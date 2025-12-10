import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { useImageProcessing } from "./useImageProcessing";
import { db } from "../db";
import { ImageProcessor } from "../helpers/imageProcessor";
import type { CardOption } from "../../../shared/types";

// Mocks
vi.mock("../db", () => ({
  db: {
    images: {
      get: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../helpers/imageProcessor");

vi.mock("../store", () => ({
  useSettingsStore: Object.assign(
    vi.fn((selector) => selector({
      dpi: 300,
      darkenNearBlack: false,
      hasHydrated: true,
    })),
    {
      persist: {
        hasHydrated: vi.fn().mockReturnValue(true),
        onFinishHydration: vi.fn().mockReturnValue(() => { }),
      },
      getState: vi.fn().mockReturnValue({
        dpi: 300,
        darkenNearBlack: false,
        bleedEdgeWidth: 1, // Default matching default props in tests
        unit: 'mm',
      }),
    }
  ),
}));

describe("useImageProcessing", () => {
  const card: CardOption = {
    uuid: "123",
    name: "Test Card",
    order: 1,
    imageId: "image123",
    isUserUpload: false,
  };

  let mockImageProcessor: ImageProcessor;
  let mockProcess: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockImageProcessor = new (ImageProcessor as unknown as Mock)();
    mockProcess = mockImageProcessor.process as Mock;
  });

  it("should not process if card has no imageId", async () => {
    const { result } = renderHook(() =>
      useImageProcessing({
        unit: "mm",
        bleedEdgeWidth: 1,
        imageProcessor: mockImageProcessor,
      })
    );

    await act(async () => {
      await result.current.ensureProcessed({ ...card, imageId: undefined });
    });

    expect(db.images.get).not.toHaveBeenCalled();
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("should not process if image already has displayBlob", async () => {
    (db.images.get as Mock).mockResolvedValue({ displayBlob: new Blob() });

    const { result } = renderHook(() =>
      useImageProcessing({
        unit: "mm",
        bleedEdgeWidth: 1,
        imageProcessor: mockImageProcessor,
      })
    );

    await act(async () => {
      await result.current.ensureProcessed(card);
    });

    expect(db.images.get).toHaveBeenCalledWith("image123");
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it("should call imageProcessor.process for an unprocessed image", async () => {
    (db.images.get as Mock).mockResolvedValue({ sourceUrl: "http://example.com/img.png" });
    mockProcess.mockResolvedValue({
      displayBlob: new Blob(['processed']),
      displayDpi: 300,
      displayBleedWidth: 1,
      exportBlob: new Blob(['processed_export']),
      exportDpi: 600,
      exportBleedWidth: 1,
      displayBlobDarkened: new Blob(['processed_darkened']),
      exportBlobDarkened: new Blob(['processed_export_darkened']),
    });


    const { result } = renderHook(() =>
      useImageProcessing({
        unit: "mm",
        bleedEdgeWidth: 1,
        imageProcessor: mockImageProcessor,
      })
    );

    await act(async () => {
      await result.current.ensureProcessed(card);
    });

    expect(mockProcess).toHaveBeenCalledTimes(1);
    expect(db.images.update).toHaveBeenCalledWith("image123", expect.any(Object));
  });

  it("should handle image processing failure", async () => {
    (db.images.get as Mock).mockResolvedValue({ sourceUrl: "http://example.com/img.png" });
    mockProcess.mockRejectedValue(new Error("Processing failed"));

    const { result } = renderHook(() =>
      useImageProcessing({
        unit: "mm",
        bleedEdgeWidth: 1,
        imageProcessor: mockImageProcessor,
      })
    );

    await act(async () => {
      await result.current.ensureProcessed(card);
    });

    expect(result.current.loadingMap[card.uuid]).toBe("error");
    expect(db.images.update).not.toHaveBeenCalled();
  });

  it("reprocessSelectedImages should process multiple cards", async () => {
    const cards = [
      { ...card, uuid: '1', imageId: 'img1' },
      { ...card, uuid: '2', imageId: 'img2' }
    ];

    (db.images.get as Mock).mockImplementation((id) => {
      if (id === 'img1') return Promise.resolve({ sourceUrl: 'url1' });
      if (id === 'img2') return Promise.resolve({ sourceUrl: 'url2' });
      return Promise.resolve(undefined);
    });

    mockProcess.mockResolvedValue({
      displayBlob: new Blob(['processed']),
      displayDpi: 300,
      displayBleedWidth: 1,
      exportBlob: new Blob(['processed_export']),
      exportDpi: 600,
      exportBleedWidth: 1,
      displayBlobDarkened: new Blob(['processed_darkened']),
      exportBlobDarkened: new Blob(['processed_export_darkened']),
    });

    const { result } = renderHook(() =>
      useImageProcessing({
        unit: "mm",
        bleedEdgeWidth: 1,
        imageProcessor: mockImageProcessor,
      })
    );

    await act(async () => {
      await result.current.reprocessSelectedImages(cards, 2);
    });

    expect(mockProcess).toHaveBeenCalledTimes(2);
    expect(db.images.update).toHaveBeenCalledTimes(2);
    expect(db.images.update).toHaveBeenCalledWith('img1', expect.any(Object));
    expect(db.images.update).toHaveBeenCalledWith('img2', expect.any(Object));
  });

  it("should use originalBlob if available", async () => {
    const blob = new Blob(['test'], { type: 'image/png' });
    (db.images.get as Mock).mockResolvedValue({ originalBlob: blob });
    global.URL.createObjectURL = vi.fn(() => "blob:test");
    global.URL.revokeObjectURL = vi.fn();

    mockProcess.mockResolvedValue({
      displayBlob: new Blob(['processed']),
      displayDpi: 300,
      displayBleedWidth: 1,
      exportBlob: new Blob(['processed_export']),
      exportDpi: 600,
      exportBleedWidth: 1,
      displayBlobDarkened: new Blob(['processed_darkened']),
      exportBlobDarkened: new Blob(['processed_export_darkened']),
    });

    const { result } = renderHook(() =>
      useImageProcessing({
        unit: "mm",
        bleedEdgeWidth: 1,
        imageProcessor: mockImageProcessor,
      })
    );

    await act(async () => {
      await result.current.ensureProcessed(card);
    });

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(mockProcess).toHaveBeenCalledWith(
      expect.objectContaining({ url: "blob:test" }),
      expect.any(Number)
    );
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("should handle process returning error object", async () => {
    (db.images.get as Mock).mockResolvedValue({ sourceUrl: "http://example.com/img.png" });
    mockProcess.mockResolvedValue({ error: "Processing failed gracefully" });

    const { result } = renderHook(() =>
      useImageProcessing({
        unit: "mm",
        bleedEdgeWidth: 1,
        imageProcessor: mockImageProcessor,
      })
    );

    await act(async () => {
      await result.current.ensureProcessed(card);
    });

    expect(result.current.loadingMap[card.uuid]).toBe("error");
    expect(db.images.update).not.toHaveBeenCalled();
  });

  it("reprocessSelectedImages should handle errors", async () => {
    const cards = [{ ...card, uuid: '1', imageId: 'img1' }];
    (db.images.get as Mock).mockResolvedValue({ sourceUrl: 'url1' });
    mockProcess.mockResolvedValue({ error: "Processing failed" });

    const { result } = renderHook(() =>
      useImageProcessing({
        unit: "mm",
        bleedEdgeWidth: 1,
        imageProcessor: mockImageProcessor,
      })
    );

    await act(async () => {
      await result.current.reprocessSelectedImages(cards, 2);
    });

    expect(mockProcess).toHaveBeenCalledTimes(1);
    expect(db.images.update).not.toHaveBeenCalled();
  });
});

