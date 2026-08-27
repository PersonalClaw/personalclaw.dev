// Validate that the site's authored styles spend the design system's vocabulary
// instead of re-deriving it. Mirrors validate-visual-baselines / validate-marketing-
// manifest: prints a summary, and sets a non-zero exit code on any problem — EXCEPT
// that it currently runs in reporting mode (see ENFORCE_DESIGN_TOKENS below).
//
// Two assertions:
//   1. every `font-size` declared under src/ resolves to a role in DESIGN.md's
//      frontmatter (`typography.<role>.fontSize`), or is a `var(--…)` indirection.
//   2. every colour literal outside src/styles/tokens.css is a `var(--…)`, i.e.
//      tokens.css is the only place a hex value is minted.
//
// WHY THIS RUNS IN REPORTING MODE
// -------------------------------
// Assertion 2 is nearly clean and the remaining gap is small. Assertion 1 is not: the
// site ships a font-size scale that was grown declaration-by-declaration, and NONE of
// DESIGN.md's six committed roles appear in src/ at all. Converging on them is a real
// pixel change across every page and its visual baselines — an owner call about how the
// site looks, not a lint fix. Failing the build today would either block every PR or
// pressure someone into "fixing" it by editing DESIGN.md down to whatever src/ happens
// to contain, which is the drift, not the cure.
//
// So this lands measuring instead of enforcing: the numbers are printed on every
// `npm run test:static` run, and flipping ENFORCE_DESIGN_TOKENS to true is the single
// edit that makes them binding. Do that once the scale question has an owner answer.
//
// SCOPE NOTES
// -----------
// * src/content/** is excluded: those pages are GENERATED from the pinned core repo by
//   scripts/sync-docs.mjs. A hex in core's prose is core's to change, and a finding
//   here could only be "fixed" by an edit the next sync deletes.
// * A colour literal in MARKUP rather than CSS (e.g. `<meta name="theme-color">`) is
//   counted separately and never a violation: an HTML attribute cannot hold a
//   `var(--…)`, so there is no token form of it to demand.
// * rgba()/hsla() compositions are counted but not asserted on. Most carry an alpha
//   channel that no flat token can express; demanding a token there would mean
//   inventing translucent tokens, which is a design decision, not a cleanup.
// * A `var(--…)` only resolves where the custom property is actually in scope. CSS
//   loaded outside BaseLayout.astro (Starlight's `customCss`, for one) does not get
//   src/styles/tokens.css unless it imports it. This script checks the TEXT, not the
//   cascade graph — so when a violation is fixed, confirm the token is in scope on the
//   pages that CSS ships to.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// The one edit that turns this guard from measuring into enforcing. Read the
// "WHY THIS RUNS IN REPORTING MODE" note above before flipping it.
const ENFORCE_DESIGN_TOKENS = false;

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(repositoryRoot, "src");
const tokensFile = join(sourceRoot, "styles", "tokens.css");
const designFile = join(repositoryRoot, "DESIGN.md");
const excludedDirectories = new Set(["content", "assets"]);
const scannedExtensions = [".css", ".astro", ".tsx", ".ts"];

const HEX_COLOUR = /#[0-9a-fA-F]{3,8}\b/g;
const FONT_SIZE = /font-size\s*:\s*([^;{}]+)/g;
const FUNCTIONAL_COLOUR = /\b(?:rgba?|hsla?)\(/g;

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      if (excludedDirectories.has(entry)) continue;
      found.push(...walk(absolute));
      continue;
    }
    if (scannedExtensions.some((extension) => entry.endsWith(extension))) {
      found.push(absolute);
    }
  }
  return found;
}

// Blank a region out with spaces rather than deleting it, so every remaining offset
// still maps to its real line number.
function blank(text, start, end) {
  const region = text.slice(start, end).replace(/[^\n]/g, " ");
  return text.slice(0, start) + region + text.slice(end);
}

function blankAll(text, pattern) {
  let result = text;
  for (const match of [...text.matchAll(pattern)]) {
    result = blank(result, match.index, match.index + match[0].length);
  }
  return result;
}

