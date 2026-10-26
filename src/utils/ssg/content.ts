import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { buildSearchIndex } from "@ox-content/vite-plugin";
import { defaultPostIcon, isPostIcon, postIcons, type PostIcon } from "../../config/icons";

export const contentDirectory = "src/content/posts";
export const aboutDocument = "src/content/about.mdx";

export interface DocPage {
  path: string;
  /** URL the search index assigns before the site route is applied. */
  indexPath: string;
  title: string;
  description: string;
  /** YYYY-MM-DD */
  created?: string;
  /** YYYY-MM-DD. Defaults to `created`. */
  updated?: string;
  icon: PostIcon;
  source: string;
  documentPath: string;
}

function readFrontmatter(source: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) return {};
  const data: unknown = parse(match[1]);
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

function firstHeading(source: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(source);
  return match?.[1].trim();
}

function contentPath(relativePath: string): string {
  return (
    "/" +
    relativePath
      .split(path.sep)
      .join("/")
      .replace(/\.mdx?$/i, "")
  );
}

function routePath(relativePath: string): string {
  const normalized = contentPath(relativePath).slice(1);
  if (normalized === "index") return "/";
  if (normalized.endsWith("/index")) return "/posts/" + normalized.slice(0, -"index".length);
  return "/posts/" + normalized + "/";
}

function readDate(value: unknown, file: string, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : typeof value === "string"
        ? value.trim()
        : "";
  const parsed = new Date(text + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  )
    throw new Error(`${file}: ${field} は YYYY-MM-DD 形式で指定してください`);
  return text;
}

function readIcon(value: unknown, file: string): PostIcon {
  if (value === undefined || value === null) return defaultPostIcon;
  if (isPostIcon(value)) return value;
  throw new Error(`${file}: icon には ${postIcons.join("・")} のいずれかを指定してください`);
}

function readIsPublished(value: unknown, file: string): boolean {
  if (value === undefined) return true;
  if (typeof value === "boolean") return value;
  throw new Error(`${file}: isPublished には true か false を指定してください`);
}

/**
 * Loads site content from `src/content/posts` only. The home page, pagination,
 * search index, and feed all use this result, so Markdown elsewhere in the
 * repository (README, agent skills, and so on) never appears on the site.
 */
export async function loadDocs(root: string): Promise<DocPage[]> {
  const contentRoot = path.join(root, contentDirectory);
  const entries = await readdir(contentRoot, { recursive: true, withFileTypes: true });
  const pages: DocPage[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.mdx?$/i.test(entry.name)) continue;
    const documentPath = path.join(entry.parentPath, entry.name);
    const relativePath = path.relative(contentRoot, documentPath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) continue;
    if (relativePath.split(path.sep).some((part) => part.startsWith("_"))) continue;
    const source = await readFile(documentPath, "utf8");
    const frontmatter = readFrontmatter(source);
    const file = path.relative(root, documentPath).split(path.sep).join("/");
    if (!readIsPublished(frontmatter.isPublished, file)) continue;
    const title =
      typeof frontmatter.title === "string" && frontmatter.title.trim()
        ? frontmatter.title.trim()
        : (firstHeading(source) ?? path.basename(relativePath).replace(/\.mdx?$/i, ""));
    const description =
      typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
    const created = readDate(frontmatter.created, file, "created");
    pages.push({
      path: routePath(relativePath),
      indexPath: contentPath(relativePath),
      title,
      description,
      created,
      updated: readDate(frontmatter.updated, file, "updated") ?? created,
      icon: readIcon(frontmatter.icon, file),
      source,
      documentPath,
    });
  }
  return pages.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

export async function loadAboutPage(root: string): Promise<DocPage> {
  const documentPath = path.join(root, aboutDocument);
  const source = await readFile(documentPath, "utf8");
  const frontmatter = readFrontmatter(source);
  return {
    path: "/about/",
    indexPath: "/about",
    title: typeof frontmatter.title === "string" ? frontmatter.title.trim() : "About",
    description: typeof frontmatter.description === "string" ? frontmatter.description.trim() : "",
    icon: defaultPostIcon,
    source,
    documentPath,
  };
}

/** Exclude unpublished sources from both the documents and the BM25 index. */
export async function loadSearchIndex(root: string): Promise<string> {
  const docs = await loadDocs(root);
  const published = new Set(docs.map((doc) => doc.indexPath.slice(1)));
  const contentRoot = path.join(root, contentDirectory);
  const entries = await readdir(contentRoot, { recursive: true, withFileTypes: true });
  const excluded = entries
    .filter((entry) => entry.isFile() && /\.mdx?$/i.test(entry.name))
    .map((entry) =>
      contentPath(path.relative(contentRoot, path.join(entry.parentPath, entry.name))).slice(1),
    )
    .filter((id) => !published.has(id));
  return buildSearchIndex(contentRoot, "/", [".mdx", ".md"], undefined, excluded, true);
}

/** Published posts, newest creation date first. Undated posts come last. */
export function listPosts(docs: readonly DocPage[]): DocPage[] {
  return [...docs].sort((a, b) => {
    if (a.created !== b.created) {
      if (!a.created) return 1;
      if (!b.created) return -1;
      return b.created.localeCompare(a.created);
    }
    return a.title.localeCompare(b.title, "ja");
  });
}
