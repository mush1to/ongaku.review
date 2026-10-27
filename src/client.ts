import "./styles.css";
import { initIslands } from "@ox-content/islands";
import { initSvelteHtmlHost } from "@ox-content/vite-plugin-svelte/html-host/client";
import modules from "virtual:ox-content-svelte/html-host/modules";

initSvelteHtmlHost({ modules, initIslands, mount: { mode: "hydrate" } });

const searchWindow = document.querySelector<HTMLDialogElement>("dialog[data-search-window]");
const searchForm = searchWindow?.querySelector<HTMLFormElement>("form[data-search-form]");
const searchInput = searchForm?.querySelector<HTMLInputElement>("input[name='q']");
if (searchWindow && searchForm && searchInput) {
  const searchStatus = searchWindow.querySelector<HTMLElement>("[data-search-status]");
  const importError =
    "検索を読み込めませんでした。もう一度開いてください。改善しない場合はページを再読み込みしてください。";
  let searchModule: Promise<void> | undefined;
  let searchInitialized = false;
  let composing = false;
  let compositionEndTimer: ReturnType<typeof setTimeout> | undefined;
  let backdropPointer: { id: number; outside: boolean } | undefined;
  let closeOnBackdropClick = false;
  const isOutsideFrame = (x: number, y: number) => {
    const frame = searchWindow.querySelector<HTMLElement>(".search-window-frame");
    if (!frame) return false;
    const bounds = frame.getBoundingClientRect();
    return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
  };
  const loadSearch = () => {
    if (!searchModule) {
      const pending = import("./search").then(({ initSearch }) => {
        initSearch(searchForm);
        searchInitialized = true;
        if (searchStatus?.textContent === importError) searchStatus.textContent = "";
      });
      const retryable = pending.catch((error: unknown) => {
        if (searchModule === retryable) searchModule = undefined;
        if (searchStatus) searchStatus.textContent = importError;
        throw error;
      });
      searchModule = retryable;
    }
    return searchModule;
  };
  searchForm.addEventListener("submit", (event) => {
    if (searchInitialized) return;
    event.preventDefault();
    void loadSearch().catch(() => {});
  });
  for (const opener of document.querySelectorAll<HTMLElement>("[data-search-open]"))
    opener.addEventListener("click", () => {
      const query = opener.dataset.searchQuery;
      const initialized = searchInitialized;
      searchWindow.showModal();
      if (query) searchInput.value = query;
      searchInput.focus();
      searchInput.select();
      void loadSearch()
        .then(() => {
          if (initialized && query) searchForm.requestSubmit();
        })
        .catch(() => {});
    });
  searchForm.addEventListener("submit", (event) => event.preventDefault());
  searchInput.addEventListener("compositionstart", () => {
    clearTimeout(compositionEndTimer);
    composing = true;
  });
  searchInput.addEventListener("compositionend", () => {
    // Keep the guard through an Escape/cancel delivered in the same event turn.
    clearTimeout(compositionEndTimer);
    compositionEndTimer = setTimeout(() => {
      composing = false;
    }, 0);
  });
  searchWindow.addEventListener("cancel", (event) => {
    if (composing) event.preventDefault();
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.isComposing || composing) return;
    event.preventDefault();
    searchWindow.close();
  });
  searchWindow
    .querySelector("[data-search-close]")
    ?.addEventListener("click", () => searchWindow.close());
  searchWindow.addEventListener("pointerdown", (event) => {
    closeOnBackdropClick = false;
    backdropPointer =
      event.button === 0 && event.isPrimary
        ? { id: event.pointerId, outside: isOutsideFrame(event.clientX, event.clientY) }
        : undefined;
  });
  searchWindow.addEventListener("pointerup", (event) => {
    const start = backdropPointer;
    backdropPointer = undefined;
    closeOnBackdropClick = Boolean(
      start &&
      start.id === event.pointerId &&
      start.outside &&
      event.button === 0 &&
      event.isPrimary &&
      isOutsideFrame(event.clientX, event.clientY),
    );
  });
  searchWindow.addEventListener("pointercancel", () => {
    backdropPointer = undefined;
    closeOnBackdropClick = false;
  });
  searchWindow.addEventListener("click", (event) => {
    if (closeOnBackdropClick && event.target === searchWindow) searchWindow.close();
    closeOnBackdropClick = false;
  });
  searchWindow.addEventListener("close", () => {
    clearTimeout(compositionEndTimer);
    composing = false;
    backdropPointer = undefined;
    closeOnBackdropClick = false;
  });
}

const copyIcons = {
  idle: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4"/>',
  success: '<path d="m5 12 4 4L19 6"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/>',
};

for (const pre of document.querySelectorAll("pre")) {
  const code = pre.querySelector("code");
  if (!code) continue;
  const button = document.createElement("button");
  const status = document.createElement("span");
  status.className = "visually-hidden";
  status.setAttribute("role", "status");
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  const setState = (state: keyof typeof copyIcons, label: string) => {
    button.dataset.state = state;
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      copyIcons[state] +
      "</svg>";
    button.setAttribute("aria-label", label);
    button.title = label;
  };
  button.type = "button";
  button.className = "copy-code";
  setState("idle", "コードをコピー");
  button.addEventListener("click", async () => {
    clearTimeout(resetTimer);
    status.textContent = "";
    try {
      await navigator.clipboard.writeText(code.textContent ?? "");
      setState("success", "コピーしました");
      status.textContent = "コピーしました";
    } catch {
      setState("error", "コピーできませんでした。コードを選択してコピーしてください");
      status.textContent = "コピーできませんでした。コードを選択してコピーしてください";
    }
    resetTimer = setTimeout(() => {
      setState("idle", "コードをコピー");
      status.textContent = "";
    }, 2500);
  });
  pre.append(button, status);
}
