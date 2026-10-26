import { expect, test, type Page } from "@playwright/test";

const mainNavigation = (page: Page) =>
  page.getByRole("navigation", { name: "メインナビゲーション" });

test.describe("トップページ", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("サイト名と説明を表示する", async ({ page }) => {
    await expect(page).toHaveTitle("ongaku.review");
    const title = page.getByRole("heading", { level: 1, name: "ongaku.review" });
    await expect(title).toBeVisible();
    await expect(title.getByRole("link", { name: "ongaku.review" })).toHaveAttribute("href", "/");
    await expect(page.getByText("音楽が好き。", { exact: true })).toBeVisible();
  });

  test("ナビゲーションをHome・About・Searchの順に並べ、現在のページを示す", async ({ page }) => {
    const navigation = mainNavigation(page);
    await expect(navigation.getByRole("link")).toHaveText(["Home", "About", "Search"]);
    await expect(navigation.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(navigation.getByRole("link", { name: "About" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  test("ナビゲーションのアイコンを読み込む", async ({ page }) => {
    const icons = mainNavigation(page).locator("img");
    await expect(icons).toHaveCount(3);
    for (const icon of await icons.all())
      await expect
        .poll(() =>
          icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
        )
        .toBe(true);
  });

  test("記事を名前と作成日時の一覧で表示する", async ({ page }) => {
    const list = page.getByRole("table", { name: "記事一覧" });
    await expect(list.getByRole("columnheader")).toHaveText(["名前", "作成日時"]);
    const row = list.getByRole("row").filter({ hasText: "アビイ・ロード" });
    await expect(
      row.getByRole("link", { name: "「アビイ・ロード」を2026年に聴く" }),
    ).toHaveAttribute("href", "/posts/abbey-road/");
    await expect(row.locator("img")).toHaveAttribute("src", "/icons/silk/cd.svg");
    await expect(row.locator("time")).toHaveAttribute("datetime", "2026-10-25");
    await expect(row.locator("time")).toHaveText("2026/10/25");
    await expect(list.getByRole("link", { name: "About" })).toHaveCount(0);
  });

  test("記事を作成日時の新しい順に並べる", async ({ page }) => {
    const list = page.getByRole("table", { name: "記事一覧" });
    await expect(list.locator("tbody tr").first()).toContainText("アビイ・ロード");
    const dates = await list
      .locator("tbody time")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("datetime") ?? ""));
    expect(dates.length).toBeGreaterThan(1);
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });

  test("アドレスバーにトップページのパスだけを表示する", async ({ page }) => {
    const address = page.getByRole("navigation", { name: "現在地" });
    await expect(address.locator("[aria-current='page']")).toHaveText("/");
    await expect(address.getByText("ongaku.review")).toHaveCount(0);
  });

  test("キーボードで本文へスキップできる", async ({ page }) => {
    const skipLink = page.getByRole("link", { name: "本文へスキップ" });
    await page.keyboard.press("Tab");
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});

test.describe("2ページ目以降", () => {
  test("アドレスバーにページ数を表示しない", async ({ page }) => {
    await page.goto("/page/2/");
    const address = page.getByRole("navigation", { name: "現在地" });
    await expect(address.locator("[aria-current='page']")).toHaveText("/");
    await expect(address.getByText("2ページ目")).toHaveCount(0);
    await expect(mainNavigation(page).getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("ページ送りをページ間で同じ高さに表示する", async ({ page }) => {
    const paginationTop = () =>
      page.getByRole("navigation", { name: "ページ送り" }).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top + window.scrollY;
      });

    await page.goto("/");
    const firstPageTop = await paginationTop();
    await page.goto("/page/2/");
    const secondPageTop = await paginationTop();

    expect(Math.abs(firstPageTop - secondPageTop)).toBeLessThanOrEqual(1);
  });

  test("空の行を表示せず、一覧の枠も広げない", async ({ page }) => {
    await page.goto("/page/2/");
    const rows = await page.locator(".file-table tbody tr").count();
    const links = await page.locator(".file-link").count();
    const paneHeight = await page.locator(".pane").evaluate((element) => {
      return element.getBoundingClientRect().height;
    });
    const tableHeight = await page.locator(".file-table").evaluate((element) => {
      return element.getBoundingClientRect().height;
    });

    expect(rows).toBe(links);
    expect(paneHeight - tableHeight).toBeLessThan(3);
  });
});

test.describe("スマートフォン表示", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("横にスクロールせずにナビゲーションと記事一覧を表示する", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await expect(mainNavigation(page).getByRole("link", { name: "Search" })).toBeInViewport();
    await expect(
      page.getByRole("link", { name: "「アビイ・ロード」を2026年に聴く" }),
    ).toBeInViewport();
  });

  test("2ページ目も一覧の直後にページ送りを表示する", async ({ page }) => {
    await page.goto("/page/2/");
    const rows = await page.locator(".file-table tbody tr").count();
    const links = await page.locator(".file-link").count();
    expect(rows).toBe(links);
    const gap = await page.evaluate(() => {
      const pane = document.querySelector(".pane")?.getBoundingClientRect();
      const pagination = document.querySelector(".pagination")?.getBoundingClientRect();
      return pane && pagination ? pagination.top - pane.bottom : Number.NaN;
    });
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(20);
  });
});

test.describe("記事ページ", () => {
  test("記事を/posts/以下のURLで公開する", async ({ request }) => {
    expect((await request.get("/posts/abbey-road/")).ok()).toBe(true);
    expect((await request.get("/abbey-road/")).status()).toBe(404);
  });

  test("本文と作成日時・更新日時を表示し、アドレスバーのフォルダからトップへ戻れる", async ({
    page,
  }) => {
    await page.goto("/posts/abbey-road/");
    await expect(page.locator(".prose")).toHaveCSS("word-break", "normal");
    await expect(page).toHaveTitle("「アビイ・ロード」を2026年に聴く | ongaku.review");
    await expect(
      page.getByRole("heading", { level: 1, name: "「アビイ・ロード」を2026年に聴く" }),
    ).toBeVisible();
    const created = page.locator(".document-date").filter({ hasText: "作成日時" });
    await expect(created.locator("time")).toHaveAttribute("datetime", "2026-10-25");
    await expect(created.locator("time")).toHaveText("2026/10/25");
    const updated = page.locator(".document-date").filter({ hasText: "更新日時" });
    await expect(updated.locator("time")).toHaveAttribute("datetime", "2026-10-25");
    await expect(updated.locator("time")).toHaveText("2026/10/25");

    const address = page.getByRole("navigation", { name: "現在地" });
    await expect(address.locator("[aria-current='page']")).toHaveText(
      "「アビイ・ロード」を2026年に聴く",
    );
    await expect(address.getByText("ongaku.review")).toHaveCount(0);
    const home = address.getByRole("link", { name: "ホーム" });
    await expect(home).toHaveAttribute("href", "/");
    await home.click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("Aboutページ", () => {
  test("Aboutを現在のページとして示す", async ({ page }) => {
    await page.goto("/about/");
    await expect(page).toHaveTitle("About | ongaku.review");
    await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeVisible();
    await expect(page.locator(".prose")).toContainText("音楽について書くブログです。");
    await expect(page.locator(".document-date")).toHaveCount(0);
    await expect(mainNavigation(page).getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
    await expect(mainNavigation(page).getByRole("link", { name: "About" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("アイコンのクレジットを表示する", async ({ page }) => {
    await page.goto("/about/");
    await expect(page.getByRole("heading", { level: 2, name: "クレジット" })).toBeVisible();
    await expect(page.getByRole("link", { name: "FamFamFam Silk as SVG" })).toHaveAttribute(
      "href",
      "https://github.com/Simandara/famfamfam-silk-svg",
    );
    await expect(page.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/deed.ja",
    );
    await expect(page.locator(".site-footer")).not.toContainText("FamFamFam");
  });
});

test.describe("非公開記事", () => {
  test("記事URLは404になり、すべての記事一覧から除外する", async ({ page, request }) => {
    expect((await request.get("/posts/unpublished-test/")).status()).toBe(404);
    await page.goto("/");
    const paths = await page
      .locator(".pagination a")
      .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute("href")!))]);
    for (const path of new Set(["/", ...paths])) {
      await page.goto(path);
      await expect(page.locator(".file-table")).not.toContainText("UnpublishedFixtureTitle");
      await expect(page.locator(".file-table a[href='/about/']")).toHaveCount(0);
    }
  });

  test("RSS・サイトマップ・検索インデックスに非公開記事の情報を含めない", async ({ request }) => {
    for (const path of ["/feed.xml", "/sitemap.xml", "/search-index.json"]) {
      const response = await request.get(path);
      expect(response.ok()).toBe(true);
      expect((await response.text()).toLowerCase()).not.toMatch(
        /unpublishedfixture|unpublished-test/,
      );
    }
    const index = await (await request.get("/search-index.json")).json();
    expect(index.documents.some((doc: { id: string }) => doc.id === "about")).toBe(false);
  });

  test("非公開本文の検索では結果が出ない", async ({ page }) => {
    await page.goto("/search/?q=UnpublishedFixtureBody");
    await expect(page.getByRole("status")).toContainText("一致するページは見つかりませんでした。");
    await expect(page.locator("[data-search-results] li")).toHaveCount(0);
  });
});

test.describe("検索ページ", () => {
  test("入力したキーワードに一致する記事を表示する", async ({ page }) => {
    await page.goto("/search/");
    await expect(mainNavigation(page).getByRole("link", { name: "Search" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.getByRole("searchbox", { name: "キーワード" }).fill("アビイ");
    await page.getByRole("button", { name: "検索" }).click();

    await expect(page.getByRole("status")).toContainText("「アビイ」の検索結果");
    await expect(
      page.getByRole("link", { name: "「アビイ・ロード」を2026年に聴く" }),
    ).toHaveAttribute("href", "/posts/abbey-road/");
    await expect(page).toHaveURL(/\/search\/\?q=%E3%82%A2%E3%83%93%E3%82%A4$/);
  });

  test("URLのキーワードで検索する", async ({ page }) => {
    await page.goto("/search/?q=" + encodeURIComponent("アビイ"));
    await expect(page.getByRole("searchbox", { name: "キーワード" })).toHaveValue("アビイ");
    await expect(
      page.getByRole("link", { name: "「アビイ・ロード」を2026年に聴く" }),
    ).toBeVisible();
  });
});

test.describe("フィード", () => {
  test("一覧に載せる記事だけを配信する", async ({ request }) => {
    const response = await request.get("/feed.xml");
    expect(response.ok()).toBe(true);
    const feed = await response.text();
    expect(feed).toContain("<link>https://ongaku.review/posts/abbey-road/</link>");
    expect(feed).not.toContain("https://ongaku.review/about/");
  });
});

test.describe("404ページ", () => {
  test("存在しないページで404を返す", async ({ page }) => {
    const response = await page.goto("/does-not-exist/");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "ページが見つかりません" }),
    ).toBeVisible();
    await expect(page.getByText("404", { exact: true })).toBeVisible();
  });
});
