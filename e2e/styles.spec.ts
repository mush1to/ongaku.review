import { expect, test, type Locator, type Page } from "@playwright/test";

const surface = {
  border: "1px solid rgb(159, 184, 226)",
  borderRadius: "4px",
  backgroundColor: "rgb(255, 255, 255)",
  boxShadow: "rgba(10, 40, 120, 0.12) 0px 1px 2px 0px",
};

const hoverShadow =
  "rgb(255, 230, 160) 0px 2px 0px 0px inset, rgb(245, 176, 66) 0px -2px 0px 0px inset";

const computedSurface = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      border: style.border,
      borderRadius: style.borderRadius,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
    };
  });

const computedHoverShadow = async (locator: Locator) => {
  await locator.hover();
  return locator.evaluate((element) => getComputedStyle(element).boxShadow);
};

const openSearchWindow = async (page: Page) => {
  await page
    .getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("button", { name: "Search" })
    .click();
  const searchWindow = page.getByRole("dialog", { name: "Search" });
  await expect(searchWindow).toBeVisible();
  return searchWindow;
};

test("一覧・検索結果・著者カード・前後記事の面の枠・角丸・背景・影と、ページ送り・XPボタン・コードコピーのホバー影を固定する", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".pane").first()).toBeVisible();
  expect(await computedSurface(page.locator(".pane").first())).toEqual(surface);

  const searchWindow = await openSearchWindow(page);
  await searchWindow.getByRole("searchbox", { name: "Keyword" }).fill("ア");
  const searchResults = searchWindow.locator(".search-results");
  await expect(searchResults.locator("li").first()).toBeVisible();
  expect(await computedSurface(searchResults)).toEqual(surface);

  await page.goto("/posts/pagination-check-01");
  await expect(page.locator(".author-card")).toBeVisible();
  expect(await computedSurface(page.locator(".author-card"))).toEqual(surface);
  await expect(page.locator(".adjacent-link").first()).toBeVisible();
  expect(await computedSurface(page.locator(".adjacent-link").first())).toEqual(surface);

  await page.goto("/page/2");
  await page.locator(".pagination-links").evaluate((element: HTMLElement) => {
    element.hidden = false;
  });
  expect(await computedHoverShadow(page.locator(".pagination-links a").first())).toBe(hoverShadow);
  expect(await computedHoverShadow(page.locator(".pagination a.xp-button").first())).toBe(
    hoverShadow,
  );

  await page.evaluate(() => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-code";
    button.textContent = "copy";
    button.style.position = "fixed";
    button.style.top = "50%";
    button.style.left = "50%";
    button.style.zIndex = "1";
    document.body.append(button);
  });
  expect(await computedHoverShadow(page.locator(".copy-code"))).toBe(hoverShadow);
});
