import { expect, test } from "@playwright/test";
import { qualityRoutes } from "../support/site-contract.mjs";
import {
  assertImageIntegrity,
  assertLayoutIntegrity,
  assertReducedMotion,
  monitorRuntime,
  openPage
} from "./support";

for (const route of qualityRoutes) {
  test(`${route.name} satisfies the runtime quality contract`, async ({
    page,
    baseURL
  }, testInfo) => {
    const runtime = monitorRuntime(page, baseURL!);
    await openPage(page, route.path);

    await expect(page).toHaveTitle(route.title);
    await expect(page.locator("h1")).toHaveCount(1);
    await assertImageIntegrity(page);
    await assertLayoutIntegrity(page);
    if (testInfo.project.name === "reduced-motion") {
      await assertReducedMotion(page);
    }
    runtime.assertClean();
  });
}

test("footer navigation carries every header destination", async ({ page }) => {
  // The header names the site's top-level surfaces. A surface reachable only
  // while the header is in view is a surface the reader loses at the bottom of
  // a long page — so the footer must offer every header destination (it may
  // add footer-only extras such as the blog and external repositories).
  await openPage(page, "/");
  const hrefs = (sel: string) =>
    page.locator(sel).evaluateAll((as) =>
      as.map((a) => a.getAttribute("href")).filter((h): h is string => !!h)
    );
  const headerLinks = await hrefs("header .desktop-nav a");
  const footerLinks = await hrefs("footer .footer-links a");
  expect(headerLinks.length).toBeGreaterThan(0);
  for (const href of headerLinks) {
    expect(footerLinks, `footer is missing header destination ${href}`).toContain(href);
  }
});

// Without a family of their own, code, keys and samples take the browser's `monospace`,
// which differs per machine. In CI's pinned image it laid Home out one way at load and
// another once the first full-page capture had painted it (31 px), failing the Home
// baseline at random. Every one of them takes the site's mono instead.
test("code, keys, samples and preformatted text use the site's mono", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "a computed style, the same at every width");
  for (const route of qualityRoutes) {
    await openPage(page, route.path);
    const offFont = await page.locator("code, kbd, samp, pre").evaluateAll((elements) =>
      elements
        .filter((element) => !getComputedStyle(element).fontFamily.startsWith('"JetBrains Mono Variable"'))
        .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}"`)
    );
    expect(offFont, `${route.path}: elements on the browser's own monospace`).toEqual([]);
  }
});
