import '@testing-library/jest-dom';
import 'fake-indexeddb/auto';
import { webcrypto } from 'crypto';
import { afterAll, vi } from 'vitest';
import { ImageProcessor } from './helpers/imageProcessor.ts';


if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as unknown as Crypto;
}

// JSDOM doesn't implement Blob.arrayBuffer(), so this polyfills it.
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const buffer = new Uint8Array(fr.result as ArrayBuffer).buffer;
        resolve(buffer);
      };
      fr.onerror = () => {
        reject(fr.error);
      };
      fr.readAsArrayBuffer(this);
    });
  };
}

// Mock Worker to avoid spawning threads in tests
class MockWorker {
  url: string;
  onmessage: ((this: Worker, ev: MessageEvent) => void) | null = null;
  onerror: ((this: Worker, ev: ErrorEvent) => void) | null = null;
  constructor(stringUrl: string) {
    this.url = stringUrl;
  }
  postMessage(_msg: unknown) { }
  terminate() { }
  addEventListener() { }
  removeEventListener() { }
  dispatchEvent() { return true; }
}
global.Worker = MockWorker as unknown as typeof Worker;

// Mock fetch globally to prevent undici connection pools from hanging the process
vi.stubGlobal('fetch', vi.fn());

import { db } from './db';

afterAll(async () => {
  // Ensure we are using real timers for the cleanup delay,
  // in case a test file left fake timers active.
  vi.useRealTimers();

  // console.log('[vitest.setup] Starting global teardown');

  try {
    // Clean up ImageProcessor workers synchronously (now that cancelAll is implemented)
    ImageProcessor.destroyAll();
    // console.log('[vitest.setup] ImageProcessor destroyed');

    // Clean up EffectProcessor workers
    const { destroyEffectProcessor } = await import('./helpers/effectCache');
    destroyEffectProcessor();
    // console.log('[vitest.setup] EffectProcessor destroyed');

    // Close Dexie connection with a timeout to prevent hanging
    if (db) {
      if (db.isOpen()) {
        try {
          db.close();
        } catch (e) { /* ignore */ }
      }
    }
  } catch (e) {
    console.error('[vitest.setup] Error during teardown:', e);
  }

  // console.log('[vitest.setup] Teardown complete');

  // Force exit to prevent hanging processes (e.g. from JSDOM or other libs)
  // This is a pragmatic fix for the persistent "close timed out" error.
});

// Suppress unhandled rejections from Dexie during teardown
process.on('unhandledRejection', (err: unknown) => {
  const e = err as { name?: string; message?: string } | null;
  if (e?.name === 'DatabaseClosedError' || e?.message?.includes('Database has been closed')) {
    return;
  }
  // Also suppress "Error: Database has been closed" which might be a simple Error type
  if (e instanceof Error && e.message === 'Database has been closed') {
    return;
  }

  if (e?.name === 'ConstraintError' && e?.message?.includes('mutation operation in the transaction failed')) {
    return;
  }

  // Re-throw other errors
  console.error('Unhandled Rejection:', err);
});
