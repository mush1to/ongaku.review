import { describe, expect, it } from "vitest";
import { site } from "../../config/site";
import type { DocPage } from "./content";
import { tagPages } from "./host";

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
