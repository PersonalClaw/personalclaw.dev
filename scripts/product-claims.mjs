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

/** Whether `href` is release-pinned evidence: it starts with one of the `evidence` prefixes. */
function isPinnedEvidence(href, evidence) {
  return typeof href === "string" && evidence.some((prefix) => href.startsWith(prefix));
}

/**
 * Whether *block* sits in an app card (`data-app-card="<slug>"`, /apps) that links its own
 * install-safety sheet, `/registry/<slug>`, and that sheet is in the build (#112). A card's words
 * are its app's manifest, and the sheet shows that manifest as the pinned commit has it, so the
 * card's own sheet is its evidence. Another app's sheet, a sheet the build lacks, or text outside
 * the cards is not.
 *
 * @param {{ exists: (sheet: string) => boolean } | undefined} sheets
 */
function ownSheetIn(page, block, sheets) {
  if (!sheets) return false;
  const card = page(block).closest("[data-app-card]");
  const slug = card.attr("data-app-card");
  if (!slug) return false;
  const sheet = `/registry/${slug}`;
  return card.find("a[href]").toArray().some((link) => page(link).attr("href") === sheet) && sheets.exists(sheet);
}

/** Whether a link in `scope` points at release-pinned evidence. */
function evidenceIn(page, scope, evidence) {
  if (evidence.length === 0) return false;
  return page(scope)
    .find("a[href]")
    .toArray()
    .some((link) => isPinnedEvidence(page(link).attr("href"), evidence));
}

/**
 * The prefixes of release-pinned evidence for a release: its files at the tag or the commit,
 * its release page and its release assets.
 *
 * @param {{ repo: string, version: string, commit: string }} release
 * @returns {string[]}
 */
export function pinnedEvidencePrefixes({ repo, version, commit }) {
  const base = repo.replace(/\/$/, "");
  return [
    `${base}/blob/${version}/`,
    `${base}/blob/${commit}/`,
    `${base}/tree/${version}/`,
    `${base}/tree/${commit}/`,
    `${base}/releases/tag/${version}`,
    `${base}/releases/download/${version}/`,
    `${base}/commit/${commit}`
  ];
}

/** The rows each link in `scope` cites. */
function citationsIn(page, scope) {
  return page(scope)
    .find("a[href]")
    .toArray()
    .map((link) => citedRow(page(link).attr("href")))
    .filter((row) => row !== null);
}

