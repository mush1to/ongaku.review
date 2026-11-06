import { afterEach, describe, expect, it, vi } from "vitest";
import { initSearch } from "./search";

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));

vi.mock("virtual:ox-content/search", () => ({ search: searchMock }));

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: unknown) => void>();
  options: FakeElement[] = [];
  className = "";
  hidden = false;
  scrollTop = 0;
  clientTop = 0;
  clientHeight = 0;
  value = "";
  private text = "";

  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.text = value;
  }

  append(...nodes: FakeElement[]) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: FakeElement[]) {
    this.children.splice(0, this.children.length, ...nodes);
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  toggleAttribute(name: string, force?: boolean) {
    if (force ?? !this.attributes.has(name)) this.attributes.set(name, "");
    else this.attributes.delete(name);
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, listener);
  }

  querySelector(): FakeElement | null {
    return null;
  }

  getBoundingClientRect() {
    return { top: 0, height: 0 };
  }
}

class FakeInputElement extends FakeElement {}

function setupSearch() {
  const input = new FakeInputElement();
  const searchWindow = new FakeElement();
  const status = new FakeElement();
  const list = new FakeElement();
  const pagination = new FakeElement();
  const pageSelect = new FakeElement();
  const pageTotal = new FakeElement();
  const previous = new FakeElement();
  const next = new FakeElement();
  const paginationParts = new Map<string, FakeElement>([
    ["[data-search-page]", pageSelect],
    ["[data-search-page-total]", pageTotal],
    ["[data-search-previous]", previous],
    ["[data-search-next]", next],
  ]);
  pagination.querySelector = (selector?: string) =>
    (selector && paginationParts.get(selector)) || null;
  const pageParts = new Map<string, FakeElement>([
    ["[data-search-status]", status],
    ["[data-search-results]", list],
    ["[data-search-pagination]", pagination],
  ]);
  const form = Object.assign(new FakeElement(), {
    elements: { namedItem: (name: string) => (name === "q" ? input : null) },
    closest: (selector: string) => (selector === "[data-search-window]" ? searchWindow : null),
  });
  vi.stubGlobal("HTMLInputElement", FakeInputElement);
  vi.stubGlobal("document", {
    createElement: () => new FakeElement(),
    querySelector: (selector: string) => pageParts.get(selector) ?? null,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({}) })),
  );
  initSearch(form as unknown as HTMLFormElement);
  return {
    status,
    list,
    submit(query: string) {
      input.value = query;
      form.listeners.get("submit")?.({ preventDefault() {} });
    },
  };
}

const nextEventLoopTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

const waitForState = async (assertion: () => void) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      assertion();
      return;
    } catch {
      await nextEventLoopTurn();
    }
  }
  assertion();
};

afterEach(() => {
  searchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("initSearch", () => {
  it("古い検索の応答が後から返っても、新しい結果を上書きしない", async () => {
    const { submit, status, list } = setupSearch();
    let respondOld!: (hits: unknown) => void;
    searchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          respondOld = resolve;
        }),
    );
    searchMock.mockImplementationOnce(() =>
      Promise.resolve([{ title: "新しい記事", url: "/new", snippet: "" }]),
    );

    submit("古い");
    submit("新しい");
    await waitForState(() => expect(status.textContent).toBe("「新しい」の検索結果：1件"));

    respondOld([{ title: "古い記事", url: "/old" }]);
    await nextEventLoopTurn();
    expect(status.textContent).toBe("「新しい」の検索結果：1件");
    expect(list.textContent).toBe("新しい記事");
  });
});
