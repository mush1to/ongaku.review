import type { MarkdownNode, MarkdownTransformer } from "@ox-content/vite-plugin";

const tweetHosts = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

const statusPath = /^\/(?:[A-Za-z0-9_]+|i\/web)\/status\/\d+\/?$/;

const escapeAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/** Only a post URL becomes an embed; profiles, lookalike hosts, and other pages stay links. */
export function tweetEmbedElement(href: string): string | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return;
  }
  if (url.protocol !== "https:" || url.username || url.password) return;
  if (!tweetHosts.has(url.hostname.toLowerCase()) || !statusPath.test(url.pathname)) return;
  return '<Tweet url="' + escapeAttribute(url.href) + '" />';
}

/** A paragraph qualifies only when its whole content is one link labelled with its own URL. */
function standaloneLinkUrl(node: MarkdownNode): string | undefined {
  if (node.type !== "paragraph") return;
  const children =
    node.children?.filter((child) => child.type !== "text" || child.value?.trim()) ?? [];
  if (children.length !== 1) return;
  const [link] = children;
  if (link?.type !== "link" || typeof link.url !== "string" || link.title) return;
  const label = link.children ?? [];
  const only = label.length === 1 ? label[0] : undefined;
  if (only?.type !== "text" || only.value?.trim() !== link.url) return;
  return link.url;
}

/**
 * Only a top-level block becomes a card. A post URL inside a quote or a list item
 * stays a link, where the surrounding block already supplies the structure.
 */
export function createTweetUrlEmbeds(): MarkdownTransformer {
  return {
    name: "site-tweet-url-embeds",
    transform(ast) {
      if (ast.type !== "root") return ast;
      ast.children = ast.children?.map((node) => {
        const href = standaloneLinkUrl(node);
        const element = href && tweetEmbedElement(href);
        return element ? { type: "html", value: element } : node;
      });
      return ast;
    },
  };
}
