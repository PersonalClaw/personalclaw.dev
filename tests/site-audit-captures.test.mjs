// The site audit's captures (docs/site-audit.md, docs/site-audit/).
//
// Gate A reviews the audit against what the pages looked like, so every route section links
// full-page captures of the pages it read, at every review width, in both themes where the
// page has two. A link to a file that is not there reads exactly like one that is until a
// reviewer clicks it, so this holds the links to the files: each one exists, is a PNG as wide
// as the width it is filed under, and is named for the page its row names. A capture no row
// links is refused too, so the folder holds only what the report shows.
//
// It reads the committed report and folder only. It does not compare pixels: the captures are
// for review, not baselines (those are made and compared in CI's pinned image).

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const docsDir = path.join(root, "docs");
const reportPath = path.join(docsDir, "site-audit.md");
const capturesDir = path.join(docsDir, "site-audit");

const CAPTURE_WIDTHS = [390, 768, 1024, 1440];
const THEMES = ["dark", "light"];

/** The report's `## ` sections, each with its heading and body. */
function sections(markdown) {
  return markdown
    .split(/^(?=## )/m)
    .filter((chunk) => chunk.startsWith("## "))
    .map((chunk) => {
      const [heading, ...body] = chunk.split("\n");
      return { heading: heading.slice(3).trim(), body: body.join("\n") };
    });
}

/** A route section is one whose heading names a path: "## `/apps`", "## The docs tier (`/docs`)". */
function routeSections(markdown) {
  return sections(markdown).filter(({ heading }) => /`\/[^`]*`/.test(heading));
}

function cells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * The section's captures table: the one whose header is "Page" followed by widths.
 *
 * @returns {{ widths: number[], rows: { label: string, path: string | null, cells: string[] }[] } | null}
 */
function capturesTable(body) {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => /^\|\s*Page\s*\|(\s*\d+\s*\|)+\s*$/.test(line));
  if (start === -1) return null;
  const widths = cells(lines[start]).slice(1).map(Number);
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith("|")) break;
    const [label, ...rest] = cells(line);
    rows.push({ label, path: label.match(/`(\/[^`]*)`/)?.[1] ?? null, cells: rest });
  }
  return { widths, rows };
}

/** "/" is home; any other path is its segments joined by hyphens. */
function slugOf(routePath) {
  return routePath === "/" ? "home" : routePath.replace(/^\//, "").replace(/\/+$/, "").replaceAll("/", "-");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The width a PNG declares in its IHDR chunk, or null when the file is not a PNG. */
function pngWidth(filePath) {
  const bytes = readFileSync(filePath);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  return bytes.readUInt32BE(16);
}

function links(cell) {
  return [...cell.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)].map((match) => ({ text: match[1], target: match[2] }));
}

const markdown = readFileSync(reportPath, "utf8");
const routes = routeSections(markdown);

test("the report has route sections to hold to their captures", () => {
  // Nine today: /, /product, /apps, /security, /release, /compare, the blog, the registry and
  // the docs tier. A floor rather than a count, so a section added later is checked, not refused.
  assert.ok(routes.length >= 9, `expected at least 9 route sections, found ${routes.length}`);
});

for (const { heading, body } of routes) {
  test(`${heading} links its captures, at every width, and each one exists`, () => {
    const table = capturesTable(body);
    assert.ok(table, `${heading} has no captures table ("| Page | 390 | 768 | … |")`);
    assert.deepEqual(table.widths, CAPTURE_WIDTHS, `${heading}: the captures table's widths`);
    assert.ok(table.rows.length > 0, `${heading}: the captures table has no rows`);

    for (const row of table.rows) {
      assert.ok(row.path, `${heading}: the row "${row.label}" names no page in backticks`);
      assert.equal(row.cells.length, table.widths.length, `${heading} ${row.path}: one cell per width`);
      const slug = slugOf(row.path);
      // A docs page has a light and a dark theme (Starlight follows the reader's preference);
      // the marketing shell is dark only.
      const themed = row.path === "/docs" || row.path.startsWith("/docs/");

      table.widths.forEach((width, index) => {
        const where = `${heading} ${row.path} at ${width}`;
        const found = links(row.cells[index]);
        assert.ok(found.length > 0, `${where}: no capture linked`);
        const name = new RegExp(`^${escapeRegExp(slug)}(?:-fixture)?-${width}(?:-(dark|light))?\\.png$`);
        const themes = [];

        for (const { target } of found) {
          assert.match(target, /^site-audit\/[^/]+\.png$/, `${where}: ${target} is not a capture in docs/site-audit/`);
          const file = path.basename(target);
          const parsed = file.match(name);
          assert.ok(parsed, `${where}: ${file} is not named for this page and width (${slug}-${width}…)`);
          if (parsed[1]) themes.push(parsed[1]);

          const filePath = path.join(docsDir, target);
          assert.ok(existsSync(filePath), `${where}: ${target} does not exist`);
          assert.equal(pngWidth(filePath), width, `${where}: ${target} is not a ${width} px wide PNG`);
        }

        if (themed) {
          assert.deepEqual([...themes].sort(), THEMES, `${where}: a docs page needs its dark and light capture`);
        } else {
          assert.deepEqual(themes, [], `${where}: this page has one theme, so its capture names none`);
          assert.equal(found.length, 1, `${where}: one capture per width`);
        }
      });
    }
  });
}

test("every capture in docs/site-audit/ is linked from a route section", () => {
  assert.ok(existsSync(capturesDir), "docs/site-audit/ does not exist");
  const linked = new Set();
  for (const { body } of routes) {
    for (const row of capturesTable(body)?.rows ?? []) {
      for (const cell of row.cells) {
        for (const { target } of links(cell)) linked.add(path.basename(target));
      }
    }
  }
  const files = readdirSync(capturesDir).filter((file) => !file.startsWith("."));
  const unlinked = files.filter((file) => !linked.has(file));
  assert.deepEqual(unlinked, [], "captures no route section links");
});
