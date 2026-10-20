// The hand-written lead of /llms.txt, and the check that holds it to the /compare rows.
//
// The lead is what an assistant reads first about PersonalClaw, and it is the only part of
// llms.txt written here: every line under it is generated from the pinned docs. So it is
// held to the same rows /compare publishes. A row marked `partial` or `no` is a claim this
// release does not support as stated, and the lead may not make it; it may state the row's
// narrower truth instead. scripts/sync-docs.mjs refuses to write llms.txt when the lead
// fails, and tests/llms-lead.test.mjs runs the same check without a sync.
//
// What the check matches, after folding case, punctuation and hyphenation:
//
//   - every `partial` or `no` row's own `claim`, from src/data/capabilities.json, so a
//     row added there is checked with no change here;
//   - LEAD_SHORT_FORMS, the shorter ways a summary states one of those claims ("no
//     telemetry" for "Zero telemetry."). Each entry must name a row that is `partial` or
//     `no`: when a row comes to hold, its entry fails as stale and has to be removed.
//
// WHAT IT CANNOT CLOSE. It matches words, not meaning. A lead can still overclaim in words
// neither list holds; when a review finds one, add the phrase to its row's entry here.
// Whether a row is TRUE at the tag is the /compare check's question, not this one's.

import { readFileSync } from "node:fs";

const matrixUrl = new URL("../src/data/capabilities.json", import.meta.url);

/**
 * The /compare rows, read straight from its data file rather than through the page's
 * normalizer, so a row the normalizer refuses still bounds the lead.
 */
export function compareRows() {
  return JSON.parse(readFileSync(matrixUrl, "utf8")).rows ?? [];
}

/**
 * Shorter ways a summary states a `partial` or `no` row's claim, keyed by row id.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const LEAD_SHORT_FORMS = Object.freeze({
  telemetry: [
    "no telemetry",
    "telemetry-free",
    "without telemetry",
    "never phones home",
    "does not phone home",
    "doesn't phone home"
  ],
  provider_agnostic: ["provider-agnostic", "vendor-agnostic", "vendor-neutral"],
  egress_default_deny: ["deny-by-default", "default-deny"],
  app_sandbox: ["sandboxed apps", "apps are sandboxed"],
  multi_user: ["multi-user", "multi-tenant"],
  sso_auth: ["single sign-on", "SSO", "SAML", "OIDC"]
});

/**
 * The lead, as lines: the H1, the summary blockquote, and the paragraphs above `## Install`.
 *
 * @param {string} version the pinned release label, such as v0.2.2
 * @returns {string[]}
 */
export function llmsLead(version) {
  return [
    "# PersonalClaw",
    "",
    "> A self-hosted personal AI agent — an agentic operating system for one person.",
    "> Chat, autonomous goal loops, long-term memory, a knowledge base, skills, scheduled",
    "> automation and channel integrations, behind one gateway and one web dashboard you",
    "> own. Local-first and MIT-licensed, with model providers, channels and other vendor",
    "> integrations installed as apps.",
    "",
    `Documentation below describes PersonalClaw ${version} exactly — it is generated from`,
    "the tagged source, not written separately.",
    "",
    "PersonalClaw has no analytics, crash reporting or usage telemetry. By default it does",
    "ask GitHub whether a newer release exists, when it starts and on an interval after",
    "that; the `updates.check_enabled` setting turns that off. This site loads no analytics",
    "and makes no third-party requests.",
    "",
    "[What this release does and does not do](https://personalclaw.dev/compare), each row",
    "sourced to the tag."
  ];
}

/** Lower-case words separated by single spaces, so matching ignores punctuation. */
function fold(text) {
  return String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Each place the lead states a claim that a `partial` or `no` row says does not hold as
 * stated.
 *
 * @param {string} lead
 * @param {Array<{ id: string, verdict: string, claim: string }>} rows
 * @param {Readonly<Record<string, readonly string[]>>} [shortForms]
 * @returns {Array<{ row: string, verdict: string, claim: string, phrase: string }>}
 */
export function leadOverclaims(lead, rows, shortForms = LEAD_SHORT_FORMS) {
  const text = ` ${fold(lead)} `;
  const findings = [];
  for (const row of rows) {
    if (row?.verdict !== "partial" && row?.verdict !== "no") continue;
    for (const phrase of [row.claim, ...(shortForms[row.id] ?? [])]) {
      const folded = fold(phrase);
      if (folded !== "" && text.includes(` ${folded} `)) {
        findings.push({ row: row.id, verdict: row.verdict, claim: row.claim, phrase });
      }
    }
  }
  return findings;
}

/**
 * Short-form entries that no longer guard anything: their row is gone, or it holds.
 *
 * @param {Array<{ id: string, verdict: string }>} rows
 * @param {Readonly<Record<string, readonly string[]>>} [shortForms]
 * @returns {string[]}
 */
export function staleShortForms(rows, shortForms = LEAD_SHORT_FORMS) {
  const verdicts = new Map(rows.map((row) => [row.id, row.verdict]));
  const stale = [];
  for (const id of Object.keys(shortForms)) {
    const verdict = verdicts.get(id);
    if (verdict === undefined) {
      stale.push(`${id} names no row in src/data/capabilities.json`);
    } else if (verdict !== "partial" && verdict !== "no") {
      stale.push(`${id} is now "${verdict}" on /compare, so the lead may say it`);
    }
  }
  return stale;
}

/**
 * Refuse a lead that claims what a `partial` or `no` row says does not hold, or a
 * short-form list that has gone stale. The message names every finding.
 *
 * @param {string} lead
 * @param {Array<{ id: string, verdict: string, claim: string }>} [rows]
 * @param {Readonly<Record<string, readonly string[]>>} [shortForms]
 */
export function assertLeadHolds(lead, rows = compareRows(), shortForms = LEAD_SHORT_FORMS) {
  const problems = [
    ...leadOverclaims(lead, rows, shortForms).map(
      (finding) =>
        `the llms.txt lead says "${finding.phrase}", which /compare row ` +
        `\`${finding.row}\` (${finding.verdict}) says does not hold as stated: ` +
        `"${finding.claim}". State the row's narrower truth instead.`
    ),
    ...staleShortForms(rows, shortForms).map(
      (entry) => `LEAD_SHORT_FORMS entry ${entry}; remove the entry.`
    )
  ];
  if (problems.length) {
    throw new Error(`scripts/llms-lead.mjs:\n  - ${problems.join("\n  - ")}`);
  }
}
