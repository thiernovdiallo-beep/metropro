export const MAX_ID_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_SOURCE_PHOTO_BYTES = 25 * 1024 * 1024;

const INPUT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const INPUT_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;
const SERVER_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SERVER_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
const LONG_EDGES = [2560, 2200, 1900, 1600];
const JPEG_QUALITIES = [0.92, 0.86, 0.8];

type DecodedPhoto = {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

export function fitPhotoWithin(width: number, height: number, longestEdge: number) {
  if (![width, height, longestEdge].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error("This photo has invalid dimensions.");
  }
  const scale = Math.min(1, longestEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decodePhoto(file: File): Promise<DecodedPhoto> {
  if (typeof createImageBitmap === "function") {
    try {
      // Honor a phone camera's EXIF rotation before drawing the resized image.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Older browsers can decode a file through an HTMLImageElement instead.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not read this image"));
      image.src = url;
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("This browser could not open the photo. Choose a JPEG, PNG or WebP image instead.");
  }
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob || blob.type !== "image/jpeg") {
        reject(new Error("This browser could not prepare a JPEG ID photo."));
      } else {
        resolve(blob);
      }
    }, "image/jpeg", quality);
  });
}

function encodeBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then(buffer => {
    const bytes = new Uint8Array(buffer);
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 0x8000) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
    }
    return btoa(chunks.join(""));
  });
}

/** Original photo bytes never leave the browser; only the optimized JPEG is sent. */
export async function prepareIdPhoto(file: File): Promise<{ base64: string; bytes: number }> {
  const recognized = file.type ? INPUT_TYPES.has(file.type.toLowerCase()) : INPUT_EXTENSIONS.test(file.name);
  if (!recognized) throw new Error("Choose a JPEG, PNG or WebP photo (HEIC works in supported browsers).");
  if (file.size < 32) throw new Error("This ID photo is empty or damaged. Choose another photo.");
  if (file.size > MAX_SOURCE_PHOTO_BYTES) {
    throw new Error("Choose a photo smaller than 25 MB so your device can process it safely.");
  }
  // Keep an already accepted photo untouched: a small but extremely high-
  // resolution PNG need not be decoded into hundreds of megabytes of pixels.
  // The server still checks the actual image signature before storing it.
  if (file.size <= MAX_ID_PHOTO_BYTES &&
      (SERVER_IMAGE_TYPES.has(file.type.toLowerCase()) || (!file.type && SERVER_IMAGE_EXTENSIONS.test(file.name)))) {
    return { base64: await encodeBase64(file), bytes: file.size };
  }

  const decoded = await decodePhoto(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser could not resize the photo. Try another browser.");

    let previousDimensions = "";
    for (const edge of LONG_EDGES) {
      const dimensions = fitPhotoWithin(decoded.width, decoded.height, edge);
      const key = `${dimensions.width}x${dimensions.height}`;
      if (key === previousDimensions) continue;
      previousDimensions = key;
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      // Assigning canvas dimensions resets all 2D context settings.
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      // An opaque background keeps transparent PNG text readable after JPEG conversion.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);

      for (const quality of JPEG_QUALITIES) {
        const jpeg = await encodeJpeg(canvas, quality);
        if (jpeg.size >= 32 && jpeg.size <= MAX_ID_PHOTO_BYTES) {
          return { base64: await encodeBase64(jpeg), bytes: jpeg.size };
        }
      }
    }
    throw new Error("This photo could not be reduced below 2 MB without losing too much detail. Try a clearer, closer photo.");
  } finally {
    decoded.release();
  }
}