// A text scanner that reads comments invents findings nobody can act on: docs.css
// documents its contrast measurements by quoting the hex values it measured.
function stripComments(text) {
  return blankAll(blankAll(text, /\/\*[\s\S]*?\*\//g), /(^|[^:\w])\/\/[^\n]*/g);
}

// Split a file into the part the browser parses as CSS and the part it does not, so a
// hex in an HTML attribute is never reported as a missing CSS token.
function splitCssAndMarkup(text, relativePath) {
  if (relativePath.endsWith(".css")) {
    return { css: text, markup: text.replace(/[^\n]/g, " ") };
  }
  let css = text.replace(/[^\n]/g, " ");
  let markup = text;
  for (const match of [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]) {
    const start = match.index + match[0].indexOf(match[1]);
    const end = start + match[1].length;
    css = css.slice(0, start) + match[1] + css.slice(end);
    markup = blank(markup, start, end);
  }
  return { css, markup };
}

function lineOf(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text[cursor] === "\n") line += 1;
  }
  return line;
}

function normaliseValue(value) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function normaliseHex(hex) {
  const digits = hex.slice(1).toLowerCase();
  if (digits.length === 3 || digits.length === 4) {
    return `#${[...digits].map((digit) => digit + digit).join("")}`;
  }
  return `#${digits}`;
}

// DESIGN.md's frontmatter is the committed type scale. Read the fontSize of every
// typography role rather than hand-listing them here, so the scale has one home.
function readDesignTypography() {
  const frontmatter = readFileSync(designFile, "utf8").split(/^---$/m)[1] ?? "";
  const roles = new Map();
  let inTypography = false;
  let role = null;
  for (const rawLine of frontmatter.split("\n")) {
    if (/^\S/.test(rawLine)) {
      inTypography = rawLine.startsWith("typography:");
      role = null;
      continue;
    }
    if (!inTypography) continue;
    const roleMatch = rawLine.match(/^ {2}([\w-]+):\s*$/);
    if (roleMatch) {
      role = roleMatch[1];
      continue;
    }
    const sizeMatch = rawLine.match(/^ {4}fontSize:\s*"(.+)"\s*$/);
    if (sizeMatch && role) roles.set(role, sizeMatch[1]);
  }
  return roles;
}

