export interface ImageSize {
  width: number;
  height: number;
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isPng = (data: Uint8Array) =>
  data.length > 24 && pngSignature.every((byte, index) => data[index] === byte);

const bigEndian32 = (data: Uint8Array, offset: number) =>
  data[offset]! * 0x1000000 +
  ((data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!);

const littleEndian24 = (data: Uint8Array, offset: number) =>
  data[offset]! + (data[offset + 1]! << 8) + (data[offset + 2]! << 16);

const littleEndian32 = (data: Uint8Array, offset: number) =>
  littleEndian24(data, offset) + data[offset + 3]! * 0x1000000;

/** JPEG stores the frame size in the first SOF segment, after any metadata segments. */
function jpegSize(data: Uint8Array): ImageSize | undefined {
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return undefined;
    const marker = data[offset + 1]!;
    // Fill bytes and standalone markers carry no length.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = (data[offset + 2]! << 8) | data[offset + 3]!;
    if (length < 2) return undefined;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return {
        height: (data[offset + 5]! << 8) | data[offset + 6]!,
        width: (data[offset + 7]! << 8) | data[offset + 8]!,
      };
    offset += 2 + length;
  }
  return undefined;
}

/** A WebP file carries the size in one of three chunk layouts. */
function webpSize(data: Uint8Array): ImageSize | undefined {
  const chunk = String.fromCharCode(...data.subarray(12, 16));
  if (chunk === "VP8 ")
    return {
      width: (data[26]! | (data[27]! << 8)) & 0x3fff,
      height: (data[28]! | (data[29]! << 8)) & 0x3fff,
    };
  if (chunk === "VP8L") {
    const bits = littleEndian32(data, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X")
    return { width: littleEndian24(data, 24) + 1, height: littleEndian24(data, 27) + 1 };
  return undefined;
}

/**
 * Reads the pixel size from a PNG, JPEG, or WebP header. Undefined when the
 * format is something else or the header is cut short, so callers omit the size
 * rather than guess one.
 */
export function imageSize(data: Uint8Array): ImageSize | undefined {
  if (isPng(data)) return { width: bigEndian32(data, 16), height: bigEndian32(data, 20) };
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) return jpegSize(data);
  if (
    data.length >= 30 &&
    String.fromCharCode(...data.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...data.subarray(8, 12)) === "WEBP"
  )
    return webpSize(data);
  return undefined;
}
