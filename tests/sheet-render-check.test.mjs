// The install-safety sheet's render check (scripts/sheet-render-check.mjs), on planted pages.
//
// Each page is built the way src/pages/registry/[app].astro marks a sheet's fields up: a
// `data-field` per fact, its value in `data-field-value` (a list for several items) or its exact
// no-source line in `data-field-missing`. The check passes on a page that shows what the raw
// source says, and each field's rendering is then broken in turn: the check must fail naming it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { load } from "cheerio";

import { gitBlobSha } from "../scripts/app-sheet.mjs";
import {
  SHEET_FIELDS,
  INSTALL_GATE,
  actionProblems,
  installGateProblems,
  expectedCommunity,
  expectedFirstParty,
  fieldProblems,
  manifestProblems
} from "../scripts/sheet-render-check.mjs";

const manifestText = readFileSync(new URL("./fixtures/first-party/fixture-reaches-hosts.json", import.meta.url), "utf8");
const at = {
  tag: "v0.2.4",
  features: ["chat-trust", "guarded-clients"],
  appsRepositoryUrl: "https://github.com/PersonalClaw/PersonalClawApps",
  appsCommit: "467cda1ae36d00a45e49418a493401fd7e3905d4",
  path: "fixture-reaches-hosts/app.json"
};
const listed = JSON.parse(readFileSync(new URL("./fixtures/registry-listed.json", import.meta.url), "utf8"));
const row = (name) => listed.registry.apps.find((app) => app.name === name);

const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** A sheet's field list, rendered from what its source says. */
function fieldsHtml(expected) {
  return SHEET_FIELDS.map((id) => {
    const want = expected[id];
    let value = want.value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      value = value.startsWith ? `${value.startsWith}, a claim the registry records and does not verify` : `${value.includes}, which is not a signer identity the registry's schema allows`;
    }
    if (value === null && want.names?.length) value = `Needs ${want.names.join(", ")}, which PersonalClaw v0.2.4 does not offer`;
    const dd = value === null
      ? `<dd data-field-missing>${escape(want.missing)}</dd>`
      : Array.isArray(value)
        ? `<dd data-field-value><ul>${value.map((item) => `<li>${escape(item)}</li>`).join("")}</ul></dd>`
        : `<dd data-field-value>${escape(value)}</dd>`;
    return `<div data-field="${id}"><dt>${id}</dt>${dd}</div>`;
  }).join("");
}

const page = (body) => load(`<main><h1>app</h1><dl>${body}</dl></main>`);

test("a first-party sheet that shows what its manifest says passes, and each field broken in turn fails naming it", () => {
  const expected = expectedFirstParty(manifestText, at);
  const html = fieldsHtml(expected);
  assert.deepEqual(fieldProblems(page(html), "fixture", expected), []);
  for (const id of SHEET_FIELDS) {
    const $ = page(html);
    const cell = $(`[data-field="${id}"] dd`);
    if (cell.is("[data-field-missing]")) cell.text("Clean");
    else if (cell.find("li").length) cell.find("li").first().text("something else");
    else cell.text(`${cell.text()} (changed)`);
    const problems = fieldProblems($, "fixture", expected);
    assert.ok(problems.some((problem) => problem.includes(`the ${id} field`)), `${id}: ${problems.join("; ")}`);
  }
});

test("a first-party floor is read from the raw manifest: at or below the release works, above it is named, unreadable is said to be", () => {
  const withFloor = (floor) => JSON.stringify({ ...JSON.parse(manifestText), minPersonalClawVersion: floor });
  assert.equal(expectedFirstParty(withFloor("0.2.3"), at).compatibility.value, "Works with PersonalClaw v0.2.4");
  assert.equal(expectedFirstParty(withFloor("v0.2.4"), at).compatibility.value, "Works with PersonalClaw v0.2.4");
  assert.equal(expectedFirstParty(withFloor("0.3.0"), at).compatibility.value, "Needs PersonalClaw 0.3.0 or later, above v0.2.4");
  assert.equal(expectedFirstParty(withFloor("soon"), at).compatibility.value, "Its version floor, soon, is not a version this site can compare with v0.2.4");
  // A floor the page words as "not declared" fails, naming the field.
  const expected = expectedFirstParty(withFloor("0.2.3"), at);
  const $ = page(fieldsHtml(expected));
  $('[data-field="compatibility"] dd').replaceWith(`<dd data-field-missing>${expected.compatibility.missing}</dd>`);
  assert.match(fieldProblems($, "fixture", expected).join("\n"), /the compatibility field/);
});

