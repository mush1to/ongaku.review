import { expect, test, type Page } from "@playwright/test";

const mainNavigation = (page: Page) =>
  page.getByRole("navigation", { name: "メインナビゲーション" });

const openSearchWindow = async (page: Page) => {
  await mainNavigation(page).getByRole("button", { name: "Search" }).click();
  const searchWindow = page.getByRole("dialog", { name: "検索" });
  await expect(searchWindow).toBeVisible();
  return searchWindow;
};

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
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://ongaku.review",
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      "https://ongaku.review",
    );
    const structuredData = await page
      .locator('script[type="application/ld+json"]')
      .evaluate((element) => JSON.parse(element.textContent ?? "{}"));
    expect(structuredData.url).toBe("https://ongaku.review");
  });

  test("ナビゲーションをHome・About・Searchの順に並べ、現在のページを示す", async ({ page }) => {
    const navigation = mainNavigation(page);
    await expect(navigation.getByRole("listitem")).toHaveText(["Home", "About", "Search"]);
    await expect(navigation.getByRole("link")).toHaveText(["Home", "About"]);
    await expect(navigation.getByRole("button", { name: "Search" })).toBeVisible();
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
    ).toHaveAttribute("href", "/posts/abbey-road");
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

test.describe("タイトルバー", () => {
  const pages = [
    { name: "トップページ", path: "/" },
    { name: "2ページ目", path: "/page/2" },
    { name: "記事ページ", path: "/posts/abbey-road" },
    { name: "Aboutページ", path: "/about" },
    { name: "404ページ", path: "/does-not-exist" },
  ];

  for (const { name, path } of pages)
    test(`${name}に操作できない飾りのタイトルバーを表示する`, async ({ page }) => {
      await page.goto(path);
      const titleBar = page.locator(".window > .title-bar");
      await expect(titleBar).toBeVisible();
      await expect(titleBar.locator(".title-bar-text")).toHaveText("Internet");

      const icon = titleBar.locator("img");
      await expect(icon).toHaveAttribute("src", "/icons/silk/world.svg");
      await expect
        .poll(() =>
          icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
        )
        .toBe(true);

      await expect(titleBar.locator(".title-bar-button")).toHaveCount(3);
      await expect(titleBar).toHaveAttribute("aria-hidden", "true");
      await expect(titleBar.locator("a, button")).toHaveCount(0);
    });
});

test.describe("URL", () => {
  test("フラットなHTMLをスラッシュなしで配信し、旧形式をクエリ付きで転送する", async ({
    request,
  }) => {
    expect((await request.get("/")).status()).toBe(200);
    expect((await request.get("/about")).status()).toBe(200);
    expect((await request.get("/page/2")).status()).toBe(200);
    expect((await request.get("/tags/ロック")).status()).toBe(200);

    for (const [source, target] of [
      ["/about/?q=1", "/about?q=1"],
      ["/about.html?q=1", "/about?q=1"],
      ["/page/2/?q=1", "/page/2?q=1"],
      ["/posts/abbey-road/?q=1", "/posts/abbey-road?q=1"],
      ["/tags/ロック/?q=1", `/tags/${encodeURIComponent("ロック")}?q=1`],
      ["/tags/ロック.html?q=1", `/tags/${encodeURIComponent("ロック")}?q=1`],
      ["/index.html?q=1", "/?q=1"],
    ]) {
      const response = await request.get(source, { maxRedirects: 0 });
      expect(response.status()).toBe(301);
      expect(response.headers().location).toBe(target);
    }
  });
});

test.describe("2ページ目以降", () => {
  test("アドレスバーにページ数を表示しない", async ({ page }) => {
    await page.goto("/page/2");
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
    await page.goto("/page/2");
    const secondPageTop = await paginationTop();

    expect(Math.abs(firstPageTop - secondPageTop)).toBeLessThanOrEqual(1);
  });

  test("空の行を表示せず、一覧の枠も広げない", async ({ page }) => {
    await page.goto("/page/2");
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
    await expect(mainNavigation(page).getByRole("button", { name: "Search" })).toBeInViewport();
    await expect(
      page.getByRole("link", { name: "「アビイ・ロード」を2026年に聴く" }),
    ).toBeInViewport();
  });

  test("検索ウィンドウを画面幅に収め、閉じるボタンのタップ範囲を44px以上にする", async ({
    page,
  }) => {
    await page.goto("/");
    const searchWindow = await openSearchWindow(page);
    const windowBox = await searchWindow.boundingBox();
    expect(windowBox?.x).toBeGreaterThanOrEqual(0);
    expect((windowBox?.x ?? 0) + (windowBox?.width ?? Infinity)).toBeLessThanOrEqual(375);
    const closeBox = await searchWindow.getByRole("button", { name: "閉じる" }).boundingBox();
    expect(closeBox?.width).toBeGreaterThanOrEqual(44);
    expect(closeBox?.height).toBeGreaterThanOrEqual(44);
  });

  test("2ページ目も一覧の直後にページ送りを表示する", async ({ page }) => {
    await page.goto("/page/2");
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
    expect((await request.get("/posts/abbey-road")).ok()).toBe(true);
    expect((await request.get("/abbey-road/")).status()).toBe(404);
  });

  test("本文と作成日時・更新日時を表示し、アドレスバーのフォルダからトップへ戻れる", async ({
    page,
  }) => {
    await page.goto("/posts/abbey-road");
    await expect(page.locator(".prose")).toHaveCSS("word-break", "normal");
    for (const heading of await page.locator(".prose :is(h2, h3)").all()) {
      await expect(heading).toHaveCSS("border-bottom-style", "none");
      await expect(heading).toHaveCSS("text-decoration-line", "none");
    }
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

test.describe("タグページ", () => {
  const currentPath = (page: Page) => decodeURIComponent(new URL(page.url()).pathname);

  test("記事のタグから静的なタグページを開く", async ({ page }) => {
    await page.goto("/posts/abbey-road");
    const tags = page.getByRole("list", { name: "タグ" });
    await expect(tags.getByRole("link")).toHaveText(["#ロック", "#The Beatles", "#1960年代"]);
    await tags.getByRole("link", { name: "#ロック" }).click();

    await expect.poll(() => currentPath(page)).toBe("/tags/ロック");
    await expect(page).toHaveTitle("#ロック | ongaku.review");
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText("#ロック");
    await expect(mainNavigation(page).getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page.getByRole("navigation", { name: "現在地" })).toContainText("#ロック");

    const list = page.getByRole("table", { name: "タグ「#ロック」の記事" });
    await expect(list.getByRole("columnheader")).toHaveText(["名前", "作成日時"]);
    await expect(list.locator(".file-link")).toHaveText([
      "「アビイ・ロード」を2026年に聴く",
      "「OK Computer」の静かな怒り",
      "「In Rainbows」の温度",
    ]);
    await expect(list.locator(".file-link").first()).toHaveAttribute("href", "/posts/abbey-road");
    await expect(list.locator(".file-date time").first()).toHaveText("2026/10/25");
    await expect(page.getByRole("navigation", { name: "ページ送り" })).toBeHidden();
    await expect(page.locator(".skip-link")).toHaveAttribute("href", "#main");
    await page.reload();
    await expect(list.locator(".file-link")).toHaveCount(3);
  });

  test("タグページを直接開いてもJavaScriptなしで記事一覧を表示する", async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:4173",
      javaScriptEnabled: false,
    });
    const staticPage = await context.newPage();
    await staticPage.goto("/tags/ジャズ");
    await expect(staticPage.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(
      "#ジャズ",
    );
    await expect(
      staticPage.getByRole("table", { name: "タグ「#ジャズ」の記事" }).locator(".file-link"),
    ).toHaveText(["「Kind of Blue」の余白"]);
    await staticPage.reload();
    await expect(staticPage.getByRole("table", { name: "タグ「#ジャズ」の記事" })).toBeVisible();
    await context.close();
  });

  test("存在しないタグは404になる", async ({ request }) => {
    expect((await request.get("/tags/存在しないタグ")).status()).toBe(404);
    expect((await request.get("/tags")).status()).toBe(404);
  });
});

test.describe("記事ページの構成", () => {
  async function expectVerticalOrder(page: Page, selectors: string[]) {
    const tops: number[] = [];
    for (const selector of selectors) {
      await expect(page.locator(selector)).toHaveCount(1);
      tops.push(
        await page.locator(selector).evaluate((element) => element.getBoundingClientRect().top),
      );
    }
    for (let index = 1; index < tops.length; index++)
      expect(tops[index], selectors[index]).toBeGreaterThan(tops[index - 1]!);
  }

  test("見出し画像・タイトル・著者欄・本文・タグ・シェア・前後の記事の順に並べる", async ({
    page,
  }) => {
    await page.goto("/posts/pagination-check-01");
    await expectVerticalOrder(page, [
      ".document-thumbnail",
      ".document-header h1",
      ".document-byline",
      ".prose",
      ".share-button",
      ".adjacent-posts",
    ]);

    await page.goto("/posts/abbey-road");
    await expectVerticalOrder(page, [
      ".document-header h1",
      ".document-byline",
      ".prose",
      ".document-tags",
      ".share-button",
      ".adjacent-posts",
    ]);
  });

  test("著者欄に記事のアイコン・著者名・日付を表示する", async ({ page }) => {
    await page.goto("/posts/abbey-road");
    const byline = page.locator(".document-byline");
    await expect(byline.locator("img")).toHaveAttribute("src", "/icons/silk/cd.svg");
    await expect(byline.locator(".document-author")).toHaveText("mush1to");
    await expect(byline.locator(".document-date")).toHaveCount(2);
  });

  test("見出し画像を1200:630で表示し、OGPとXのカードに使う", async ({ page }) => {
    await page.goto("/posts/pagination-check-01");
    const image = page.locator(".document-thumbnail img");
    await expect(image).toHaveAttribute("alt", "青一色の確認用画像");
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBe(1200);
    const ratio = await image.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width / rect.height;
    });
    expect(ratio).toBeCloseTo(1200 / 630, 1);

    const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(ogImage).toMatch(/^https:\/\/ongaku\.review\/assets\/content\/[0-9a-f]+\.png$/);
    expect(new URL(ogImage!).pathname).toBe(await image.getAttribute("src"));
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
      "content",
      "青一色の確認用画像",
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
  });

  test("見出し画像のない記事はsummaryカードのままにする", async ({ page }) => {
    await page.goto("/posts/abbey-road");
    await expect(page.locator(".document-thumbnail")).toHaveCount(0);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary");
  });

  test("Xのシェアボタンでタイトルとcanonical URLを新しいタブに渡す", async ({ page }) => {
    await page.goto("/posts/abbey-road");
    const share = page.getByRole("link", { name: "Xでポスト" });
    await expect(share).toHaveText("ポスト");
    await expect(share).toHaveAttribute("target", "_blank");
    await expect(share.locator("svg path")).toHaveAttribute("fill", "#000");
    const url = new URL((await share.getAttribute("href"))!);
    expect(url.origin + url.pathname).toBe("https://x.com/intent/post");
    expect(url.searchParams.get("text")).toBe("「アビイ・ロード」を2026年に聴く");
    expect(url.searchParams.get("url")).toBe(
      await page.locator('link[rel="canonical"]').getAttribute("href"),
    );
  });

  test("タグ検索は全角の#と表記ゆれを同じタグとして扱う", async ({ page }) => {
    await page.goto("/");
    const searchWindow = await openSearchWindow(page);
    const searchbox = searchWindow.getByRole("searchbox", { name: "キーワード" });
    await searchbox.fill("＃ｼﾞｬｽﾞ");
    await expect(searchWindow.getByRole("status")).toHaveText("タグ「#ｼﾞｬｽﾞ」の記事：1件");
    await expect(searchWindow.getByRole("link", { name: "「Kind of Blue」の余白" })).toBeVisible();
    await searchbox.fill("#存在しないタグ");
    await expect(searchWindow.getByRole("status")).toHaveText(
      "タグ「#存在しないタグ」の記事は見つかりませんでした。",
    );
  });

  test("前後の記事へのリンクを表示する", async ({ page }) => {
    await page.goto("/posts/abbey-road");
    const adjacent = page.getByRole("navigation", { name: "前後の記事" });
    const previous = adjacent.locator("a[rel='prev']");
    await expect(previous).toContainText("前の記事");
    const previousPath = await previous.getAttribute("href");
    await expect(adjacent.locator("a[rel='next']")).toHaveCount(0);

    await page.goto(previousPath!);
    const next = page.getByRole("navigation", { name: "前後の記事" }).locator("a[rel='next']");
    await expect(next).toHaveAttribute("href", "/posts/abbey-road");
    await expect(next).toContainText("「アビイ・ロード」を2026年に聴く");
  });

  test("いちばん古い記事は次の記事だけを右の列に表示する", async ({ page }) => {
    await page.goto("/posts/pagination-check-01");
    const adjacent = page.getByRole("navigation", { name: "前後の記事" });
    await expect(adjacent.locator("a[rel='prev']")).toHaveCount(0);
    const next = adjacent.locator("a[rel='next']");
    await expect(next).toHaveAttribute("href", "/posts/pagination-check-02");
    const [navBox, nextBox] = await Promise.all([adjacent.boundingBox(), next.boundingBox()]);
    expect(nextBox!.x).toBeGreaterThan(navBox!.x + navBox!.width / 3);
  });
});

test.describe("記事ページのスマートフォン表示", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("横にスクロールせず、見出し画像をペインの幅いっぱいに広げる", async ({ page }) => {
    await page.goto("/posts/pagination-check-01");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    const [pane, image] = await Promise.all([
      page.locator(".document").evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          left: rect.left + parseFloat(style.borderLeftWidth),
          right: rect.right - parseFloat(style.borderRightWidth),
        };
      }),
      page.locator(".document-thumbnail img").boundingBox(),
    ]);
    expect(Math.abs(image!.x - pane.left)).toBeLessThanOrEqual(1);
    expect(Math.abs(image!.x + image!.width - pane.right)).toBeLessThanOrEqual(1);
  });

  test("前後の記事を2列で並べる", async ({ page }) => {
    await page.goto("/posts/abbey-road");
    const previousPath = await page.locator(".adjacent-posts a[rel='prev']").getAttribute("href");
    await page.goto(previousPath!);
    const [previous, next] = await Promise.all([
      page.locator(".adjacent-posts a[rel='prev']").boundingBox(),
      page.locator(".adjacent-posts a[rel='next']").boundingBox(),
    ]);
    expect(Math.abs(previous!.y - next!.y)).toBeLessThanOrEqual(1);
    expect(next!.x).toBeGreaterThan(previous!.x + previous!.width - 1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});

test.describe("Aboutページ", () => {
  test("記事ページだけの要素を表示しない", async ({ page }) => {
    await page.goto("/about");
    for (const selector of [
      ".document-thumbnail",
      ".document-byline",
      ".document-tags",
      ".share-button",
      ".adjacent-posts",
    ])
      await expect(page.locator(selector)).toHaveCount(0);
  });

  test("Aboutを現在のページとして示す", async ({ page }) => {
    await page.goto("/about");
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
    await page.goto("/about");
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
    expect((await request.get("/posts/unpublished-test")).status()).toBe(404);
    await page.goto("/");
    const paths = await page
      .locator(".pagination a")
      .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute("href")!))]);
    for (const path of new Set(["/", ...paths])) {
      await page.goto(path);
      await expect(page.locator(".file-table")).not.toContainText("UnpublishedFixtureTitle");
      await expect(page.locator(".file-table a[href='/about']")).toHaveCount(0);
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
    await page.goto("/");
    const searchWindow = await openSearchWindow(page);
    await searchWindow
      .getByRole("searchbox", { name: "キーワード" })
      .fill("UnpublishedFixtureBody");
    await expect(searchWindow.getByRole("status")).toContainText(
      "一致するページは見つかりませんでした。",
    );
    await expect(searchWindow.locator("[data-search-results] li")).toHaveCount(0);
  });
});

