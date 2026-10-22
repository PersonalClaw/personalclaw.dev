import { expect, test } from "@playwright/test";
import { qualityRoutes } from "../support/site-contract.mjs";
import { openPage } from "./support";

// The global chrome's findings in docs/site-audit.md, each pinned where it was fixed.

test("the header holds five links and GitHub, with no primary button and no glued arrow (X4, X7)", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the full header row shows on desktop");
  await openPage(page, "/");
  await expect(page.locator(".desktop-nav a")).toHaveText(["Product", "Apps", "Security", "Docs", "Release"]);
  const github = page.locator(".site-header .header-github");
  await expect(github).toHaveText("GitHub");
  await expect(github).not.toHaveClass(/button-primary/);
  // An icon inside a header link is an arrow glued to its label; only the menu button has one.
  await expect(page.locator(".site-header a svg, #mobile-menu a svg")).toHaveCount(0);
});

test("a page below a section index marks that section as current (X9)", async ({ page }) => {
  await openPage(page, "/blog/launch");
  await expect(page.locator(".footer-links a", { hasText: "Blog" })).toHaveAttribute("aria-current", "true");
  await openPage(page, "/product");
  await expect(page.locator(".footer-links a", { hasText: "Product" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".desktop-nav a", { hasText: "Product" })).toHaveAttribute("aria-current", "page");
});

test("the header's current page keeps a mark under forced colors (X5)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the full header row shows on desktop");
  await page.emulateMedia({ forcedColors: "active" });
  for (const path of ["/product", "/apps", "/security", "/release"]) {
    await openPage(page, path);
    const current = page.locator('.desktop-nav a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    const decoration = await current.evaluate((link) => getComputedStyle(link).textDecorationLine);
    expect(decoration, `the current link on ${path}`).toContain("underline");
  }
});

test("an unknown address gets the site's 404 in the site's chrome, under /docs too (X8)", async ({ page }) => {
  for (const path of ["/no-such-page", "/docs/no-such-page"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.locator("h1"), path).toHaveText("Nothing is published here.");
    await expect(page.locator(".site-header"), path).toHaveCount(1);
    await expect(page.locator(".site-footer"), path).toHaveCount(1);
  }
});

for (const route of qualityRoutes) {
  test(`${route.name} sets no label in all caps (X3)`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "a computed style, the same at every width");
    await openPage(page, route.path);
    const shouted = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((element) => getComputedStyle(element).textTransform === "uppercase")
        .map((element) => `${element.tagName.toLowerCase()}.${String(element.className)} "${element.textContent?.trim().slice(0, 30)}"`)
    );
    expect(shouted).toEqual([]);
  });
}

test("the System Window's view survives reload, back, forward and a copied link (H11)", async ({
  page,
  context
}) => {
  const selected = page.locator('.system-tabs [role="tab"][aria-selected="true"]');
  await openPage(page, "/");
  await page.locator('.system-tabs [role="tab"]', { hasText: "Loops" }).click();
  await expect(selected).toHaveText("Loops");
  await expect(page).toHaveURL(/[?&]view=loops\b/);

  await page.reload();
  await expect(selected).toHaveText("Loops");

  await page.goto("/product");
  await page.goBack();
  await expect(selected).toHaveText("Loops");
  await page.goForward();
  await page.goBack();
  await expect(selected).toHaveText("Loops");

  const copied = await context.newPage();
  await copied.goto(page.url());
  await expect(copied.locator('.system-tabs [role="tab"][aria-selected="true"]')).toHaveText("Loops");
  await expect(copied.locator('.system-tabs [role="tab"][aria-selected="true"]')).toHaveAttribute("tabindex", "0");

  await copied.goto("/?view=no-such-view");
  await expect(copied.locator('.system-tabs [role="tab"]').first()).toHaveAttribute("aria-selected", "true");
  await copied.close();
});

test("the System Window's selected tab keeps a mark under forced colors (H10)", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await openPage(page, "/");
  const decoration = await page
    .locator('.system-tabs [role="tab"][aria-selected="true"]')
    .evaluate((tab) => getComputedStyle(tab).textDecorationLine);
  expect(decoration).toContain("underline");
});
