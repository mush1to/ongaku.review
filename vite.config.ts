import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { defineConfig } from "vite-plus";
import { svelte } from "@rsvelte/vite-plugin-svelte";
import { oxContentCustomHost, planCollectionAssetsFromDocuments } from "@ox-content/vite-plugin";
import { createSvelteHtmlHostIslandRegistry } from "@ox-content/vite-plugin-svelte";
import type { PreviewServer, ViteDevServer } from "vite";
import {
  aboutDocument,
  contentDirectory,
  loadAboutPage,
  loadDocs,
  loadSearchIndex,
} from "./src/utils/ssg/content";
import { site } from "./src/config/site";

export default defineConfig(async ({ command, mode }) => {
  const root = import.meta.dirname;
  let searchOutputDirectory: string | undefined;
  const registry = createSvelteHtmlHostIslandRegistry({
    documents: async () =>
      [...(await loadDocs(root)), await loadAboutPage(root)].map(({ documentPath, source }) => ({
        documentPath,
        source,
      })),
    entries: [{ moduleId: "/src/components/SiteStatus.svelte", name: "SiteStatus" }],
    components: {
      SiteStatus: root + "/src/components/SiteStatus.svelte",
    },
    watch: [contentDirectory, aboutDocument],
    root,
  });
  const oxContentPlugins = oxContentCustomHost({
    host: "./src/utils/ssg/host.ts",
    collectionAssets: {
      watch: [
        { path: contentDirectory, kind: "directory" },
        { path: aboutDocument, kind: "file" },
      ],
      manifest: async (ctx) => {
        const docs = [...(await loadDocs(ctx.root)), await loadAboutPage(ctx.root)];
        const result = await planCollectionAssetsFromDocuments({
          root: ctx.root,
          contentRoot: "src/content",
          documents: docs.map((doc) => ({
            documentPath: doc.documentPath,
            pagePath: doc.path,
          })),
        });
        if (result.diagnostics.length)
          throw new Error(result.diagnostics.map((item) => item.message).join("\n"));
        return result.manifest;
      },
    },
    oxContent: {
      srcDir: contentDirectory,
      docs: false,
      highlight: true,
      mdx: true,
      search: mode === "test" ? false : { limit: 8, hotkey: "" },
      feeds: { formats: ["rss"], title: site.title, language: "ja" },
      siteMaps: { llms: false },
      ssg: {
        siteUrl: site.url,
        siteName: site.title,
        markdownSource: false,
      },
    },
    dev: {
      feedOutputs: true,
      routeDependencies: [
        { path: contentDirectory, kind: "directory" },
        { path: aboutDocument, kind: "file" },
      ],
    },
    build: { enabled: mode !== "test", transformHtml: false },
  });
  const configuredOxContentPlugins = oxContentPlugins.map((plugin) => {
    if (command === "build" || plugin.name !== "ox-content:search") return plugin;
    // The native writer otherwise overwrites dist at dev-server shutdown.
    return { ...plugin, closeBundle: undefined };
  });
  return {
    appType: "mpa" as const,
    server: {
      fs: {
        allow: [root],
      },
    },
    plugins: [
      {
        name: "site-public-search",
        configResolved(config) {
          if (command === "build" && mode !== "test")
            searchOutputDirectory = path.resolve(root, config.build.outDir);
        },
        // Ox Content scans srcDir independently of host routes. Replace its index
        // after its writer finishes, using the same publication rules as routes.
        closeBundle: {
          order: "post",
          sequential: true,
          async handler() {
            if (!searchOutputDirectory) return;
            await mkdir(searchOutputDirectory, { recursive: true });
            await writeFile(
              path.join(searchOutputDirectory, "search-index.json"),
              await loadSearchIndex(root),
              "utf8",
            );
          },
        },
        configurePreviewServer(server: PreviewServer) {
          return () =>
            server.middlewares.use(async (_request, response, next) => {
              try {
                const dist = path.resolve(root, "dist");
                const requested = path.resolve(
                  dist,
                  "." + decodeURIComponent((_request.url ?? "/").split("?")[0]),
                );
                if (
                  requested.startsWith(dist + path.sep) &&
                  (await stat(requested).catch(() => null))?.isFile()
                )
                  return next();
                const html = await readFile(path.join(root, "dist/404.html"), "utf8");
                response.statusCode = 404;
                response.setHeader("Content-Type", "text/html; charset=utf-8");
                response.end(html);
              } catch (error) {
                next(error);
              }
            });
        },
        configureServer(server: ViteDevServer) {
          server.middlewares.use(async (request, response, next) => {
            if (request.url?.split("?")[0] !== "/search-index.json") return next();
            try {
              const index = await loadSearchIndex(root);
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(index);
            } catch (error) {
              next(error);
            }
          });
        },
      },
      svelte(),
      registry.plugin,
      ...configuredOxContentPlugins,
    ],
    build: {
      manifest: true,
      rolldownOptions: { input: { client: "src/client.ts" } },
    },
    test: { include: ["src/**/*.test.ts"] },
  };
});
