// The llms.txt lead, held to the /compare rows.
//
// The lead is the first thing an assistant reads about PersonalClaw, and it is the one
// part of llms.txt this repository writes by hand: everything under it is generated from
// the pinned docs, whose words core owns. It said "zero telemetry" and "PersonalClaw sends
// no telemetry" while the /compare `telemetry` row marked exactly that claim `partial`,
// because by default PersonalClaw asks GitHub for a newer release on its own. Both the
// lead and the matrix are data in this repository, so the disagreement is mechanical to
// catch, and it is caught here and again before the sync writes the file.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertLeadHolds,
  LEAD_SHORT_FORMS,
  leadOverclaims,
  llmsLead,
  staleShortForms
} from "../scripts/llms-lead.mjs";

const matrix = JSON.parse(
  readFileSync(new URL("../src/data/capabilities.json", import.meta.url), "utf8")
);
const rows = matrix.rows;
const version = matrix.release.version;

/** The lead as it shipped before this check, verbatim. */
const previousLead = [
  "# PersonalClaw",
  "",
  "> A self-hosted personal AI agent — an agentic operating system for one person.",
  "> Chat, autonomous goal loops, long-term memory, a knowledge base, skills, scheduled",
  "> automation and channel integrations, behind one gateway process and one web",
  "> dashboard you own. Local-first, provider-agnostic, zero telemetry, MIT.",
  "",
  `Documentation below describes PersonalClaw ${version} exactly — it is generated from`,
  "the tagged source, not written separately. PersonalClaw sends no telemetry: there is",
  "no adoption instrumentation in the product or on this site."
].join("\n");

const row = (id, verdict, claim) => ({ id, verdict, claim });

test("the lead the sync writes claims nothing a /compare row marks partial or no", () => {
  const lead = llmsLead(version).join("\n");
  assert.deepEqual(leadOverclaims(lead, rows), []);
  assertLeadHolds(lead, rows);
});

test("the lead names the release it describes and links /compare", () => {
  const lead = llmsLead(version).join("\n");
  assert.ok(lead.startsWith("# PersonalClaw\n"), "llms.txt opens with the project's H1");
  assert.ok(lead.includes(version), `the lead names ${version}`);
  assert.ok(lead.includes("https://personalclaw.dev/compare"), "the lead points at the rows");
});

test("the lead states the update check the telemetry row names, and how to turn it off", () => {
  // The narrower truth, not only the absence of the wider claim: an assistant asked
  // whether PersonalClaw phones home should be able to answer from the lead alone.
  const lead = llmsLead(version).join("\n");
  assert.match(lead, /asks? GitHub whether a newer release exists/);
  assert.ok(lead.includes("`updates.check_enabled`"), "the lead names the setting");
  const telemetry = rows.find((entry) => entry.id === "telemetry");
  const toggle = rows.find((entry) => entry.id === "disable_update_check");
  assert.equal(telemetry?.verdict, "partial");
  assert.equal(toggle?.verdict, "yes");
  assert.ok(toggle.statement.includes("`updates.check_enabled`"), "the setting is the row's");
});

test("the previous lead fails on the telemetry and provider-agnostic rows", () => {
  const findings = leadOverclaims(previousLead, rows);
  const flagged = new Set(findings.map((finding) => finding.row));
  assert.deepEqual([...flagged].sort(), ["provider_agnostic", "telemetry"]);
  const phrases = findings.map((finding) => finding.phrase);
  assert.ok(phrases.includes("Zero telemetry."), "the row's own claim is caught");
  assert.ok(phrases.includes("no telemetry"), "a short form of it is caught");
  assert.ok(phrases.includes("provider-agnostic"));
  assert.throws(
    () => assertLeadHolds(previousLead, rows),
    (error) => {
      assert.match(error.message, /`telemetry` \(partial\)/);
      assert.match(error.message, /`provider_agnostic` \(partial\)/);
      assert.match(error.message, /scripts\/llms-lead\.mjs/);
      return true;
    }
  );
});

test("any partial or no row's own claim fails when the lead restates it", () => {
  // No short form is needed for this: a row added tomorrow is checked by its claim.
  const planted = [
    row("planted_partial", "partial", "Apps run in a hardware-isolated enclave."),
    row("planted_no", "no", "It ships a native Windows build.")
  ];
  const lead = "> Apps run in a hardware-isolated enclave, and it ships a native Windows build.";
  assert.deepEqual(
    leadOverclaims(lead, planted, {}).map((finding) => finding.row),
    ["planted_partial", "planted_no"]
  );
});

test("a claim a yes row holds may be stated", () => {
  const holds = [row("license", "yes", "The code is under a permissive open-source license.")];
  assert.deepEqual(
    leadOverclaims("The code is under a permissive open-source license.", holds, {}),
    []
  );
});

test("matching ignores case, punctuation and hyphenation, but not word boundaries", () => {
  const telemetry = [row("telemetry", "partial", "Zero telemetry.")];
  const forms = { telemetry: ["no telemetry"] };
  for (const text of ["ZERO-TELEMETRY", "zero\ntelemetry", "There is *no* telemetry.", "no‑telemetry"]) {
    assert.equal(leadOverclaims(text, telemetry, forms).length, 1, text);
  }
  for (const text of ["no telemetryd", "nano telemetry", "no usage telemetry", "zero telemetrics"]) {
    assert.deepEqual(leadOverclaims(text, telemetry, forms), [], text);
  }
});

test("every short form belongs to a row that is partial or no", () => {
  assert.deepEqual(staleShortForms(rows), []);
  assert.ok(Object.keys(LEAD_SHORT_FORMS).length > 0, "the vocabulary is not empty");
  assert.ok(LEAD_SHORT_FORMS.telemetry.length > 0, "the telemetry row has short forms");
});

test("a short form goes stale when its row holds or is gone, and the check says so", () => {
  // Both directions, so the vocabulary cannot outlive the verdict it guards: once a row
  // holds at the pinned release, the lead may say it, and the entry has to go.
  const promoted = rows.map((entry) =>
    entry.id === "telemetry" ? { ...entry, verdict: "yes" } : entry
  );
  const stale = staleShortForms(promoted, { telemetry: ["no telemetry"], gone_row: ["x"] });
  assert.equal(stale.length, 2);
  assert.match(stale[0], /telemetry/);
  assert.match(stale[0], /yes/);
  assert.match(stale[1], /gone_row/);
  assert.throws(
    () => assertLeadHolds(llmsLead(version).join("\n"), promoted),
    /LEAD_SHORT_FORMS/
  );
});
