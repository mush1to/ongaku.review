import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@ox-content/vite-plugin";
import { preserveFullWidthSpaces } from "./whitespace";

const options = { ssg: false, mdx: true };
const render = (source: string) =>
  renderMarkdown(preserveFullWidthSpaces(source), "sample.md", options);

describe("preserveFullWidthSpaces", () => {
  it("段落の先頭と改行後の全角空白を残す", async () => {
    const source = "　先頭\n\n　　二段落  \n　改行後\n\n字下げなし\n\n　末尾　";
    const result = await render(source);
    expect(result.html).toBe(
      "<p>　先頭</p>\n<p>　　二段落<br>\n　改行後</p>\n<p>字下げなし</p>\n<p>　末尾　</p>\n",
    );
  });

  it("引用・箇条書き・見出し・強調・リンクの文字を残す", async () => {
    const source =
      "> 　引用\n\n- 　箇条書き\n\n## 　見出し\n\n　**強調**と[　ラベル](/posts/sample)";
    const result = await render(source);
    expect(result.html).toContain("<blockquote>\n<p>　引用</p>");
    expect(result.html).toContain("<li>　箇条書き</li>");
    expect(result.html).toContain("　見出し</h2>");
    expect(result.html).toContain(
      '<p>　<strong>強調</strong>と<a href="/posts/sample">　ラベル</a></p>',
    );
  });

  it("コード・HTML・画像の代替文・リンク先を変更しない", () => {
    const untouched = [
      '---\ntitle: "　タイトル"\n---',
      "```text\n　コード\n```",
      " ".repeat(4) + "　インデントコード",
      "`　インラインコード`",
      '[リンク](https://example.com/　path "　title")',
      "<https://example.com/　path>",
      "[リンク][ref]\n\n[ref]: /　path",
      "![　代替文](/　image.png)",
      '<div data-label="　属性">　HTML</div>',
    ].join("\n\n");
    expect(preserveFullWidthSpaces(untouched)).toBe(untouched);
    expect(preserveFullWidthSpaces(untouched + "\n\n　本文")).toBe(untouched + "\n\n&#x3000;本文");
  });

  it("既存の文字参照を保ち、繰り返し変換しない", async () => {
    const source = "&#x3000;既存\n\n&#12288;既存2\n\n　新規 &amp; 本文　";
    const prepared = preserveFullWidthSpaces(source);
    expect(preserveFullWidthSpaces(prepared)).toBe(prepared);
    const result = await renderMarkdown(prepared, "sample.md", options);
    expect(result.html).toBe("<p>　既存</p>\n<p>　既存2</p>\n<p>　新規 &amp; 本文　</p>\n");
    expect(preserveFullWidthSpaces("字下げなし\n\nplain")).toBe("字下げなし\n\nplain");
  });

  it("CRLFやサロゲートペアでも変換位置がずれない", async () => {
    const source = '---\r\ntitle: "👼　title"\r\n---\r\n\r\n　👼本文\r\n\r\n　次';
    const result = await render(source);
    expect(result.frontmatter.title).toBe("👼　title");
    expect(result.html).toBe("<p>　👼本文</p>\n<p>　次</p>\n");
  });
});
