// /product's claims, held to the /compare rows they touch.
//
// /compare states what the pinned release does and does not do, one sourced row per claim.
// /product makes the same kind of claim in prose, so it is held to those rows. Two
// sentences on it said more than their rows (docs/site-audit.md, P1 and P2): "no product
// telemetry", which the `telemetry` row marks partial, and "react to webhooks", which the
// `webhooks` row narrows to programs on this machine. scripts/validate-compare-render.mjs
// runs these rules on the /product page the build wrote; tests/product-claims.test.mjs plants
// each failure.
//
// The rules, on the text inside `main`:
//
//   - A section that talks about a row's subject cites that row: it carries a link to
//     /compare#<row>. A section is the nearest <section> or <article> around the words, so a
//     card cites for itself. The subject is a row's CLAIM_TOPICS words, matched as whole
//     words after folding case, punctuation and hyphens, with an optional plural "s".
//   - No block states the claim of a `partial` or `no` row, or a short form of it: the
//     llms.txt lead's rule (scripts/llms-lead.mjs), with the same LEAD_SHORT_FORMS, so one
//     list bounds both. Citing the row does not excuse stating the wider claim.
//   - Every /compare#<row> link names a row the data has.
//   - Every row marked `partial` or `no` has topic words, and every entry names a row, so a
//     row added to src/data/capabilities.json is either covered here or fails until it is.
//   - The page cites at least one row. A page with none has nothing held to a row, which is
//     what an empty or misread page looks like too.
//
// WHAT IT CANNOT CLOSE. It matches words, not meaning: a sentence can overclaim in words no
// topic lists. When a review finds one, add the word to its row's entry here, or the phrase
// to LEAD_SHORT_FORMS. Whether the cited row is TRUE at the tag is the /compare check's
// question, not this one's.

import { load } from "cheerio";

import { LEAD_SHORT_FORMS, leadOverclaims } from "./llms-lead.mjs";

const SITE_ORIGIN = "https://personalclaw.dev";
const PAGE_URL = `${SITE_ORIGIN}/product/`;

/**
 * The words that mark a sentence as being about a row's subject, keyed by row id. Every row
 * /compare marks `partial` or `no` has an entry; a row that holds may have one too.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const CLAIM_TOPICS = Object.freeze({
  multi_user: ["multi-user", "multi-tenant", "user accounts"],
  data_stability: ["migration", "data migration"],
  telemetry: [
    "telemetry",
    "analytics",
    "crash report",
    "crash reporting",
    "usage reporting",
    "usage tracking",
    "phone home",
    "phones home"
  ],
  egress_default_deny: ["deny-by-default", "default-deny"],
  single_chokepoint: ["chokepoint"],
  egress_allowlist_exclusive: ["allow-list", "allowlist"],
  audit_log: ["audit trail", "audit log", "security log", "tamper-evident"],
  tool_approval: ["tool grant", "per-tool"],
  provider_agnostic: ["provider-agnostic", "vendor-agnostic", "vendor-neutral", "vendor-specific"],
  app_sandbox: ["sandbox", "sandboxed"],
  dep_scan_gate: ["pip-audit", "npm audit", "vulnerable dependency", "vulnerable dependencies"],
  desktop_app: ["desktop app", "desktop application"],
  retrieval: ["RAG", "semantic search", "vector search", "embeddings"],
  sso_auth: ["single sign-on", "SSO", "SAML", "OIDC"],
  webhooks: ["webhook"],
  web_search: ["web search", "search the web", "searches the web"]
});

/** Text inside these is not a claim a reader sees. */
const UNREAD = new Set(["script", "style", "template", "noscript"]);

/** The elements that hold one sentence or item of copy. */
const BLOCK =
  "p, li, h1, h2, h3, h4, h5, h6, dt, dd, td, th, figcaption, blockquote, summary, label";

