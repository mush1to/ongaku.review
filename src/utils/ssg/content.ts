import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { buildSearchIndex } from "@ox-content/vite-plugin";
import { defaultPostIcon, isPostIcon, postIcons, type PostIcon } from "../../config/icons";
import { site } from "../../config/site";
import type { AuthorLink } from "../../pages/page-data";
import { normalizeSearchPath, normalizeTag, tagRoutePath } from "../search-path";
import { articleDescription, descriptionLimit } from "./description";

export const contentDirectory = "src/content/posts";
export const aboutDocument = "src/content/about.mdx";
export const usersDocument = "src/content/users.yaml";
export const usersDirectory = "src/content/users";
const assetRoot = "src/content";
/** Formats X accepts for summary_large_image cards. User icons accept the same formats. */
const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
const userIdPattern = /^[A-Za-z0-9_-]+$/;
const xUsernamePattern = /^[A-Za-z0-9_]{1,15}$/;
/** Longest article title, name, and description, counted in code points. */
const titleLimit = 100;
const nameLimit = 20;

export interface ContentImage {
  /** Absolute path of the image file. */
  sourcePath: string;
  /** Public alias resolved against the referring file's URL, as body images are. */
  publicPath: string;
}

export interface User {
  id: string;
  name: string;
  description: string;
  icon?: ContentImage;
  links: AuthorLink[];
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
  thumbnail?: ContentImage;
  tags: string[];
  /** Only posts have an author. */
  author?: User;
  source: string;
  documentPath: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

function readFrontmatter(source: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) return {};
  const data: unknown = parse(match[1]);
  return isRecord(data) ? data : {};
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

async function readImage(
  value: unknown,
  context: {
    root: string;
    file: string;
    field: string;
    /** How the error message names the file that relative paths start from. */
    origin: string;
    /** Path of the file that relative paths start from. */
    referrer: string;
    /** Public URL that relative paths resolve against. Ends with a slash. */
    publicBase: string;
  },
): Promise<ContentImage | undefined> {
  const { root, file, field, origin, referrer, publicBase } = context;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${file}: ${field} には画像ファイルのパスを文字列で指定してください`);
  const reference = value.trim().replaceAll("\\", "/");
  if (
    reference.startsWith("/") ||
    path.isAbsolute(reference) ||
    /^[a-z][a-z\d+.-]*:/i.test(reference)
  )
    throw new Error(`${file}: ${field} は${origin}からの相対パスで指定してください`);
  if (!imageExtensions.includes(path.extname(reference).toLowerCase()))
    throw new Error(
      `${file}: ${field} には ${imageExtensions.join("・")} のいずれかの画像を指定してください`,
    );
  const candidate = path.resolve(path.dirname(referrer), reference);
  const fromAssetRoot = path.relative(path.join(root, assetRoot), candidate);
  if (fromAssetRoot.startsWith("..") || path.isAbsolute(fromAssetRoot))
    throw new Error(`${file}: ${field} には ${assetRoot} 内の画像を指定してください`);
  const sourcePath = await realpath(candidate).catch(() => null);
  if (!sourcePath) throw new Error(`${file}: ${field} の画像 ${reference} が見つかりません`);
  const fromRealAssetRoot = path.relative(await realpath(path.join(root, assetRoot)), sourcePath);
  if (fromRealAssetRoot.startsWith("..") || path.isAbsolute(fromRealAssetRoot))
    throw new Error(`${file}: ${field} には ${assetRoot} 内の画像を指定してください`);
  if (!(await stat(sourcePath).catch(() => null))?.isFile())
    throw new Error(`${file}: ${field} の画像 ${reference} が見つかりません`);
  const encodedReference = reference.split("/").map(encodeURIComponent).join("/");
  return {
    sourcePath,
    publicPath: new URL(encodedReference, "https://local" + publicBase).pathname,
  };
}

async function readThumbnail(
  value: unknown,
  context: { root: string; file: string; documentPath: string; pagePath: string },
): Promise<ContentImage | undefined> {
  const { root, file, documentPath, pagePath } = context;
  return readImage(value, {
    root,
    file,
    field: "thumbnail",
    origin: "記事ファイル",
    referrer: documentPath,
    publicBase: pagePath === "/" ? "/" : pagePath + "/",
  });
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

function readXLink(value: unknown, file: string, id: string): AuthorLink[] {
  if (value === undefined || value === null) return [];
  const username = typeof value === "string" ? value.trim().replace(/^[@＠]/, "") : "";
  if (!xUsernamePattern.test(username))
    throw new Error(
      `${file}: ${id} の x.com には X のユーザー名を英数字と _ の15文字以内の文字列で指定してください`,
    );
  return [{ kind: "x", url: `https://x.com/${username}`, label: `X（@${username}）` }];
}

function readWebsiteLinks(value: unknown, file: string, id: string): AuthorLink[] {
  if (value === undefined || value === null) return [];
  const error = new Error(
    `${file}: ${id} の links には http か https の URL を文字列の配列で指定してください`,
  );
  if (!Array.isArray(value)) throw error;
  return value.map((item): AuthorLink => {
    const url = typeof item === "string" ? URL.parse(item.trim()) : null;
    if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) throw error;
    return { kind: "website", url: url.href, label: url.host };
  });
}