test.describe("検索ウィンドウ", () => {
  test("ページを移動せずに開き、入力したキーワードに一致する記事を表示する", async ({ page }) => {
    await page.goto("/posts/kind-of-blue");
    const searchWindow = await openSearchWindow(page);
    const searchbox = searchWindow.getByRole("searchbox", { name: "キーワード" });
    await expect(searchbox).toBeFocused();
    await searchbox.fill("アビイ");
    await searchWindow.getByRole("button", { name: "検索" }).click();

    await expect(searchWindow.getByRole("status")).toContainText("「アビイ」の検索結果");
    const result = searchWindow.getByRole("link", { name: "「アビイ・ロード」を2026年に聴く" });
    await expect(result).toHaveAttribute("href", "/posts/abbey-road");
    await expect(result.locator("img")).toHaveAttribute("src", "/icons/silk/cd.svg");
    await expect(page).toHaveURL(/\/posts\/kind-of-blue$/);

    await result.click();
    await expect(page).toHaveURL(/\/posts\/abbey-road$/);
  });

  test("結果が入っても上端の位置を変えず、下に同じ余白を残して広がる", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("/");
    const searchWindow = await openSearchWindow(page);
    const emptyBox = await searchWindow.boundingBox();
    await searchWindow.getByRole("searchbox", { name: "キーワード" }).fill("ア");
    await expect(searchWindow.getByRole("status")).toContainText("「ア」の検索結果");
    const filledBox = await searchWindow.boundingBox();

    expect(filledBox?.y).toBeCloseTo(emptyBox?.y ?? 0, 0);
    expect(600 - ((filledBox?.y ?? 0) + (filledBox?.height ?? 0))).toBeCloseTo(
      filledBox?.y ?? 0,
      0,
    );
  });

  test("背景を右端まで覆い、開いたときにページを横に動かさない", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("/posts/abbey-road/");
    const x = () => page.locator(".window").evaluate((el) => el.getBoundingClientRect().x);
    const before = await x();
    await openSearchWindow(page);

    expect(
      await page.evaluate(() => document.elementFromPoint(window.innerWidth - 1, 100)?.tagName),
    ).toBe("DIALOG");
    expect(await x()).toBeCloseTo(before, 0);
  });

  test("閉じるボタン・Esc・ウィンドウの外のクリックで閉じ、Searchボタンにフォーカスを戻す", async ({
    page,
  }) => {
    await page.goto("/");
    const searchButton = mainNavigation(page).getByRole("button", { name: "Search" });

    const searchWindow = await openSearchWindow(page);
    await searchWindow.getByRole("button", { name: "閉じる" }).click();
    await expect(searchWindow).toBeHidden();
    await expect(searchButton).toBeFocused();

    await openSearchWindow(page);
    await page.keyboard.press("Escape");
    await expect(searchWindow).toBeHidden();
    await expect(searchButton).toBeFocused();

    await openSearchWindow(page);
    await searchWindow.getByRole("heading", { name: "検索" }).click();
    await expect(searchWindow).toBeVisible();
    await searchWindow
      .getByRole("searchbox", { name: "キーワード" })
      .dispatchEvent("keydown", { key: "Escape", isComposing: true });
    await expect(searchWindow).toBeVisible();
    await page.mouse.click(10, 10);
    await expect(searchWindow).toBeHidden();
  });

  test("変換中の標準Escとcancelを抑止し、変換終了後のEscで閉じる", async ({ page }) => {
    await page.goto("/");
    const searchWindow = await openSearchWindow(page);
    const input = searchWindow.getByRole("searchbox", { name: "キーワード" });
    await input.dispatchEvent("compositionstart");
    await page.keyboard.press("Escape");
    await expect(searchWindow).toBeVisible();
    await searchWindow.evaluate((element: HTMLDialogElement) => element.requestClose());
    await expect(searchWindow).toBeVisible();
    await input.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
      element.closest("dialog")!.requestClose();
    });
    await expect(searchWindow).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(searchWindow).toBeHidden();
  });

  test("変換中でも閉じるボタンは使え、再度開いた後のEscを妨げない", async ({ page }) => {
    await page.goto("/");
    const searchWindow = await openSearchWindow(page);
    await searchWindow
      .getByRole("searchbox", { name: "キーワード" })
      .dispatchEvent("compositionstart");
    await searchWindow.getByRole("button", { name: "閉じる" }).click();
    await expect(searchWindow).toBeHidden();
    await openSearchWindow(page);
    await page.keyboard.press("Escape");
    await expect(searchWindow).toBeHidden();
  });

  test("検索データの取得に失敗したあと再試行できる", async ({ page }) => {
    let requests = 0;
    await page.route("**/search-pages.json", async (route) => {
      requests++;
      if (requests === 1) return route.fulfill({ status: 503, body: "{}" });
      return route.continue();
    });
    await page.goto("/");
    const searchWindow = await openSearchWindow(page);
    const searchbox = searchWindow.getByRole("searchbox", { name: "キーワード" });
    await searchbox.fill("アビイ");
    await expect(searchWindow.getByRole("status")).toContainText("検索できませんでした");

    await searchbox.fill("#ロック");
    await expect(searchWindow.getByRole("status")).toContainText("タグ「#ロック」の記事：");
    expect(requests).toBeGreaterThanOrEqual(2);
  });

  test("検索語を指定して開く場合も初期化完了後に検索する", async ({ page }) => {
    await page.goto("/");
    const opener = mainNavigation(page).getByRole("button", { name: "Search" });
    await opener.evaluate((button) => button.setAttribute("data-search-query", "アビイ"));
    const searchWindow = await openSearchWindow(page);
    await expect(searchWindow.getByRole("status")).toContainText("「アビイ」の検索結果");
    await expect(
      searchWindow.getByRole("link", { name: "「アビイ・ロード」を2026年に聴く" }),
    ).toBeVisible();
  });

  test("検索モジュールの読み込み失敗を表示し、閉じて再度開くと再試行する", async ({ page }) => {
    await page.goto("/");
    let requests = 0;
    await page.route("**/*.js", async (route) => {
      requests++;
      if (requests === 1) return route.abort();
      return route.continue();
    });

    const searchWindow = await openSearchWindow(page);
    await expect(searchWindow.getByRole("status")).toContainText("再読み込みしてください");
    await searchWindow.getByRole("button", { name: "閉じる" }).click();
    await mainNavigation(page).getByRole("button", { name: "Search" }).click();
    await expect(searchWindow.getByRole("status")).toHaveText("");
    expect(requests).toBeGreaterThanOrEqual(2);
  });

  test("背景とのドラッグでは閉じず、右クリックでも閉じない", async ({ page }) => {
    await page.goto("/");
    const searchWindow = await openSearchWindow(page);
    const frame = await searchWindow.locator(".search-window-frame").boundingBox();
    expect(frame).not.toBeNull();
    const inside = { x: frame!.x + frame!.width / 2, y: frame!.y + frame!.height / 2 };

    await page.mouse.move(10, 10);
    await page.mouse.down();
    await page.mouse.move(inside.x, inside.y);
    await page.mouse.up();
    await expect(searchWindow).toBeVisible();

    await page.mouse.move(inside.x, inside.y);
    await page.mouse.down();
    await page.mouse.move(10, 10);
    await page.mouse.up();
    await expect(searchWindow).toBeVisible();

    await page.mouse.click(10, 10, { button: "right" });
    await expect(searchWindow).toBeVisible();
  });

  test("入力中にEscで閉じても、開き直すと前回のキーワードと結果を残して選択した状態にする", async ({
    page,
  }) => {
    await page.goto("/");
    const searchWindow = await openSearchWindow(page);
    const searchbox = searchWindow.getByRole("searchbox", { name: "キーワード" });
    const result = searchWindow.getByRole("link", { name: "「アビイ・ロード」を2026年に聴く" });
    await searchbox.fill("アビイ");
    await expect(result).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(searchWindow).toBeHidden();

    await openSearchWindow(page);
    await expect(searchbox).toHaveValue("アビイ");
    await expect(searchbox).toBeFocused();
    expect(
      await searchbox.evaluate((input: HTMLInputElement) => [
        input.selectionStart,
        input.selectionEnd,
      ]),
    ).toEqual([0, 3]);
    await expect(result).toBeVisible();
  });

  test("検索ページは公開しない", async ({ request }) => {
    expect((await request.get("/search/")).status()).toBe(404);
  });
});

