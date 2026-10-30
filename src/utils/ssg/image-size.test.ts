import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { imageSize, imageSizeFromFile } from "./image-size";

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

const jpeg = (width: number, height: number, metadata: number[] = []) => {
  const parts: Uint8Array[] = [
    new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array.from({ length: 14 }, () => 0x00)]),
  ];
  for (const payload of metadata) {
    const segment = new Uint8Array(4 + payload);
    segment.set([0xff, 0xe1, (payload + 2) >> 8, (payload + 2) & 0xff], 0);
    parts.push(segment);
  }
  parts.push(
    new Uint8Array([
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      height >> 8,
      height & 0xff,
      width >> 8,
      width & 0xff,
      0x03,
      0x01,
      0x11,
      0x00,
      0x02,
      0x11,
      0x00,
      0x03,
      0x11,
      0x00,
    ]),
  );
  parts.push(new Uint8Array([0xff, 0xd9]));
  const data = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    data.set(part, offset);
    offset += part.length;
  }
  return data;
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
  new DataView(data.buffer).setUint32(16, 10, true);
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
  new DataView(data.buffer).setUint32(16, 10, true);
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
    expect(imageSize(jpeg(400, 400, [64]))).toEqual({ width: 400, height: 400 });
  });

  it("WebPは拡張・可逆・非可逆のどの形式でも大きさを読む", () => {
    expect(imageSize(webpExtended(1200, 630))).toEqual({ width: 1200, height: 630 });
    expect(imageSize(webpLossless(1200, 630))).toEqual({ width: 1200, height: 630 });
    expect(imageSize(webpLossy(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  it("読めない形式は大きさを返さない", () => {
    expect(imageSize(new Uint8Array())).toBeUndefined();
    expect(imageSize(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeUndefined();
  });

  it("途中で切れたヘッダは大きさを返さない", () => {
    expect(imageSize(png(1200, 630).slice(0, 12))).toBeUndefined();
    expect(imageSize(jpeg(1200, 630).slice(0, 24))).toBeUndefined();
    expect(imageSize(webpExtended(1200, 630).slice(0, 24))).toBeUndefined();
    expect(imageSize(webpLossless(1200, 630).slice(0, 21))).toBeUndefined();
  });

  it("長さや識別バイトが矛盾するヘッダは大きさを返さない", () => {
    const wrongPngLength = png(1200, 630);
    new DataView(wrongPngLength.buffer).setUint32(8, 99);
    expect(imageSize(wrongPngLength)).toBeUndefined();

    const wrongPngType = png(1200, 630);
    wrongPngType.set([...Buffer.from("IDAT", "ascii")], 12);
    expect(imageSize(wrongPngType)).toBeUndefined();

    const wrongFrameLength = jpeg(1200, 630);
    wrongFrameLength[22] = 0x00;
    wrongFrameLength[23] = 0x10;
    expect(imageSize(wrongFrameLength)).toBeUndefined();

    const wrongExtendedLength = webpExtended(1200, 630);
    new DataView(wrongExtendedLength.buffer).setUint32(16, 9, true);
    expect(imageSize(wrongExtendedLength)).toBeUndefined();

    const wrongStartCode = webpLossy(1200, 630);
    wrongStartCode[23] = 0x00;
    expect(imageSize(wrongStartCode)).toBeUndefined();

    const wrongLosslessSignature = webpLossless(1200, 630);
    wrongLosslessSignature[20] = 0x00;
    expect(imageSize(wrongLosslessSignature)).toBeUndefined();
  });
});

describe("imageSizeFromFile", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function writeImage(name: string, data: Uint8Array): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "ongaku-review-image-"));
    roots.push(root);
    const file = path.join(root, name);
    await writeFile(file, data);
    return file;
  }

  it("先頭の4KBに入っているヘッダから大きさを読む", async () => {
    expect(await imageSizeFromFile(await writeImage("cover.png", png(1200, 630)))).toEqual({
      width: 1200,
      height: 630,
    });
  });

  it("4KBより後ろにあるヘッダも、読み足して大きさを読む", async () => {
    const file = await writeImage("cover.jpg", jpeg(1200, 630, [8 * 1024]));

    expect(await imageSizeFromFile(file)).toEqual({ width: 1200, height: 630 });
  });

  it("128KBの中にヘッダがなければ大きさを返さない", async () => {
    const file = await writeImage("cover.jpg", jpeg(1200, 630, [60000, 60000, 60000]));

    expect(await imageSizeFromFile(file)).toBeUndefined();
  });

  it("空のファイルは大きさを返さない", async () => {
    expect(
      await imageSizeFromFile(await writeImage("cover.png", new Uint8Array())),
    ).toBeUndefined();
  });
});