/** Users that posts name in `author`, keyed by user ID. */
export async function loadUsers(root: string): Promise<Map<string, User>> {
  const documentPath = path.join(root, usersDocument);
  const file = usersDocument;
  const data: unknown = parse(await readFile(documentPath, "utf8"));
  if (!isRecord(data)) throw new Error(`${file}: ユーザーIDをキーにしたマップで書いてください`);
  const users = new Map<string, User>();
  for (const [id, entry] of Object.entries(data)) {
    if (!userIdPattern.test(id))
      throw new Error(`${file}: ユーザーID ${id} には英数字・-・_ だけを使用してください`);
    if (!isRecord(entry)) throw new Error(`${file}: ${id} の内容はマップで書いてください`);
    const { name, description } = entry;
    if (typeof name !== "string" || !name.trim())
      throw new Error(`${file}: ${id} の name を文字列で指定してください`);
    if ([...name.trim()].length > nameLimit)
      throw new Error(`${file}: ${id} の name は${nameLimit}文字以内で指定してください`);
    if (description !== undefined && description !== null && typeof description !== "string")
      throw new Error(`${file}: ${id} の description は文字列で指定してください`);
    if (typeof description === "string" && [...description.trim()].length > descriptionLimit)
      throw new Error(
        `${file}: ${id} の description は${descriptionLimit}文字以内で指定してください`,
      );
    users.set(id, {
      id,
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : "",
      icon: await readImage(entry.icon, {
        root,
        file,
        field: `${id} の icon`,
        origin: "このファイル",
        referrer: documentPath,
        publicBase: "/",
      }),
      links: [...readXLink(entry["x.com"], file, id), ...readWebsiteLinks(entry.links, file, id)],
    });
  }
  return users;
}

function readAuthor(value: unknown, file: string, users: ReadonlyMap<string, User>): User {
  const id =
    value === undefined || value === null
      ? site.author
      : typeof value === "string"
        ? value.trim()
        : "";
  if (!id) throw new Error(`${file}: author はユーザーIDを文字列で指定してください`);
  const user = users.get(id);
  if (!user)
    throw new Error(`${file}: author のユーザーID ${id} は ${usersDocument} に登録されていません`);
  return user;
}

/**
 * Loads site content from `src/content/posts` only. The home page, pagination,
 * search index, and feed all use this result, so Markdown elsewhere in the
 * repository (README, agent skills, and so on) never appears on the site.
 */
export async function loadDocs(root: string): Promise<DocPage[]> {
  const contentRoot = path.join(root, contentDirectory);
  const entries = await readdir(contentRoot, { recursive: true, withFileTypes: true });
  const users = await loadUsers(root);
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
    if ([...title].length > titleLimit)
      throw new Error(`${file}: title は${titleLimit}文字以内で指定してください`);
    const description = articleDescription(source);
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
      thumbnail: await readThumbnail(frontmatter.thumbnail, {
        root,
        file,
        documentPath,
        pagePath,
      }),
      tags: readTags(frontmatter.tags, file),
      author: readAuthor(frontmatter.author, file, users),
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
