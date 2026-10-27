import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  planCollectionAssetsFromDocuments,
  rewriteCollectionAssetUrls,
} from "@ox-content/vite-plugin";
import { listPosts, loadAboutPage, loadDocs, loadSearchIndex, loadSearchPages } from "./content";

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
      "/posts/default",
      "/posts/published",
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

describe("thumbnail", () => {
  async function createRootWithImage(frontmatter: string, image = "images/cover.png") {
    const root = await createRoot({ "first.md": post(frontmatter) });
    const imagePath = path.join(root, "src/content/posts", image);
    await mkdir(path.dirname(imagePath), { recursive: true });
    await writeFile(imagePath, "");
    return root;
  }

  it("記事ファイルからの相対パスで画像を読み込み、記事URLを基準に公開パスを決める", async () => {
    const root = await createRootWithImage(
      "thumbnail: ./images/cover.png\nthumbnailAlt: ジャケット写真",
    );

    const [doc] = await loadDocs(root);

    expect(doc?.thumbnail).toEqual({
      sourcePath: path.join(root, "src/content/posts/images/cover.png"),
      publicPath: "/posts/first/images/cover.png",
      alt: "ジャケット写真",
    });
  });

  it("バックスラッシュ区切りの相対パスもスラッシュと同じ画像として解決する", async () => {
    const root = await createRootWithImage(`thumbnail: ./images\\cover.png`);

    const [doc] = await loadDocs(root);

    expect(doc?.thumbnail).toEqual({
      sourcePath: path.join(root, "src/content/posts/images/cover.png"),
      publicPath: "/posts/first/images/cover.png",
      alt: "",
    });
  });

  it("thumbnailAltを省略すると代替テキストを空にする", async () => {
    const root = await createRootWithImage("thumbnail: ./images/cover.png");

    expect((await loadDocs(root))[0]?.thumbnail?.alt).toBe("");
  });

  it("thumbnailを省略すると見出し画像を設定しない", async () => {
    const root = await createRoot({ "first.md": post("title: 画像なし") });

    expect((await loadDocs(root))[0]?.thumbnail).toBeUndefined();
  });

  it("URLに特殊文字を含む見出し画像をcollection assetとして解決する", async () => {
    const filename = "cover % # 日本語.png";
    const root = await createRoot({
      "first.md": post(`thumbnail: "./images/${filename}"`) + "\n![本文画像](./images/body.png)\n",
    });
    const images = path.join(root, "src/content/posts/images");
    await mkdir(images, { recursive: true });
    await writeFile(path.join(images, filename), "");
    await writeFile(path.join(images, "body.png"), "");
    const [doc] = await loadDocs(root);
    const thumbnail = doc!.thumbnail!;
    const planned = await planCollectionAssetsFromDocuments({
      root,
      contentRoot: "src/content",
      documents: [{ documentPath: doc!.documentPath, pagePath: doc!.path, source: doc!.source }],
      extraAssets: [{ sourcePath: thumbnail.sourcePath, publicPath: thumbnail.publicPath }],
    });
    const asset = planned.manifest.assets.find(
      (entry) => path.resolve(entry.sourcePath) === thumbnail.sourcePath,
    );
    const bodyAsset = planned.manifest.assets.find(
      (entry) => entry.sourcePath === path.join(images, "body.png"),
    );
    const rewritten = rewriteCollectionAssetUrls({
      html: `<img src="${thumbnail.publicPath}">` + '<img src="/posts/first/images/body.png">',
      pagePath: doc!.path + "/",
      manifest: planned.manifest,
      document: true,
    });

    expect(planned.diagnostics).toEqual([]);
    expect(thumbnail.publicPath).toBe(
      "/posts/first/images/cover%20%25%20%23%20%E6%97%A5%E6%9C%AC%E8%AA%9E.png",
    );
    expect(asset?.publicPaths).toContain(thumbnail.publicPath);
    expect(rewritten.html).toContain(asset!.contentPath);
    expect(bodyAsset?.publicPaths).toContain("/posts/first/images/body.png");
    expect(rewritten.html).toContain(bodyAsset!.contentPath);
  });

  it("存在しない画像を拒否する", async () => {
    const root = await createRoot({ "first.md": post("thumbnail: ./images/missing.png") });

    await expect(loadDocs(root)).rejects.toThrow(
      "src/content/posts/first.md: thumbnail の画像 ./images/missing.png が見つかりません",
    );
  });

  it.each(["/images/cover.png", "https://example.com/cover.png"])(
    "相対パスでないthumbnail: %sを拒否する",
    async (value) => {
      const root = await createRootWithImage(`thumbnail: ${value}`);

      await expect(loadDocs(root)).rejects.toThrow(
        "src/content/posts/first.md: thumbnail は記事ファイルからの相対パスで指定してください",
      );
    },
  );

  it("対応していない拡張子を拒否する", async () => {
    const root = await createRootWithImage("thumbnail: ./images/cover.gif", "images/cover.gif");

    await expect(loadDocs(root)).rejects.toThrow(
      "src/content/posts/first.md: thumbnail には .jpg・.jpeg・.png・.webp のいずれかの画像を指定してください",
    );
  });

  it("src/contentの外を指す画像を拒否する", async () => {
    const root = await createRoot({ "first.md": post("thumbnail: ../../../outside.png") });
    await writeFile(path.join(root, "outside.png"), "");

    await expect(loadDocs(root)).rejects.toThrow(
      "src/content/posts/first.md: thumbnail には src/content 内の画像を指定してください",
    );
  });

  it.each(["file", "directory"])("src/content外への%s symlinkを拒否する", async (kind) => {
    const reference = kind === "file" ? "./linked.png" : "./linked/cover.png";
    const root = await createRoot({ "first.md": post(`thumbnail: ${reference}`) });
    const outside = path.join(root, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "cover.png"), "");
    await symlink(
      kind === "file" ? path.join(outside, "cover.png") : outside,
      path.join(root, "src/content/posts", kind === "file" ? "linked.png" : "linked"),
      kind === "file" ? "file" : "dir",
    );

    await expect(loadDocs(root)).rejects.toThrow(
      "src/content/posts/first.md: thumbnail には src/content 内の画像を指定してください",
    );
  });

  it("src/content内へのsymlinkは実パスと元の公開URLで登録する", async () => {
    const root = await createRootWithImage("thumbnail: ./linked.png");
    const target = path.join(root, "src/content/posts/images/cover.png");
    await symlink(target, path.join(root, "src/content/posts/linked.png"));
    const [doc] = await loadDocs(root);
    const thumbnail = doc!.thumbnail!;
    expect(thumbnail.sourcePath).toBe(await realpath(target));
    expect(thumbnail.publicPath).toBe("/posts/first/linked.png");
    const planned = await planCollectionAssetsFromDocuments({
      root,
      contentRoot: "src/content",
      documents: [{ documentPath: doc!.documentPath, pagePath: doc!.path, source: doc!.source }],
      extraAssets: [{ sourcePath: thumbnail.sourcePath, publicPath: thumbnail.publicPath }],
    });
    expect(
      planned.manifest.assets.find((asset) => asset.sourcePath === thumbnail.sourcePath)
        ?.publicPaths,
    ).toContain(thumbnail.publicPath);
  });
});