/** Lower-case words separated by single spaces, so matching ignores punctuation. */
function fold(text) {
  return String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** A block's text on one line, cut at a word near 90 characters. */
function excerpt(text) {
  const line = String(text).replace(/\s+/g, " ").trim();
  if (line.length <= 90) return line;
  return `${line.slice(0, line.lastIndexOf(" ", 90))}…`;
}

/** Whether folded `text` holds the folded `term` as whole words, or its plural. */
function mentions(text, term) {
  const folded = fold(term);
  if (folded === "") return false;
  return ` ${text} `.includes(` ${folded} `) || ` ${text} `.includes(` ${folded}s `);
}

/** The row an href cites, when it is a link to /compare#<row> on this site; else null. */
function citedRow(href) {
  let url;
  try {
    url = new URL(href, PAGE_URL);
  } catch {
    return null;
  }
  if (url.origin !== SITE_ORIGIN) return null;
  if (url.pathname !== "/compare" && url.pathname !== "/compare/") return null;
  if (url.hash.length < 2) return null;
  return decodeURIComponent(url.hash.slice(1));
}

/** The rows each link in `scope` cites. */
function citationsIn(page, scope) {
  return page(scope)
    .find("a[href]")
    .toArray()
    .map((link) => citedRow(page(link).attr("href")))
    .filter((row) => row !== null);
}

/** Every text node under `node` that a reader sees. */
function visibleText(node, found = []) {
  for (const child of node.children ?? []) {
    if (child.type === "text") found.push(child);
    else if (child.type === "tag" && !UNREAD.has(child.name)) visibleText(child, found);
  }
  return found;
}

/**
 * The rows /product cites, each once, in the order the page first links them.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function compareCitations(html) {
  const page = load(html);
  const main = page("main").first();
  if (main.length === 0) return [];
  return [...new Set(citationsIn(page, main))];
}

/**
 * Topic entries that guard nothing, and rows that do not hold as stated with no entry.
 *
 * @param {Array<{ id: string, verdict: string }>} rows
 * @param {Readonly<Record<string, readonly string[]>>} [topics]
 * @returns {string[]}
 */
export function staleClaimTopics(rows, topics = CLAIM_TOPICS) {
  const ids = new Set(rows.map((row) => row.id));
  const problems = [];
  for (const id of Object.keys(topics)) {
    if (!ids.has(id)) {
      problems.push(
        `CLAIM_TOPICS entry ${id} names no row in src/data/capabilities.json; remove the entry.`
      );
    }
  }
  for (const row of rows) {
    if ((row.verdict === "partial" || row.verdict === "no") && !(topics[row.id]?.length > 0)) {
      problems.push(
        `CLAIM_TOPICS has no words for ${row.id}, which /compare marks ${row.verdict}; add the ` +
          `words a page would use to claim it.`
      );
    }
  }
  return problems;
}

/**
 * What is wrong with the claims on the built /product page, held to the /compare rows.
 *
 * @param {string} html the page the build wrote
 * @param {Array<{ id: string, verdict: string, claim: string }>} rows the /compare data's rows
 * @param {{ topics?: Readonly<Record<string, readonly string[]>>,
 *           shortForms?: Readonly<Record<string, readonly string[]>> }} [options]
 * @returns {string[]}
 */
export function productClaimProblems(
  html,
  rows,
  { topics = CLAIM_TOPICS, shortForms = LEAD_SHORT_FORMS } = {}
) {
  const page = load(html);
  const main = page("main").first();
  if (main.length === 0) return ["/product has no <main> to read claims from"];

  const ids = new Set(rows.map((row) => row.id));
  const problems = [];

  const cited = [...new Set(citationsIn(page, main))];
  for (const row of cited) {
    if (!ids.has(row)) problems.push(`/product cites /compare#${row}, which is no row on /compare`);
  }

  // The blocks the page's words sit in, in document order, each once.
  const blocks = [];
  for (const node of visibleText(main.get(0))) {
    if (fold(node.data) === "") continue;
    const block = page(node.parent).closest(BLOCK).get(0) ?? node.parent;
    if (!blocks.includes(block)) blocks.push(block);
  }

  for (const block of blocks) {
    const text = fold(page(block).text());
    const scope = page(block).closest("section, article").get(0) ?? block;
    const citesHere = new Set(citationsIn(page, scope));
    for (const [row, words] of Object.entries(topics)) {
      if (citesHere.has(row)) continue;
      const word = words.find((candidate) => mentions(text, candidate));
      if (word !== undefined) {
        problems.push(
          `/product mentions "${word}" without citing /compare#${row} in its section: ` +
            `"${excerpt(page(block).text())}"`
        );
      }
    }
  }

  for (const block of blocks) {
    for (const finding of leadOverclaims(page(block).text(), rows, shortForms)) {
      problems.push(
        `/product says "${finding.phrase}", which /compare row \`${finding.row}\` ` +
          `(${finding.verdict}) says does not hold as stated ("${finding.claim}"). State the ` +
          `row's narrower truth instead: "${excerpt(page(block).text())}"`
      );
    }
  }

  problems.push(...staleClaimTopics(rows, topics));

  if (cited.length === 0) problems.push("/product cites no /compare row, so nothing on it is held to one");
  return problems;
}
