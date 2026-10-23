// The site's social card, held to its source and to the ledger (#98).
//
// public/brand/social-preview.png is what a link preview shows of the site, so it is a
// description like any other: it says nothing a /compare row marks `partial` or `no` as if it
// held (the old card said "zero telemetry", which the `telemetry` row marks partial). It is
// rendered from marketing/social-card/card.html by `npm run render:social-card`, which stamps
// the hashes of both, so the PNG that ships is the one the source says. Its colours are the
// coral field and coral ink alone, the one text pair the hard rules allow on coral.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { leadOverclaims } from "../scripts/llms-lead.mjs";
import { CARD_PNG, CARD_SOURCE, CARD_STAMP, sha256 } from "../scripts/render-social-card.mjs";

const rows = JSON.parse(readFileSync(new URL("../src/data/capabilities.json", import.meta.url), "utf8")).rows;
const source = readFileSync(CARD_SOURCE, "utf8");
// src/data/social-card.ts is TypeScript, which a bare node process does not load: its alt text
// is read from the file, one string concatenation.
const SOCIAL_IMAGE_ALT = (() => {
  const file = readFileSync(new URL("../src/data/social-card.ts", import.meta.url), "utf8");
  const body = /export const SOCIAL_IMAGE_ALT =([\s\S]*?);/.exec(file)?.[1] ?? "";
  return [...body.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("");
})();

/** The words the card shows: the source's body text, without its comment or styles. */
function cardText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

test("the card says nothing the ledger says does not hold", () => {
  assert.deepEqual(leadOverclaims(cardText(source), rows), []);
  assert.match(cardText(source), /No analytics, no crash reporting/);
});

test("a card that says zero telemetry fails, as the old one did", () => {
  const old = "an agentic OS for one person · local-first · zero telemetry · MIT";
  assert.deepEqual(
    leadOverclaims(old, rows).map((finding) => finding.row),
    ["telemetry"]
  );
});

test("the committed card is the one its source renders", () => {
  const stamp = JSON.parse(readFileSync(CARD_STAMP, "utf8"));
  assert.equal(stamp.source, sha256(CARD_SOURCE), "card.html changed since the card was rendered: run npm run render:social-card");
  assert.equal(stamp.png, sha256(CARD_PNG), "social-preview.png is not the one its source rendered");
});

test("the card is coral and coral ink, and nothing else", () => {
  const colours = [...new Set(source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])].map((c) => c.toLowerCase());
  assert.deepEqual(colours.sort(), ["#3f1008", "#ff6b5b"]);
  assert.doesNotMatch(source, /gradient\(/i, "no gradient on the field");
});

test("the alt text says what the card shows", () => {
  for (const line of ["One agentic OS. Your machine. Your rules.", "No analytics, no crash reporting"]) {
    assert.ok(cardText(source).includes(line), `the card shows "${line}"`);
    assert.ok(SOCIAL_IMAGE_ALT.includes(line), `the alt text names "${line}"`);
  }
});