test.describe("フィード", () => {
  test("一覧に載せる記事だけを配信する", async ({ request }) => {
    const response = await request.get("/feed.xml");
    expect(response.ok()).toBe(true);
    const feed = await response.text();
    expect(feed).toContain("<link>https://ongaku.review/posts/abbey-road</link>");
    expect(feed).not.toContain("https://ongaku.review/about");
  });
});

test.describe("サイトマップ", () => {
  test("タグページを含めるがRSSと検索ページデータには含めない", async ({ request }) => {
    const sitemapResponse = await request.get("/sitemap.xml");
    expect(sitemapResponse.ok()).toBe(true);
    expect(await sitemapResponse.text()).toContain(
      "https://ongaku.review/tags/%E3%83%AD%E3%83%83%E3%82%AF",
    );

    const [feed, searchPages] = await Promise.all([
      request.get("/feed.xml").then((response) => response.text()),
      request
        .get("/search-pages.json")
        .then((response) => response.json() as Promise<Record<string, { path: string }>>),
    ]);
    expect(feed).not.toContain("https://ongaku.review/tags/");
    expect(Object.values(searchPages).every((entry) => entry.path.startsWith("/posts/"))).toBe(
      true,
    );
  });
});

test.describe("404ページ", () => {
  test("存在しないページで404を返す", async ({ page }) => {
    const response = await page.goto("/does-not-exist");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "ページが見つかりません" }),
    ).toBeVisible();
    await expect(page.getByText("404", { exact: true })).toBeVisible();
  });
});
