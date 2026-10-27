import { defaultPostIcon, icons, isPostIcon } from "./config/icons";
import { site } from "./config/site";
import type { TaggedPost } from "./pages/page-data";
import { normalizeTag } from "./utils/search-path";

const formatDate = (date: string) => date.replaceAll("-", "/");

function postRow({ path, title, created, icon }: TaggedPost) {
  const row = document.createElement("tr");
  const name = document.createElement("td");
  const link = document.createElement("a");
  link.className = "file-link";
  link.href = path;
  const image = document.createElement("img");
  image.src = icons[isPostIcon(icon) ? icon : defaultPostIcon];
  image.alt = "";
  image.width = 24;
  image.height = 24;
  const label = document.createElement("span");
  label.textContent = title;
  link.append(image, label);
  name.append(link);
  const date = document.createElement("td");
  date.className = "file-date";
  if (created) {
    const time = document.createElement("time");
    time.dateTime = created;
    time.textContent = formatDate(created);
    date.append(time);
  }
  row.append(name, date);
  return row;
}

function emptyRow(tag: string) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.className = "file-empty";
  cell.colSpan = 2;
  cell.textContent = `タグ「#${tag}」の記事はありません。`;
  row.append(cell);
  return row;
}

/**
 * Reads the tag from `/#タグ名`. A fragment that names an element (`#main` from
 * the skip link) is an in-page anchor, so the home list stays as it is.
 */
const tagFromLocation = (): string | undefined => {
  if (!location.hash) return undefined;
  const hash = location.hash.slice(1);
  let fragment = hash;
  try {
    fragment = decodeURIComponent(hash);
  } catch {
    // Keep the raw fragment when it is not valid percent-encoding.
  }
  const tag = fragment.replace(/^[#＃]+/, "").trim();
  return tag && !document.getElementById(fragment) ? tag : undefined;
};

export function initTagView(table: HTMLTableElement) {
  const body = table.tBodies[0];
  const address = document.querySelector<HTMLElement>("nav.address-bar");
  const caption = table.querySelector("caption");
  if (!body || !address || !caption) return;

  const posts = JSON.parse(table.dataset.tagPosts ?? "[]") as TaggedPost[];
  const homeRows = [...body.children];
  const homeAddress = address.innerHTML;
  const homeCaption = caption.textContent ?? "";
  const homeTitle = document.title;
  const pagination = document.querySelector<HTMLElement>(".pagination");
  const spacer = document.querySelector<HTMLElement>(".pane-spacer");

  const showTagAddress = (tag: string) => {
    address.innerHTML = homeAddress;
    const root = address.querySelector(".address-root");
    if (!root) return;
    // The slash and the tag share one crumb so the bar reads "/#タグ名" exactly.
    const list = document.createElement("ol");
    const item = document.createElement("li");
    const slash = document.createElement("span");
    slash.className = "address-root";
    slash.setAttribute("aria-hidden", "true");
    slash.textContent = "/";
    const current = document.createElement("span");
    current.setAttribute("aria-current", "page");
    current.textContent = "#" + tag;
    item.append(slash, current);
    list.append(item);
    root.replaceWith(list);
  };

  const render = (tag?: string) => {
    // The tag list shows every matching post at once, so pagination gives way.
    pagination?.toggleAttribute("hidden", Boolean(tag));
    spacer?.toggleAttribute("hidden", Boolean(tag));
    if (!tag) {
      body.replaceChildren(...homeRows);
      address.innerHTML = homeAddress;
      caption.textContent = homeCaption;
      document.title = homeTitle;
      return;
    }
    const key = normalizeTag(tag);
    const matches = posts.filter((post) => post.tags.some((item) => normalizeTag(item) === key));
    body.replaceChildren(...(matches.length ? matches.map(postRow) : [emptyRow(tag)]));
    showTagAddress(tag);
    caption.textContent = `タグ「#${tag}」の記事`;
    document.title = "#" + tag + " | " + site.title;
  };

  const initial = tagFromLocation();
  if (initial) render(initial);
  addEventListener("hashchange", () => render(tagFromLocation()));
}
