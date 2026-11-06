import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OxContentCustomHostBaseContext } from "@ox-content/vite-plugin";
import type { Plugin } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { embedMediaPlugin, embedOptions, renderDocumentMarkdown } from "./embeds";

const roots: string[] = [];

async function root() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ongaku-embeds-"));
  roots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function build(plugin: Plugin, output: string) {
  const configResolved = plugin.configResolved as unknown as (config: unknown) => void;
  await configResolved({ command: "build", mode: "production", build: { outDir: output } });
  const closeBundle = plugin.closeBundle as unknown as { handler: () => Promise<void> };
  await closeBundle.handler();
}

describe("embedOptions", () => {
  it("keeps the tweet cache under the repository", () => {
    const options = embedOptions("/site");
    expect(options.embeds.twitter).toMatchObject({
      fetch: true,
      appearance: "full",
      lang: "ja",
      timeZone: "Asia/Tokyo",
      timeout: 8000,
      cache: true,
      cacheDir: path.join("/site", "embeds/twitter"),
      mediaOutputDir: path.join("/site", "public/embeds/twitter/media"),
      mediaPublicPath: "/embeds/twitter/media",
    });
  });

  it("enables Spotify and Apple Music", () => {
    const options = embedOptions("/site");
    expect(options.embeds.spotify).toBe(true);
    expect(options.embeds.appleMusic).toBe(true);
  });

  it("returns embed options only", () => {
    expect(embedOptions("/site")).not.toHaveProperty("transformers");
  });
});

describe("embedMediaPlugin", () => {
  it("copies fetched media into the output", async () => {
    const siteRoot = await root();
    const media = path.join(siteRoot, "public/embeds/twitter/media");
    await mkdir(media, { recursive: true });
    await writeFile(path.join(media, "20-avatar.jpg"), "avatar");

    const output = path.join(siteRoot, "dist");
    await build(embedMediaPlugin(siteRoot), output);

    expect(await readFile(path.join(output, "embeds/twitter/media/20-avatar.jpg"), "utf8")).toBe(
      "avatar",
    );
  });

  it("leaves the output alone when nothing was fetched", async () => {
    const siteRoot = await root();

    await build(embedMediaPlugin(siteRoot), path.join(siteRoot, "dist"));

    await expect(readdir(path.join(siteRoot, "dist"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  // chmod 000 does not make a directory unreadable on Windows.
  const canMakeDirectoryUnreadable = process.platform !== "win32" && process.getuid?.() !== 0;

  it.skipIf(!canMakeDirectoryUnreadable)("rethrows a directory it cannot read", async () => {
    const siteRoot = await root();
    const media = path.join(siteRoot, "public/embeds/twitter/media");
    await mkdir(media, { recursive: true });
    await chmod(media, 0o000);

    try {
      await expect(
        build(embedMediaPlugin(siteRoot), path.join(siteRoot, "dist")),
      ).rejects.toMatchObject({
        code: "EACCES",
      });
    } finally {
      await chmod(media, 0o755);
    }
  });
});

describe("renderDocumentMarkdown", () => {
  it("ソースが変わった記事と描画に失敗した記事では、前回の結果を返さない", async () => {
    const render = vi.fn();
    const context = {
      mode: "build",
      options: {},
      markdown: { render },
    } as unknown as OxContentCustomHostBaseContext;
    render
      .mockResolvedValueOnce({ html: "古い本文" })
      .mockResolvedValueOnce({ html: "新しい本文" })
      .mockRejectedValueOnce(new Error("取得に失敗"))
      .mockResolvedValueOnce({ html: "再試行の本文" });
    const documentPath = "src/content/posts/post.md";

    const first = await renderDocumentMarkdown(context, { documentPath, source: "古いソース" });
    expect(first).toMatchObject({ html: "古い本文" });
    expect(await renderDocumentMarkdown(context, { documentPath, source: "古いソース" })).toBe(
      first,
    );
    expect(render).toHaveBeenCalledTimes(1);

    expect(
      await renderDocumentMarkdown(context, { documentPath, source: "新しいソース" }),
    ).toMatchObject({ html: "新しい本文" });

    await expect(
      renderDocumentMarkdown(context, { documentPath, source: "失敗するソース" }),
    ).rejects.toThrow("取得に失敗");
    expect(
      await renderDocumentMarkdown(context, { documentPath, source: "失敗するソース" }),
    ).toMatchObject({ html: "再試行の本文" });
    expect(render).toHaveBeenCalledTimes(4);
  });
});
