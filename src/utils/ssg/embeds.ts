import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import type {
  OxContentCustomHostBaseContext,
  OxContentCustomHostMarkdownResult,
  OxContentOptions,
} from "@ox-content/vite-plugin";
import type { Plugin } from "vite";
import { preserveFullWidthSpaces } from "./whitespace";

function embedMediaDirectory(root: string) {
  return path.join(root, "public/embeds/twitter/media");
}

export function embedOptions(root: string) {
  return {
    embeds: {
      twitter: {
        fetch: true,
        appearance: "full",
        lang: "ja",
        timeZone: "Asia/Tokyo",
        timeout: 8000,
        cache: true,
        cacheDir: path.join(root, "embeds/twitter"),
        mediaOutputDir: embedMediaDirectory(root),
        mediaPublicPath: "/embeds/twitter/media",
      },
      spotify: true,
      appleMusic: true,
    },
  } satisfies Pick<OxContentOptions, "embeds">;
}

async function mediaFiles(directory: string) {
  try {
    return (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Fetched media is written while pages render, after Vite has already copied public. */
export function embedMediaPlugin(root: string): Plugin {
  let outputDirectory: string | undefined;
  return {
    name: "site-embed-media",
    configResolved(config) {
      if (config.command === "build" && config.mode !== "test")
        outputDirectory = path.resolve(root, config.build.outDir);
    },
    closeBundle: {
      order: "post",
      sequential: true,
      async handler() {
        if (!outputDirectory) return;
        const media = embedMediaDirectory(root);
        const files = await mediaFiles(media);
        if (!files.length) return;
        const target = path.join(outputDirectory, "embeds/twitter/media");
        await mkdir(target, { recursive: true });
        for (const file of files)
          await copyFile(path.join(media, file.name), path.join(target, file.name));
      },
    },
  };
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

/** Reuses the previous render while the source is unchanged, even when a remote request fails. */
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