test("a community sheet is checked against its raw row, and two rows with different gaps each read 'not recorded' where they lack a field", () => {
  for (const name of ["registry-fixture-clean", "registry-fixture-unscanned"]) {
    const expected = expectedCommunity(row(name), listed.scanner);
    const html = fieldsHtml(expected);
    assert.deepEqual(fieldProblems(page(html), name, expected), [], name);
  }
  const clean = expectedCommunity(row("registry-fixture-clean"), listed.scanner);
  const unscanned = expectedCommunity(row("registry-fixture-unscanned"), listed.scanner);
  assert.notEqual(clean.scanVerdict.value, null);
  assert.equal(unscanned.scanVerdict.value, null, "the unscanned row lacks a verdict the clean row has");
  assert.equal(unscanned.signer.value, null, "the unscanned row makes no signer claim");
  // A gap shown as anything but its exact line fails, naming the field.
  const $ = page(fieldsHtml(unscanned));
  $('[data-field="scanVerdict"] dd').text("Not recorded");
  assert.match(fieldProblems($, "unscanned", unscanned).join("\n"), /the scanVerdict field must read "Not recorded for this listing" exactly/);
});

test("the signer's four states are read from the raw row", () => {
  assert.deepEqual(expectedCommunity(row("registry-fixture-clean"), null).signer.value, { startsWith: "personalclaw-release" });
  assert.equal(expectedCommunity(row("registry-fixture-warning"), null).signer.value, "Unsigned, as the listing declares");
  assert.equal(expectedCommunity(row("registry-fixture-unscanned"), null).signer.value, null);
  assert.deepEqual(expectedCommunity(row("registry-fixture-signer-invalid"), null).signer.value, { includes: "-not a signer!" });
});

test("a manifest panel must show the pinned bytes, which hash to the blob the tree lists", () => {
  const raw = { text: manifestText, treeBlob: gitBlobSha(manifestText) };
  const shown = (text, blob) => load(`<main><pre data-manifest>${escape(text)}</pre><code data-manifest-blob>${blob}</code></main>`);
  assert.deepEqual(manifestProblems(shown(manifestText, raw.treeBlob), "fixture", raw), []);
  assert.match(manifestProblems(shown(manifestText.replace("MIT", "BSD"), raw.treeBlob), "fixture", raw).join("\n"), /not the pinned app.json/);
  assert.match(manifestProblems(shown(manifestText, "0".repeat(40)), "fixture", raw).join("\n"), /hash that is not the pinned tree's/);
});

test("an unsafe or incompatible sheet carries no action and says why; its control carries the steps", () => {
  const steps = '<div data-enable-steps><ol><li>Install it, then switch it on.</li></ol></div>';
  const why = "<p data-no-enable>It is refused.</p>";
  assert.deepEqual(actionProblems(load(`<main>${steps}</main>`), "control", false), []);
  assert.deepEqual(actionProblems(load(`<main>${why}<a href="/compare#install_rescan">The row on Compare: install rescan</a></main>`), "blocked", true), []);
  assert.match(actionProblems(load(`<main>${why}${steps}</main>`), "blocked", true).join("\n"), /shows the enable steps/);
  assert.match(actionProblems(load(`<main>${why}<button disabled>Install</button></main>`), "blocked", true).join("\n"), /carries "Install"/);
  assert.match(actionProblems(load(`<main>${why}<code>personalclaw app install x</code></main>`), "blocked", true).join("\n"), /carries/);
  assert.match(actionProblems(load("<main></main>"), "control", false).join("\n"), /no enable steps/);
});

test("each kind of sheet names the install-time rescan in words true of it, and only those", () => {
  const row = '<p><a href="/compare#install_rescan">Its row on Compare</a></p>';
  const gate = (text, source = row) => load(`<main><section data-decision><p class="install-gate">${text}</p>${source}</section></main>`);
  assert.deepEqual(installGateProblems(gate(INSTALL_GATE.community), "listing", "community"), []);
  assert.deepEqual(installGateProblems(gate(INSTALL_GATE["first-party"]), "app", "first-party"), []);
  // A first-party app is not a listing: the community sentence on its sheet is untrue there.
  assert.match(installGateProblems(gate(INSTALL_GATE.community), "app", "first-party").join("\n"), /first-party/);
  assert.match(installGateProblems(gate(INSTALL_GATE["first-party"]), "listing", "community").join("\n"), /community/);
  assert.match(installGateProblems(load("<main></main>"), "app", "first-party").join("\n"), /names no install-time rescan/);
  assert.match(installGateProblems(gate(INSTALL_GATE["first-party"], ""), "app", "first-party").join("\n"), /does not link its row/);
  for (const sentence of Object.values(INSTALL_GATE)) assert.match(sentence, /rescanned when you install/, "each keeps the Store's job 3");
  assert.doesNotMatch(INSTALL_GATE["first-party"], /listed|endorse/, "the first-party sentence says nothing of listings");
});
