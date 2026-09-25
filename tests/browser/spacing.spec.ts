import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openPage } from "./support";

// ── No built page may render two words glued together ──────────────────────────────────
//
// 🔴 Astro's `compressHTML` DISCARDS whitespace that contains a newline when the next thing is
// a tag or a `{...}` expression. Text-to-text whitespace still collapses to one space, so the
// defect appears only where the following SOURCE line starts with an element or an expression
// — and the source reads correctly every time. Six shipped that way (issue #78):
// `against inv0.1.3`, `Checked on2026-09-23`, `v0.1.3(bc185c020252)`, `·12 holding`,
// `·8 not in this release`, `pyproject.tomland`. #76 had already fixed a seventh on the home
// page, which only ever showed at one width.
//
// So this reads the BUILT site, in a browser. Whether an adjacency is visible is a layout
// question, and two text-level drafts of this check proved it:
//
//   · A regex over dist/**/*.html reported 365 places on a build with 7 defects. The noise was
//     inline ELEMENTS laid out as flex items — nav links, stat tiles, the blog card meta, the
//     `.source` link on /compare (`display: inline-flex; gap: 0.4rem`). Flex layout discards
//     whitespace between items, so those seams render identically with or without a space.
//   · Restricting it to prose containers only cut it to 86, because the same pattern lives
//     inside list items and paragraphs, and a text rule cannot see `margin-left` or `gap`.
//
// A seam is two adjacent non-space characters with an element boundary between them (or a `·`
// touching a word inside one text node — `· ` then `{counts.yes}` renders as the single text
// node `·12`, so there is no boundary to find). A seam is GLUED when either:
//
//   A. both glyphs sit on one line and touch, measured from their layout boxes; or
//   B. the line breaks exactly at the seam, every element crossed there is `display: inline`,
//      and no margin, border or padding separates them. No break opportunity exists between
//      the characters this rule looks at, so a break there is `overflow-wrap` splitting one
//      glued token — which is how the #76 defect looked correct at one width and read
//      `theinstall` at another. Without B, catching it would depend on line lengths.
//
// What is deliberately NOT a seam:
//   · `(` before a word and `)` after one — `(bc185c020252)` hugs its span on purpose.
//   · `sup`, `sub` and `wbr` boundaries, which attach to the preceding word by definition
//     (footnote markers, formulae, break hints).
//   · `.sl-markdown-content`: core's Markdown, republished under /docs. Markdown turns a line
//     break into a text space, so it cannot produce this defect, and a hit there (`Provider`s)
//     would be core's authoring choice. It would red this repository for a whole release cycle
//     over words it does not own. The Starlight chrome around it is still checked.
//   · `pre`, which holds syntax-highlighted code where every token is its own span.
//
// Known limit: an expression's value merges into the neighbouring text node, so `word` then
// `{value}` on the next line renders as one node — `on2026-09-23` with no boundary and no `·`.
// Nothing in the built page separates that from a real token like `v0.1.3`. Every instance on
// this site wraps its value in an element (`<time>`, `<span translate="no">`) or follows a `·`,
// and both shapes are caught. A bare `{value}` after a word at a line break is not.

type Glue = { seam: string; how: string; container: string; context: string };

/**
 * Every page the build emitted, read from dist/ rather than from the route contract. The
 * contract pins the INVENTORY (validate:build enforces it); this check asserts a property of
 * whatever was actually published, including registry listing pages the contract derives.
 */
function builtRoutes(directory: string, prefix = ""): string[] {
  if (!existsSync(directory)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      found.push(...builtRoutes(absolute, `${prefix}${entry}/`));
    } else if (entry === "index.html") {
      found.push(prefix ? `/${prefix.replace(/\/$/, "")}` : "/");
    }
  }
  return found.sort();
}

const routes = builtRoutes("dist");

/**
 * Measured: 47 built routes (48 pages, less 404.html, which is not served at a route). A
 * FLOOR, so that collecting this file before a build — zero routes, zero tests, a clean
 * report — fails instead.
 */
const ROUTE_FLOOR = 40;

