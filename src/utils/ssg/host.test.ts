import { describe, expect, it } from "vitest";
import { site } from "../../config/site";
import type { PageData } from "../../pages/page-data";
import type { DocPage } from "./content";
import { aboutPage, homePages, notFoundPage, postPage, tagPages } from "./host";

const posts = (count: number, tags: string[]): DocPage[] =>
  Array.from({ length: count }, (_, index) => ({
    path: `/posts/post-${index + 1}`,
    indexPath: `/post-${index + 1}`,
    title: `記事 ${index + 1}`,
    description: "",
    icon: "document",
    tags,
    source: "",
    documentPath: `post-${index + 1}.md`,
  }));

describe("tagPages", () => {
  it("タグの記事を1ページの件数ずつに分け、2ページ目以降を/page/Nにする", () => {
    const pages = tagPages(posts(site.postsPerPage + 1, ["AC/DC"]));
    expect(pages.map(({ path, title, posts }) => ({ path, title, count: posts?.length }))).toEqual([
      { path: "/tags/AC/DC", title: "#AC/DC", count: site.postsPerPage },
      { path: "/tags/AC/DC/page/2", title: "#AC/DC（2ページ目）", count: 1 },
    ]);
    expect(pages[1]?.pagination).toEqual({
      current: 2,
      pages: [
        { number: 1, path: "/tags/AC/DC" },
        { number: 2, path: "/tags/AC/DC/page/2" },
      ],
      previous: "/tags/AC/DC",
      next: undefined,
    });
  });

  it("ほかのタグのページとURLが重なるタグ名ではビルドを止める", () => {
    expect(() =>
      tagPages([...posts(site.postsPerPage + 1, ["AC"]), ...posts(1, ["AC/page/2"])]),
    ).toThrow(
      "タグ「#AC」と「#AC/page/2」のページが同じURL /tags/AC/page/2 になるため、どちらかのタグ名を変更してください",
    );
  });
});

describe("アドレスバー", () => {
  const address = (page: PageData) => page.breadcrumbs.map(({ label }) => label);
  const doc = (path: string, title: string): DocPage => ({
    ...posts(1, ["ロック"])[0]!,
    path,
    title,
  });

  it("トップの1ページ目は区切りを出さず、2ページ目以降はURLのパスを区切りごとに出す", () => {
    expect(homePages(posts(site.postsPerPage * 2 + 1, [])).map(address)).toEqual([
      [],
      ["page", "2"],
      ["page", "3"],
    ]);
  });

  it("記事をタイトルではなくURLの最後の区切りのファイル名にする", () => {
    expect(
      address(postPage([doc("/posts/abbey-road", "「アビイ・ロード」を2026年に聴く")], 0)),
    ).toEqual(["abbey-road.html"]);
  });

  it("Aboutをタイトルではなくabout.htmlにする", () => {
    expect(address(aboutPage(doc("/about", "About")))).toEqual(["about.html"]);
  });

  it("タグはURLのパスをデコードして区切りごとに出し、.htmlと#を付けない", () => {
    expect(tagPages(posts(site.postsPerPage + 1, ["ロック"])).map(address)).toEqual([
      ["tags", "ロック"],
      ["tags", "ロック", "page", "2"],
    ]);
  });

  it("/を含むタグはURLの区切りどおりにフォルダを分ける", () => {
    expect(tagPages(posts(site.postsPerPage + 1, ["AC/DC"])).map(address)).toEqual([
      ["tags", "AC", "DC"],
      ["tags", "AC", "DC", "page", "2"],
    ]);
  });

  it("404を404.htmlにする", () => {
    expect(address(notFoundPage)).toEqual(["404.html"]);
  });
});
