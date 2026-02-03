type IdleWorker = {
  worker: Worker;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

import { IMAGE_PROCESSING } from '@/constants/imageProcessing';
import { debugLog } from './debug';

// Maximum total tasks in queue to prevent memory exhaustion on large imports
const MAX_QUEUE_SIZE = 200;

interface WorkerMessage {
  uuid: string;
  url: string;
  bleedEdgeWidth: number;
  unit: "mm" | "in";
  apiBase: string;
  hasBuiltInBleed?: boolean;
  bleedMode?: 'generate' | 'existing' | 'none';  // Per-card bleed override
  existingBleedMm?: number;  // Amount when bleedMode is 'existing'
  dpi: number;
  darkenMode?: number;  // 0=none, 1=darken-all, 2=contrast-edges, 3=contrast-full
}

interface WorkerSuccessResponse {
  uuid: string;
  exportBlob: Blob;
  exportDpi: number;
  exportBleedWidth: number;
  displayBlob: Blob;
  displayDpi: number;
  displayBleedWidth: number;
  // Per-mode darkened blobs (optional - only generated modes are present)
  exportBlobDarkenAll?: Blob;
  displayBlobDarkenAll?: Blob;
  exportBlobContrastEdges?: Blob;
  displayBlobContrastEdges?: Blob;
  exportBlobContrastFull?: Blob;
  displayBlobContrastFull?: Blob;
  // Legacy (optional)
  exportBlobDarkened?: Blob;
  displayBlobDarkened?: Blob;
  // For Card Editor live preview (M1.5)
  baseDisplayBlob: Blob;  // Same as displayBlob - undarkened version for CardCanvas
  baseExportBlob?: Blob;   // Optional - undarkened export version for CardCanvas
  imageCacheHit?: boolean; // True if image was served from 7-day persistent cache
  detectedHasBuiltInBleed?: boolean; // Auto-detected during processing
  darknessFactor?: number; // Computed histogram darkness (0-1)
  error?: undefined;
}

interface WorkerErrorResponse {
  uuid: string;
  error: string;
}

type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

export const Priority = {
  HIGH: 0,
  LOW: 1,
} as const;

export type Priority = (typeof Priority)[keyof typeof Priority];

interface Task {
  message: WorkerMessage;
  resolve: (value: WorkerResponse) => void;
  reject: (reason?: Error | ErrorEvent) => void;
  priority: Priority;
}

export type ActivityCallback = (isActive: boolean) => void;

export class ImageProcessor {
  static getInstance() {
    if (!ImageProcessor.instance) {
      ImageProcessor.instance = new ImageProcessor();
    }
    return ImageProcessor.instance;
  }
  private static instance: ImageProcessor;
  private static instances: Set<ImageProcessor> = new Set();
  private allWorkers: Set<Worker> = new Set();
  private idleWorkers: IdleWorker[] = [];

  // Separate queues for priorities
  private highPriorityQueue: Task[] = [];
  private lowPriorityQueue: Task[] = [];

  // Activity tracking for toast notifications
  private activeTaskCount = 0;
  private activityCallbacks: Set<ActivityCallback> = new Set();

  // Helper to get all tasks for cancellation
  private get allTasks(): Task[] {
    return [...this.highPriorityQueue, ...this.lowPriorityQueue];
  }

  private baseMaxWorkers: number;


  private constructor() {
    // Detect Firefox - it has aggressive WebGL context limits and memory issues
    const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.includes('Firefox');
    const maxWorkers = isFirefox ? IMAGE_PROCESSING.MAX_WORKERS_FIREFOX : IMAGE_PROCESSING.MAX_WORKERS;

    // Cap workers based on hardware and browser limits
    const concurrency = navigator.hardwareConcurrency || 4;
    this.baseMaxWorkers = Math.min(maxWorkers, Math.max(1, concurrency - 1));

    if (isFirefox) {
      debugLog(`[ImageProcessor] Firefox detected - limiting to ${this.baseMaxWorkers} workers`);
    }

    ImageProcessor.instances.add(this);
  }

  /**
   * Pre-warm workers for faster first-use performance.
   * Call this on app init to avoid cold-start latency.
   */
  prewarm(count: number = IMAGE_PROCESSING.PREWARM_WORKER_COUNT): void {
    for (let i = 0; i < Math.min(count, this.baseMaxWorkers); i++) {
      if (this.allWorkers.size < this.baseMaxWorkers) {
        const worker = this.createWorker();
        this.returnWorkerToPool(worker);
      }
    }
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL("./bleed.webgl.worker.ts", import.meta.url), {
      type: "module",
    });
    this.allWorkers.add(worker);
    return worker;
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

  private terminateWorker(worker: Worker) {
    const idleWorkerIndex = this.idleWorkers.findIndex(
      (iw) => iw.worker === worker
    );
    if (idleWorkerIndex > -1) {
      const idleWorker = this.idleWorkers[idleWorkerIndex];
      if (idleWorker.timeoutId) {
        clearTimeout(idleWorker.timeoutId);
      }
      this.idleWorkers.splice(idleWorkerIndex, 1);
    }

    if (this.allWorkers.has(worker)) {
      worker.terminate();
      this.allWorkers.delete(worker);
    }
  }

  private returnWorkerToPool(worker: Worker) {
    const timeoutId = setTimeout(() => {
      this.terminateWorker(worker);
    }, IMAGE_PROCESSING.WORKER_IDLE_TIMEOUT_MS); // Terminate after inactivity

    this.idleWorkers.push({ worker, timeoutId });
    this.processNextTask();
  }

  private processNextTask() {
    // Check high priority first
    let task = this.highPriorityQueue.shift();

    // If no high priority, check low priority
    if (!task) {
      task = this.lowPriorityQueue.shift();
    }

    if (!task) {
      return;
    }

    let worker: Worker | null = null;

    if (this.idleWorkers.length > 0) {
      const idleWorker = this.idleWorkers.pop()!;
      if (idleWorker.timeoutId) {
        clearTimeout(idleWorker.timeoutId);
      }
      worker = idleWorker.worker;
    } else if (this.allWorkers.size < this.baseMaxWorkers) {
      worker = this.createWorker();
    }

    if (worker) {
      const currentTask = task; // Capture for closure

      // Track that a task has started processing
      this.taskStarted();

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        this.taskCompleted();
        this.returnWorkerToPool(worker!);
        currentTask.resolve(e.data);
      };

      worker.onerror = (e: ErrorEvent) => {
        this.taskCompleted();
        console.error("Worker error, terminating:", e);
        this.terminateWorker(worker!);
        currentTask.reject(e);
        this.processNextTask(); // Try to process another task with a new worker if available
      };

      worker.postMessage(currentTask.message);
    } else {
      // No worker available, put task back at the front of its respective queue
      if (task.priority === Priority.HIGH) {
        this.highPriorityQueue.unshift(task);
      } else {
        this.lowPriorityQueue.unshift(task);
      }
    }
  }

  process(message: WorkerMessage, priority: Priority = Priority.LOW): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      // Check queue size limit to prevent memory exhaustion
      const totalQueued = this.highPriorityQueue.length + this.lowPriorityQueue.length;
      if (totalQueued >= MAX_QUEUE_SIZE) {
        reject(new Error('Processing queue full, please wait for current tasks to complete'));
        return;
      }

      const task: Task = { message, resolve, reject, priority };

      // Optimization: If promoting to HIGH, remove any pending LOW task for the same UUID
      if (priority === Priority.HIGH) {
        const existingLowIndex = this.lowPriorityQueue.findIndex(t => t.message.uuid === message.uuid);
        if (existingLowIndex > -1) {
          const [existingTask] = this.lowPriorityQueue.splice(existingLowIndex, 1);
          // Reject the old task so it doesn't hang
          existingTask.reject(new Error("Promoted to high priority"));
        }
      }

      if (priority === Priority.HIGH) {
        this.highPriorityQueue.push(task);
      } else {
        this.lowPriorityQueue.push(task);
      }

      this.processNextTask();
    });
  }

  promoteToHighPriority(uuid: string) {
    const lowIndex = this.lowPriorityQueue.findIndex(t => t.message.uuid === uuid);
    if (lowIndex > -1) {
      const [task] = this.lowPriorityQueue.splice(lowIndex, 1);
      task.priority = Priority.HIGH;
      this.highPriorityQueue.push(task);
      // Trigger processing in case a worker is free and was waiting for high priority?
      // Actually processNextTask handles queue checking order.
    }
  }

  private terminateAllWorkers() {
    this.idleWorkers.forEach(({ worker, timeoutId }) => {
      if (timeoutId) clearTimeout(timeoutId);
      worker.terminate();
    });
    this.idleWorkers = [];
    this.allWorkers.forEach(worker => worker.terminate());
    this.allWorkers.clear();
  }

  destroy() {
    this.highPriorityQueue = [];
    this.lowPriorityQueue = [];
    this.terminateAllWorkers();
    ImageProcessor.instances.delete(this);
  }

  cancelAll() {
    this.allTasks.forEach(task => {
      task.reject(new Error("Cancelled") as unknown as ErrorEvent);
    });
    this.highPriorityQueue = [];
    this.lowPriorityQueue = [];

    if (this.activeTaskCount > 0) {
      this.activeTaskCount = 0;
      this.notifyActivityChange(false);
    }

    this.terminateAllWorkers();
  }

  static destroyAll() {
    for (const instance of ImageProcessor.instances) {
      instance.destroy();
    }
  }
}
