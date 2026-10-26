import type { Component } from "svelte";
import {
  rewriteCollectionAssetUrls,
  type OxContentCustomHostBaseContext,
  type OxContentCustomHostModule,
  type OxContentCustomHostRoute,
} from "@ox-content/vite-plugin";
import {
  createSvelteHtmlHostRenderer,
  type RenderSvelteHtmlHostResult,
} from "@ox-content/vite-plugin-svelte";
import { searchPath, site } from "../../config/site";
import type { PageData, Pagination } from "../../pages/page-data";
import { normalizeSearchPath } from "../search-path";
import { listPosts, loadAboutPage, loadDocs, type DocPage } from "./content";
import { preserveFullWidthSpaces } from "./whitespace";

const components = (root: string) => ({
  SiteStatus: root + "/src/components/SiteStatus.svelte",
});

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

const notFoundPage: PageData = {
  kind: "404",
  path: "/404.html",
  title: "ページが見つかりません",
  description: "お探しのページは見つかりませんでした。",
  breadcrumbs: [{ label: "ページが見つかりません" }],
};

const listPath = (page: number) => (page === 1 ? "/" : `/page/${page}/`);

function homePages(posts: readonly DocPage[]): PageData[] {
  const size = site.postsPerPage;
  const count = Math.max(1, Math.ceil(posts.length / size));
  const pages = Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    path: listPath(index + 1),
  }));
  return pages.map(({ number, path }) => {
    const pagination: Pagination | undefined =
      count > 1
        ? {
            current: number,
            pages,
            previous: number > 1 ? listPath(number - 1) : undefined,
            next: number < count ? listPath(number + 1) : undefined,
          }
        : undefined;
    return {
      kind: "home",
      path,
      title: number === 1 ? site.title : `${number}ページ目`,
      description: site.description,
      // Pagination is a view of Home, so later list pages keep the same address bar.
      breadcrumbs: [],
      posts: posts
        .slice((number - 1) * size, number * size)
        .map(({ path, title, created, icon }) => ({ path, title, created, icon })),
      pagination,
    };
  });
}

const docPage = (doc: DocPage, isPost: boolean): PageData => ({
  kind: "page",
  path: doc.path,
  title: doc.title,
  description: doc.description,
  breadcrumbs: [{ label: doc.title }],
  created: doc.created,
  updated: doc.updated,
  isPost,
});

const searchPage = (docs: readonly DocPage[]): PageData => ({
  kind: "search",
  path: searchPath,
  title: "検索",
  description: site.title + " の記事を検索します。",
  breadcrumbs: [{ label: "検索" }],
  searchPages: Object.fromEntries(
    docs.map((doc) => [normalizeSearchPath(doc.indexPath), { path: doc.path, icon: doc.icon }]),
  ),
});

function assertRoutable(doc: DocPage) {
  if (doc.path === "/" || doc.path === searchPath || doc.path.startsWith("/page/"))
    throw new Error(
      `${doc.documentPath}: ${doc.path} は記事一覧・検索ページと重なるため、ファイル名を変更してください`,
    );
}

async function markdown(ctx: OxContentCustomHostBaseContext, source: string, documentPath: string) {
  const renderIslands = createSvelteHtmlHostRenderer({
    root: ctx.root,
    contentRoot: ctx.root + "/src",
    components: components(ctx.root),
    loadModule: ctx.loadModule,
    async renderComponent(component, props, slotHtml) {
      const { render } = (await ctx.loadModule("svelte/server")) as typeof import("svelte/server");
      const { createRawSnippet } = (await ctx.loadModule("svelte")) as typeof import("svelte");
      const output = render(component as Component, {
        props: {
          ...props,
          ...(slotHtml ? { children: createRawSnippet(() => ({ render: () => slotHtml })) } : {}),
        },
      });
      return { html: output.body, head: output.head };
    },
  });
  const markdownResult = await ctx.markdown.render({
    source: preserveFullWidthSpaces(source),
    documentPath,
  });
  const result: RenderSvelteHtmlHostResult = await renderIslands(markdownResult.html, {
    documentPath,
    imports: markdownResult.transform.imports,
    contentRoot: ctx.root + "/src",
  });
  return {
    ...markdownResult,
    html: result.html,
    metadata: result,
  };
}

