import { expect, test } from "@playwright/test";
import { openPage } from "./support";

// Every hand-authored page keeps its short headline and one factual support sentence under it,
// and both sit inside the first viewport (#98, settled by the maintainer on 2026-10-14). The
// sentence is the page's `[data-support]`; scripts/product-claims.mjs (supportSentenceProblems)
// holds each built page to one headline and one sentence, and this holds them to the screen,
// at the four widths the issue names, on every hand-authored route rather than a chosen few.

const ROUTES = ["/", "/product", "/apps", "/security", "/release", "/compare", "/blog", "/blog/launch", "/registry"];
const SIZES = [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 640 }
];

test.describe("the headline and its support sentence", () => {
  // The four sizes are set here, so one project runs them all.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the sizes are this spec's own");
  });

  for (const route of ROUTES) {
    test(`on ${route}, sit in the first viewport at every width`, async ({ page }) => {
      for (const size of SIZES) {
        await page.setViewportSize(size);
        await openPage(page, route);
        await page.evaluate(() => window.scrollTo(0, 0));
        const headline = page.locator("main h1");
        const support = page.locator("main [data-support]");
        await expect(headline).toHaveCount(1);
        await expect(support).toHaveCount(1);
        for (const [name, element] of [
          ["headline", headline],
          ["support sentence", support]
        ] as const) {
          const box = await element.boundingBox();
          expect(box, `${route} at ${size.width}: the ${name} is drawn`).not.toBeNull();
          expect(box!.y, `${route} at ${size.width}: the ${name} starts on screen`).toBeGreaterThanOrEqual(0);
          expect(
            box!.y + box!.height,
            `${route} at ${size.width}x${size.height}: the ${name} ends inside the first viewport`
          ).toBeLessThanOrEqual(size.height);
        }
      }
    });
  }
});
