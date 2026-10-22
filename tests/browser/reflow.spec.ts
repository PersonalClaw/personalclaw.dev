import { expect, test, type Page } from "@playwright/test";
import { qualityRoutes } from "../support/site-contract.mjs";
import { openPage } from "./support";

// Every route reflows at 200% text on the narrowest phone: nothing ends past the right edge,
// so nothing has to be scrolled sideways or is cut off (section 5.7 of SITE-REDESIGN.md, and
// X2 in docs/site-audit.md, which measured 452 such elements on /apps, 99 on /compare, 34 on
// /security, 31 on /release and 21 on /). The page-level overflow check in site.spec.ts cannot
// see this: `body { overflow-x: hidden }` clips the overflow before it reaches the document's
// scroll width. So this reads each element's own box.
//
// What may be wider than the screen: what scrolls inside its own region (a code block, a table
// in its scroll wrapper, a row of chips that scrolls), excepted by its scrolling ancestor, and
// what runs off the edge by design at every text size (the home page's app tape, the product
// capture that bleeds off the hero). The second kind is excepted by measuring the same page at
// 100% text first: only what 200% text pushes past the edge counts, which is X2 exactly, and
// no element is excepted by name. 200% text is a doubled root font size, as the audit measured.
const WIDTH = 320;

/** Marks every element past the right edge now, or returns those past it that were not marked. */
async function pastTheEdge(page: Page, mode: "mark" | "report"): Promise<string[]> {
  return page.evaluate((mode) => {
    const marked: WeakSet<Element> = ((window as unknown as { __pastTheEdge?: WeakSet<Element> }).__pastTheEdge ??=
      new WeakSet());
    const viewportWidth = document.documentElement.clientWidth;
    const scrollsSideways = (element: Element) => {
      const style = getComputedStyle(element);
      return (
        (style.overflowX === "auto" || style.overflowX === "scroll") &&
        element.scrollWidth > element.clientWidth
      );
    };
    const found: string[] = [];
    for (const element of document.body.querySelectorAll("*")) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= viewportWidth + 0.5 && rect.left >= -0.5) continue;
      if (mode === "mark") {
        marked.add(element);
        continue;
      }
      // Past the edge at 100% text, it or what holds it: a bleed by design, all of it.
      let bleeds = false;
      for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
        if (marked.has(node)) {
          bleeds = true;
          break;
        }
      }
      if (bleeds) continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.position === "fixed") continue;
      let inScroller = false;
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor === document.body) break;
        if (scrollsSideways(ancestor)) {
          inScroller = true;
          break;
        }
      }
      if (inScroller) continue;
      // Something the reader cannot reach is not on the page: the closed mobile menu.
      if (element.closest("[inert], [aria-hidden='true']")) continue;
      const name =
        element.tagName.toLowerCase() +
        (element.id ? `#${element.id}` : "") +
        (typeof element.className === "string" && element.className.trim()
          ? `.${element.className.trim().split(/\s+/).join(".")}`
          : "");
      const text = element.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) ?? "";
      found.push(`${name} "${text}" spans ${Math.round(rect.left)}..${Math.round(rect.right)}`);
    }
    return found;
  }, mode);
}

/** Lets a layout that follows the text size (a container query, a balanced heading) settle. */
const settle = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

for (const route of qualityRoutes) {
  test(`${route.name} reflows at 200% text on a ${WIDTH} px screen`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the test sets its own width and text size");
    await page.setViewportSize({ width: WIDTH, height: 900 });
    await openPage(page, route.path);
    await settle(page);
    await pastTheEdge(page, "mark");
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await settle(page);
    expect(await pastTheEdge(page, "report"), `elements 200% text puts past the right edge of ${route.path}`).toEqual([]);
  });
}
