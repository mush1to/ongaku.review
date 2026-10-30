import { open } from "node:fs/promises";

export interface ImageSize {
  width: number;
  height: number;
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Enough of a file to hold the header of any image the site accepts. */
const headerLimit = 128 * 1024;

/** Read this much first, then grow, so a header near the front is not paid for twice. */
const headerStages = [4 * 1024, 32 * 1024, headerLimit];

const ascii = (data: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...data.subarray(start, end));

const bigEndian32 = (data: Uint8Array, offset: number) =>
  data[offset]! * 0x1000000 +
  ((data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!);

const littleEndian24 = (data: Uint8Array, offset: number) =>
  data[offset]! + (data[offset + 1]! << 8) + (data[offset + 2]! << 16);

const littleEndian32 = (data: Uint8Array, offset: number) =>
  littleEndian24(data, offset) + data[offset + 3]! * 0x1000000;

/** The first chunk of a PNG is the header, and it always declares 13 bytes. */
function pngSize(data: Uint8Array): ImageSize | undefined {
  if (data.length < 24 || pngSignature.some((byte, index) => data[index] !== byte)) return;
  if (ascii(data, 12, 16) !== "IHDR" || bigEndian32(data, 8) !== 13) return;
  return { width: bigEndian32(data, 16), height: bigEndian32(data, 20) };
}

const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/** JPEG stores the frame size in the first SOF segment, after any metadata segments. */
function jpegSize(data: Uint8Array): ImageSize | undefined {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return;
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) return;
    const marker = data[offset + 1]!;
    // Fill bytes and standalone markers carry no length.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (
      marker === 0x00 ||
      marker === 0x01 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset += 2;
      continue;
    }
    const length = (data[offset + 2]! << 8) | data[offset + 3]!;
    // A segment that runs past the bytes read so far may still be complete in the file.
    if (length < 2 || offset + 2 + length > data.length) return;
    if (isStartOfFrame(marker)) {
      const components = data[offset + 9]!;
      // The frame header is precision, height, width, a component count, and 3 bytes per component.
      if (components === 0 || length !== 8 + 3 * components) return;
      return {
        height: (data[offset + 5]! << 8) | data[offset + 6]!,
        width: (data[offset + 7]! << 8) | data[offset + 8]!,
      };
    }
    offset += 2 + length;
  }
}

/** A WebP file carries the size in one of three chunk layouts. */
function webpSize(data: Uint8Array): ImageSize | undefined {
  if (data.length < 20 || ascii(data, 0, 4) !== "RIFF" || ascii(data, 8, 12) !== "WEBP") return;
  const chunk = ascii(data, 12, 16);
  const chunkLength = littleEndian32(data, 16);
  if (chunk === "VP8X") {
    // The extended header is a flags byte, three reserved bytes, and two 24-bit sizes.
    if (chunkLength !== 10 || data.length < 30) return;
    return { width: littleEndian24(data, 24) + 1, height: littleEndian24(data, 27) + 1 };
  }
  if (chunk === "VP8 ") {
    if (chunkLength < 10 || data.length < 30) return;
    if (data[23] !== 0x9d || data[24] !== 0x01 || data[25] !== 0x2a) return;
    return {
      width: (data[26]! | (data[27]! << 8)) & 0x3fff,
      height: (data[28]! | (data[29]! << 8)) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    if (chunkLength < 5 || data.length < 25 || data[20] !== 0x2f) return;
    const bits = littleEndian32(data, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
}

/**
 * Reads the pixel size from a PNG, JPEG, or WebP header. Undefined when the
 * format is something else, the header is cut short, or its fields disagree, so
 * callers omit the size rather than guess one.
 */
export function imageSize(data: Uint8Array): ImageSize | undefined {
  const size = pngSize(data) ?? jpegSize(data) ?? webpSize(data);
  if (!size || size.width <= 0 || size.height <= 0) return undefined;
  return size;
}

/**
 * Reads the header of a file in stages and never loads more than `headerLimit`,
 * so a large image costs its first bytes and not the whole file.
 */
export async function imageSizeFromFile(filePath: string): Promise<ImageSize | undefined> {
  const handle = await open(filePath, "r");
  try {
    const { size } = await handle.stat();
    let read = 0;
    for (const stage of headerStages) {
      const length = Math.min(stage, size);
      if (length <= read) break;
      const data = new Uint8Array(length);
      const { bytesRead } = await handle.read(data, 0, length, 0);
      read = bytesRead;
      const found = imageSize(data.subarray(0, bytesRead));
      if (found) return found;
    }
    return undefined;
  } finally {
    await handle.close();
  }
}
