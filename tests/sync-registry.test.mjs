// The registry sync's three decisions: whether the pinned release lists the registry at all,
// whether the registry could be read at its own pin, and whether the Store's consent copy
// has to be there to compare against.
//
// Each is a question about a PINNED TREE, and each has a trap where a missing file answers
// two different questions at once. So each is tested against fake sources with the file
// present, absent, and absent for the other reason, rather than only end to end, where the
// path needs a network or matching checkouts and only ever sees today's pins.

import assert from "node:assert/strict";
import test from "node:test";

import {
  checkStoreConsentParity,
  coreListsRegistry,
  readRegistry
} from "../scripts/sync-registry.mjs";
import { STORE_CONSENT } from "../src/data/registry.mjs";

const REGISTRY = "PersonalClaw/registry";
const PIN = "PersonalClaw/PersonalClaw@v9.9.9-fixture";

/** A missing path, shaped the way both source kinds report one (HTTP 404 and ENOENT). */
function missing(path) {
  return Object.assign(new Error(`not found: ${path}`), { status: 404, code: "ENOENT" });
}

/** A pinned tree holding exactly *files*: every other path is missing. */
function tree(files) {
  return {
    async readText(path) {
      if (Object.hasOwn(files, path)) return files[path];
      throw missing(path);
    }
  };
}

/** A source whose every read fails for a reason that is not a missing path. */
const unreachable = {
  async readText() {
    throw Object.assign(new Error("GitHub request failed (503)"), { status: 503 });
  }
};

const CATALOG = "src/personalclaw/apps/catalog.py";
const seeding = `_REGISTRY_GIT_SOURCE = "https://github.com/${REGISTRY}.git"\n`;
const notSeeding = `_REGISTRY_FILENAME = "app-registry.json"\n`;

// ── does the pinned release's Store list the registry ─────────────────────────────────────

test("a release whose catalog seeds the registry lists it", async () => {
  assert.equal(await coreListsRegistry(tree({ [CATALOG]: seeding }), REGISTRY, PIN), true);
});

test("a release whose catalog reads an index but seeds no registry does not list it", async () => {
  // v0.1.3's shape: the Store reads a source's app-registry.json, and no registry source.
  assert.equal(await coreListsRegistry(tree({ [CATALOG]: notSeeding }), REGISTRY, PIN), false);
});

test("a missing catalog is a wrong path, never 'not in this release'", async () => {
  await assert.rejects(coreListsRegistry(tree({}), REGISTRY, PIN), (error) => {
    assert.match(error.message, /Every release carries core's Store catalog/);
    assert.match(error.message, /CORE_CATALOG_PATH/);
    return true;
  });
});

test("a catalog read that fails for another reason fails the sync", async () => {
  await assert.rejects(coreListsRegistry(unreachable, REGISTRY, PIN), /503/);
});

// ── the registry at its own pin ──────────────────────────────────────────────────────────

const index = JSON.stringify({ apps: [{ name: "fixture-app", repo: "https://github.com/acme/fixture-app" }] });

test("the registry index is read and parsed", async () => {
  const registry = await readRegistry(tree({ "app-registry.json": index }), `${REGISTRY}@0`);
  assert.deepEqual(registry, JSON.parse(index));
});

test("the index missing beside its schema is a wrong filename", async () => {
  const source = tree({ "app-registry.schema.json": "{}" });
  await assert.rejects(readRegistry(source, `${REGISTRY}@0`), (error) => {
    assert.match(error.message, /reading the wrong filename/);
    return true;
  });
});

test("both files missing is a pin that is not the registry repository", async () => {
  await assert.rejects(readRegistry(tree({}), `${REGISTRY}@0`), (error) => {
    assert.match(error.message, /does not pin the registry repository/);
    return true;
  });
});

test("an index that does not parse fails the sync", async () => {
  await assert.rejects(readRegistry(tree({ "app-registry.json": "{not json" }), `${REGISTRY}@0`), SyntaxError);
});

// ── the Store's consent copy ────────────────────────────────────────────────────────────

const MODULE = "web/src/lib/provenance.ts";
const everyPhrase = Object.values(STORE_CONSENT).join("\n");

test("a release that does not list the registry has no consent copy to compare yet", async () => {
  const result = await checkStoreConsentParity(tree({}), PIN, false);
  assert.equal(result.status, "absent-at-pin");
});

test("a release that lists the registry without the module is a wrong path", async () => {
  await assert.rejects(checkStoreConsentParity(tree({}), PIN, true), (error) => {
    assert.match(error.message, /release's Store lists the registry/);
    return true;
  });
});

test("the Store's own words are verified when they are all there", async () => {
  const result = await checkStoreConsentParity(tree({ [MODULE]: everyPhrase }), PIN, true);
  assert.equal(result.status, "verified");
});

test("one phrase the Store no longer says fails the sync", async () => {
  const drifted = everyPhrase.replace(STORE_CONSENT.notEndorsed, "Community-listed");
  await assert.rejects(checkStoreConsentParity(tree({ [MODULE]: drifted }), PIN, true), /notEndorsed/);
});
