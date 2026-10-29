import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { buildCollectionManifest, prepareSource } from "@ox-content/napi";
import { parse } from "yaml";
import { buildSearchIndex } from "@ox-content/vite-plugin";
import { defaultPostIcon, isPostIcon, postIcons, type PostIcon } from "../../config/icons";
import { site } from "../../config/site";
import type { AuthorLink } from "../../pages/page-data";
import { normalizeSearchPath, normalizeTag, tagRoutePath } from "../search-path";
import { articleDescription, descriptionLimit } from "./description";
import { imageSize } from "./image-size";

export const contentDirectory = "src/content/posts";
export const aboutDocument = "src/content/about.mdx";
export const usersDocument = "src/content/users.yaml";
export const usersDirectory = "src/content/users";
const assetRoot = "src/content";
/** Formats X accepts for summary_large_image cards. User icons accept the same formats. */
const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];
const imageMediaTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
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
  /** Media type the site serves the file as, for the OGP image hint. */
  mediaType: string;
  /** Pixel size read from the image header. Undefined when it cannot be read. */
  width?: number;
  height?: number;
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

const collectionName = "posts";

interface ManifestEntry {
  /** Source path relative to the collection root, with slash separators. */
  source: string;
  frontmatter: Record<string, unknown>;
}

/** Every spelling of an extension, because the native matcher compares it literally. */
function caseVariants(extension: string): string[] {
  return [...extension].reduce<string[]>(
    (variants, character) => {
      const lower = character.toLowerCase();
      const upper = character.toUpperCase();
      return lower === upper
        ? variants.map((value) => value + lower)
        : variants.flatMap((value) => [value + lower, value + upper]);
    },
    [""],
  );
}

const markdownExtensions = [".md", ".mdx"].flatMap(caseVariants);

/** One native pass over the content directory: file discovery, frontmatter, and titles. */
function readManifest(contentRoot: string): ManifestEntry[] {
  const json = buildCollectionManifest({
    srcDir: contentRoot,
    extensions: markdownExtensions,
    frontmatter: true,
    collections: [
      {
        name: collectionName,
        source: markdownExtensions.map((extension) => "**/*" + extension),
        include: [],
      },
    ],
  });
  const manifest = JSON.parse(json) as { collections: Record<string, ManifestEntry[]> };
  return manifest.collections[collectionName] ?? [];
}

/** `hello-world.md` becomes `Hello World`. */
function fileNameTitle(relativePath: string): string {
  return path
    .basename(relativePath)
    .replace(/\.mdx?$/i, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * The manifest title falls back to the first heading at any depth, but the docs
 * promise the first H1 and the file name after that, so the fallback reads the
 * body without its frontmatter instead.
 */
function fallbackTitle(source: string, relativePath: string): string {
  const { content } = prepareSource(source);
  return /^#\s+(.+)$/m.exec(content)?.[1].trim() || fileNameTitle(relativePath);
}

const frontmatterBlock = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * The native parser drops a frontmatter block it cannot read and reports an
 * empty map. Publication defaults would then publish the article, so a block
 * that came back empty is read again here to fail the build instead.
 */
function assertFrontmatterReadable(
  source: string,
  frontmatter: Record<string, unknown>,
  file: string,
): void {
  if (Object.keys(frontmatter).length) return;
  const block = frontmatterBlock.exec(source)?.[1];
  if (!block?.trim()) return;
  try {
    parse(block);
  } catch (error) {
    throw new Error(`${file}: フロントマターを読み込めません: ${(error as Error).message}`);
  }
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

/**
 * `draft` is the publish field Ox Content itself honours, so the native search
 * index, sitemap, and page output all agree with the route list below.
 */
/** Ox Content reads these as publish state too, which would hide a page the routes still publish. */
const otherPublishFields = ["unlisted", "scheduled", "date", "expiry"];

function assertPublishFields(frontmatter: Record<string, unknown>, file: string): void {
  const field = otherPublishFields.find((name) => frontmatter[name] !== undefined);
  if (field)
    throw new Error(
      `${file}: ${field} はOx Contentが公開状態として読むため、このサイトでは使えません。公開状態は draft で指定してください`,
    );
}

function readDraft(value: unknown, file: string): boolean {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  throw new Error(`${file}: draft には true か false を指定してください`);
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
  const size = imageSize(await readFile(sourcePath));
  return {
    sourcePath,
    publicPath: new URL(encodedReference, "https://local" + publicBase).pathname,
    mediaType: imageMediaTypes[path.extname(sourcePath).toLowerCase()]!,
    width: size?.width,
    height: size?.height,
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

const documents = new Map<string, Promise<DocPage[]>>();

/** Drops the cached documents, so the next `loadDocs` reads the files again. */
export function invalidateContentCache(): void {
  documents.clear();
}

/**
 * Loads site content from `src/content/posts` only. The home page, pagination,
 * search index, and feed all use this result, so Markdown elsewhere in the
 * repository (README, agent skills, and so on) never appears on the site.
 *
 * One build reads and parses each file once: the collection manifest, the host
 * routes, the feed outputs, and the search files all share this result.
 */
export async function loadDocs(root: string): Promise<DocPage[]> {
  const cached = documents.get(root);
  if (cached) return cached;
  const pending = readDocs(root);
  documents.set(root, pending);
  void pending.catch(() => {
    if (documents.get(root) === pending) documents.delete(root);
  });
  return pending;
}

async function readDocs(root: string): Promise<DocPage[]> {
  const contentRoot = path.join(root, contentDirectory);
  const users = await loadUsers(root);
  const pages: DocPage[] = [];
  for (const entry of readManifest(contentRoot)) {
    const relativePath = entry.source;
    const documentPath = path.join(contentRoot, relativePath);
    const file = path.relative(root, documentPath).split(path.sep).join("/");
    // Ox Content indexes every file under the posts directory, so a file without a
    // route would still reach search results. Reject it instead of skipping it.
    if (relativePath.split("/").some((part) => part.startsWith("_")))
      throw new Error(
        `${file}: _ で始まるファイルは記事にできません。記事以外のファイルは ${contentDirectory} の外に置いてください`,
      );
    const source = await readFile(documentPath, "utf8");
    const frontmatter = entry.frontmatter;
    assertFrontmatterReadable(source, frontmatter, file);
    assertPublishFields(frontmatter, file);
    if (readDraft(frontmatter.draft, file)) continue;
    const title =
      (typeof frontmatter.title === "string" ? frontmatter.title.trim() : "") ||
      fallbackTitle(source, relativePath);
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
  const { frontmatter } = prepareSource(source);
  assertFrontmatterReadable(source, frontmatter, aboutDocument);
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
