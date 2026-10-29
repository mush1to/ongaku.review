import { describe, expect, it } from "vitest";
import { imageSize } from "./image-size";

const png = (width: number, height: number) => {
  const data = new Uint8Array(33);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  data.set([0x00, 0x00, 0x00, 0x0d], 8);
  data.set([...Buffer.from("IHDR", "ascii")], 12);
  const view = new DataView(data.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return data;
};

const jpeg = (width: number, height: number, padding = 0) => {
  const parts = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array.from({ length: 14 }, () => 0x00)];
  if (padding) {
    const length = padding + 2;
    parts.push(
      0xff,
      0xe1,
      length >> 8,
      length & 0xff,
      ...Array.from({ length: padding }, () => 0x00),
    );
  }
  parts.push(0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff);
  parts.push(0x03, 0xff, 0xd9);
  return new Uint8Array(parts);
};

const webpExtended = (width: number, height: number) => {
  const data = new Uint8Array(30);
  data.set([...Buffer.from("RIFF", "ascii")], 0);
  data.set([...Buffer.from("WEBP", "ascii")], 8);
  data.set([...Buffer.from("VP8X", "ascii")], 12);
  const view = new DataView(data.buffer);
  view.setUint32(16, 10, true);
  const size = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
  data.set(size(width - 1), 24);
  data.set(size(height - 1), 27);
  return data;
};

const webpLossless = (width: number, height: number) => {
  const data = new Uint8Array(30);
  data.set([...Buffer.from("RIFF", "ascii")], 0);
  data.set([...Buffer.from("WEBP", "ascii")], 8);
  data.set([...Buffer.from("VP8L", "ascii")], 12);
  data[20] = 0x2f;
  const bits = (width - 1) | ((height - 1) << 14);
  new DataView(data.buffer).setUint32(21, bits, true);
  return data;
};

const webpLossy = (width: number, height: number) => {
  const data = new Uint8Array(30);
  data.set([...Buffer.from("RIFF", "ascii")], 0);
  data.set([...Buffer.from("WEBP", "ascii")], 8);
  data.set([...Buffer.from("VP8 ", "ascii")], 12);
  data.set([0x9d, 0x01, 0x2a], 23);
  new DataView(data.buffer).setUint16(26, width, true);
  new DataView(data.buffer).setUint16(28, height, true);
  return data;
};

describe("imageSize", () => {
  it("PNGのIHDRから大きさを読む", () => {
    expect(imageSize(png(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  it("JPEGはメタデータの区間を飛ばしてSOFから大きさを読む", () => {
    expect(imageSize(jpeg(1200, 630))).toEqual({ width: 1200, height: 630 });
    expect(imageSize(jpeg(400, 400, 64))).toEqual({ width: 400, height: 400 });
  });

  it("WebPは拡張・可逆・非可逆のどの形式でも大きさを読む", () => {
    expect(imageSize(webpExtended(1200, 630))).toEqual({ width: 1200, height: 630 });
    expect(imageSize(webpLossless(1200, 630))).toEqual({ width: 1200, height: 630 });
    expect(imageSize(webpLossy(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  it("読めない形式や途中で切れたファイルは大きさを返さない", () => {
    expect(imageSize(new Uint8Array())).toBeUndefined();
    expect(imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeUndefined();
    expect(imageSize(png(1200, 630).slice(0, 12))).toBeUndefined();
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBeUndefined();
  });
});
