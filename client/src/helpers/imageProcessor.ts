const maxWorkers = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
const workers = Array.from({ length: maxWorkers }, () => new Worker(new URL('./bleed.worker.ts', import.meta.url), { type: 'module' }));
const taskQueue: any[] = [];
let idleWorkers = [...workers];

function returnWorkerToPool(worker: Worker) {
  idleWorkers.push(worker);
  processNextTask();
}

async function runTask(task: any) {
  if (idleWorkers.length === 0) return; // Should not happen due to processNextTask check, but as a safeguard
  
  const worker = idleWorkers.pop()!;

  worker.onmessage = (e: MessageEvent) => {
    worker.onmessage = null;
    worker.onerror = null;
    returnWorkerToPool(worker);
    task.resolve(e.data);
  };
  worker.onerror = (e: ErrorEvent) => {
    worker.onmessage = null;
    worker.onerror = null;
    returnWorkerToPool(worker);
    task.reject(e);
  };
  worker.postMessage(task.message);
}

function processNextTask() {
  if (taskQueue.length > 0 && idleWorkers.length > 0) {
    const task = taskQueue.shift();
    if (task) {
      runTask(task);
    }
  }
}

export const imageProcessor = {
  process: (message: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const task = {
        message,
        resolve,
        reject,
      };
      taskQueue.push(task);
      processNextTask();
    });
  },
  destroy: () => {
    workers.forEach(w => w.terminate());
    idleWorkers = [];
  }
};