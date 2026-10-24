// /product's claims, held to the /compare rows they touch.
//
// docs/site-audit.md (P1, P2) found two /product sentences wider than their rows: the closing
// paragraph's "no product telemetry", which the `telemetry` row marks partial (by default
// PersonalClaw asks GitHub for a newer release on its own), and the automation section's
// "react to webhooks" and "an inbound webhook endpoint", which the `webhooks` row narrows to
// programs on this machine. Both pages are built here, so the rule is mechanical: a /product
// section that talks about something a row covers links that row, and no block states the
// claim a partial or no row says does not hold. The rules are scripts/product-claims.mjs;
// validate-compare-render runs them on the built /product page. Here each failure is planted
// on a page made of the blocks the rule reads, and the script is run end to end on a copy.

import assert from "node:assert/strict";
import test from "node:test";

import { LEAD_SHORT_FORMS } from "../scripts/llms-lead.mjs";
import {
  CLAIM_TOPICS,
  compareCitations,
  productClaimProblems,
  staleClaimTopics,
  topicsIn
} from "../scripts/product-claims.mjs";
import {
  comparePage,
  compareRun,
  productPage,
  readData
} from "./support/compare-fixtures.mjs";

const rows = readData().rows;

/** The automation section and the closing section of /product as they shipped, verbatim. */
const previousAutomation =
  '<section class="section automation-section section-rule"><div class="shell automation-grid">' +
  '<div class="feature-copy"><p class="kicker">Automation</p>' +
  '<h2 class="section-title">Let the system notice first.</h2>' +
  "<p>Schedule recurring work, react to webhooks, monitor connected channels, and dispatch " +
  "background subagents without building a second automation stack. Anything that needs you " +
  "lands in one inbox you can answer in place &mdash; a loop waiting on a decision, a proposed " +
  "skill, an approval you walked away from.</p>" +
  '<ul class="feature-list"><li>Cron and interval triggers, plus an inbound webhook endpoint</li>' +
  "<li>One inbox for decisions, approvals, and messages</li>" +
  "<li>Background subagents</li></ul></div></div></section>";

const previousClosing =
  '<section class="section product-cta"><div class="narrow">' +
  '<p class="kicker">Open source · self-hosted</p>' +
  '<h2 class="section-title">Run the system on your machine.</h2>' +
  "<p>Python 3.12 or 3.13, an aiohttp gateway, React dashboard, state on disk as SQLite plus " +
  "plain JSON and JSONL, and no product telemetry.</p>" +
  '<div><a class="button button-primary" href="https://github.com/PersonalClaw/PersonalClaw">' +
  'Get PersonalClaw</a><a class="button button-secondary" href="/security">Read the security ' +
  "model</a></div></div></section>";

/** The same two sections, each narrowed to its row and citing it. */
const citedAutomation =
  '<section class="section automation-section section-rule"><div class="feature-copy">' +
  "<p>Schedule recurring work, let a program on this machine start it with a webhook, monitor " +
  "connected channels, and dispatch background subagents.</p>" +
  '<ul class="feature-list"><li>Cron and interval triggers, plus webhooks from programs on ' +
  "this machine</li><li>Background subagents</li></ul>" +
  '<a class="text-link" href="/compare#webhooks">What webhooks can and cannot do</a>' +
  "</div></section>";

const citedClosing =
  '<section class="section product-cta"><div class="narrow">' +
  "<p>State on disk as SQLite plus plain JSON and JSONL. No analytics, no crash reporting and " +
  "no usage reporting; by default it asks GitHub for a newer release when it starts and on an " +
  "interval, and one setting turns that off.</p>" +
  '<p class="cta-source"><a class="text-link" href="/compare#telemetry">What it sends, and ' +
  "what it does not</a></p></div></section>";

const section = (body) => `<section>${body}</section>`;

// ── the topic list ────────────────────────────────────────────────────────────────────────

test("every topic entry names a row, and every row that does not hold as stated has one", () => {
  assert.deepEqual(staleClaimTopics(rows), []);
  for (const row of rows) {
    if (row.verdict === "partial" || row.verdict === "no") {
      assert.ok(CLAIM_TOPICS[row.id]?.length > 0, `${row.id} (${row.verdict}) has topic words`);
    }
  }
});

