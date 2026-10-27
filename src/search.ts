import { search } from "virtual:ox-content/search";
import { defaultPostIcon, icons, isPostIcon } from "./config/icons";
import { normalizeSearchPath, normalizeTag } from "./utils/search-path";

interface PageEntry {
  path?: unknown;
  title?: unknown;
  icon?: unknown;
  tags?: unknown;
}

interface ResultItem {
  path: string;
  title: string;
  icon: unknown;
  snippet?: string;
}

const pageEntry = (value: unknown): PageEntry | undefined =>
  value && typeof value === "object" ? (value as PageEntry) : undefined;

function resultItem({ path, title: text, icon, snippet }: ResultItem) {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.className = "file-link";
  link.href = path;
  const image = document.createElement("img");
  image.src = icons[isPostIcon(icon) ? icon : defaultPostIcon];
  image.alt = "";
  image.width = 24;
  image.height = 24;
  const title = document.createElement("span");
  title.textContent = text;
  link.append(image, title);
  item.append(link);
  if (snippet) {
    const paragraph = document.createElement("p");
    paragraph.className = "search-snippet";
    paragraph.textContent = snippet;
    item.append(paragraph);
  }
  return item;
}

/** Entries are in newest-first order, so tag results keep the home page order. */
function tagResults(tag: string, pagesByIndexPath: Record<string, unknown>): ResultItem[] {
  const key = normalizeTag(tag);
  return Object.values(pagesByIndexPath).flatMap((value) => {
    const entry = pageEntry(value);
    if (
      typeof entry?.path !== "string" ||
      typeof entry.title !== "string" ||
      !Array.isArray(entry.tags) ||
      !entry.tags.some((item) => typeof item === "string" && normalizeTag(item) === key)
    )
      return [];
    return [{ path: entry.path, title: entry.title, icon: entry.icon }];
  });
}

export function initSearch(form: HTMLFormElement) {
  const input = form.elements.namedItem("q");
  const status = document.querySelector<HTMLElement>("[data-search-status]");
  const list = document.querySelector<HTMLElement>("[data-search-results]");
  if (!(input instanceof HTMLInputElement) || !status || !list) return;
  let pages: Promise<Record<string, unknown>> | undefined;
  let latest = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async (query: string) => {
    const request = ++latest;
    const keyword = query.trim();
    if (!keyword) {
      list.replaceChildren();
      status.textContent = "";
      return;
    }
    const tag = /^[#＃]/.test(keyword) ? keyword.replace(/^[#＃]+/, "").trim() : undefined;
    try {
      if (!pages) {
        const pending = fetch("/search-pages.json").then((response) => {
          if (!response.ok) throw new Error(`search-pages.json: ${response.status}`);
          return response.json() as Promise<Record<string, unknown>>;
        });
        const retryable = pending.catch((error: unknown) => {
          if (pages === retryable) pages = undefined;
          throw error;
        });
        pages = retryable;
      }
      if (tag) {
        const results = tagResults(tag, await pages);
        if (request !== latest) return;
        list.replaceChildren(...results.map(resultItem));
        status.textContent = results.length
          ? `タグ「#${tag}」の記事：${results.length}件`
          : `タグ「#${tag}」の記事は見つかりませんでした。`;
        return;
      }
      const [results, pagesByIndexPath] = await Promise.all([search(keyword), pages]);
      if (request !== latest) return;
      list.replaceChildren(
        ...results.map((result) => {
          const indexPath = normalizeSearchPath(result.url);
          const entry = pageEntry(pagesByIndexPath[indexPath]);
          return resultItem({
            path: typeof entry?.path === "string" ? entry.path : indexPath,
            title: result.title,
            icon: entry?.icon,
            snippet: result.snippet,
          });
        }),
      );
      status.textContent = results.length
        ? `「${keyword}」の検索結果：${results.length}件`
        : `「${keyword}」に一致するページは見つかりませんでした。`;
    } catch {
      if (request !== latest) return;
      list.replaceChildren();
      status.textContent = "検索できませんでした。時間をおいてもう一度お試しください。";
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(timer);
    void run(input.value);
  });
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(input.value), 200);
  });

  if (input.value.trim()) void run(input.value);
}
