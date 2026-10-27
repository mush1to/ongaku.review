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
  listPosts,
  loadAboutPage,
  loadDocs,
  loadSearchIndex,
  loadSearchPages,
} from "./src/utils/ssg/content";
import { site } from "./src/config/site";
import { tagRoutePath } from "./src/utils/search-path";

export default defineConfig(async ({ command, mode }) => {
  const root = import.meta.dirname;
  let searchOutputDirectory: string | undefined;
  const searchOutputs = new Map([
    ["/search-index.json", loadSearchIndex],
    ["/search-pages.json", loadSearchPages],
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
          extraAssets: docs.flatMap(({ thumbnail }) =>
            thumbnail
              ? [{ sourcePath: thumbnail.sourcePath, publicPath: thumbnail.publicPath }]
              : [],
          ),
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
            for (const [url, load] of searchOutputs)
              await writeFile(
                path.join(searchOutputDirectory, url.slice(1)),
                await load(root),
                "utf8",
              );
          },
        },
        configurePreviewServer(server: PreviewServer) {
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
              const dist = path.resolve(root, "dist");
              const decodedTarget = decodeURIComponent(target);
              const output = path.resolve(
                dist,
                target === "/" ? "index.html" : "." + decodedTarget + ".html",
              );
              if (
                (output === path.join(dist, "index.html") || output.startsWith(dist + path.sep)) &&
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
                  const pageCount = Math.max(1, Math.ceil(posts.length / site.postsPerPage));
                  const pagePaths = new Set([
                    "/",
                    (await loadAboutPage(root)).path,
                    ...posts.map(({ path }) => path),
                    ...posts.flatMap(({ tags }) => tags.map(tagRoutePath)),
                    ...Array.from({ length: pageCount }, (_, index) =>
                      index === 0 ? "/" : `/page/${index + 1}`,
                    ),
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
            const load = searchOutputs.get(request.url?.split("?")[0] ?? "");
            if (!load) return next();
            try {
              const output = await load(root);
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
      rolldownOptions: { input: { client: "src/client.ts" } },
    },
    test: { include: ["src/**/*.test.ts"] },
  };
});