test("a topic entry for a row the data no longer has is named, as is a row left without one", () => {
  const topics = { ...CLAIM_TOPICS, gone_row: ["gone"] };
  delete topics.webhooks;
  assert.deepEqual(staleClaimTopics(rows, topics), [
    "CLAIM_TOPICS entry gone_row names no row in src/data/capabilities.json; remove the entry.",
    "CLAIM_TOPICS has no words for webhooks, which /compare marks partial; add the words a " +
      "page would use to claim it."
  ]);
});

// ── the claims the audit found ────────────────────────────────────────────────────────────

test("/product as it shipped fails: the telemetry and webhook claims cite no row", () => {
  const page = productPage([previousAutomation, previousClosing]);
  assert.deepEqual(productClaimProblems(page, rows), [
    '/product mentions "webhook" without citing /compare#webhooks in its section: ' +
      '"Schedule recurring work, react to webhooks, monitor connected channels, and dispatch…"',
    '/product mentions "webhook" without citing /compare#webhooks in its section: ' +
      '"Cron and interval triggers, plus an inbound webhook endpoint"',
    '/product mentions "telemetry" without citing /compare#telemetry in its section: ' +
      '"Python 3.12 or 3.13, an aiohttp gateway, React dashboard, state on disk as SQLite plus…"',
    '/product says "no product telemetry", which /compare row `telemetry` (partial) says does ' +
      'not hold as stated ("Zero telemetry."). State the row\'s narrower truth instead: ' +
      '"Python 3.12 or 3.13, an aiohttp gateway, React dashboard, state on disk as SQLite plus…"',
    "/product cites no /compare row, so nothing on it is held to one"
  ]);
});

test("the same claims, narrowed to their rows and citing them, pass", () => {
  const page = productPage([citedAutomation, citedClosing]);
  assert.deepEqual(productClaimProblems(page, rows), []);
  assert.deepEqual(compareCitations(page), ["webhooks", "telemetry"]);
});

test("a cited block may still not state the claim its row says does not hold", () => {
  const page = productPage([
    section(
      '<p>State on disk as plain JSON, and no product telemetry.</p>' +
        '<a class="text-link" href="/compare#telemetry">What it sends</a>'
    )
  ]);
  const problems = productClaimProblems(page, rows);
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], /^\/product says "no product telemetry", which \/compare row `telemetry` \(partial\)/);
});

test("the row's own claim is refused like a short form of it", () => {
  const page = productPage([
    section('<p>Zero telemetry.</p><a href="/compare#telemetry">What it sends</a>')
  ]);
  const problems = productClaimProblems(page, rows);
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], /^\/product says "Zero telemetry\.", which \/compare row `telemetry`/);
});

// ── where a citation counts ───────────────────────────────────────────────────────────────

test("a citation counts in the claim's own section or card, not in another", () => {
  const elsewhere = productPage([
    section("<p>Take webhooks from programs on this machine.</p>"),
    section('<a href="/compare#webhooks">What webhooks can and cannot do</a>')
  ]);
  assert.deepEqual(productClaimProblems(elsewhere, rows), [
    '/product mentions "webhook" without citing /compare#webhooks in its section: ' +
      '"Take webhooks from programs on this machine."'
  ]);

  const cards = productPage([
    section(
      '<article><p>Take webhooks from programs on this machine.</p></article>' +
        '<article><a href="/compare#webhooks">What webhooks can and cannot do</a></article>'
    )
  ]);
  assert.equal(productClaimProblems(cards, rows).length, 1, "a card is its own section");

  const nested = productPage([
    section(
      '<div><ul><li>Webhooks from programs on this machine</li></ul></div>' +
        '<p><a href="/compare#webhooks">What webhooks can and cannot do</a></p>'
    )
  ]);
  assert.deepEqual(productClaimProblems(nested, rows), []);
});

test("a citation must name the row of the topic, and a row that exists", () => {
  const wrongRow = productPage([
    section('<p>Take webhooks from programs on this machine.</p><a href="/compare#scheduled">Schedules</a>')
  ]);
  assert.deepEqual(productClaimProblems(wrongRow, rows), [
    '/product mentions "webhook" without citing /compare#webhooks in its section: ' +
      '"Take webhooks from programs on this machine."'
  ]);

  const dangling = productPage([
    section('<p>Runs on your machine.</p><a href="/compare#webhook">What it answers</a>')
  ]);
  assert.deepEqual(productClaimProblems(dangling, rows), [
    "/product cites /compare#webhook, which is no row on /compare"
  ]);
});

