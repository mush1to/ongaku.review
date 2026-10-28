import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  planCollectionAssetsFromDocuments,
  rewriteCollectionAssetUrls,
} from "@ox-content/vite-plugin";
import {
  listPosts,
  loadAboutPage,
  loadDocs,
  loadSearchIndex,
  loadSearchPages,
  loadUsers,
} from "./content";

const roots: string[] = [];

async function createRoot(
  posts: Record<string, string>,
  users = "mush1to:\n  name: むしにゃんこ\n",
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "ongaku-review-"));
  roots.push(root);
  const directory = path.join(root, "src/content/posts");
  await mkdir(directory, { recursive: true });
  for (const [name, source] of Object.entries(posts))
    await writeFile(path.join(directory, name), source, "utf8");
  await writeFile(path.join(root, "src/content/users.yaml"), users, "utf8");
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

describe("title", () => {
  it("100文字のtitleを読み込む", async () => {
    const title = "あ".repeat(100);
    const root = await createRoot({ "first.md": post(`title: ${title}`) });

    expect((await loadDocs(root))[0]?.title).toBe(title);
  });

  it("100文字を超えるtitleを拒否する", async () => {
    const root = await createRoot({ "long.md": post(`title: ${"あ".repeat(101)}`) });

    await expect(loadDocs(root)).rejects.toThrow(
      "src/content/posts/long.md: title は100文字以内で指定してください",
    );
  });

  it("ファイル名から作ったtitleも100文字を超えると拒否する", async () => {
    const name = "a".repeat(101) + ".md";
    const root = await createRoot({ [name]: "---\ncreated: 2026-10-01\n---\n\n本文です。\n" });

    await expect(loadDocs(root)).rejects.toThrow(
      `src/content/posts/${name}: title は100文字以内で指定してください`,
    );
  });

  it("本文の見出しから作ったtitleも100文字を超えると拒否する", async () => {
    const root = await createRoot({
      "long.md": `---
created: 2026-10-01
---

# ${"あ".repeat(101)}
`,
    });

    await expect(loadDocs(root)).rejects.toThrow(
      "src/content/posts/long.md: title は100文字以内で指定してください",
    );
  });
});

