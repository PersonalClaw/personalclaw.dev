import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { routes } from "../support/site-contract.mjs";
import { openPage } from "./support";

for (const route of routes) {
  test(`${route.name} has no automated WCAG A or AA violations`, async ({ page }) => {
    await openPage(page, route.path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
}
