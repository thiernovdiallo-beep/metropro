import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fitPhotoWithin,
  MAX_ID_PHOTO_BYTES,
  MAX_SOURCE_PHOTO_BYTES,
  prepareIdPhoto,
} from "./id-photo";

afterEach(() => vi.unstubAllGlobals());

function syntheticJpeg(size: number) {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return new Blob([bytes], { type: "image/jpeg" });
}

function mockCanvas(outputSizes: number[]) {
  const close = vi.fn();
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4000, height: 3000, close }));
  const context = {
    fillStyle: "",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    fillRect: vi.fn(),
    drawImage: vi.fn(() => {
      expect(context.imageSmoothingEnabled).toBe(true);
      expect(context.imageSmoothingQuality).toBe("high");
    }),
  };
  let width = 0;
  let height = 0;
  const canvas = {
    get width() { return width; },
    set width(value: number) {
      width = value;
      context.imageSmoothingEnabled = false;
      context.imageSmoothingQuality = "low";
    },
    get height() { return height; },
    set height(value: number) {
      height = value;
      context.imageSmoothingEnabled = false;
      context.imageSmoothingQuality = "low";
    },
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
      const nextSize = outputSizes.shift();
      if (nextSize === undefined) throw new Error("Unexpected encoding attempt");
      callback(syntheticJpeg(nextSize));
    }),
  };
  vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
  return { canvas, context, close };
}

describe("member ID photo preparation", () => {
  it("preserves the full aspect ratio without upscaling", () => {
    expect(fitPhotoWithin(4000, 3000, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(fitPhotoWithin(1500, 2000, 2560)).toEqual({ width: 1500, height: 2000 });
    expect(() => fitPhotoWithin(0, 2000, 2560)).toThrow("invalid dimensions");
  });

  it("rejects unsupported and excessively large files before decoding", async () => {
    const unsupported = { name: "id.pdf", type: "application/pdf", size: 500 } as File;
    const huge = { name: "id.jpg", type: "image/jpeg", size: MAX_SOURCE_PHOTO_BYTES + 1 } as File;
    await expect(prepareIdPhoto(unsupported)).rejects.toThrow("JPEG, PNG or WebP");
    await expect(prepareIdPhoto(huge)).rejects.toThrow("25 MB");
  });

  it("leaves an already accepted small image intact without decoding its pixels", async () => {
    const decoder = vi.fn(() => { throw new Error("Should not decode a small source"); });
    vi.stubGlobal("createImageBitmap", decoder);
    const source = syntheticJpeg(1024) as File;
    const prepared = await prepareIdPhoto(source);
    expect(prepared.bytes).toBe(1024);
    expect(Buffer.from(prepared.base64, "base64")).toEqual(Buffer.from(await source.arrayBuffer()));
    expect(decoder).not.toHaveBeenCalled();
  });

  it("resizes a phone image, strips the input format, and sends only a small JPEG", async () => {
    const { canvas, context, close } = mockCanvas([1_000_000]);
    const source = { name: "id.png", type: "image/png", size: 5_000_000 } as File;
    const prepared = await prepareIdPhoto(source);
    expect(canvas.width).toBe(2560);
    expect(canvas.height).toBe(1920);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2560, 1920);
    expect(context.fillStyle).toBe("#ffffff");
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.92);
    expect(prepared.bytes).toBe(1_000_000);
    const image = Buffer.from(prepared.base64, "base64");
    expect(image.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(image.length).toBeLessThan(MAX_ID_PHOTO_BYTES);
    expect(close).toHaveBeenCalledOnce();
  });

  it("tries better-compressed encodings and smaller dimensions before giving up", async () => {
    const { canvas, context, close } = mockCanvas([
      MAX_ID_PHOTO_BYTES + 1,
      MAX_ID_PHOTO_BYTES + 1,
      MAX_ID_PHOTO_BYTES + 1,
      MAX_ID_PHOTO_BYTES - 200,
    ]);
    const source = { name: "id.jpg", type: "image/jpeg", size: 8_000_000 } as File;
    const result = await prepareIdPhoto(source);
    expect(result.bytes).toBe(MAX_ID_PHOTO_BYTES - 200);
    expect(canvas.toBlob).toHaveBeenCalledTimes(4);
    expect(context.drawImage).toHaveBeenNthCalledWith(2, expect.anything(), 0, 0, 2200, 1650);
    expect(close).toHaveBeenCalledOnce();
  });
});
