import { describe, expect, it } from "vitest";
import { renderHead } from "@ox-content/vite-plugin";
import type { PageData } from "../../pages/page-data";
import { pageHead, pageUrl, type SiteMeta } from "./meta";

const site: SiteMeta = {
  name: "ongaku.review",
  title: "ongaku.review",
  url: "https://ongaku.review",
  description: "音楽が好き。",
  themeColor: "#0b55e0",
};

const head = (page: PageData, serve = false) => renderHead(pageHead({ page, site, serve })).html;

const metaContents = (html: string, attribute: "name" | "property", key: string) =>
  [...html.matchAll(new RegExp(`<meta ${attribute}="${key}" content="([^"]*)"`, "g"))].map(
    (match) => match[1],
  );

const metaContent = (html: string, attribute: "name" | "property", key: string) =>
  metaContents(html, attribute, key)[0];

const post: PageData = {
  kind: "page",
  path: "/posts/abbey-road",
  title: "「アビイ・ロード」を2026年に聴く",
  description: "最後の一音まで聴く。",
  breadcrumbs: [{ label: "「アビイ・ロード」を2026年に聴く" }],
  isPost: true,
  created: "2026-10-25",
  updated: "2026-10-26",
  tags: ["ロック", "The Beatles"],
  thumbnail: {
    src: "/assets/content/0a1b2c.png",
    width: 1200,
    height: 630,
    mediaType: "image/png",
  },
};

const postWithoutThumbnail: PageData = { ...post, thumbnail: undefined };

describe("pageHead の記事ページ", () => {
  it("OGPをarticleにし、公開日時・更新日時・タグをJSTのISO 8601で出力する", () => {
    const html = head(post);

    expect(metaContent(html, "property", "og:type")).toBe("article");
    expect(metaContent(html, "property", "og:url")).toBe("https://ongaku.review/posts/abbey-road");
    expect(metaContent(html, "property", "article:published_time")).toBe(
      "2026-10-25T00:00:00+09:00",
    );
    expect(metaContent(html, "property", "article:modified_time")).toBe(
      "2026-10-26T00:00:00+09:00",
    );
    expect(metaContents(html, "property", "article:tag")).toEqual(["ロック", "The Beatles"]);
    expect(metaContent(html, "property", "og:locale")).toBe("ja_JP");
  });

  it("thumbnailを大きな画像付きカードの絶対URLと実寸で出力する", () => {
    const html = head(post);

    expect(metaContent(html, "property", "og:image")).toBe(
      "https://ongaku.review/assets/content/0a1b2c.png",
    );
    expect(metaContent(html, "name", "twitter:image")).toBe(
      "https://ongaku.review/assets/content/0a1b2c.png",
    );
    expect(metaContent(html, "name", "twitter:card")).toBe("summary_large_image");
    expect(metaContent(html, "property", "og:image:width")).toBe("1200");
    expect(metaContent(html, "property", "og:image:height")).toBe("630");
    expect(metaContent(html, "property", "og:image:type")).toBe("image/png");
    expect(metaContent(html, "property", "og:image:alt")).toBe("「アビイ・ロード」を2026年に聴く");
    expect(metaContent(html, "name", "twitter:image:alt")).toBe("「アビイ・ロード」を2026年に聴く");
    expect(metaContent(html, "property", "og:title")).toBe(
      "「アビイ・ロード」を2026年に聴く | ongaku.review",
    );
  });

  it("画像の実寸が読めない記事はサイズを省き、決め打ちしない", () => {
    const html = head({
      ...post,
      thumbnail: { src: "/assets/content/0a1b2c.jpg", mediaType: "image/jpeg" },
    });

    expect(metaContent(html, "name", "twitter:card")).toBe("summary_large_image");
    expect(metaContent(html, "property", "og:image:type")).toBe("image/jpeg");
    expect(metaContent(html, "property", "og:image:width")).toBeUndefined();
    expect(metaContent(html, "property", "og:image:height")).toBeUndefined();
  });

  it("thumbnailのない記事はサイトアイコンのsummaryカードにし、articleは保つ", () => {
    const html = head(postWithoutThumbnail);

    expect(metaContent(html, "property", "og:type")).toBe("article");
    expect(metaContent(html, "name", "twitter:card")).toBe("summary");
    expect(metaContent(html, "property", "og:image")).toBe("https://ongaku.review/icon-512.png");
    expect(metaContent(html, "name", "twitter:image")).toBe("https://ongaku.review/icon-512.png");
    expect(metaContent(html, "property", "og:image:width")).toBe("512");
    expect(metaContent(html, "property", "og:image:height")).toBe("512");
    expect(metaContent(html, "property", "og:image:type")).toBe("image/png");
    expect(metaContent(html, "property", "og:image:alt")).toBe("ongaku.review");
    expect(metaContent(html, "name", "twitter:image:alt")).toBe("ongaku.review");
    expect(metaContent(html, "property", "article:published_time")).toBe(
      "2026-10-25T00:00:00+09:00",
    );
  });
});

