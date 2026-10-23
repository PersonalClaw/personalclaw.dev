import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { monitorRuntime, openPage } from "./support";

// /release's Gate D fixes (#93): the verify commands are read whole, the asset table reads on a
// phone, the hero's headline holds to two lines, and a failed attestation says what to do next.
// Each case runs in the desktop and mobile projects' own viewports, and at 320 where it says so.

const facts = JSON.parse(readFileSync(new URL("../../.generated/release-facts.json", import.meta.url), "utf8"));

/** The commands in the verify steps whose text runs past their well, as a reader would have to scroll it. */
const clippedCommands = (page: Page) =>
  page.locator("[data-verify-step] .command-block code").evaluateAll((codes) =>
    codes.filter((code) => code.scrollWidth > code.clientWidth + 1).map((code) => code.textContent?.trim().slice(0, 60))
  );

test.describe("/release", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === "reduced-motion", "the desktop and mobile projects hold the layout");
  });

  test("shows every verify command whole, wrapped in its well", async ({ page, baseURL }) => {
    const runtime = monitorRuntime(page, baseURL!);
    await openPage(page, "/release");
    expect(await clippedCommands(page)).toEqual([]);
    runtime.assertClean();
  });

  test("keeps the asset table inside its region at 320, each file's digest whole", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "a phone width");
    await page.setViewportSize({ width: 320, height: 800 });
    await openPage(page, "/release");
    const region = page.locator(".asset-table");
    expect(await region.evaluate((r) => r.scrollWidth - r.clientWidth)).toBeLessThanOrEqual(1);
    for (const digest of await page.locator("[data-asset-sha256]").all()) {
      const box = await digest.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    }
    // Still a table to assistive tech, with the rows' files as their headers.
    await expect(page.getByRole("table", { name: /Every file attached to/ })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: `personalclaw-${facts.core.version}-py3-none-any.whl` })).toBeVisible();
  });

  test("holds the headline to two lines on a wide screen", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "a wide screen");
    await openPage(page, "/release");
    const lines = await page.locator("h1").evaluate((h1) => {
      const lineHeight = parseFloat(getComputedStyle(h1).lineHeight);
      return Math.round(h1.getBoundingClientRect().height / lineHeight);
    });
    expect(lines).toBeLessThanOrEqual(2);
  });

  test("says where a failed attestation goes: core's security policy at the pin", async ({ page }) => {
    await openPage(page, "/release");
    const link = page.locator('[data-verify-step="attestation"]').getByRole("link", { name: "core's security policy" });
    await expect(link).toHaveAttribute("href", `${facts.core.source.repositoryUrl}/blob/${facts.core.source.commit}/SECURITY.md`);
  });
});