async function renderPage(ctx: OxContentCustomHostBaseContext, page: PageData, source?: DocPage) {
  const body = source ? await markdown(ctx, source.source, source.documentPath) : undefined;
  const pageModule = (await ctx.loadModule("/src/pages/Page.svelte")) as {
    default: Component<{ page: PageData }>;
  };
  const { render } = (await ctx.loadModule("svelte/server")) as typeof import("svelte/server");
  const rendered = render(pageModule.default, {
    props: { page: { ...page, body: body?.html } },
  });
  const title =
    page.kind === "404" || page.path !== "/" ? page.title + " | " + site.title : site.title;
  const canonical = site.url + page.path;
  const assets = ctx.assets.document({
    clientEntries: ["src/client.ts"],
    sharedStyles: ctx.mode === "serve" ? ["/src/styles.css"] : [],
  });
  const robots =
    ctx.mode === "serve" || page.kind === "404"
      ? '<meta name="robots" content="noindex, nofollow">'
      : "";
  const structuredData =
    page.kind === "404"
      ? undefined
      : page.path === "/"
        ? {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: site.name,
            url: canonical,
            description: site.description,
          }
        : {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: page.title,
            url: canonical,
            description: page.description,
            isPartOf: { "@type": "WebSite", name: site.name, url: site.url + "/" },
            inLanguage: "ja",
          };
  const jsonLd = structuredData
    ? '<script type="application/ld+json">' +
      JSON.stringify(structuredData).replace(/</g, "\\u003c") +
      "</script>"
    : "";
  let html =
    '<!doctype html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light">' +
    '<meta name="theme-color" content="' +
    site.themeColor +
    '">' +
    "<title>" +
    escapeHtml(title) +
    "</title>" +
    '<meta name="description" content="' +
    escapeHtml(page.description) +
    '">' +
    '<link rel="canonical" href="' +
    escapeHtml(canonical) +
    '">' +
    '<link rel="alternate" type="application/rss+xml" title="' +
    escapeHtml(site.title) +
    '" href="/feed.xml">' +
    '<meta property="og:site_name" content="' +
    escapeHtml(site.title) +
    '">' +
    '<meta property="og:title" content="' +
    escapeHtml(title) +
    '">' +
    '<meta property="og:description" content="' +
    escapeHtml(page.description) +
    '">' +
    '<meta property="og:url" content="' +
    escapeHtml(canonical) +
    '">' +
    '<meta property="og:type" content="website">' +
    '<meta name="twitter:card" content="summary">' +
    '<meta name="twitter:title" content="' +
    escapeHtml(title) +
    '">' +
    '<meta name="twitter:description" content="' +
    escapeHtml(page.description) +
    '">' +
    robots +
    jsonLd +
    rendered.head +
    (body?.metadata?.headHtml ?? "") +
    assets.headHtml +
    "</head><body>" +
    rendered.body +
    "</body></html>";
  const manifest = await ctx.assets.collectionManifest();
  if (manifest)
    html = rewriteCollectionAssetUrls({ html, pagePath: page.path, manifest, document: true }).html;
  return {
    html,
    title: page.title,
    description: page.description,
    loc: canonical,
    dependencies: body?.dependencies ?? [],
    ...(page.kind === "404" ? { outputPath: "404.html", status: 404, unlisted: true } : {}),
  };
}

const host: OxContentCustomHostModule = {
  async routes(ctx) {
    const docs = await ctx.memo("content", () => loadDocs(ctx.root));
    docs.forEach(assertRoutable);
    const routes: OxContentCustomHostRoute[] = homePages(listPosts(docs)).map((page) => ({
      path: page.path,
      title: page.title,
      description: page.description,
      render: (context) => renderPage(context, page),
    }));
    for (const doc of docs)
      routes.push({
        path: doc.path,
        title: doc.title,
        description: doc.description,
        inputPath: doc.documentPath,
        source: doc.source,
        render: (context) => renderPage(context, docPage(doc, true), doc),
      });
    const about = await ctx.memo("about", () => loadAboutPage(ctx.root));
    const search = searchPage(docs);
    routes.push(
      {
        path: about.path,
        title: about.title,
        description: about.description,
        inputPath: about.documentPath,
        source: about.source,
        render: (context) => renderPage(context, docPage(about, false), about),
      },
      {
        path: search.path,
        title: search.title,
        description: search.description,
        render: (context) => renderPage(context, search),
      },
      {
        path: notFoundPage.path,
        unlisted: true,
        render: (context) => renderPage(context, notFoundPage),
      },
    );
    return routes;
  },
  async outputs(ctx) {
    const docs = await ctx.memo("content", () => loadDocs(ctx.root));
    return {
      siteDescription: site.description,
      items: listPosts(docs).map((doc) => ({
        title: doc.title,
        description: doc.description,
        url: site.url + doc.path,
        path: doc.path,
        date: doc.created,
        lastUpdated: doc.updated,
      })),
    };
  },
  async notFound(ctx) {
    if (!ctx.request.headers.get("accept")?.includes("text/html")) return;
    return renderPage(ctx, notFoundPage);
  },
};

export default host;
