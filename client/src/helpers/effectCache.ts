/**
 * Effect Cache - Pre-rendered export images for cards with overrides
 * 
 * Caches the result of rendering cards with advanced overrides (holo effects,
 * brightness, contrast, etc.) to avoid re-rendering during PDF export.
 * Uses a Web Worker pool to avoid blocking the UI.
 */

import { db, type EffectCacheEntry } from '../db';
import type { CardOverrides, CardOption } from '../../../shared/types';
import { enforceEffectCacheLimits } from './cacheUtils';
import { hasActiveAdjustments } from './adjustmentUtils';
import { overridesToRenderParams } from './cardCanvasWorker';
import type { RenderParams } from '../components/CardCanvas/types';
import { useSettingsStore } from '../store/settings';
import { CONSTANTS } from '../constants/commonConstants';

interface IdleWorker {
    worker: Worker;
    timeoutId: ReturnType<typeof setTimeout> | null;
}

// --- Worker Pool for Effect Processing ---
interface EffectTask {
    taskId: string;
    resolve: (blob: Blob) => void;
    reject: (error: Error) => void;
}

export type ActivityCallback = (isActive: boolean) => void;

class EffectProcessor {
    private static instance: EffectProcessor;
    private workers: Worker[] = [];
    private idleWorkers: IdleWorker[] = [];
    private pendingTasks: Map<string, EffectTask> = new Map();
    private taskQueue: Array<{
        imageData: ArrayBuffer;
        imageWidth: number;
        imageHeight: number;
        params: RenderParams;
        taskId: string;
    }> = [];
    private taskIdCounter = 0;
    private readonly maxWorkers: number;
    // Track which task is assigned to which worker for error handling
    private workerToTaskId: Map<Worker, string> = new Map();

    // Activity tracking for toast notifications
    private activeTaskCount = 0;
    private activityCallbacks: Set<ActivityCallback> = new Set();

    private constructor() {
        // Limit to 4 workers to balance speed vs resource usage
        this.maxWorkers = Math.min(CONSTANTS.MAX_WORKERS, navigator.hardwareConcurrency || 2);
    }

    static getInstance(): EffectProcessor {
        if (!EffectProcessor.instance) {
            EffectProcessor.instance = new EffectProcessor();
        }
        return EffectProcessor.instance;
    }

    private notifyActivityChange(isActive: boolean) {
        this.activityCallbacks.forEach(cb => cb(isActive));
    }

    /**
     * Register a callback to be notified when processing activity starts/stops.
     * Returns an unsubscribe function.
     */
    onActivityChange(callback: ActivityCallback): () => void {
        this.activityCallbacks.add(callback);
        return () => {
            this.activityCallbacks.delete(callback);
        };
    }

    private taskStarted() {
        const wasIdle = this.activeTaskCount === 0;
        this.activeTaskCount++;
        if (wasIdle) {
            this.notifyActivityChange(true);
        }
    }

    private taskCompleted() {
        this.activeTaskCount = Math.max(0, this.activeTaskCount - 1);
        if (this.activeTaskCount === 0) {
            this.notifyActivityChange(false);
        }
    }

