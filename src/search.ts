import { search } from "virtual:ox-content/search";
import { site } from "./config/site";
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
  const searchWindow = form.closest<HTMLElement>("[data-search-window]");
  const status = document.querySelector<HTMLElement>("[data-search-status]");
  const list = document.querySelector<HTMLElement>("[data-search-results]");
  const pagination = document.querySelector<HTMLElement>("[data-search-pagination]");
  const pageLabel = pagination?.querySelector<HTMLElement>("[data-search-page]");
  const previous = pagination?.querySelector<HTMLButtonElement>("[data-search-previous]");
  const next = pagination?.querySelector<HTMLButtonElement>("[data-search-next]");
  if (
    !(input instanceof HTMLInputElement) ||
    !searchWindow ||
    !status ||
    !list ||
    !pagination ||
    !pageLabel ||
    !previous ||
    !next
  )
    return;
  let pages: Promise<Record<string, unknown>> | undefined;
  let latest = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let results: ResultItem[] = [];
  let summary = "";
  let perPage = 1;
  let current = 0;

  const render = () => {
    const pageCount = Math.ceil(results.length / perPage);
    const paginated = pageCount > 1;
    list.replaceChildren(
      ...results.slice(current * perPage, (current + 1) * perPage).map(resultItem),
    );
    list.scrollTop = 0;
    status.textContent = paginated ? `${summary}（${current + 1}/${pageCount} ページ）` : summary;
    pagination.hidden = !paginated;
    searchWindow.toggleAttribute("data-paginated", paginated);
    pageLabel.textContent = `${current + 1} / ${pageCount}`;
    previous.setAttribute("aria-disabled", String(current === 0));
    next.setAttribute("aria-disabled", String(current >= pageCount - 1));
  };

  const show = (items: ResultItem[], text: string, pageSize = Math.max(items.length, 1)) => {
    results = items;
    summary = text;
    perPage = pageSize;
    current = 0;
    render();
  };

  const turnPage = (step: number) => {
    const target = current + step;
    if (target < 0 || target * perPage >= results.length) return;
    current = target;
    render();
  };

  const run = async (query: string) => {
    const request = ++latest;
    const keyword = query.trim();
    if (!keyword) {
      show([], "");
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
        const items = tagResults(tag, await pages);
        if (request !== latest) return;
        show(
          items,
          items.length
            ? `タグ「#${tag}」の記事：${items.length}件`
            : `タグ「#${tag}」の記事は見つかりませんでした。`,
        );
        return;
      }
      const [hits, pagesByIndexPath] = await Promise.all([
        search(keyword, { limit: Number.POSITIVE_INFINITY }),
        pages,
      ]);
      if (request !== latest) return;
      show(
        hits.map((result) => {
          const indexPath = normalizeSearchPath(result.url);
          const entry = pageEntry(pagesByIndexPath[indexPath]);
          return {
            path: typeof entry?.path === "string" ? entry.path : indexPath,
            title: result.title,
            icon: entry?.icon,
            snippet: result.snippet,
          };
        }),
        hits.length
          ? `「${keyword}」の検索結果：${hits.length}件`
          : `「${keyword}」に一致するページは見つかりませんでした。`,
        site.searchResultsPerPage,
      );
    } catch {
      if (request !== latest) return;
      show([], "検索できませんでした。時間をおいてもう一度お試しください。");
    }
  };

  previous.addEventListener("click", () => turnPage(-1));
  next.addEventListener("click", () => turnPage(1));
  list.addEventListener("focusin", ({ target }) => {
    if (!(target instanceof HTMLElement) || !target.matches(":focus-visible")) return;
    const card = target.closest("li")?.getBoundingClientRect();
    if (!card) return;
    const top = card.top - list.getBoundingClientRect().top - list.clientTop + list.scrollTop;
    if (top < list.scrollTop || card.height > list.clientHeight) list.scrollTop = Math.floor(top);
    else if (top + card.height > list.scrollTop + list.clientHeight)
      list.scrollTop = Math.ceil(top + card.height - list.clientHeight);
  });
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