function readTokenPalette() {
  const palette = new Map();
  for (const line of readFileSync(tokensFile, "utf8").split("\n")) {
    const match = line.match(/^\s*(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/);
    if (match) palette.set(normaliseHex(match[2]), match[1]);
  }
  return palette;
}

// DESIGN.md's frontmatter also commits the COLOUR palette, and nothing checked it against the
// tokens it claims to describe. It was wrong: `line` said `#343638` while `--line` shipped
// `#2b2d2f`, a value `var(--line)` is spent 72 times on — and both values dated from the initial
// commit, so neither drifted; the doc was transcribed wrong on day one and went unnoticed for the
// life of the repo. `--line-strong` was shipping undocumented at the same time.
//
// The two assertions above check that authored styles SPEND the vocabulary. This one checks that the
// document defining the vocabulary tells the truth about it — the same drift, one level up, and the
// level a reader trusts.
function readDesignColours() {
  const frontmatter = readFileSync(designFile, "utf8").split(/^---$/m)[1] ?? "";
  const colours = new Map();
  let inColours = false;
  for (const rawLine of frontmatter.split("\n")) {
    if (/^\S/.test(rawLine)) {
      inColours = rawLine.startsWith("colors:");
      continue;
    }
    if (!inColours) continue;
    const match = rawLine.match(/^ {2}([\w-]+):\s*"(#[0-9a-fA-F]{3,8})"\s*$/);
    if (match) colours.set(match[1], normaliseHex(match[2]));
  }
  return colours;
}

// tokens.css keyed by NAME. `readTokenPalette` keys by hex so a literal can be traced back to its
// token; parity needs the other direction, and two tokens may legitimately share a value.
function readTokenColoursByName() {
  const byName = new Map();
  for (const line of readFileSync(tokensFile, "utf8").split("\n")) {
    const match = line.match(/^\s*--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/);
    if (match) byName.set(match[1], normaliseHex(match[2]));
  }
  return byName;
}

const typographyRoles = readDesignTypography();
const tokenPalette = readTokenPalette();
const designColours = readDesignColours();
const tokenColours = readTokenColoursByName();

// Both directions. A doc that misstates a token is wrong; a token the doc omits is undocumented,
// and the palette block reads as complete either way.
const paletteMismatches = [];
const undocumentedTokens = [];
for (const [name, hex] of designColours) {
  const shipped = tokenColours.get(name);
  if (shipped === undefined) paletteMismatches.push(`${name}: DESIGN.md says ${hex}, tokens.css declares no --${name}`);
  else if (shipped !== hex) paletteMismatches.push(`${name}: DESIGN.md says ${hex}, tokens.css ships ${shipped}`);
}
for (const name of tokenColours.keys()) {
  if (!designColours.has(name)) undocumentedTokens.push(`--${name}: ${tokenColours.get(name)}`);
}

// Vacuity floor: if either reader stops matching, the comparison passes by comparing nothing — the
// exact failure mode that let a wrong value live since the initial commit.
if (designColours.size === 0 || tokenColours.size === 0) {
  console.error(
    `Design token validation FAILED: the palette parity check read ${designColours.size} colour(s) ` +
      `from DESIGN.md and ${tokenColours.size} from tokens.css. One of the readers has stopped ` +
      "matching, so it is asserting nothing."
  );
  process.exitCode = 1;
}

if (typographyRoles.size === 0) {
  console.error(
    "Design token validation FAILED: DESIGN.md declares no typography.*.fontSize roles."
  );
  process.exit(1);
}
if (tokenPalette.size === 0) {
  console.error(
    `Design token validation FAILED: ${relative(repositoryRoot, tokensFile)} declares no colour tokens.`
  );
  process.exit(1);
}

const allowedFontSizes = new Map();
for (const [role, size] of typographyRoles) {
  allowedFontSizes.set(normaliseValue(size), role);
}

const fontSizeFindings = [];
const shippedRoles = new Set();
const colourFindings = [];
const markupColours = [];
let fontSizeDeclarations = 0;
let functionalColours = 0;

for (const absolute of walk(sourceRoot).sort()) {
  const relativePath = relative(repositoryRoot, absolute);
  const source = stripComments(readFileSync(absolute, "utf8"));
  const { css, markup } = splitCssAndMarkup(source, relativePath);

  for (const match of css.matchAll(FONT_SIZE)) {
    const value = match[1].trim();
    fontSizeDeclarations += 1;
    const role = allowedFontSizes.get(normaliseValue(value));
    if (role) {
      shippedRoles.add(role);
      continue;
    }
    if (/^var\(--[\w-]+/.test(value)) continue;
    fontSizeFindings.push({
      value,
      location: `${relativePath}:${lineOf(css, match.index)}`
    });
  }

  functionalColours += [...css.matchAll(FUNCTIONAL_COLOUR)].length;
  functionalColours += [...markup.matchAll(FUNCTIONAL_COLOUR)].length;

  for (const match of markup.matchAll(HEX_COLOUR)) {
    markupColours.push({
      literal: match[0],
      location: `${relativePath}:${lineOf(markup, match.index)}`
    });
  }

  if (absolute === tokensFile) continue;
  for (const match of css.matchAll(HEX_COLOUR)) {
    colourFindings.push({
      literal: match[0],
      token: tokenPalette.get(normaliseHex(match[0])) ?? null,
      location: `${relativePath}:${lineOf(css, match.index)}`
    });
  }
}

function groupBy(findings, key) {
  const grouped = new Map();
  for (const finding of findings) {
    const bucket = grouped.get(finding[key]) ?? [];
    bucket.push(finding.location);
    grouped.set(finding[key], bucket);
  }
  return [...grouped.entries()].sort(
    (left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0])
  );
}

const report = [];
const tokenBacked = colourFindings.filter((finding) => finding.token);
const offPalette = colourFindings.filter((finding) => !finding.token);

const fontSizeByValue = groupBy(fontSizeFindings, "value");
report.push(
  `font-size outside DESIGN.md's type scale: ${fontSizeFindings.length} of ` +
    `${fontSizeDeclarations} declaration(s), ${fontSizeByValue.length} distinct value(s).`,
  `  DESIGN.md commits ${typographyRoles.size} role(s); ${shippedRoles.size} of them ship in src/.`,
  ...[...typographyRoles].map(
    ([role, size]) =>
      `    ${shippedRoles.has(role) ? "ships    " : "NOT SHIPPED"} typography.${role}.fontSize: ${size}`
  ),
  ...fontSizeByValue.map(
    ([value, locations]) => `  ${locations.length}x  ${value}  —  ${locations.join(", ")}`
  )
);

report.push(
  "",
  `colour literals outside ${relative(repositoryRoot, tokensFile)}: ${colourFindings.length} ` +
    `(${tokenBacked.length} re-declare an existing token, ${offPalette.length} are off-palette).`
);
if (tokenBacked.length > 0) {
  report.push("  re-declares a token — replace with the var():");
  for (const [literal, locations] of groupBy(tokenBacked, "literal")) {
    const token = tokenPalette.get(normaliseHex(literal));
    report.push(`    ${literal} -> var(${token})  —  ${locations.join(", ")}`);
  }
}
if (offPalette.length > 0) {
  report.push("  off-palette — needs a token minted in tokens.css, or a decision to drop it:");
  for (const [literal, locations] of groupBy(offPalette, "literal")) {
    report.push(`    ${literal}  —  ${locations.join(", ")}`);
  }
}

report.push(
  "",
  `not asserted on: ${markupColours.length} colour literal(s) in markup (an HTML attribute ` +
    `cannot hold a var()), ${functionalColours} rgba()/hsla() composition(s).`
);
if (markupColours.length > 0) {
  for (const [literal, locations] of groupBy(markupColours, "literal")) {
    report.push(`    ${literal}  —  ${locations.join(", ")}`);
  }
}

// The palette parity check is BINDING, and deliberately not behind ENFORCE_DESIGN_TOKENS. That flag
// exists because assertion 1 has an open owner question — none of DESIGN.md's six typography roles
// ships in src/, and converging is a real pixel change. Parity has no such question: a doc that
// misstates a shipped token is simply wrong, in one direction or the other, and fixing it costs zero
// pixels. It starts green, so enforcing it now can only catch a regression.
const paletteProblems = paletteMismatches.length + undocumentedTokens.length;
if (paletteProblems > 0) {
  console.error("Design token validation FAILED: DESIGN.md's palette disagrees with tokens.css.");
  for (const line of paletteMismatches) console.error(`  ${line}`);
  for (const line of undocumentedTokens) {
    console.error(`  ${line} ships but is not in DESIGN.md's colors block`);
  }
  console.error(
    "  DESIGN.md commits the palette; tokens.css ships it. Correct whichever is wrong — and if the " +
      "token is the one that moves, that is a visual change and needs its baselines."
  );
  process.exitCode = 1;
} else {
  console.log(
    `Palette parity OK: DESIGN.md's ${designColours.size} colour(s) match tokens.css's ` +
      `${tokenColours.size}, in both directions.`
  );
}

const violations = fontSizeFindings.length + colourFindings.length;

if (violations > 0 && ENFORCE_DESIGN_TOKENS) {
  console.error("Design token validation FAILED:");
  for (const line of report) console.error(line ? `  ${line}` : "");
  process.exitCode = 1;
} else if (violations > 0) {
  console.log(
    `Design token validation: ${violations} finding(s) — REPORTING ONLY, not failing the ` +
      "build. Flip ENFORCE_DESIGN_TOKENS in scripts/validate-design-tokens.mjs to enforce."
  );
  for (const line of report) console.log(line ? `  ${line}` : "");
} else {
  console.log(
    `Design tokens OK: ${fontSizeDeclarations} font-size declaration(s) all resolve to ` +
      `DESIGN.md's ${typographyRoles.size} typography role(s), and no colour literal is minted ` +
      `outside ${relative(repositoryRoot, tokensFile)}.`
  );
}
