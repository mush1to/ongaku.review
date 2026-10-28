import type { MarkdownNode, TransformContext } from "@ox-content/vite-plugin";
import { fromMarkdown } from "mdast-util-from-markdown";
import { describe, expect, it } from "vitest";
import { createTweetUrlEmbeds, tweetEmbedElement } from "./standalone-embeds";

const context = {} as TransformContext;

async function firstBlock(source: string) {
  const transformer = createTweetUrlEmbeds();
  const ast = await transformer.transform(fromMarkdown(source) as unknown as MarkdownNode, context);
  expect(ast.children).toHaveLength(1);
  return ast.children![0]!;
}

describe("tweetEmbedElement", () => {
  it("embeds a post URL on X", () => {
    expect(tweetEmbedElement("https://x.com/jack/status/20")).toBe(
      '<Tweet url="https://x.com/jack/status/20" />',
    );
  });

  it("embeds post URLs on twitter.com and i/web", () => {
    expect(tweetEmbedElement("https://twitter.com/jack/status/20")).toBe(
      '<Tweet url="https://twitter.com/jack/status/20" />',
    );
    expect(tweetEmbedElement("https://x.com/i/web/status/20")).toBe(
      '<Tweet url="https://x.com/i/web/status/20" />',
    );
  });

  it("keeps the query string and escapes it for the attribute", () => {
    expect(tweetEmbedElement("https://x.com/jack/status/20?s=20&t=abc")).toBe(
      '<Tweet url="https://x.com/jack/status/20?s=20&amp;t=abc" />',
    );
  });

  it("leaves profiles, other pages, and lookalike hosts as links", () => {
    expect(tweetEmbedElement("https://x.com/jack")).toBeUndefined();
    expect(tweetEmbedElement("https://x.com/jack/status/20/photo/1")).toBeUndefined();
    expect(tweetEmbedElement("https://x.com.example.com/jack/status/20")).toBeUndefined();
    expect(tweetEmbedElement("https://example.com/jack/status/20")).toBeUndefined();
  });

  it("requires https and rejects credentials", () => {
    expect(tweetEmbedElement("http://x.com/jack/status/20")).toBeUndefined();
    expect(tweetEmbedElement("https://user:pass@x.com/jack/status/20")).toBeUndefined();
    expect(tweetEmbedElement("not a url")).toBeUndefined();
  });
});

describe("createTweetUrlEmbeds", () => {
  it("replaces a paragraph whose only content is a post URL", async () => {
    expect(
      await firstBlock("[https://x.com/jack/status/20](https://x.com/jack/status/20)"),
    ).toEqual({
      type: "html",
      value: '<Tweet url="https://x.com/jack/status/20" />',
    });
  });

  it("replaces an autolink", async () => {
    expect(await firstBlock("<https://x.com/jack/status/20>")).toEqual({
      type: "html",
      value: '<Tweet url="https://x.com/jack/status/20" />',
    });
  });

  it("keeps a URL written inside a sentence", async () => {
    expect((await firstBlock("詳細は <https://x.com/jack/status/20> を参照")).type).toBe(
      "paragraph",
    );
  });

  it("keeps a link whose label differs from its URL", async () => {
    expect((await firstBlock("[このポスト](https://x.com/jack/status/20)")).type).toBe("paragraph");
  });

  it("keeps a link with a title", async () => {
    expect(
      (await firstBlock('[https://x.com/jack/status/20](https://x.com/jack/status/20 "ポスト")'))
        .type,
    ).toBe("paragraph");
  });

  it("keeps a paragraph holding a link and other text", async () => {
    expect(
      (await firstBlock("<https://x.com/jack/status/20> と <https://x.com/jack/status/21>")).type,
    ).toBe("paragraph");
  });

  it("keeps a URL-only paragraph inside a blockquote and a list item", async () => {
    const transformer = createTweetUrlEmbeds();
    const ast = await transformer.transform(
      fromMarkdown(
        "> <https://x.com/jack/status/20>\n\n- <https://x.com/jack/status/21>\n",
      ) as unknown as MarkdownNode,
      context,
    );
    expect(ast.children?.[0]?.children?.[0]?.type).toBe("paragraph");
    expect(ast.children?.[1]?.children?.[0]?.children?.[0]?.type).toBe("paragraph");
  });

  it("leaves the document alone outside the root", async () => {
    const transformer = createTweetUrlEmbeds();
    const node: MarkdownNode = { type: "paragraph", children: [] };
    expect(await transformer.transform(node, context)).toBe(node);
  });
});
