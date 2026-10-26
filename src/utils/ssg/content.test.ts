import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listPosts, loadAboutPage, loadDocs, loadSearchIndex } from "./content";

const roots: string[] = [];

async function createRoot(posts: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ongaku-review-"));
  roots.push(root);
  const directory = path.join(root, "src/content/posts");
  await mkdir(directory, { recursive: true });
  for (const [name, source] of Object.entries(posts))
    await writeFile(path.join(directory, name), source, "utf8");
  return root;
}

const post = (frontmatter: string) => `---\n${frontmatter}\n---\n\n# 見出し\n`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("loadDocs", () => {
  it("公開状態を省略した記事とtrueの記事だけを読み込む", async () => {
    const root = await createRoot({
      "default.md": post("title: 省略"),
      "published.md": post("title: 公開\nisPublished: true"),
      "hidden.mdx": post("title: 非公開\nisPublished: false"),
    });

    expect((await loadDocs(root)).map((doc) => doc.path)).toEqual([
      "/posts/default/",
      "/posts/published/",
    ]);
  });

  it.each(['"false"', "0", "null", "[]", "{}"])(
    "真偽値でないisPublished: %sを拒否する",
    async (value) => {
      const root = await createRoot({ "invalid.md": post(`isPublished: ${value}`) });

      await expect(loadDocs(root)).rejects.toThrow(
        "src/content/posts/invalid.md: isPublished には true か false を指定してください",
      );
    },
  );

  it("createdとupdatedを読み取る", async () => {
    const root = await createRoot({
      "first.md": post("title: 最初の記事\ncreated: 2026-10-01\nupdated: 2026-10-20"),
    });

    const [doc] = await loadDocs(root);

    expect(doc?.created).toBe("2026-10-01");
    expect(doc?.updated).toBe("2026-10-20");
  });

  it("updatedを省略するとcreatedと同じ日時になる", async () => {
    const root = await createRoot({
      "first.md": post("title: 最初の記事\ncreated: 2026-10-01"),
    });

    const [doc] = await loadDocs(root);

    expect(doc?.updated).toBe("2026-10-01");
  });
});

describe("loadAboutPage", () => {
  it("固定ページと同名の記事を別々のURLで読み込む", async () => {
    const root = await createRoot({ "about.md": post("title: Aboutの記事") });
    await writeFile(
      path.join(root, "src/content/about.mdx"),
      post("title: About\ndescription: 固定ページ"),
    );

    expect(await loadAboutPage(root)).toMatchObject({
      path: "/about/",
      title: "About",
      description: "固定ページ",
    });
    expect((await loadDocs(root)).map((doc) => doc.path)).toEqual(["/posts/about/"]);
  });
});

describe("loadSearchIndex", () => {
  it("非公開記事を本文・検索語を含めてインデックスから除外する", async () => {
    const root = await createRoot({
      "published.md": post("title: PublicFixture"),
      "hidden.mdx": post("title: SecretFixture\nisPublished: false") + "SecretBodyToken",
      "_partial.md": post("title: PartialFixture"),
    });
    await writeFile(path.join(root, "src/content/about.mdx"), post("title: AboutFixture"));

    const index = await loadSearchIndex(root);
    expect(JSON.parse(index).documents.map((doc: { id: string }) => doc.id)).toEqual(["published"]);
    expect(index).toContain("PublicFixture");
    expect(index.toLowerCase()).not.toMatch(/secret|partial|aboutfixture/);
  });
});

describe("listPosts", () => {
  it("updatedではなくcreatedの新しい順に並べる", async () => {
    const root = await createRoot({
      "old.md": post("title: 古い記事\ncreated: 2026-10-01\nupdated: 2026-10-30"),
      "new.md": post("title: 新しい記事\ncreated: 2026-10-20\nupdated: 2026-10-21"),
      "undated.md": post("title: 日付なし"),
    });

    const docs = await loadDocs(root);

    expect(listPosts(docs).map((doc) => doc.title)).toEqual(["新しい記事", "古い記事", "日付なし"]);
  });
});
