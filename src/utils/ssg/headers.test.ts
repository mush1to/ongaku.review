import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const headersFile = path.resolve(import.meta.dirname, "../../../public/_headers");

async function headerBlocks() {
  const blocks = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const line of (await readFile(headersFile, "utf8")).split("\n")) {
    if (line.startsWith(" ")) {
      const separator = line.indexOf(":");
      current?.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
      continue;
    }
    if (line.trim() === "") continue;
    current = new Map();
    blocks.set(line.trim(), current);
  }
  return blocks;
}

describe("public/_headers", () => {
  it("キャッシュ制御を_headersに固定する", async () => {
    const blocks = await headerBlocks();
    expect([...blocks.keys()]).toEqual(["/assets/*", "/feed.xml", "/sitemap.xml"]);
    expect(blocks.get("/assets/*")?.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    for (const pattern of ["/feed.xml", "/sitemap.xml"])
      expect(blocks.get(pattern)?.get("Cache-Control"), pattern).toBe("public, max-age=3600");
  });

  it("セキュリティヘッダを配らないことを_headersに固定する", async () => {
    const blocks = await headerBlocks();
    expect([...new Set([...blocks.values()].flatMap((headers) => [...headers.keys()]))]).toEqual([
      "Cache-Control",
    ]);
  });
});