    private createWorker(): Worker {
        const worker = new Worker(
            new URL('./effect.worker.ts', import.meta.url),
            { type: 'module' }
        );

        worker.onmessage = (event) => {
            const { taskId, blob, error } = event.data;
            const task = this.pendingTasks.get(taskId);
            if (task) {
                this.pendingTasks.delete(taskId);
                this.taskCompleted();
                if (error) {
                    task.reject(new Error(error));
                } else {
                    task.resolve(blob);
                }
            }

            // Return worker to idle pool and process next task
            // Return worker to idle pool and process next task
            this.workerToTaskId.delete(worker);

            // Set idle timeout
            const timeoutId = setTimeout(() => {
                const idx = this.idleWorkers.findIndex(w => w.worker === worker);
                if (idx > -1) {
                    this.idleWorkers.splice(idx, 1);
                    const workerIdx = this.workers.indexOf(worker);
                    if (workerIdx > -1) this.workers.splice(workerIdx, 1);
                    worker.terminate();
                }
            }, CONSTANTS.WORKER_IDLE_TIMEOUT_MS);

            this.idleWorkers.push({ worker, timeoutId });
            this.processNextTask();
        };

        worker.onerror = (event) => {
            console.error('[EffectProcessor] Worker error:', event);
            // Reject the pending task for this worker so it doesn't hang forever
            const taskId = this.workerToTaskId.get(worker);
            if (taskId) {
                const task = this.pendingTasks.get(taskId);
                if (task) {
                    task.reject(new Error('Worker crashed: ' + (event.message || 'Unknown error')));
                    this.pendingTasks.delete(taskId);
                }
                this.workerToTaskId.delete(worker);
            }
            this.taskCompleted();
            // Remove from workers list and create a new one if needed
            const idx = this.workers.indexOf(worker);
            if (idx > -1) this.workers.splice(idx, 1);
            worker.terminate();
            this.processNextTask();
        };

        this.workers.push(worker);
        return worker;
    }

    private processNextTask() {
        if (this.taskQueue.length === 0) return;

        let worker: Worker | null = null;

        if (this.idleWorkers.length > 0) {
            const idleWorker = this.idleWorkers.pop()!;
            if (idleWorker.timeoutId) clearTimeout(idleWorker.timeoutId);
            worker = idleWorker.worker;
        } else if (this.workers.length < this.maxWorkers) {
            worker = this.createWorker();
        }

        if (worker) {
            const task = this.taskQueue.shift()!;
            this.taskStarted();
            // Track which task this worker is processing
            this.workerToTaskId.set(worker, task.taskId);
            worker.postMessage({
                taskId: task.taskId,
                imageData: task.imageData,
                imageWidth: task.imageWidth,
                imageHeight: task.imageHeight,
                params: task.params,
            }, [task.imageData]); // Transfer the ArrayBuffer
        }
    }

    /**
     * Process an effect rendering task in a worker.
     */
    async process(
        exportBlob: Blob,
        params: RenderParams
    ): Promise<Blob> {
        // Convert Blob to ImageData via canvas
        const bitmap = await createImageBitmap(exportBlob);
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            bitmap.close();
            throw new Error('Failed to get 2d context for effect processing');
        }
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        bitmap.close();

        const taskId = `task-${++this.taskIdCounter}`;

        return new Promise<Blob>((resolve, reject) => {
            const task: EffectTask = { taskId, resolve, reject };
            this.pendingTasks.set(taskId, task);

            this.taskQueue.push({
                taskId,
                imageData: imageData.data.buffer,
                imageWidth: imageData.width,
                imageHeight: imageData.height,
                params,
            });

            this.processNextTask();
        });
    }

    /**
     * Terminate all workers and clear queues.
     */
    destroy() {
        this.workers.forEach(w => w.terminate());
        this.workers = [];
        this.idleWorkers.forEach(w => {
            if (w.timeoutId) clearTimeout(w.timeoutId);
            w.worker.terminate();
        });
        this.idleWorkers = [];
        this.taskQueue = [];
        this.pendingTasks.clear();
        if (this.activeTaskCount > 0) {
            this.activeTaskCount = 0;
            this.notifyActivityChange(false);
        }
    }
    static destroyInstance() {
        if (EffectProcessor.instance) {
            EffectProcessor.instance.destroy();
            // @ts-expect-error - we need to clear the instance
            EffectProcessor.instance = undefined;
        }
    }
}

/**
 * Get the EffectProcessor singleton instance.
 * Exported for use by useProcessingMonitor to show toasts.
 */
export function getEffectProcessor(): EffectProcessor {
    return EffectProcessor.getInstance();
}

/**
 * Destroy the EffectProcessor singleton and terminate all workers.
 * Used for testing cleanup.
 */
export function destroyEffectProcessor(): void {
    EffectProcessor.destroyInstance();
}

// --- Hash and Cache Key Functions ---