/** A block's text without what it quotes: `<q>` and the words between quotation marks. */
function assertedText(page, block) {
  const copy = page(block).clone();
  copy.find("q").remove();
  return copy.text().replace(/“[^”]*”/g, " ").replace(/"[^"]*"/g, " ");
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
 * What is wrong with the claims on one built page, held to the /compare rows (#98): every
 * section that talks about a row's subject links its evidence, either the row
 * (/compare#<row>) or a file at the pinned release (`evidence`, `pinnedEvidencePrefixes`),
 * and no block states a `partial` or `no` row's claim as if it held. `requireCitation` asks
 * that the page cite at least one row.
 *
 * @param {string} html the page the build wrote
 * @param {Array<{ id: string, verdict: string, claim: string }>} rows the /compare data's rows
 * @param {{ route: string, evidence?: readonly string[], requireCitation?: boolean,
 *           topics?: Readonly<Record<string, readonly string[]>>,
 *           shortForms?: Readonly<Record<string, readonly string[]>>,
 *           sheets?: { exists: (sheet: string) => boolean } }} options
 *   `sheets` says which install-safety sheets the build has, for an /apps card's own (`ownSheetIn`).
 * @returns {string[]}
 */
export function pageClaimProblems(
  html,
  rows,
  { route, evidence = [], requireCitation = false, topics = CLAIM_TOPICS, shortForms = LEAD_SHORT_FORMS, sheets }
) {
  const page = load(html);
  const main = page("main").first();
  if (main.length === 0) return [`${route} has no <main> to read claims from`];

  const ids = new Set(rows.map((row) => row.id));
  const problems = [];

  const cited = [...new Set(citationsIn(page, main))];
  for (const row of cited) {
    if (!ids.has(row)) problems.push(`${route} cites /compare#${row}, which is no row on /compare`);
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
    const pinnedHere = evidenceIn(page, scope, evidence) || ownSheetIn(page, block, sheets);
    for (const [row, words] of Object.entries(topics)) {
      if (citesHere.has(row) || pinnedHere) continue;
      const word = words.find((candidate) => mentions(text, candidate));
      if (word !== undefined) {
        const or = evidence.length > 0 ? " or linking its file at the pinned release" : "";
        problems.push(
          `${route} mentions "${word}" without citing /compare#${row}${or} in its section: ` +
            `"${excerpt(page(block).text())}"`
        );
      }
    }
  }

  // A claim a page quotes in order to narrow it is a mention, not an assertion: the words a
  // block quotes, or a claim inside the card that names its row and links to it (Home's trust
  // cards, /security's limits, a post's verification callout).
  for (const block of blocks) {
    const card = page(block).closest("[data-trust-row], [data-limit], [data-blog-claim]");
    const named = card.attr("data-trust-row") ?? card.attr("data-limit") ?? card.attr("data-blog-claim");
    const narrowed = named !== undefined && citationsIn(page, card.get(0)).includes(named);
    for (const finding of leadOverclaims(assertedText(page, block), rows, shortForms)) {
      if (narrowed && finding.row === named) continue;
      problems.push(
        `${route} says "${finding.phrase}", which /compare row \`${finding.row}\` ` +
          `(${finding.verdict}) says does not hold as stated ("${finding.claim}"). State the ` +
          `row's narrower truth instead: "${excerpt(page(block).text())}"`
      );
    }
  }

  if (requireCitation && cited.length === 0) {
    problems.push(`${route} cites no /compare row, so nothing on it is held to one`);
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
  return [
    ...pageClaimProblems(html, rows, { route: "/product", requireCitation: true, topics, shortForms }),
    ...staleClaimTopics(rows, topics)
  ];
}

/** Every string a page's JSON-LD says about the product: descriptions, questions, answers. */
function structuredClaims(page) {
  const found = [];
  const walk = (value, key = "") => {
    if (typeof value === "string") {
      if (["description", "text", "name"].includes(key)) found.push({ key, value });
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  for (const script of page('script[type="application/ld+json"]').toArray()) {
    try {
      walk(JSON.parse(page(script).text()));
    } catch {
      // validate:build owns "exactly one parseable graph per page".
    }
  }
  return found;
}

/**
 * What a page tells search engines and assistants that is broader than the ledger (#98): its
 * meta and Open Graph descriptions, and every description, question and answer in its
 * structured data, held to the /compare rows as the llms.txt lead is (`leadOverclaims`).
 *
 * @param {string} html
 * @param {Array<{ id: string, verdict: string, claim: string }>} rows
 * @param {{ route: string, shortForms?: Readonly<Record<string, readonly string[]>> }} options
 * @returns {string[]}
 */
export function headClaimProblems(html, rows, { route, shortForms = LEAD_SHORT_FORMS }) {
  const page = load(html);
  const said = [
    { where: "its description", value: page('meta[name="description"]').attr("content") ?? "" },
    { where: "its Open Graph description", value: page('meta[property="og:description"]').attr("content") ?? "" },
    ...structuredClaims(page).map(({ key, value }) => ({ where: `its structured data (${key})`, value }))
  ];
  const problems = [];
  for (const { where, value } of said) {
    for (const finding of leadOverclaims(value, rows, shortForms)) {
      problems.push(
        `${route} says "${finding.phrase}" in ${where}, which /compare row \`${finding.row}\` ` +
          `(${finding.verdict}) says does not hold as stated ("${finding.claim}"): "${excerpt(value)}"`
      );
    }
  }
  return problems;
}

/**
 * Whether Home's FAQPage says exactly what its visible questions say (#98): the same
 * questions, in order, each with the text of its answer paragraphs.
 *
 * @param {string} html the built Home page
 * @returns {string[]}
 */
export function faqParityProblems(html) {
  const page = load(html);
  const squash = (text) => String(text).replace(/\s+/g, " ").trim();
  const visible = page("details[data-faq]")
    .toArray()
    .map((details) => ({
      name: squash(page(details).find("summary").first().text()),
      text: squash(
        page(details)
          .find("p[data-faq-answer]")
          .toArray()
          .map((p) => squash(page(p).text()))
          .join(" ")
      )
    }));
  let published = null;
  for (const script of page('script[type="application/ld+json"]').toArray()) {
    try {
      const graph = JSON.parse(page(script).text())["@graph"] ?? [];
      const faq = graph.find((node) => node?.["@type"] === "FAQPage");
      if (faq) published = (faq.mainEntity ?? []).map((q) => ({ name: squash(q.name), text: squash(q.acceptedAnswer?.text) }));
    } catch {
      // validate:build owns parseability.
    }
  }
  if (visible.length === 0) return ["/ shows no questions (details[data-faq]) for its FAQPage to publish"];
  if (published === null) return ["/ shows questions but its structured data has no FAQPage"];
  const problems = [];
  const count = Math.max(visible.length, published.length);
  for (let i = 0; i < count; i++) {
    const shown = visible[i];
    const told = published[i];
    if (!shown || !told) {
      problems.push(`/ shows ${visible.length} question(s) and its FAQPage publishes ${published.length}`);
      break;
    }
    if (shown.name !== told.name) problems.push(`/ asks "${shown.name}" where its FAQPage asks "${told.name}"`);
    else if (shown.text !== told.text) {
      problems.push(`/ answers "${shown.name}" differently from its FAQPage: "${excerpt(shown.text)}" vs "${excerpt(told.text)}"`);
    }
  }
  return problems;
}

/**
 * Whether a page carries the headline pattern (#98, settled 2026-10-14): one headline, and
 * under it one factual support sentence (`[data-support]`) in the same section, one sentence
 * long. tests/browser/support-sentence.spec.ts holds both to the first viewport.
 *
 * @param {string} html
 * @param {{ route: string }} options
 * @returns {string[]}
 */
export function supportSentenceProblems(html, { route }) {
  const page = load(html);
  const main = page("main").first();
  if (main.length === 0) return [`${route} has no <main> to read its headline from`];
  const headings = main.find("h1");
  if (headings.length !== 1) return [`${route} has ${headings.length} h1 headlines, not one`];
  const support = main.find("[data-support]");
  if (support.length !== 1) return [`${route} has ${support.length} support sentences ([data-support]), not one`];
  const problems = [];
  const section = headings.first().closest("section, article").get(0);
  if (!section || page(section).find("[data-support]").length !== 1) {
    problems.push(`${route}'s support sentence is not in its headline's section`);
  }
  const text = support.first().text().replace(/\s+/g, " ").trim();
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((part) => part.trim() !== "");
  if (sentences.length !== 1) {
    problems.push(`${route}'s support sentence is ${sentences.length} sentences, not one: "${excerpt(text)}"`);
  }
  return problems;
}