describe("pageHead のカード種別", () => {
  const withSize = (width: number, height: number): PageData => ({
    ...post,
    thumbnail: { src: "/assets/content/small.png", width, height, mediaType: "image/png" },
  });

  const cases: [number, number, string][] = [
    [299, 157, "summary"],
    [300, 157, "summary_large_image"],
    [300, 156, "summary"],
    [1200, 630, "summary_large_image"],
  ];

  for (const [width, height, card] of cases)
    it(`${width}×${height}のthumbnailは${card}のカードにする`, () => {
      const html = head(withSize(width, height));

      expect(metaContent(html, "name", "twitter:card")).toBe(card);
      expect(metaContent(html, "property", "og:image")).toBe(
        "https://ongaku.review/assets/content/small.png",
      );
      expect(metaContent(html, "name", "twitter:image")).toBe(
        "https://ongaku.review/assets/content/small.png",
      );
      expect(metaContent(html, "property", "og:image:width")).toBe(String(width));
      expect(metaContent(html, "property", "og:image:height")).toBe(String(height));
    });
});

describe("pageHead の記事以外のページ", () => {
  const home: PageData = {
    kind: "home",
    path: "/",
    title: "ongaku.review",
    description: "音楽が好き。",
    breadcrumbs: [],
  };

  it("トップページはwebsiteとsummaryのカードにし、サイトアイコンを使う", () => {
    const html = head(home);

    expect(metaContent(html, "property", "og:type")).toBe("website");
    expect(metaContent(html, "name", "twitter:card")).toBe("summary");
    expect(metaContent(html, "property", "og:image")).toBe("https://ongaku.review/icon-512.png");
    expect(metaContent(html, "property", "og:image:width")).toBe("512");
    expect(metaContent(html, "property", "og:image:height")).toBe("512");
    expect(metaContent(html, "property", "og:image:alt")).toBe("ongaku.review");
    expect(metaContent(html, "property", "og:locale")).toBe("ja_JP");
    expect(metaContents(html, "property", "article:tag")).toEqual([]);
  });

  it("タグページとAboutページもwebsiteとsummaryのカードにする", () => {
    for (const page of [
      { ...home, kind: "tag" as const, path: "/tags/ロック", title: "#ロック", tag: "ロック" },
      { ...home, kind: "page" as const, path: "/about", title: "About" },
    ]) {
      const html = head(page);

      expect(metaContent(html, "property", "og:type"), page.path).toBe("website");
      expect(metaContent(html, "name", "twitter:card"), page.path).toBe("summary");
      expect(metaContent(html, "property", "og:image"), page.path).toBe(
        "https://ongaku.review/icon-512.png",
      );
      expect(metaContent(html, "property", "og:url"), page.path).toBe(
        "https://ongaku.review" + page.path,
      );
      expect(metaContent(html, "property", "article:published_time"), page.path).toBeUndefined();
    }
  });

  it("ページ送りとタグページのcanonicalにも実URLを出す", () => {
    expect(pageUrl("https://ongaku.review", "/")).toBe("https://ongaku.review");
    expect(pageUrl("https://ongaku.review", "/page/2")).toBe("https://ongaku.review/page/2");
  });

  it("404はcanonicalを出さず、noindexにする", () => {
    const html = head({
      kind: "404",
      path: "/404.html",
      title: "ページが見つかりません",
      description: "お探しのページは見つかりませんでした。",
      breadcrumbs: [{ label: "ページが見つかりません" }],
    });

    expect(metaContent(html, "property", "og:type")).toBe("website");
    expect(metaContent(html, "name", "twitter:card")).toBe("summary");
    expect(metaContent(html, "property", "og:image")).toBe("https://ongaku.review/icon-512.png");
    expect(metaContent(html, "name", "robots")).toBe("noindex, nofollow");
    expect(html).not.toContain('rel="canonical"');
    expect(html).not.toContain('property="og:url"');
    expect(html).not.toContain("application/ld+json");
  });

  it("開発サーバーの配信ではnoindexにする", () => {
    expect(metaContent(head(home, true), "name", "robots")).toBe("noindex, nofollow");
    expect(metaContent(head(home), "name", "robots")).toBeUndefined();
  });
});