/**
 * Simple fast hash function (djb2 algorithm).
 */
function hashString(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Compute a stable cache key from imageId, overrides, and DPI.
 * Including DPI ensures different resolutions are cached separately and
 * switching back to a previous DPI can hit the cache (LRU eviction handles cleanup).
 */
function computeCacheKey(imageId: string, overrides: CardOverrides, dpi: number): string {
    const sortedOverrides = Object.keys(overrides || {})
        .sort()
        .reduce((acc, k) => {
            const value = overrides[k as keyof CardOverrides];
            if (value !== undefined) {
                acc[k] = value;
            }
            return acc;
        }, {} as Record<string, unknown>);
    const overridesHash = hashString(JSON.stringify(sortedOverrides));
    return `${imageId}:${dpi}:${overridesHash}`;
}

// --- Public Cache API ---

/**
 * Get a pre-rendered export blob from the cache.
 * Uses current DPI from settings to look up the correct cached version.
 */
export async function getEffectCacheEntry(
    imageId: string,
    overrides: CardOverrides,
    dpi?: number
): Promise<Blob | undefined> {
    const effectiveDpi = dpi ?? useSettingsStore.getState().dpi;
    const key = computeCacheKey(imageId, overrides, effectiveDpi);
    const entry = await db.effectCache.get(key);
    if (entry) {
        // Touch cachedAt for LRU
        await db.effectCache.update(key, { cachedAt: Date.now() });
        return entry.blob;
    }
    return undefined;
}

/**
 * Store a pre-rendered export blob in the cache.
 * Uses current DPI from settings to store at the correct key.
 */
async function setEffectCacheEntry(
    imageId: string,
    overrides: CardOverrides,
    blob: Blob,
    dpi?: number
): Promise<void> {
    const effectiveDpi = dpi ?? useSettingsStore.getState().dpi;
    const key = computeCacheKey(imageId, overrides, effectiveDpi);
    const entry: EffectCacheEntry = {
        key,
        blob,
        size: blob.size,
        cachedAt: Date.now(),
    };
    await db.effectCache.put(entry);
    await enforceEffectCacheLimits();
}

/**
 * Worker-friendly version that requires DPI explicitly.
 * Use this in web workers where useSettingsStore isn't available.
 */
export async function setEffectCacheEntryWithDpi(
    imageId: string,
    overrides: CardOverrides,
    blob: Blob,
    dpi: number
): Promise<void> {
    const key = computeCacheKey(imageId, overrides, dpi);
    const entry: EffectCacheEntry = {
        key,
        blob,
        size: blob.size,
        cachedAt: Date.now(),
    };
    await db.effectCache.put(entry);
    // Note: skip enforceEffectCacheLimits in worker to avoid perf hit during export
}



/**
 * Pre-render and cache a card's export image using the worker pool.
 * This runs in a separate thread and won't block the UI.
 */
export async function preRenderEffect(
    card: CardOption,
    exportBlob: Blob
): Promise<void> {
    if (!card.imageId || !card.overrides || !hasActiveAdjustments(card.overrides)) {
        return;
    }

    try {
        const params = overridesToRenderParams(card.overrides);
        const processor = EffectProcessor.getInstance();
        const renderedBlob = await processor.process(exportBlob, params);
        await setEffectCacheEntry(card.imageId, card.overrides, renderedBlob);
    } catch (error) {
        console.error('[effectCache] Pre-render failed:', error);
    }
}

/**
 * Queue bulk pre-render tasks. Uses the worker pool for non-blocking processing.
 * Fire-and-forget - logs errors but doesn't throw.
 */
export function queueBulkPreRender(
    tasks: Array<{ card: CardOption; exportBlob: Blob }>
): void {
    if (tasks.length === 0) return;

    // Process all tasks using the worker pool (limited concurrency handled internally)
    for (const task of tasks) {
        preRenderEffect(task.card, task.exportBlob)
            .catch(err => console.error('[effectCache] Bulk pre-render task failed:', err));
    }
}
