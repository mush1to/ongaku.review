import { fromMarkdown } from "mdast-util-from-markdown";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { mdxFromMarkdown } from "mdast-util-mdx";
import { frontmatter } from "micromark-extension-frontmatter";
import { mdxjs } from "micromark-extension-mdxjs";
import type { PhrasingContent, Root, RootContent } from "mdast";

/** Longest article description and user description, counted in code points. */
export const descriptionLimit = 140;

interface TextRun {
  text: string;
  /** Set by a line break and resolved when the next character arrives. */
  wrapped: boolean;
}

const isWordCharacter = (character: string) =>
  /[\p{Script_Extensions=Latin}\p{Number}]/u.test(character);
const isEnglishPunctuation = (character: string) => /[.!?,;:]/.test(character);
/**
 * MDX adds import, JSX, and expression nodes that never belong in prose, and the
 * plain Markdown fallback reads JSX and HTML blocks as `html` nodes.
 */
const isNonProse = (type: string) => type.startsWith("mdx") || type === "html";

/**
 * Appends plain text. A wrapped line joins Latin words with a space and
 * Japanese text with nothing, so a description keeps no stray space. A wrapped
 * line that ends in English punctuation keeps its space too, so `Done.` and
 * the next line never run together as `Done.Next`.
 */
function write(run: TextRun, value: string): void {
  for (const character of value) {
    if (character === "\n" || character === "\r") {
      run.wrapped = true;
      continue;
    }
    const previous = run.text.slice(-1);
    if (
      run.wrapped &&
      previous &&
      isWordCharacter(character) &&
      (isWordCharacter(previous) || isEnglishPunctuation(previous))
    )
      run.text += " ";
    run.wrapped = false;
    run.text += character;
  }
}

/** Emphasis, links, and images contribute their text so syntax never reaches the description. */
function writeInline(children: readonly PhrasingContent[], run: TextRun): void {
  for (const child of children) {
    if (isNonProse(child.type)) continue;
    if (child.type === "text") write(run, child.value);
    else if (child.type === "inlineCode") write(run, child.value);
    else if (child.type === "image" || child.type === "imageReference") write(run, child.alt ?? "");
    else if (child.type === "break") run.wrapped = true;
    else if ("children" in child) writeInline(child.children, run);
  }
}

function textOfInline(children: readonly PhrasingContent[]): string {
  const run: TextRun = { text: "", wrapped: false };
  writeInline(children, run);
  return run.text;
}

/** The first paragraph inside a block, so a list or a quote still yields prose. */
function paragraphText(node: RootContent): string | undefined {
  if (isNonProse(node.type)) return undefined;
  if (node.type === "paragraph") return textOfInline(node.children);
  if (node.type === "blockquote" || node.type === "list" || node.type === "listItem")
    for (const child of node.children) {
      const text = paragraphText(child);
      if (text?.trim()) return text;
    }
  return undefined;
}

/** Fallback for an article with no paragraph, such as one that is only a heading. */
function blockText(node: RootContent): string {
  if (isNonProse(node.type)) return "";
  if (node.type === "paragraph" || node.type === "heading") return textOfInline(node.children);
  if (node.type === "blockquote" || node.type === "list" || node.type === "listItem")
    for (const child of node.children) {
      const text = blockText(child);
      if (text.trim()) return text;
    }
  return "";
}

function firstText(
  nodes: readonly RootContent[],
  text: (node: RootContent) => string | undefined,
): string {
  for (const node of nodes) {
    if (isNonProse(node.type)) continue;
    const value = text(node);
    if (value?.trim()) return value;
  }
  return "";
}

function truncate(text: string): string {
  const characters = [...text];
  if (characters.length <= descriptionLimit) return text;
  return (
    characters
      .slice(0, descriptionLimit - 1)
      .join("")
      .trimEnd() + "…"
  );
}

/**
 * Strict MDX rejects the HTML comments and autolinks that the site itself
 * renders, so an unparsable article falls back to plain Markdown, where those
 * constructs are ordinary prose, instead of failing the whole build.
 */
function parse(source: string): { tree: Root; lenient: boolean } {
  try {
    return {
      tree: fromMarkdown(source, {
        extensions: [frontmatter(["yaml"]), mdxjs()],
        mdastExtensions: [frontmatterFromMarkdown(["yaml"]), mdxFromMarkdown()],
      }),
      lenient: false,
    };
  } catch {
    return {
      tree: fromMarkdown(source, {
        extensions: [frontmatter(["yaml"])],
        mdastExtensions: [frontmatterFromMarkdown(["yaml"])],
      }),
      lenient: true,
    };
  }
}

/**
 * A plain parse reads an import, an expression, and a JSX block as prose. Each
 * paragraph is therefore read again as MDX from its own source, so only what
 * MDX keeps as text reaches the description. A paragraph MDX cannot read, such
 * as one holding an HTML comment, keeps the plain node.
 */
function readParagraph(node: RootContent, source: string): RootContent {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (node.type !== "paragraph" || start === undefined || end === undefined) return node;
  try {
    const children = fromMarkdown(source.slice(start, end), {
      extensions: [mdxjs()],
      mdastExtensions: [mdxFromMarkdown()],
    }).children;
    return children.length === 1 ? children[0] : node;
  } catch {
    return node;
  }
}

/**
 * Builds an article's description from the first paragraph of its body, so
 * writers never maintain one by hand. Frontmatter, MDX imports, and JSX are
 * skipped, and a paragraph wins over a leading heading, which would only repeat
 * the title.
 */
export function articleDescription(source: string): string {
  const { tree, lenient } = parse(source);
  const nodes = lenient ? tree.children.map((node) => readParagraph(node, source)) : tree.children;
  const text = firstText(nodes, paragraphText) || firstText(nodes, blockText);
  return truncate(text.replace(/\s+/g, " ").trim());
}
