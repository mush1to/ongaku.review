import { access } from "node:fs/promises";
import path from "node:path";
import type {
  CollectionAssetInput,
  OxContentCustomHostBaseContext,
  OxContentCustomHostMarkdownResult,
  OxContentOptions,
} from "@ox-content/vite-plugin";
import { createTweetUrlEmbeds } from "./standalone-embeds";
import { preserveFullWidthSpaces } from "./whitespace";

export const tweetMediaPublicPath = "/embeds/twitter/media";

export function embedDirectories(root: string) {
  const base = path.join(root, "embeds/twitter");
  return { cache: base, media: path.join(base, "media") };
}

export function embedOptions(root: string) {
  const directories = embedDirectories(root);
  return {
    transformers: [createTweetUrlEmbeds()],
    embeds: {
      twitter: {
        fetch: true,
        appearance: "full",
        lang: "ja",
        timeZone: "Asia/Tokyo",
        timeout: 8000,
        cache: true,
        cacheDir: directories.cache,
        mediaOutputDir: directories.media,
        mediaPublicPath: tweetMediaPublicPath,
      },
    },
  } satisfies Pick<OxContentOptions, "transformers" | "embeds">;
}

interface DocumentSource {
  source: string;
  documentPath: string;
}

interface CachedRender {
  source: string;
  result: Promise<OxContentCustomHostMarkdownResult>;
}

const renders = new WeakMap<object, Map<string, CachedRender>>();

/** Shares one render between asset planning and the page, even when a remote request fails. */
export function renderDocumentMarkdown(
  ctx: OxContentCustomHostBaseContext,
  document: DocumentSource,
) {
  let documents = renders.get(ctx.options);
  if (!documents) {
    documents = new Map();
    renders.set(ctx.options, documents);
  }
  const key = ctx.mode + ":" + document.documentPath;
  const cached = documents.get(key);
  if (cached?.source === document.source) return cached.result;
  const result = ctx.markdown.render({
    ...document,
    source: preserveFullWidthSpaces(document.source),
  });
  const entry: CachedRender = { source: document.source, result };
  documents.set(key, entry);
  void result.catch(() => {
    if (documents.get(key) === entry) documents.delete(key);
  });
  return result;
}

const mediaFilename = /^[\w-]+\.[a-z0-9]+$/i;
const mediaReference = new RegExp(`(?:src|poster)="${tweetMediaPublicPath}/([^"]+)"`, "g");

/** Only media that exists is published, so a partial cache never fails the build. */
export async function referencedEmbedAssets(html: string, root: string) {
  const assets = new Map<string, CollectionAssetInput>();
  for (const match of html.matchAll(mediaReference)) {
    const filename = match[1]!;
    if (!mediaFilename.test(filename)) continue;
    const publicPath = tweetMediaPublicPath + "/" + filename;
    const sourcePath = path.join(embedDirectories(root).media, filename);
    if (
      await access(sourcePath).then(
        () => true,
        () => false,
      )
    )
      assets.set(publicPath, { sourcePath, publicPath });
  }
  return [...assets.values()];
}

export async function collectEmbedAssets(
  ctx: OxContentCustomHostBaseContext,
  documents: readonly DocumentSource[],
) {
  const assets = new Map<string, CollectionAssetInput>();
  for (const document of documents) {
    const rendered = await renderDocumentMarkdown(ctx, document);
    for (const asset of await referencedEmbedAssets(rendered.html, ctx.root))
      assets.set(asset.sourcePath, asset);
  }
  return [...assets.values()];
}
