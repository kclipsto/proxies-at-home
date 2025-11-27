import { AsyncLock } from './AsyncLock';

describe('AsyncLock', () => {
    it('should allow acquiring lock immediately when free', async () => {
        const lock = new AsyncLock();
        let acquired = false;

        await lock.acquire();
        acquired = true;

        expect(acquired).toBe(true);
    });

    it('should block subsequent acquisitions until released', async () => {
        const lock = new AsyncLock();
        const executionOrder: string[] = [];

        await lock.acquire();
        executionOrder.push('first acquired');

        // Start second acquisition (should block)
        const secondPromise = (async () => {
            await lock.acquire();
            executionOrder.push('second acquired');
            lock.release();
        })();

        // Verify second hasn't run yet
        expect(executionOrder).toEqual(['first acquired']);

        // Release first
        executionOrder.push('first releasing');
        lock.release();

        // Wait for second to complete
        await secondPromise;

        expect(executionOrder).toEqual([
            'first acquired',
            'first releasing',
            'second acquired'
        ]);
    });

    it('should process queue in order (FIFO)', async () => {
        const lock = new AsyncLock();
        const executionOrder: number[] = [];

        await lock.acquire();

        // Queue up 3 tasks
        const task1 = (async () => {
            await lock.acquire();
            executionOrder.push(1);
            lock.release();
        })();

        const task2 = (async () => {
            await lock.acquire();
            executionOrder.push(2);
            lock.release();
        })();

        const task3 = (async () => {
            await lock.acquire();
            executionOrder.push(3);
            lock.release();
        })();

        // Release initial lock
        lock.release();

        await Promise.all([task1, task2, task3]);

        expect(executionOrder).toEqual([1, 2, 3]);
    });
});