async function findGluedWords(page: Page): Promise<Glue[]> {
  return page.evaluate(() => {
    const SEPARATOR = "·";
    const isWord = (character: string) => /[\p{L}\p{N}]/u.test(character);
    const endsGlue = (character: string) =>
      isWord(character) || character === ")" || character === SEPARATOR;
    const startsGlue = (character: string) =>
      isWord(character) || character === "(" || character === SEPARATOR;

    const SKIPPED = "script, style, template, noscript, pre, svg, math, .sl-markdown-content";
    const ATTACHED = new Set(["sup", "sub", "wbr"]);
    const ATOMIC = new Set([
      "br", "img", "picture", "video", "audio", "canvas", "iframe", "object", "embed",
      "input", "select", "textarea", "button", "hr"
    ]);

    type Character = { node: Text; offset: number; character: string };
    type Crossing = { element: Element; edge: "open" | "close" };

    const findings: Array<{ seam: string; how: string; container: string; at: number }> = [];
    let rendered = "";
    let previous: Character | null = null;
    let crossed: Crossing[] = [];

    const range = document.createRange();
    const boxOf = (character: Character) => {
      range.setStart(character.node, character.offset);
      range.setEnd(character.node, character.offset + 1);
      return range.getBoundingClientRect();
    };

    const onlyInline = () =>
      crossed.every(({ element }) => {
        if (ATOMIC.has(element.localName)) return false;
        const display = getComputedStyle(element).display;
        return display === "inline" || display === "contents";
      });

    // The trailing edge of every element that closed at the seam plus the leading edge of
    // every element that opened there. The site is LTR (`lang="en"`, no `dir`).
    const cssSeparation = () =>
      crossed.reduce((total, { element, edge }) => {
        const style = getComputedStyle(element);
        const side = edge === "close" ? "Right" : "Left";
        return (
          total +
          Number.parseFloat(style.getPropertyValue(`margin-${side.toLowerCase()}`)) +
          Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) +
          Number.parseFloat(style.getPropertyValue(`padding-${side.toLowerCase()}`))
        );
      }, 0);

    const consider = (left: Character, right: Character) => {
      const sameNode = left.node === right.node;
      if (sameNode && left.character !== SEPARATOR && right.character !== SEPARATOR) return;
      if (!endsGlue(left.character) || !startsGlue(right.character)) return;
      if (!isWord(left.character) && !isWord(right.character)) return;
      if (crossed.some(({ element }) => ATTACHED.has(element.localName))) return;

      const leftBox = boxOf(left);
      const rightBox = boxOf(right);
      if (leftBox.width === 0 || rightBox.width === 0) return;

      let how = "";
      const sameLine = rightBox.top < leftBox.bottom && leftBox.top < rightBox.bottom;
      if (sameLine) {
        // Touching, in reading order. A box far to the LEFT of its predecessor is not
        // adjacency but an out-of-flow element sharing the line — Starlight's off-screen
        // "Skip to content" link sits 98px behind the docs title on every docs page.
        const gap = rightBox.left - leftBox.right;
        if (rightBox.left >= leftBox.left && gap < 0.5) {
          how = `touching, gap ${Math.round(gap * 100) / 100}px`;
        }
      } else if (onlyInline() && cssSeparation() < 0.5) {
        how = "split across a line break at the seam, which only overflow-wrap does to one token";
      }
      if (!how) return;

      const container = right.node.parentElement?.closest(
        "p, li, dd, dt, figcaption, blockquote, caption, td, th, summary, h1, h2, h3, h4, h5, h6, div"
      );
      const classes = container?.getAttribute("class")?.trim();
      findings.push({
        seam: `${left.character}${right.character}`,
        how,
        container: `<${container?.localName ?? "?"}${classes ? ` class="${classes}"` : ""}>`,
        at: rendered.length
      });
    };

    const visit = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node as Text;
        for (let offset = 0; offset < text.data.length; offset += 1) {
          const character = text.data[offset];
          if (/\s/.test(character)) {
            if (!rendered.endsWith(" ")) rendered += " ";
            previous = null;
            crossed = [];
            continue;
          }
          const current = { node: text, offset, character };
          if (previous) consider(previous, current);
          rendered += character;
          previous = current;
          crossed = [];
        }
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as Element;
      if (element.matches(SKIPPED)) {
        previous = null;
        crossed = [];
        return;
      }
      // Not rendered at all: transparent, so the text either side of it is still adjacent.
      if (getComputedStyle(element).display === "none") return;
      crossed.push({ element, edge: "open" });
      for (const child of element.childNodes) visit(child);
      crossed.push({ element, edge: "close" });
    };

    visit(document.body);

    return findings.map(({ at, ...finding }) => ({
      ...finding,
      context: rendered.slice(Math.max(0, at - 48), at + 48)
    }));
  });
}

test("the spacing sweep has a build to sweep", () => {
  expect(
    routes.length,
    `Found ${routes.length} built route(s) under dist/. Run \`npm run build\` first: a sweep ` +
      `with no pages generates no tests and reports a clean run.`
  ).toBeGreaterThanOrEqual(ROUTE_FLOOR);
});

// The detector's own controls. Branch B has no live instance on the site, so without a fixture
// nothing would ever show it failing — and each negative below is a false-positive category a
// text-level draft of this check actually reported.
test("the detector catches glued seams and passes deliberate adjacency", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "a fixed fixture needs one layout, not three");
  await page.setContent(`<!doctype html><html lang="en"><body style="font: 16px/1.5 monospace">
    <p class="touching">verified against in<span>v0.1.3</span></p>
    <p class="wrapped" style="width: 5ch; overflow-wrap: anywhere">abcde<span>fghij</span></p>
    <p class="separator">narrower than stated ·8 not in this release</p>
    <p class="spaced">verified against in <span>v0.1.3</span></p>
    <p class="margin">v0.1.3<small style="margin-left: 0.75rem">2026-07-30</small></p>
    <p class="flex" style="display: flex; gap: 0.4rem"><span>LICENSE</span><span>at v0.1.3</span></p>
    <p class="parens">Read from v0.1.3 (<span>bc185c020252</span>)</p>
    <p class="footnote">a claim<sup>1</sup></p>
    <div class="sl-markdown-content"><p>core's <code>Provider</code>s</p></div>
  </body></html>`);

  const glued = await findGluedWords(page);

  expect(glued.map((finding) => `${finding.container} ${finding.seam}`).sort()).toEqual([
    '<p class="separator"> ·8',
    '<p class="touching"> nv',
    '<p class="wrapped"> ef'
  ]);
  expect(glued.find((finding) => finding.seam === "ef")?.how).toMatch(/^split across a line/);
});

for (const routePath of routes) {
  test(`${routePath} renders no glued words`, async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "reduced-motion",
      "reduced motion changes animation, not text layout; desktop and mobile cover the layouts"
    );
    await openPage(page, routePath);

    const glued = await findGluedWords(page);

    expect(
      glued.map(
        (finding) =>
          `"${finding.seam}" in ${finding.container} (${finding.how}): …${finding.context}…`
      ),
      `${routePath} renders words with no space between them. The source is almost certainly ` +
        `correct: compressHTML drops a newline before a tag or a {...} expression, so a line ` +
        `break that reads as a space in the editor is not one in dist/. End the line with {" "}.`
    ).toEqual([]);
  });
}