test("absolute and trailing-slash links to a row cite it; a bare /compare or another site does not", () => {
  const forms = [
    "https://personalclaw.dev/compare#webhooks",
    "/compare/#webhooks",
    "../compare#webhooks"
  ];
  for (const href of forms) {
    const page = productPage([section(`<p>Webhooks from this machine.</p><a href="${href}">Row</a>`)]);
    assert.deepEqual(productClaimProblems(page, rows), [], href);
  }
  for (const href of ["/compare", "https://example.com/compare#webhooks", "#webhooks"]) {
    const page = productPage([
      section(`<p>Webhooks from this machine.</p><a href="${href}">Row</a>`),
      section('<a href="/compare#telemetry">What it sends</a>')
    ]);
    assert.equal(productClaimProblems(page, rows).length, 1, href);
  }
});

// ── what counts as a mention ──────────────────────────────────────────────────────────────

test("topics match whole words, folding case, punctuation, hyphens and a plural", () => {
  const cite = '<a href="/compare#telemetry">What it sends</a>';
  const mentions = (text) =>
    productClaimProblems(productPage([section(`<p>${text}</p>${cite}`)]), rows).filter((problem) =>
      problem.includes("without citing")
    );
  assert.equal(mentions("Grounded answers with RAG.").length, 1);
  assert.equal(mentions("Webhooks, Webhook and WEBHOOK.").length, 1, "one problem per block");
  assert.equal(mentions("A multi user install.").length, 1, "multi-user, unhyphenated");
  assert.equal(mentions("Single Sign-On.").length, 1);
  assert.equal(mentions("Fragments in storage, dragged.").length, 0, "rag inside a word");
  assert.equal(mentions("Hooks on the web.").length, 0);
});

test("text outside main, in scripts, styles and comments, is not a claim", () => {
  const page = productPage(
    [
      section(
        '<script>const webhook = "no telemetry";</script><style>.webhook{}</style>' +
          "<!-- react to webhooks --><p>Runs on your machine.</p>" +
          '<a href="/compare#telemetry">What it sends</a>'
      )
    ],
    { header: "<p>No usage tracking</p>", footer: "<p>Webhooks and SSO</p>" }
  );
  assert.deepEqual(productClaimProblems(page, rows), []);
});

test("a page that cites nothing fails, and so does one with no main", () => {
  assert.deepEqual(productClaimProblems(productPage([section("<p>Runs on your machine.</p>")]), rows), [
    "/product cites no /compare row, so nothing on it is held to one"
  ]);
  assert.deepEqual(productClaimProblems("<!doctype html><html><body><p>Hi</p></body></html>", rows), [
    "/product has no <main> to read claims from"
  ]);
});

test("the short forms it refuses are the llms.txt lead's, so one list bounds both", () => {
  assert.ok(LEAD_SHORT_FORMS.telemetry.includes("no product telemetry"));
});

// ── end to end, through validate-compare-render ──────────────────────────────────────────

test("validate-compare-render fails the /product page as it shipped, naming both rows", () => {
  const data = readData();
  const run = compareRun({
    data,
    page: comparePage(data),
    product: productPage([previousAutomation, previousClosing])
  });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /\/product mentions "webhook" without citing \/compare#webhooks/);
  assert.match(run.stderr, /\/product mentions "telemetry" without citing \/compare#telemetry/);
  assert.match(run.stderr, /\/product says "no product telemetry"/);
});

test("validate-compare-render passes /product when its claims cite their rows", () => {
  const data = readData();
  const run = compareRun({
    data,
    page: comparePage(data),
    product: productPage([citedAutomation, citedClosing])
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /\/product cites 2 rows/);
});

test("validate-compare-render fails a build with no /product page", () => {
  const data = readData();
  const run = compareRun({ data, page: comparePage(data), product: null });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /\/product was not published/);
});

test("quoted copy names the rows its words touch, once each, by the first word it uses", () => {
  assert.deepEqual(
    topicsIn("The gateway image, its agent CLIs and the desktop app take security fixes. No upgrade step is needed."),
    [{ row: "desktop_app", word: "desktop app" }]
  );
  assert.deepEqual(topicsIn("Two webhooks, a desktop application and a webhook."), [
    { row: "desktop_app", word: "desktop application" },
    { row: "webhooks", word: "webhook" }
  ]);
  assert.deepEqual(topicsIn("A running turn's status sits at the bottom of the chat."), []);
});
