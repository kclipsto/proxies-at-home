import 'fake-indexeddb/auto';
import { webcrypto } from 'crypto';
import { afterAll } from 'vitest';
import { ImageProcessor } from './helpers/imageProcessor.ts';
import { IDBFactory } from 'fake-indexeddb';

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

afterAll(() => {
  ImageProcessor.destroyAll();
  // eslint-disable-next-line no-global-assign
  indexedDB = new IDBFactory();
});