describe("description", () => {
  const article = (body: string, frontmatter = "title: 記事") =>
    `---\n${frontmatter}\n---\n\n${body}\n`;
  const describeFirst = async (body: string, frontmatter?: string) => {
    const root = await createRoot({ "first.md": article(body, frontmatter) });
    return (await loadDocs(root))[0]?.description;
  };

  it("本文の先頭の段落を説明にする", async () => {
    expect(await describeFirst("最初の段落です。\n\n次の段落です。")).toBe("最初の段落です。");
  });

  it("フロントマターのdescriptionは使わない", async () => {
    expect(await describeFirst("本文の説明です。", "title: 記事\ndescription: 手書きの説明")).toBe(
      "本文の説明です。",
    );
  });

  it("見出しで始まる記事でも最初の段落を説明にする", async () => {
    expect(await describeFirst("# 見出し\n\n本文の説明です。")).toBe("本文の説明です。");
  });

  it("段落のない記事は見出しを説明にする", async () => {
    expect(await describeFirst("# 見出し\n\n## 小見出し")).toBe("見出し");
  });

  it("箇条書きで始まる記事は最初の項目を説明にする", async () => {
    expect(await describeFirst("- 最初の項目\n- 次の項目")).toBe("最初の項目");
  });

  it("インラインの記法を取り除く", async () => {
    expect(
      await describeFirst(
        "**強い**文字と`コード`と[リンク](https://example.com)と![画像](./img/cover.png)です。",
      ),
    ).toBe("強い文字とコードとリンクと画像です。");
  });

  it("段落の折り返しは日本語では詰め、英数字の間だけ空白にする", async () => {
    expect(await describeFirst("学生の頃は\n「Here Comes the\nSun」ばかり聴いていました。")).toBe(
      "学生の頃は「Here Comes the Sun」ばかり聴いていました。",
    );
  });

  it("アクセント付きや全角のラテン文字も折り返しで区切る", async () => {
    expect(await describeFirst("café\nhouse")).toBe("café house");
    expect(await describeFirst("ＡＢ\nＣＤ")).toBe("ＡＢ ＣＤ");
  });

  it("MarkdownのHTMLコメントと自動リンクを解析できる", async () => {
    const root = await createRoot({
      "first.md": article("<!-- コメント -->\n\n<https://example.com> の記事です。"),
    });

    expect((await loadDocs(root))[0]?.description).toBe("https://example.com の記事です。");
  });

  it("MDXのHTMLコメントと自動リンクも解析できる", async () => {
    const root = await createRoot({
      "first.mdx": `---
title: 記事
---

<!-- コメント -->

<https://example.com> の記事です。
`,
    });

    expect((await loadDocs(root))[0]?.description).toBe("https://example.com の記事です。");
  });

  it("HTMLコメントとimportが同居する記事の説明にimportを含めない", async () => {
    const root = await createRoot({
      "first.mdx": `---
title: 記事
---

import Cover from "./Cover.svelte"

<!-- コメント -->

本文の説明です。
`,
    });

    expect((await loadDocs(root))[0]?.description).toBe("本文の説明です。");
  });

  it("importやexportで始まる文章は説明に含める", async () => {
    const describeAfterComment = async (body: string) => {
      const root = await createRoot({ "first.md": article(`<!-- コメント -->\n\n${body}`) });
      return (await loadDocs(root))[0]?.description;
    };

    expect(await describeAfterComment("import した音楽の話をします。")).toBe(
      "import した音楽の話をします。",
    );
    expect(await describeAfterComment("export される音の話をします。")).toBe(
      "export される音の話をします。",
    );
  });

  it("HTMLコメントとMDXの式が同居する記事の説明に式を含めない", async () => {
    const root = await createRoot({
      "first.mdx": `---
title: 記事
---

<!-- コメント -->

{secretValue} についての記事です。
`,
    });

    expect((await loadDocs(root))[0]?.description).toBe("についての記事です。");
  });

  it("英文の句点で折り返した段落は空白を空ける", async () => {
    expect(await describeFirst("Done.\nNext line starts here.")).toBe(
      "Done. Next line starts here.",
    );
  });

  it("MDXのimportとJSXは説明に含めない", async () => {
    const root = await createRoot({
      "first.mdx": `---
title: 記事
---

import Cover from "./Cover.svelte"

<Cover src="./img/cover.png" />

本文の説明です。
`,
    });

    expect((await loadDocs(root))[0]?.description).toBe("本文の説明です。");
  });

  it("140文字を超える説明は打ち切って三点リーダーを付ける", async () => {
    expect(await describeFirst("あ".repeat(200))).toBe("あ".repeat(139) + "…");
  });

  it("本文のない記事の説明は空にする", async () => {
    expect(await describeFirst("")).toBe("");
  });
});

