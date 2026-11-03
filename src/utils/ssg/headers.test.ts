import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const headersFile = path.resolve(import.meta.dirname, "../../../public/_headers");

async function globalBlock() {
  const lines = (await readFile(headersFile, "utf8")).split("\n");
  const start = lines.findIndex((line) => line === "/*");
  expect(start, "/* のブロックがない").toBeGreaterThanOrEqual(0);
  const headers = new Map<string, string>();
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith(" ")) break;
    const separator = line.indexOf(":");
    headers.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return headers;
}

describe("public/_headers", () => {
  it("必須のセキュリティヘッダとCSPディレクティブを_headersに固定する", async () => {
    const headers = await globalBlock();
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    for (const name of [
      "Content-Security-Policy",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ])
      expect(headers.get(name), name).toBeTruthy();

    const policy = headers.get("Content-Security-Policy") ?? "";
    const directives = new Map(
      policy.split(";").map((directive) => {
        const [name, ...values] = directive.trim().split(/\s+/);
        return [name, values] as const;
      }),
    );
    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives.get("frame-src")).toEqual(
      expect.arrayContaining([
        "https://www.youtube-nocookie.com",
        "https://open.spotify.com",
        "https://embed.music.apple.com",
      ]),
    );
  });
});
