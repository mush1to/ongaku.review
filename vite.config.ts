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
  contentRoot,
  invalidateContentCache,
  listPosts,
  loadAboutPage,
  loadDocs,
  loadSearchIndex,
  loadSearchPages,
  usersDirectory,
  usersDocument,
} from "./src/utils/ssg/content";
import { site } from "./src/config/site";
import { collectEmbedAssets, embedOptions } from "./src/utils/ssg/embeds";
import { homePages, tagPages } from "./src/utils/ssg/host";
import { resolveBuildOutDir } from "./src/utils/ssg/output-dir";

export default defineConfig(async ({ command, mode }) => {
  const root = import.meta.dirname;
  const buildOutDir = resolveBuildOutDir(process.env.BUILD_OUT_DIR);
  let searchOutputDirectory: string | undefined;
  // Ox Content writes the search index itself, and a build already leaves drafts
  // out of it. The dev server indexes drafts, so serve the filtered index there to
  // keep search results pointing at pages the route list publishes.
  const searchOutputs = new Map([
    ["/search-index.json", { load: loadSearchIndex, build: false }],
    ["/search-pages.json", { load: loadSearchPages, build: true }],
  ]);
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
        { path: usersDocument, kind: "file" },
        { path: usersDirectory, kind: "directory" },
      ],
      manifest: async (ctx) => {
        const docs = [...(await loadDocs(ctx.root)), await loadAboutPage(ctx.root)];
        const embedAssets = await collectEmbedAssets(ctx, docs);
        const result = await planCollectionAssetsFromDocuments({
          root: ctx.root,
          contentRoot,
          documents: docs.map((doc) => ({
            documentPath: doc.documentPath,
            pagePath: doc.path,
          })),
          extraAssets: [
            ...docs.flatMap(({ thumbnail, author }) =>
              [thumbnail, author?.icon].flatMap((image) =>
                image ? [{ sourcePath: image.sourcePath, publicPath: image.publicPath }] : [],
              ),
            ),
            ...embedAssets,
          ],
        });
        if (result.diagnostics.length)
          throw new Error(result.diagnostics.map((item) => item.message).join("\n"));
        return result.manifest;
      },
    },
    oxContent: {
      ...embedOptions(root),
      srcDir: contentDirectory,
      outDir: buildOutDir,
      // The search index must cover the same files as the routes, which only read these two.
      extensions: [".md", ".mdx"],
      docs: false,
      highlight: true,
      mdx: true,
      publishState: true,
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
        { path: usersDocument, kind: "file" },
        { path: usersDirectory, kind: "directory" },
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
        // Ox Content scans srcDir independently of host routes, so the extra
        // search metadata it does not know about is written here.
        closeBundle: {
          order: "post",
          sequential: true,
          async handler() {
            if (!searchOutputDirectory) return;
            await mkdir(searchOutputDirectory, { recursive: true });
            for (const [url, output] of searchOutputs) {
              if (!output.build) continue;
              await writeFile(
                path.join(searchOutputDirectory, url.slice(1)),
                await output.load(root),
                "utf8",
              );
            }
          },
        },
        configurePreviewServer(server: PreviewServer) {
          const previewRoot = path.resolve(root, buildOutDir);
          server.middlewares.use(async (request, response, next) => {
            try {
              const url = new URL(request.url ?? "/", "http://localhost");
              if (url.pathname === "/404.html") return next();
              const target =
                url.pathname === "/index.html"
                  ? "/"
                  : url.pathname.endsWith("/")
                    ? url.pathname.replace(/\/+$/, "")
                    : url.pathname.endsWith(".html")
                      ? url.pathname.slice(0, -".html".length)
                      : undefined;
              if (!target) return next();
              const decodedTarget = decodeURIComponent(target);
              const output = path.resolve(
                previewRoot,
                target === "/" ? "index.html" : "." + decodedTarget + ".html",
              );
              if (
                (output === path.join(previewRoot, "index.html") ||
                  output.startsWith(previewRoot + path.sep)) &&
                (await stat(output).catch(() => null))?.isFile()
              ) {
                response.statusCode = 301;
                response.setHeader("Location", target + url.search);
                response.end();
                return;
              }
              next();
            } catch (error) {
              next(error);
            }
          });
          return () =>
            server.middlewares.use(async (_request, response, next) => {
              try {
                const requested = path.resolve(
                  previewRoot,
                  "." + decodeURIComponent((_request.url ?? "/").split("?")[0]),
                );
                if (
                  requested.startsWith(previewRoot + path.sep) &&
                  (await stat(requested).catch(() => null))?.isFile()
                )
                  return next();
                const html = await readFile(path.join(previewRoot, "404.html"), "utf8");
                response.statusCode = 404;
                response.setHeader("Content-Type", "text/html; charset=utf-8");
                response.end(html);
              } catch (error) {
                next(error);
              }
            });
        },
        configureServer(server: ViteDevServer) {
          const contentRootPath = path.resolve(root, contentRoot);
          server.watcher.on("all", (_event, file) => {
            if (path.resolve(file).startsWith(contentRootPath + path.sep)) invalidateContentCache();
          });
          server.middlewares.use(async (request, response, next) => {
            try {
              const url = new URL(request.url ?? "/", "http://localhost");
              if (url.pathname !== "/" && url.pathname !== "/404.html") {
                const target =
                  url.pathname === "/index.html"
                    ? "/"
                    : url.pathname.endsWith("/")
                      ? url.pathname.replace(/\/+$/, "")
                      : url.pathname.endsWith(".html")
                        ? url.pathname.slice(0, -".html".length)
                        : undefined;
                if (target !== undefined) {
                  const posts = listPosts(await loadDocs(root));
                  const pagePaths = new Set([
                    (await loadAboutPage(root)).path,
                    ...posts.map(({ path }) => path),
                    ...[...homePages(posts), ...tagPages(posts)].map(({ path }) => path),
                  ]);
                  if (pagePaths.has(target)) {
                    response.statusCode = 301;
                    response.setHeader("Location", target + url.search);
                    response.end();
                    return;
                  }
                }
              }
              next();
            } catch (error) {
              next(error);
            }
          });
          server.middlewares.use(async (request, response, next) => {
            const searchOutput = searchOutputs.get(request.url?.split("?")[0] ?? "");
            if (!searchOutput) return next();
            try {
              const output = await searchOutput.load(root);
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(output);
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
      outDir: buildOutDir,
      rolldownOptions: { input: { client: "src/client.ts" } },
    },
    test: { include: ["src/**/*.test.ts"] },
  };
});