describe("thumbnail", () => {
  async function createRootWithImage(frontmatter: string, image = "img/cover.png") {
    const root = await createRoot({ "first.md": post(frontmatter) });
    const imagePath = path.join(root, "src/content/posts", image);
    await mkdir(path.dirname(imagePath), { recursive: true });
    await writeFile(imagePath, "");
    return root;
  }

  it("記事ファイルからの相対パスで画像を読み込み、記事URLを基準に公開パスを決める", async () => {
    const root = await createRootWithImage("thumbnail: ./img/cover.png");

    const [doc] = await loadDocs(root);

    expect(doc?.thumbnail).toEqual({
      sourcePath: path.join(root, "src/content/posts/img/cover.png"),
      publicPath: "/posts/first/img/cover.png",
    });
  });

  it("バックスラッシュ区切りの相対パスもスラッシュと同じ画像として解決する", async () => {
    const root = await createRootWithImage(`thumbnail: ./img\\cover.png`);

    const [doc] = await loadDocs(root);

    expect(doc?.thumbnail).toEqual({
      sourcePath: path.join(root, "src/content/posts/img/cover.png"),
      publicPath: "/posts/first/img/cover.png",
    });
  });

  it("thumbnailを省略すると見出し画像を設定しない", async () => {
    const root = await createRoot({ "first.md": post("title: 画像なし") });

    expect((await loadDocs(root))[0]?.thumbnail).toBeUndefined();
  });

  it("URLに特殊文字を含む見出し画像をcollection assetとして解決する", async () => {
    const filename = "cover % # 日本語.png";
    const root = await createRoot({
      "first.md": post(`thumbnail: "./img/${filename}"`) + "\n![本文画像](./img/body.png)\n",
    });
    const images = path.join(root, "src/content/posts/img");
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
      html: `<img src="${thumbnail.publicPath}">` + '<img src="/posts/first/img/body.png">',
      pagePath: doc!.path + "/",
      manifest: planned.manifest,
      document: true,
    });

    expect(planned.diagnostics).toEqual([]);
    expect(thumbnail.publicPath).toBe(
      "/posts/first/img/cover%20%25%20%23%20%E6%97%A5%E6%9C%AC%E8%AA%9E.png",
    );
    expect(asset?.publicPaths).toContain(thumbnail.publicPath);
    expect(rewritten.html).toContain(asset!.contentPath);
    expect(bodyAsset?.publicPaths).toContain("/posts/first/img/body.png");
    expect(rewritten.html).toContain(bodyAsset!.contentPath);
  });

  it("存在しない画像を拒否する", async () => {
    const root = await createRoot({ "first.md": post("thumbnail: ./img/missing.png") });

    await expect(loadDocs(root)).rejects.toThrow(
      "src/content/posts/first.md: thumbnail の画像 ./img/missing.png が見つかりません",
    );
  });

  it.each(["/img/cover.png", "https://example.com/cover.png"])(
    "相対パスでないthumbnail: %sを拒否する",
    async (value) => {
      const root = await createRootWithImage(`thumbnail: ${value}`);

      await expect(loadDocs(root)).rejects.toThrow(
        "src/content/posts/first.md: thumbnail は記事ファイルからの相対パスで指定してください",
      );
    },
  );

  it("対応していない拡張子を拒否する", async () => {
    const root = await createRootWithImage("thumbnail: ./img/cover.gif", "img/cover.gif");

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
    const target = path.join(root, "src/content/posts/img/cover.png");
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
  const users = "mush1to:\n  name: むしにゃんこ\nguest:\n  name: ゲスト\n";

  it("authorを省略するとサイトの既定のユーザーを使う", async () => {
    const root = await createRoot({ "first.md": post("title: 著者なし") }, users);

    expect((await loadDocs(root))[0]?.author).toMatchObject({
      id: "mush1to",
      name: "むしにゃんこ",
    });
  });

  it("authorに書いたユーザーIDのユーザーを使う", async () => {
    const root = await createRoot({ "first.md": post("author: guest") }, users);

    expect((await loadDocs(root))[0]?.author).toMatchObject({ id: "guest", name: "ゲスト" });
  });

  it("登録されていないユーザーIDを拒否する", async () => {
    const root = await createRoot({ "first.md": post("author: ゲスト") }, users);

    await expect(loadDocs(root)).rejects.toThrow(
      "src/content/posts/first.md: author のユーザーID ゲスト は src/content/users.yaml に登録されていません",
    );
  });

  it.each(["123", '""', "[]"])("文字列でないauthor: %sを拒否する", async (value) => {
    const root = await createRoot({ "first.md": post(`author: ${value}`) }, users);

    await expect(loadDocs(root)).rejects.toThrow(
      "src/content/posts/first.md: author はユーザーIDを文字列で指定してください",
    );
  });
});

