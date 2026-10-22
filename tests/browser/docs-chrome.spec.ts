import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openPage } from "./support";

// The docs tier's findings in docs/site-audit.md (D2, D4 to D7), on the pages the audit read.
const facts = JSON.parse(readFileSync(new URL("../../.generated/release-facts.json", import.meta.url), "utf8"));
const DOCS = ["/docs", "/docs/guides", "/docs/reference/cli", "/docs/architecture/overview", "/docs/research/security-and-guardrails"];
const SITE_LINKS = ["Product", "Apps", "Security", "Docs", "Release"];

test("every docs page names the release it was generated from (D2)", async ({ page }) => {
  for (const path of DOCS) {
    await openPage(page, path);
    await expect(page.locator(".docs-release"), path).toContainText(`Generated from PersonalClaw ${facts.core.versionLabel}`);
    await expect(page.locator(".docs-release a"), path).toHaveAttribute("href", "/release");
  }
});

test("the page's own content comes before \"On this page\" in reading order (D6)", async ({ page }) => {
  await openPage(page, "/docs/reference/cli");
  const order = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const toc = [...document.querySelectorAll("h2")].find((h) => h.textContent?.trim() === "On this page");
    if (!h1 || !toc) return "missing";
    return h1.compareDocumentPosition(toc) & Node.DOCUMENT_POSITION_FOLLOWING ? "h1 first" : "toc first";
  });
  expect(order).toBe("h1 first");
});

test("the docs header carries the site's links at every width (D5)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the test sets its own widths");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPage(page, "/docs/guides");
  await expect(page.locator(".right-group .docs-site-nav a")).toHaveText(SITE_LINKS);
  await expect(page.locator('.right-group .docs-site-nav a[aria-current="true"]')).toHaveText("Docs");

  await page.setViewportSize({ width: 960, height: 900 });
  await expect(page.locator(".right-group .docs-site-nav")).toBeHidden();
  await page.locator(".right-group .docs-site-menu summary").click();
  await expect(page.locator(".right-group .docs-site-menu nav a")).toHaveText(SITE_LINKS);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".sl-menu-button").click();
  await expect(page.locator(".mobile-preferences .docs-site-nav a")).toHaveText(SITE_LINKS);
});

/** Every control in the selector that is under 44 px. */
async function smallTargets(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return [];
      const name = element.getAttribute("aria-label") ?? element.textContent?.trim().replace(/\s+/g, " ").slice(0, 30);
      return rect.width < 43.5 || rect.height < 43.5 ? [`"${name}" is ${Math.round(rect.width)}x${Math.round(rect.height)}`] : [];
    })
  );
}

test("Starlight's chrome keeps 44 px targets and a visible current page (D4)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the test sets its own widths");
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPage(page, "/docs/guides/getting-started");
  expect(
    await smallTargets(page, "site-search > button, .right-group .social-icons > a, .right-group .docs-site-nav a, .sidebar-content a, .sidebar-content summary")
  ).toEqual([]);
  await page.keyboard.press("Tab");
  expect(await smallTargets(page, ".sl-skip-link")).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await smallTargets(page, ".sl-menu-button, site-search > button")).toEqual([]);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ forcedColors: "active" });
  const marked = await page
    .locator('.sidebar-content a[aria-current="page"]')
    .evaluate((link) => getComputedStyle(link).textDecorationLine);
  expect(marked).toContain("underline");
});

test("a heading 40% longer still keeps its anchor link on screen (D7)", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "the test sets its own widths");
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/docs/reference/cli", "/docs/architecture/overview", "/docs/research/security-and-guardrails"]) {
      await openPage(page, path);
      const past = await page.evaluate(() => {
        for (const heading of document.querySelectorAll(".sl-heading-wrapper > :first-child")) {
          const text = heading.textContent ?? "";
          heading.textContent = `${text}${text.slice(0, Math.ceil(text.length * 0.4))}`;
        }
        const viewportWidth = document.documentElement.clientWidth;
        return [...document.querySelectorAll(".sl-anchor-link")]
          .filter((link) => link.getBoundingClientRect().right > viewportWidth + 0.5)
          .map((link) => link.getAttribute("href"));
      });
      expect(past, `${path} at ${width} px`).toEqual([]);
    }
  }
});
