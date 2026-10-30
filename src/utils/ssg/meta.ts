import type { HeadInput, HeadMeta } from "@ox-content/vite-plugin";
import type { PageData } from "../../pages/page-data";

/** The site settings the page head reads. */
export interface SiteMeta {
  name: string;
  title: string;
  url: string;
  description: string;
  themeColor: string;
}

/** Image X draws for pages without a thumbnail. Square, so X shows it as it is. */
const siteIcon = { path: "/icon-512.png", width: 512, height: 512, mediaType: "image/png" };

/** Absolute URL of a route. The home page has no trailing slash, as its canonical does. */
export function pageUrl(siteUrl: string, pagePath: string): string {
  return siteUrl + (pagePath === "/" ? "" : pagePath);
}

/** Frontmatter dates are calendar days in JST, so the article times are too. */
const articleTime = (date: string) => date + "T00:00:00+09:00";

/**
 * X replaces a large card with the small one below 300×157, so the page declares
 * the card X would show. An unreadable size keeps the large card: the image is
 * still the article's own, and X decides on the file itself.
 */
function cardType(thumbnail: PageData["thumbnail"]): "summary" | "summary_large_image" {
  if (!thumbnail) return "summary";
  const { width, height } = thumbnail;
  if (width === undefined || height === undefined) return "summary_large_image";
  return width >= 300 && height >= 157 ? "summary_large_image" : "summary";
}

export interface PageHeadInput {
  page: PageData;
  site: SiteMeta;
  /** The dev server serves pages that must stay out of search results. */
  serve: boolean;
}

/**
 * Everything `renderHead` needs for one page: title, canonical, OGP, the X card,
 * and structured data. Kept out of the renderer so each page kind stays testable.
 */
export function pageHead({ page, site, serve }: PageHeadInput): HeadInput {
  const loc = pageUrl(site.url, page.path);
  const isPost = page.isPost === true;
  const thumbnail = page.thumbnail;
  const image = thumbnail
    ? {
        url: new URL(thumbnail.src, site.url).href,
        width: thumbnail.width,
        height: thumbnail.height,
        mediaType: thumbnail.mediaType,
        alt: page.title,
      }
    : {
        url: new URL(siteIcon.path, site.url).href,
        width: siteIcon.width,
        height: siteIcon.height,
        mediaType: siteIcon.mediaType,
        alt: site.name,
      };
  const articleMetas: HeadMeta[] = isPost
    ? [
        ...(page.created
          ? [{ property: "article:published_time", content: articleTime(page.created) }]
          : []),
        ...(page.updated
          ? [{ property: "article:modified_time", content: articleTime(page.updated) }]
          : []),
        ...(page.tags ?? []).map((tag, index) => ({
          property: "article:tag",
          content: tag,
          // The renderer keeps one tag per key, so every article tag needs its own.
          key: "article:tag:" + index,
        })),
      ]
    : [];
  const imageMetas: HeadMeta[] = [
    ...(image.width ? [{ property: "og:image:width", content: String(image.width) }] : []),
    ...(image.height ? [{ property: "og:image:height", content: String(image.height) }] : []),
    { property: "og:image:type", content: image.mediaType },
    { property: "og:image:alt", content: image.alt },
    { name: "twitter:image:alt", content: image.alt },
  ];
  const structuredData =
    page.kind === "404"
      ? undefined
      : page.path === "/"
        ? {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: site.name,
            url: loc,
            description: site.description,
          }
        : {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: page.title,
            url: loc,
            description: page.description,
            isPartOf: { "@type": "WebSite", name: site.name, url: site.url },
            inLanguage: "ja",
          };
  return {
    // Report an unsafe canonical or OGP image instead of dropping it silently.
    validation: "strict",
    site: { name: site.name, url: site.url, locale: "ja" },
    title: page.kind === "404" || page.path !== "/" ? page.title + " | " + site.title : site.title,
    titleSuffix: false,
    description: page.description,
    canonical: page.kind === "404" ? undefined : loc,
    robots: serve || page.kind === "404" ? "noindex, nofollow" : undefined,
    ogType: isPost ? "article" : "website",
    twitterCard: cardType(thumbnail),
    ogImage: image.url,
    emitSiteName: true,
    jsonLd: structuredData && [{ json: JSON.stringify(structuredData) }],
    metas: [
      { name: "viewport", content: "width=device-width,initial-scale=1" },
      { name: "color-scheme", content: "light" },
      { name: "theme-color", content: site.themeColor },
      { property: "og:locale", content: "ja_JP" },
      ...articleMetas,
      ...imageMetas,
    ],
  };
}
