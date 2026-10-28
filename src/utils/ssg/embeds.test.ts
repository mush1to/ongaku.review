import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MarkdownNode, TransformContext } from "@ox-content/vite-plugin";
import { transformAllPlugins } from "@ox-content/vite-plugin";
import { fromMarkdown } from "mdast-util-from-markdown";
import { afterEach, describe, expect, it } from "vitest";
import { embedDirectories, embedOptions, referencedEmbedAssets } from "./embeds";
import { createTweetUrlEmbeds } from "./standalone-embeds";

const roots: string[] = [];

async function root() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ongaku-embeds-"));
  roots.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("embedOptions", () => {
  it("keeps the tweet cache under the repository", () => {
    const options = embedOptions("/site");
    expect(options.transformers).toHaveLength(1);
    expect(options.embeds?.twitter).toMatchObject({
      fetch: true,
      appearance: "full",
      lang: "ja",
      cacheDir: path.join("/site", "embeds/twitter"),
      mediaOutputDir: path.join("/site", "embeds/twitter/media"),
      mediaPublicPath: "/embeds/twitter/media",
    });
  });
});

describe("referencedEmbedAssets", () => {
  it("returns only cached media that the HTML references", async () => {
    const siteRoot = await root();
    const { media } = embedDirectories(siteRoot);
    await mkdir(media, { recursive: true });
    await writeFile(path.join(media, "20-avatar.jpg"), "");
    await writeFile(path.join(media, "20-media-1.jpg"), "");

    const assets = await referencedEmbedAssets(
      [
        '<img src="/embeds/twitter/media/20-avatar.jpg">',
        '<video poster="/embeds/twitter/media/20-media-1.jpg"></video>',
        '<img src="/embeds/twitter/media/20-missing.jpg">',
        '<img src="/assets/thumbnail.png">',
        '<img src="/embeds/twitter/media/../../etc/passwd">',
      ].join(""),
      siteRoot,
    );

    expect(assets.map((asset) => asset.publicPath).sort()).toEqual([
      "/embeds/twitter/media/20-avatar.jpg",
      "/embeds/twitter/media/20-media-1.jpg",
    ]);
  });
});

describe("tweet cards", () => {
  it("turns a standalone post URL into a card element", async () => {
    const transformer = createTweetUrlEmbeds();
    const ast = await transformer.transform(
      fromMarkdown(
        "[https://x.com/jack/status/20](https://x.com/jack/status/20)",
      ) as unknown as MarkdownNode,
      {} as TransformContext,
    );
    const html = await transformAllPlugins(ast.children![0]!.value as string, { twitter: true });

    expect(html).toContain('class="ox-tweet');
    expect(html).toContain('href="https://x.com/jack/status/20"');
    expect(html).toContain("@jack");
  });
});
