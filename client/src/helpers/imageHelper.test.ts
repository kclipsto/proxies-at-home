import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toProxied,
  getBleedInPixels,
  getLocalBleedImageUrl,
  pngToNormal,
  urlToDataUrl,
  fetchWithRetry,
  parseImageIdFromUrl,
} from './imageHelper';
import * as constants from '../constants';

vi.mock('../constants', async () => {
  const originalConstants = await vi.importActual('../constants');
  return {
    ...originalConstants,
    API_BASE: 'http://localhost:3001',
  };
});

describe('ImageHelper', () => {
  describe('toProxied', () => {
    const proxiedUrl = `${constants.API_BASE}/api/cards/images/proxy?url=http%3A%2F%2Fexample.com`;

    it('should return the url if it is falsy', () => {
      expect(toProxied('')).toBe('');
    });

    it('should return the url if it is a data url', () => {
      const url = 'data:image/png;base64, ...';
      expect(toProxied(url)).toBe(url);
    });

    it('should return the url if it is already proxied', () => {
      expect(toProxied(proxiedUrl)).toBe(proxiedUrl);
    });

    it('should proxy the url', () => {
      expect(toProxied('http://example.com')).toBe(proxiedUrl);
    });
  });

  describe('getBleedInPixels', () => {
    it('should calculate bleed in pixels for mm', () => {
      expect(getBleedInPixels(1, 'mm')).toBe(12);
    });

    it('should calculate bleed in pixels for inches', () => {
      expect(getBleedInPixels(0.1, 'in')).toBe(30);
    });
  });

  describe('getLocalBleedImageUrl', () => {
    it('should return a proxied url', () => {
      const url = 'http://example.com';
      const proxied = toProxied(url);
      expect(getLocalBleedImageUrl(url)).toBe(proxied);
    });
  });

  describe('pngToNormal', () => {
    it('should convert scryfall png url to normal jpg', () => {
      const png = 'https://cards.scryfall.io/png/front/1/2/123.png?version';
      const jpg = 'https://cards.scryfall.io/normal/front/1/2/123.jpg?version';
      expect(pngToNormal(png)).toBe(jpg);
    });

    it('should not convert non-scryfall url', () => {
      const url = 'https://example.com/image.png';
      expect(pngToNormal(url)).toBe(url);
    });

    it('should return original url if it is not a valid url', () => {
      const invalidUrl = 'not a url';
      expect(pngToNormal(invalidUrl)).toBe(invalidUrl);
    });
  });

  describe('urlToDataUrl', () => {
    beforeEach(() => {
      vi.mocked(global.fetch).mockClear();
      global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost:3001/some-uuid');
    });

    it('should return a data url for a successful fetch', async () => {
      const blob = new Blob(['image data']);
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true, blob: () => Promise.resolve(blob),
        headers: new Headers(),
        redirected: false,
        status: 0,
        statusText: '',
        type: 'default',
        url: '',
        clone: function (): Response {
          throw new Error('Function not implemented.');
        },
        body: null,
        bodyUsed: false,
        arrayBuffer: function (): Promise<ArrayBuffer> {
          throw new Error('Function not implemented.');
        },
        bytes: function (): Promise<Uint8Array<ArrayBuffer>> {
          throw new Error('Function not implemented.');
        },
        formData: function (): Promise<FormData> {
          throw new Error('Function not implemented.');
        },
        json: function (): Promise<unknown> {
          throw new Error('Function not implemented.');
        },
        text: function (): Promise<string> {
          throw new Error('Function not implemented.');
        }
      } as Response);

      const dataUrl = await urlToDataUrl('http://example.com/image.jpg');
      expect(global.fetch).toHaveBeenCalledWith(toProxied('http://example.com/image.jpg'));
      expect(global.URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(dataUrl).toBe('blob:http://localhost:3001/some-uuid');
    });

    it('should throw an error for a failed fetch', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false, status: 404,
        headers: new Headers(),
        redirected: false,
        statusText: '',
        type: 'default',
        url: '',
        clone: function (): Response {
          throw new Error('Function not implemented.');
        },
        body: null,
        bodyUsed: false,
        arrayBuffer: function (): Promise<ArrayBuffer> {
          throw new Error('Function not implemented.');
        },
        blob: function (): Promise<Blob> {
          throw new Error('Function not implemented.');
        },
        bytes: function (): Promise<Uint8Array<ArrayBuffer>> {
          throw new Error('Function not implemented.');
        },
        formData: function (): Promise<FormData> {
          throw new Error('Function not implemented.');
        },
        json: function (): Promise<unknown> {
          throw new Error('Function not implemented.');
        },
        text: function (): Promise<string> {
          throw new Error('Function not implemented.');
        }
      } as Response);
      await expect(urlToDataUrl('http://example.com/image.jpg')).rejects.toThrow('Failed to fetch image: 404');
    });
  });

  describe('fetchWithRetry', () => {
    beforeEach(() => {
      vi.mocked(global.fetch).mockClear();
      vi.useFakeTimers();
      vi.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return response on first try if successful', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        headers: new Headers(),
        redirected: false,
        status: 0,
        statusText: '',
        type: 'default',
        url: '',
        clone: function (): Response {
          throw new Error('Function not implemented.');
        },
        body: null,
        bodyUsed: false,
        arrayBuffer: function (): Promise<ArrayBuffer> {
          throw new Error('Function not implemented.');
        },
        blob: function (): Promise<Blob> {
          throw new Error('Function not implemented.');
        },
        bytes: function (): Promise<Uint8Array<ArrayBuffer>> {
          throw new Error('Function not implemented.');
        },
        formData: function (): Promise<FormData> {
          throw new Error('Function not implemented.');
        },
        json: function (): Promise<unknown> {
          throw new Error('Function not implemented.');
        },
        text: function (): Promise<string> {
          throw new Error('Function not implemented.');
        }
      } as unknown as Response);
      const result = await fetchWithRetry('url');
      expect(result).toHaveProperty('ok', true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({
          ok: false, status: 500,
          headers: new Headers(),
          redirected: false,
          statusText: '',
          type: 'default',
          url: '',
          clone: function (): Response {
            throw new Error('Function not implemented.');
          },
          body: null,
          bodyUsed: false,
          arrayBuffer: function (): Promise<ArrayBuffer> {
            throw new Error('Function not implemented.');
          },
          blob: function (): Promise<Blob> {
            throw new Error('Function not implemented.');
          },
          bytes: function (): Promise<Uint8Array<ArrayBuffer>> {
            throw new Error('Function not implemented.');
          },
          formData: function (): Promise<FormData> {
            throw new Error('Function not implemented.');
          },
          json: function (): Promise<unknown> {
            throw new Error('Function not implemented.');
          },
          text: function (): Promise<string> {
            throw new Error('Function not implemented.');
          }
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers(),
          redirected: false,
          status: 0,
          statusText: '',
          type: 'default',
          url: '',
          clone: function (): Response {
            throw new Error('Function not implemented.');
          },
          body: null,
          bodyUsed: false,
          arrayBuffer: function (): Promise<ArrayBuffer> {
            throw new Error('Function not implemented.');
          },
          blob: function (): Promise<Blob> {
            throw new Error('Function not implemented.');
          },
          bytes: function (): Promise<Uint8Array<ArrayBuffer>> {
            throw new Error('Function not implemented.');
          },
          formData: function (): Promise<FormData> {
            throw new Error('Function not implemented.');
          },
          json: function (): Promise<unknown> {
            throw new Error('Function not implemented.');
          },
          text: function (): Promise<string> {
            throw new Error('Function not implemented.');
          }
        } as unknown as Response);

      const promise = fetchWithRetry('url');
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toHaveProperty('ok', true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after all retries fail', async () => {
      const error = new Error('Network error');
      vi.mocked(global.fetch).mockRejectedValue(error);

      // 1. Call the function to get the promise.
      const testPromise = fetchWithRetry('url', 2, 10);

      // 2. Immediately attach the .rejects assertion. This is the key step.
      const assertionPromise = expect(testPromise).rejects.toThrow(error);

      // 3. Advance the timers to trigger all retries and the final failure.
      await vi.runAllTimersAsync();

      // 4. Await the assertion itself to ensure the test completes.
      await assertionPromise;

      // 5. Verify the number of attempts.
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('parseImageIdFromUrl', () => {
    it('should strip query params from Scryfall URLs', () => {
      const url = 'https://cards.scryfall.io/normal/front/a/1/a1.jpg?1234567890';
      expect(parseImageIdFromUrl(url)).toBe('https://cards.scryfall.io/normal/front/a/1/a1.jpg');
    });

    it('should extract id from MPC/Drive URLs', () => {
      const url = 'http://localhost:3001/api/cards/images/mpc?id=abc123xyz';
      expect(parseImageIdFromUrl(url)).toBe('abc123xyz');
    });

    it('should return as-is for other URLs', () => {
      const url = 'https://example.com/image.jpg';
      expect(parseImageIdFromUrl(url)).toBe('https://example.com/image.jpg');
    });

    it('should handle empty string', () => {
      expect(parseImageIdFromUrl('')).toBe('');
    });

    it('should handle Scryfall URL without query params', () => {
      const url = 'https://cards.scryfall.io/normal/front/a/1/a1.jpg';
      expect(parseImageIdFromUrl(url)).toBe('https://cards.scryfall.io/normal/front/a/1/a1.jpg');
    });
  });
});
