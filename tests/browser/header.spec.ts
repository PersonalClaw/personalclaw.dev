import { expect, test, type Page } from "@playwright/test";
import { qualityRoutes } from "../support/site-contract.mjs";
import { openPage } from "./support";

// The header has to keep every control whole at every width and text size: on screen,
// unclipped, at least 44 px, and with its label on one line. The page-level overflow check
// in site.spec.ts cannot see a header that breaks this, because `body { overflow-x: hidden }`
// clips the overflow away before it reaches the document's scroll width. That is how the
// header's button ran off the right edge from 721 to 851 px, and at 200% text, with every
// check green (X1 and X2 in docs/site-audit.md).
//
// The layouts: the band the audit measured, 960 px (where the full row still wrapped its
// button) and 1024 px (the first width that holds it), the mobile project's 390 px (whose
// open menu cut its last link off), and 200% text on a desktop window and on the narrowest
// phone. 200% text is a doubled root font size, as the audit measured it. Each layout
// reports softly, so one run names every layout that breaks.
const LAYOUTS = [
  { width: 721, text: 1 },
  { width: 800, text: 1 },
  { width: 851, text: 1 },
  { width: 960, text: 1 },
  { width: 1024, text: 1 },
  { width: 390, text: 1 },
  { width: 1440, text: 2 },
  { width: 320, text: 2 }
];

/** Every reason a rendered control is not whole, or none. Runs in the page. */
async function problemsOf(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const name =
        element.getAttribute("aria-label") ??
        element.textContent?.trim().replace(/\s+/g, " ") ??
        element.tagName.toLowerCase();
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return [`"${name}" is not rendered`];
      const problems: string[] = [];
      const box = (r: DOMRect) =>
        `${Math.round(r.left)}..${Math.round(r.right)} x ${Math.round(r.top)}..${Math.round(r.bottom)}`;
      const viewportWidth = document.documentElement.clientWidth;
      if (rect.left < -0.5 || rect.right > viewportWidth + 0.5) {
        problems.push(`"${name}" spans ${box(rect)}, past the ${viewportWidth} px viewport`);
      }
      if (rect.bottom > window.innerHeight + 0.5) {
        problems.push(`"${name}" ends at ${Math.round(rect.bottom)}, below the ${window.innerHeight} px viewport`);
      }
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.overflowX === "visible" && style.overflowY === "visible") continue;
        const clip = ancestor.getBoundingClientRect();
        if (
          rect.left < clip.left - 0.5 ||
          rect.right > clip.right + 0.5 ||
          rect.top < clip.top - 0.5 ||
          rect.bottom > clip.bottom + 0.5
        ) {
          problems.push(`"${name}" (${box(rect)}) is clipped by <${ancestor.tagName.toLowerCase()} class="${ancestor.className}"> (${box(clip)})`);
        }
      }
      if (rect.width < 43.5 || rect.height < 43.5) {
        problems.push(`"${name}" is ${Math.round(rect.width)}x${Math.round(rect.height)}, under 44 px`);
      }
      // A label that wraps is a label cut in two. A flex item reports one box however many
      // lines it holds, so count the line boxes of the text itself.
      const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = text.nextNode(); node; node = text.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const lines = new Set([...range.getClientRects()].map((line) => Math.round(line.top)));
        if (lines.size > 1) problems.push(`"${name}" wraps its label onto ${lines.size} lines`);
      }
      return problems;
    })
  );
}

const rendered = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => getComputedStyle(element).display !== "none");

for (const route of qualityRoutes) {
  test(`${route.name}'s header keeps every control whole at every width and at 200% text`, async ({
    page
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the test sets its own widths and text sizes");
    await openPage(page, route.path);

    for (const layout of LAYOUTS) {
      const at = `at ${layout.width} px and ${layout.text * 100}% text`;
      await page.setViewportSize({ width: layout.width, height: 900 });
      await page.evaluate((scale) => {
        document.documentElement.style.fontSize = scale === 1 ? "" : `${scale * 100}%`;
      }, layout.text);

      const fullRow = await rendered(page, ".desktop-nav");
      const menu = await rendered(page, "[data-menu-button]");
      expect(fullRow !== menu, `exactly one header composition ${at}`).toBe(true);

      if (fullRow) {
        expect.soft(
          await problemsOf(page, ".site-header .brand-link, .desktop-nav a, .header-github"),
          `the full header row ${at}`
        ).toEqual([]);
        continue;
      }

      expect.soft(
        await problemsOf(page, ".site-header .brand-link, [data-menu-button]"),
        `the header row ${at}`
      ).toEqual([]);

      // The menu carries what the full row would have: every link, GitHub's included.
      const button = page.locator("[data-menu-button]");
      await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true");
      await page
        .locator("[data-mobile-menu]")
        .evaluate((menu) => Promise.all(menu.getAnimations().map((animation) => animation.finished)));
      await expect(page.locator("[data-mobile-menu] a").last()).toHaveText("GitHub");
      expect.soft(await problemsOf(page, "[data-mobile-menu] a"), `the open menu ${at}`).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(button).toHaveAttribute("aria-expanded", "false");
    }
  });
}
