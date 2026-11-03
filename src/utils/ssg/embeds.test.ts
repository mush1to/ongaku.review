import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Plugin } from "vite";
import { afterEach, describe, expect, it } from "vitest";
import { embedMediaPlugin, embedOptions } from "./embeds";

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

  it.skipIf(process.getuid?.() === 0)("rethrows a directory it cannot read", async () => {
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
