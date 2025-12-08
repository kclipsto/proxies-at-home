type IdleWorker = {
  worker: Worker;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

interface WorkerMessage {
  uuid: string;
  url: string;
  bleedEdgeWidth: number;
  unit: "mm" | "in";
  apiBase: string;
  isUserUpload: boolean;
  hasBakedBleed?: boolean;
  dpi: number;
  darkenNearBlack?: boolean;
}

interface WorkerSuccessResponse {
  uuid: string;
  exportBlob: Blob;
  exportDpi: number;
  exportBleedWidth: number;
  displayBlob: Blob;
  displayDpi: number;
  displayBleedWidth: number;
  exportBlobDarkened: Blob;
  displayBlobDarkened: Blob;
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
  reject: (reason?: ErrorEvent) => void;
  priority: Priority;
}

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

  // Helper to get all tasks for cancellation
  private get allTasks(): Task[] {
    return [...this.highPriorityQueue, ...this.lowPriorityQueue];
  }

  private baseMaxWorkers: number;
  static mockProcess: unknown;

  private constructor() {
    // Cap at 8 workers to prevent network request storms and memory issues
    const concurrency = navigator.hardwareConcurrency || 4;
    this.baseMaxWorkers = Math.min(8, Math.max(1, concurrency - 1));
    ImageProcessor.instances.add(this);
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL("./bleed.webgl.worker.ts", import.meta.url), {
      type: "module",
    });
    this.allWorkers.add(worker);
    return worker;
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
    }, 20000); // Terminate after 20 seconds of inactivity

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

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        this.returnWorkerToPool(worker!);
        currentTask.resolve(e.data);
      };

      worker.onerror = (e: ErrorEvent) => {
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
      const task: Task = { message, resolve, reject, priority };

      // Optimization: If promoting to HIGH, remove any pending LOW task for the same UUID
      if (priority === Priority.HIGH) {
        const existingLowIndex = this.lowPriorityQueue.findIndex(t => t.message.uuid === message.uuid);
        if (existingLowIndex > -1) {
          const [existingTask] = this.lowPriorityQueue.splice(existingLowIndex, 1);
          // Reject the old task so it doesn't hang
          existingTask.reject(new Error("Promoted to high priority") as unknown as ErrorEvent);
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

  destroy() {
    this.highPriorityQueue = [];
    this.lowPriorityQueue = [];
    this.idleWorkers.forEach(({ worker, timeoutId }) => {
      if (timeoutId) clearTimeout(timeoutId);
      worker.terminate();
    });
    this.idleWorkers = [];
    this.allWorkers.forEach((worker) => {
      worker.terminate();
    });
    this.allWorkers.clear();
    ImageProcessor.instances.delete(this);
  }

  cancelAll() {
    // Reject all pending tasks
    this.allTasks.forEach((task) => {
      task.reject(new Error("Cancelled") as unknown as ErrorEvent);
    });
    this.highPriorityQueue = [];
    this.lowPriorityQueue = [];

    // Terminate all workers immediately
    this.idleWorkers.forEach(({ worker, timeoutId }) => {
      if (timeoutId) clearTimeout(timeoutId);
      worker.terminate();
    });
    this.idleWorkers = [];
    this.allWorkers.forEach((worker) => {
      worker.terminate();
    });
    this.allWorkers.clear();
  }

  static destroyAll() {
    for (const instance of ImageProcessor.instances) {
      instance.destroy();
    }
  }
}
