import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { buildSearchIndex } from "@ox-content/vite-plugin";
import { defaultPostIcon, isPostIcon, postIcons, type PostIcon } from "../../config/icons";
import { site } from "../../config/site";
import { normalizeSearchPath, normalizeTag, tagRoutePath } from "../search-path";

export const contentDirectory = "src/content/posts";
export const aboutDocument = "src/content/about.mdx";
const assetRoot = "src/content";
/** Formats X accepts for summary_large_image cards. */
const thumbnailExtensions = [".jpg", ".jpeg", ".png", ".webp"];

export interface DocThumbnail {
  /** Absolute path of the image file. */
  sourcePath: string;
  /** Public alias resolved against the page URL, as body images are. */
  publicPath: string;
  alt: string;
}

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
  thumbnail?: DocThumbnail;
  tags: string[];
  author: string;
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
  const segments = normalized.split("/");
  if (normalized === "index") return "/";
  if (normalized.endsWith("/index")) segments.pop();
  return "/posts/" + segments.map(encodeURIComponent).join("/");
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

async function readThumbnail(
  value: unknown,
  alt: unknown,
  context: { root: string; file: string; documentPath: string; pagePath: string },
): Promise<DocThumbnail | undefined> {
  const { root, file, documentPath, pagePath } = context;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${file}: thumbnail には画像ファイルのパスを文字列で指定してください`);
  const reference = value.trim().replaceAll("\\", "/");
  if (
    reference.startsWith("/") ||
    path.isAbsolute(reference) ||
    /^[a-z][a-z\d+.-]*:/i.test(reference)
  )
    throw new Error(`${file}: thumbnail は記事ファイルからの相対パスで指定してください`);
  if (!thumbnailExtensions.includes(path.extname(reference).toLowerCase()))
    throw new Error(
      `${file}: thumbnail には ${thumbnailExtensions.join("・")} のいずれかの画像を指定してください`,
    );
  const candidate = path.resolve(path.dirname(documentPath), reference);
  const fromAssetRoot = path.relative(path.join(root, assetRoot), candidate);
  if (fromAssetRoot.startsWith("..") || path.isAbsolute(fromAssetRoot))
    throw new Error(`${file}: thumbnail には ${assetRoot} 内の画像を指定してください`);
  const sourcePath = await realpath(candidate).catch(() => null);
  if (!sourcePath) throw new Error(`${file}: thumbnail の画像 ${reference} が見つかりません`);
  const fromRealAssetRoot = path.relative(await realpath(path.join(root, assetRoot)), sourcePath);
  if (fromRealAssetRoot.startsWith("..") || path.isAbsolute(fromRealAssetRoot))
    throw new Error(`${file}: thumbnail には ${assetRoot} 内の画像を指定してください`);
  if (!(await stat(sourcePath).catch(() => null))?.isFile())
    throw new Error(`${file}: thumbnail の画像 ${reference} が見つかりません`);
  if (alt !== undefined && alt !== null && typeof alt !== "string")
    throw new Error(`${file}: thumbnailAlt は文字列で指定してください`);
  const assetBase = pagePath === "/" ? "/" : pagePath + "/";
  const encodedReference = reference.split("/").map(encodeURIComponent).join("/");
  return {
    sourcePath,
    publicPath: new URL(encodedReference, "https://local" + assetBase).pathname,
    alt: typeof alt === "string" ? alt.trim() : "",
  };
}

function readTags(value: unknown, file: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string"))
    throw new Error(`${file}: tags は文字列の配列で指定してください`);
  const tags = new Map<string, string>();
  for (const tag of value as string[]) {
    const name = tag
      .trim()
      .replace(/^[#＃]+/, "")
      .trim();
    const key = normalizeTag(name);
    if (key && !tags.has(key)) {
      try {
        tagRoutePath(key);
      } catch {
        throw new Error(
          `${file}: タグ名には空のパス要素、「.」「..」、制御文字、バックスラッシュを使用できません`,
        );
      }
      tags.set(key, name);
    }
  }
  return [...tags.values()];
}

function readAuthor(value: unknown, file: string): string {
  if (value === undefined || value === null) return site.author;
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`${file}: author は文字列で指定してください`);
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
    const pagePath = routePath(relativePath);
    pages.push({
      path: pagePath,
      indexPath: contentPath(relativePath),
      title,
      description,
      created,
      updated: readDate(frontmatter.updated, file, "updated") ?? created,
      icon: readIcon(frontmatter.icon, file),
      thumbnail: await readThumbnail(frontmatter.thumbnail, frontmatter.thumbnailAlt, {
        root,
        file,
        documentPath,
        pagePath,
      }),
      tags: readTags(frontmatter.tags, file),
      author: readAuthor(frontmatter.author, file),
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
    path: "/about",
    indexPath: "/about",
    title: typeof frontmatter.title === "string" ? frontmatter.title.trim() : "About",
    description: typeof frontmatter.description === "string" ? frontmatter.description.trim() : "",
    icon: defaultPostIcon,
    tags: [],
    author: site.author,
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

/** Each post's search metadata in `listPosts` order, keyed by its normalized index URL. */
export async function loadSearchPages(root: string): Promise<string> {
  const posts = listPosts(await loadDocs(root));
  return JSON.stringify(
    Object.fromEntries(
      posts.map((doc) => [
        normalizeSearchPath(doc.indexPath),
        { path: doc.path, title: doc.title, icon: doc.icon, tags: doc.tags },
      ]),
    ),
  );
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
