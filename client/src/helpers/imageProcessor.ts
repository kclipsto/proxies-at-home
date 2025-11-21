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
}

interface WorkerSuccessResponse {
  uuid: string;
  exportBlob: Blob;
  exportDpi: number;
  exportBleedWidth: number;
  displayBlob: Blob;
  displayDpi: number;
  displayBleedWidth: number;
  error?: undefined;
}

interface WorkerErrorResponse {
  uuid: string;
  error: string;
}

type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse;

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
  private taskQueue: {
    message: WorkerMessage;
    resolve: (value: WorkerResponse) => void;
    reject: (reason?: ErrorEvent) => void;
  }[] = [];
  private maxWorkers: number;
  static mockProcess: unknown;

  private constructor() {
    // Cap at 8 workers to prevent network request storms and memory issues
    const concurrency = navigator.hardwareConcurrency || 4;
    this.maxWorkers = Math.min(18, Math.max(1, concurrency - 1));
    ImageProcessor.instances.add(this);
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL("./bleed.worker.ts", import.meta.url), {
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
    if (this.taskQueue.length === 0) {
      return;
    }

    let worker: Worker | null = null;

    if (this.idleWorkers.length > 0) {
      const idleWorker = this.idleWorkers.pop()!;
      if (idleWorker.timeoutId) {
        clearTimeout(idleWorker.timeoutId);
      }
      worker = idleWorker.worker;
    } else if (this.allWorkers.size < this.maxWorkers) {
      worker = this.createWorker();
    }

    if (worker) {
      const task = this.taskQueue.shift()!;

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        this.returnWorkerToPool(worker);
        task.resolve(e.data);
      };

      worker.onerror = (e: ErrorEvent) => {
        console.error("Worker error, terminating:", e);
        this.terminateWorker(worker);
        task.reject(e);
        this.processNextTask(); // Try to process another task with a new worker if available
      };

      worker.postMessage(task.message);
    }
  }

  process(message: WorkerMessage): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ message, resolve, reject });
      this.processNextTask();
    });
  }

  destroy() {
    this.taskQueue = [];
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

  static destroyAll() {
    for (const instance of ImageProcessor.instances) {
      instance.destroy();
    }
  }
}
