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