describe("loadUsers", () => {
  async function createRootWithIcon(users: string) {
    const root = await createRoot({}, users);
    const icon = path.join(root, "src/content/users/mush1to.webp");
    await mkdir(path.dirname(icon), { recursive: true });
    await writeFile(icon, "");
    return { root, icon };
  }

  it("名前・説明・アイコン・リンクを読み込み、x.comのユーザー名をXのURLにする", async () => {
    const { root, icon } = await createRootWithIcon(
      [
        "mush1to:",
        "  name: むしにゃんこ",
        "  description: 趣味で固定給貰ってます。",
        "  icon: ./users/mush1to.webp",
        '  x.com: "@mush1to"',
        "  links:",
        "    - https://links.6410.org",
      ].join("\n"),
    );

    expect((await loadUsers(root)).get("mush1to")).toEqual({
      id: "mush1to",
      name: "むしにゃんこ",
      description: "趣味で固定給貰ってます。",
      icon: { sourcePath: icon, publicPath: "/users/mush1to.webp" },
      links: [
        { kind: "x", url: "https://x.com/mush1to", label: "X（@mush1to）" },
        { kind: "website", url: "https://links.6410.org/", label: "links.6410.org" },
      ],
    });
  });

  it("nameだけのユーザーは説明・アイコン・リンクを空にする", async () => {
    const root = await createRoot({}, "guest:\n  name: ゲスト\n");

    expect((await loadUsers(root)).get("guest")).toEqual({
      id: "guest",
      name: "ゲスト",
      description: "",
      icon: undefined,
      links: [],
    });
  });

  it("descriptionの改行をそのまま読み込む", async () => {
    const root = await createRoot(
      {},
      "mush1to:\n  name: むし\n  description: |\n    一行目\n    二行目\n",
    );

    expect((await loadUsers(root)).get("mush1to")?.description).toBe("一行目\n二行目");
  });

  it("140文字のdescriptionを読み込む", async () => {
    const text = "あ".repeat(140);
    const root = await createRoot({}, `mush1to:\n  name: むし\n  description: ${text}\n`);

    expect((await loadUsers(root)).get("mush1to")?.description).toBe(text);
  });

  it("140文字を超えるdescriptionを拒否する", async () => {
    const root = await createRoot(
      {},
      `mush1to:\n  name: むし\n  description: ${"あ".repeat(141)}\n`,
    );

    await expect(loadUsers(root)).rejects.toThrow(
      "src/content/users.yaml: mush1to の description は140文字以内で指定してください",
    );
  });

  it("20文字のnameを読み込む", async () => {
    const name = "あ".repeat(20);
    const root = await createRoot({}, `mush1to:\n  name: ${name}\n`);

    expect((await loadUsers(root)).get("mush1to")?.name).toBe(name);
  });

  it("20文字を超えるnameを拒否する", async () => {
    const root = await createRoot({}, `mush1to:\n  name: ${"あ".repeat(21)}\n`);

    await expect(loadUsers(root)).rejects.toThrow(
      "src/content/users.yaml: mush1to の name は20文字以内で指定してください",
    );
  });

  it("nameのないユーザーを拒否する", async () => {
    const root = await createRoot({}, "guest:\n  description: 説明\n");

    await expect(loadUsers(root)).rejects.toThrow(
      "src/content/users.yaml: guest の name を文字列で指定してください",
    );
  });

  it("英数字・-・_以外を含むユーザーIDを拒否する", async () => {
    const root = await createRoot({}, "むし:\n  name: むし\n");

    await expect(loadUsers(root)).rejects.toThrow(
      "src/content/users.yaml: ユーザーID むし には英数字・-・_ だけを使用してください",
    );
  });

  it.each(["https://x.com/mush1to", "mush 1to", "a234567890123456"])(
    "Xのユーザー名でないx.com: %sを拒否する",
    async (value) => {
      const root = await createRoot({}, `mush1to:\n  name: むし\n  x.com: ${value}\n`);

      await expect(loadUsers(root)).rejects.toThrow(
        "src/content/users.yaml: mush1to の x.com には X のユーザー名を英数字と _ の15文字以内の文字列で指定してください",
      );
    },
  );

  it("文字列でないx.comを拒否する", async () => {
    const root = await createRoot({}, "mush1to:\n  name: むし\n  x.com: 1234\n");

    await expect(loadUsers(root)).rejects.toThrow(
      "src/content/users.yaml: mush1to の x.com には X のユーザー名を英数字と _ の15文字以内の文字列で指定してください",
    );
  });

  it.each(["https://links.6410.org", "[links.6410.org]", "[ftp://example.com]", "[1]"])(
    "httpかhttpsのURLの配列でないlinks: %sを拒否する",
    async (value) => {
      const root = await createRoot({}, `mush1to:\n  name: むし\n  links: ${value}\n`);

      await expect(loadUsers(root)).rejects.toThrow(
        "src/content/users.yaml: mush1to の links には http か https の URL を文字列の配列で指定してください",
      );
    },
  );

  it.each([
    ["./users/missing.webp", "mush1to の icon の画像 ./users/missing.webp が見つかりません"],
    ["/users/mush1to.webp", "mush1to の icon はこのファイルからの相対パスで指定してください"],
    ["../outside.webp", "mush1to の icon には src/content 内の画像を指定してください"],
    [
      "./users/mush1to.gif",
      "mush1to の icon には .jpg・.jpeg・.png・.webp のいずれかの画像を指定してください",
    ],
  ])("不正なicon: %sを拒否する", async (value, message) => {
    const { root } = await createRootWithIcon(`mush1to:\n  name: むし\n  icon: ${value}\n`);

    await expect(loadUsers(root)).rejects.toThrow(`src/content/users.yaml: ${message}`);
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
