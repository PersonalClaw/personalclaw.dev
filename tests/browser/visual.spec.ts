import { expect, test } from "@playwright/test";
import { routes } from "../support/site-contract.mjs";
import { openPage } from "./support";

for (const route of routes) {
  test(`${route.name} matches its responsive visual baseline`, async ({
    page
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "reduced-motion",
      "reduced motion is behavior-tested; responsive baselines cover desktop and mobile"
    );
    await openPage(page, route.path);
    await expect(page).toHaveScreenshot(`${route.name}-page.png`, {
      fullPage: true,
      mask: route.name === "release" ? [page.locator("[data-build-time]")] : []
    });
  });
}

test("home loop state matches its visual baseline", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "reduced-motion");
  await openPage(page, "/");
  await page.getByRole("tab", { name: "Loops" }).click();
  await expect(page.locator(".system-window")).toHaveScreenshot("home-loops-state.png");
});

test("filtered app directory matches its visual baseline", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "reduced-motion");
  await openPage(page, "/apps?q=Ollama&category=models");
  await expect(page.locator(".app-directory")).toHaveScreenshot("apps-filtered-state.png");
});

test("open mobile navigation matches its visual baseline", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await openPage(page, "/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".site-header")).toHaveScreenshot("mobile-navigation-open.png");
});