describe("tags", () => {
  it("先頭の#を取り除き、重複をまとめる", async () => {
    const root = await createRoot({
      "first.md": post(
        'tags:\n  - "#ロック"\n  - ロック\n  - "＃ジャズ"\n  - " "\n  - ＲＯＣＫ\n  - ROCK',
      ),
    });

    expect((await loadDocs(root))[0]?.tags).toEqual(["ロック", "ジャズ", "ＲＯＣＫ"]);
  });

  it("tagsを省略すると空の配列になる", async () => {
    const root = await createRoot({ "first.md": post("title: タグなし") });

    expect((await loadDocs(root))[0]?.tags).toEqual([]);
  });

  it.each(["ロック", "[1, 2]", "{}"])("文字列の配列でないtags: %sを拒否する", async (value) => {
    const root = await createRoot({ "first.md": post(`tags: ${value}`) });

    await expect(loadDocs(root)).rejects.toThrow(
      "src/content/posts/first.md: tags は文字列の配列で指定してください",
    );
  });

  it("unsafeなタグ名を記事ファイル付きで拒否する", async () => {
    const root = await createRoot({ "invalid.md": post('tags:\n  - ".."') });

    await expect(loadDocs(root)).rejects.toThrow(
      "src/content/posts/invalid.md: タグ名には空のパス要素、「.」「..」、制御文字、バックスラッシュを使用できません",
    );
  });

  it("スラッシュを含む表現可能なタグを許可する", async () => {
    const root = await createRoot({ "valid.md": post("tags:\n  - AC/DC") });

    expect((await loadDocs(root))[0]?.tags).toEqual(["AC/DC"]);
  });
});

describe("author", () => {
  it("authorを省略するとサイトの著者名を使う", async () => {
    const root = await createRoot({ "first.md": post("title: 著者なし") });

    expect((await loadDocs(root))[0]?.author).toBe("mush1to");
  });

  it("authorを指定するとその名前を使う", async () => {
    const root = await createRoot({ "first.md": post("author: ゲスト") });

    expect((await loadDocs(root))[0]?.author).toBe("ゲスト");
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
      path: "/about",
      title: "About",
      description: "固定ページ",
    });
    expect((await loadDocs(root)).map((doc) => doc.path)).toEqual(["/posts/about"]);
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

describe("loadSearchPages", () => {
  it("公開記事を新しい順に並べ、検索URLから記事URL・タイトル・アイコン・タグを引けるようにする", async () => {
    const root = await createRoot({
      "old.md": post("title: 古い記事\ncreated: 2026-10-01\ntags:\n  - ロック"),
      "new.md": post("title: 新しい記事\ncreated: 2026-10-20\nicon: cd"),
      "hidden.md": post("title: 非公開\nisPublished: false"),
    });

    const pages = JSON.parse(await loadSearchPages(root));
    expect(Object.keys(pages)).toEqual(["/new", "/old"]);
    expect(pages).toEqual({
      "/new": { path: "/posts/new", title: "新しい記事", icon: "cd", tags: [] },
      "/old": { path: "/posts/old", title: "古い記事", icon: "document", tags: ["ロック"] },
    });
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
