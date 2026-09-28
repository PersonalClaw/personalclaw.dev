// Sync the community app registry, plus one README per listed app, into the ignored
// .generated/registry.json artifact the site renders.
//
//   node scripts/sync-registry.mjs
//
// WHY A SYNC AND NOT A COMMITTED SNAPSHOT: the registry is not this repository's
// content. It is its own repository, PersonalClaw/registry, pinned here by commit in
// sources/personalclaw.sources.json (`data.registry`). This repository commits no copies
// of source content — the rule stated in README.md and enforced by .gitignore for the
// docs corpus and the release facts. A committed copy is a copy that drifts, and a stale
// copy of a PRE-INSTALL CONSENT SURFACE is worse than a stale marketing sentence: it would
// show a reader permissions and a scan verdict that the registry no longer claims. A pin
// is a frozen copy too, which is why scripts/validate-release-parity.mjs fails whenever
// the registry's default branch is not at it.
//
// EGRESS: source resolution is REUSED from sync-sources.mjs, so this reaches the
// network only when no local sibling checkout matches the pin — and then only
// api.github.com and raw.githubusercontent.com, the hosts the existing source and
// docs syncs already use. READMEs are fetched from raw.githubusercontent.com only;
// a listing whose repo is not on GitHub is recorded as un-fetched rather than
// turning an arbitrary community-controlled host into a build-time dependency.
// Nothing is fetched at VIEW time: the site is static and same-origin only
// (tests/browser/support.ts asserts that).
//
// WHAT DECIDES WHETHER THE PAGE LISTS ANYTHING IS THE PINNED CORE RELEASE, not the
// registry. The registry is published continuously; what makes its listings part of
// released PersonalClaw is a release whose Store reads it, which is a release whose
// catalog seeds the registry repository as a git source (`coreListsRegistry`). v0.1.3,
// which this site pins today, reads a source's `app-registry.json` but seeds no registry,
// so its Store lists no community apps. Rendering the registry anyway would publish a
// Store feature the released product does not have — the exact thing the projection rule
// forbids. So that is recorded as `availability: "absent-at-pin"`, the registry is not
// read at all, and the page says so plainly. The listing surface goes live when the core
// pin moves to a release whose Store reads the registry; nothing about it needs to change
// then.
//
// NEITHER IS THE STORE'S OWN CONSENT COPY, and for the same reason. The Store is the other
// surface a reader meets a listing on, and core owns its wording in
// `web/src/lib/provenance.ts` — a file that also postdates v0.1.3 (and at that tag
// `RegistryPointer` carries none of `maintainer`, `last_validated` or `last_scan_verdict`).
// So `checkStoreConsentParity` records `absent-at-pin` today and starts ENFORCING the
// moment the pin moves to a release whose Store lists the registry. That is what makes the
// three strings in `src/data/registry.mjs: STORE_CONSENT` an assertion about core rather
// than a copy of it.
//
// FAIL-OPEN vs FAIL-CLOSED, deliberately split:
//   - the REGISTRY read is fail-closed. Once the pinned release lists the registry, an
//     index that cannot be read at its pin, or that does not parse, exits non-zero and
//     stops the build: the site does not publish a consent surface it could not source.
//     So does a core catalog this script cannot find, because every release has one.
//   - the STORE CONSENT PARITY check is fail-closed on drift and on a wrong path, and
//     absent-at-pin only while the pinned release's Store does not list the registry. By
//     the same rule as the registry read: the site does not publish a consent surface it
//     cannot show agrees with the product's own.
//   - each README fetch is fail-OPEN, per app, with the reason recorded and rendered.
//     A community repository deleting its README, renaming its default branch, or
//     going private must not red the whole website build; and a README is prose, not
//     a security claim. The permissions and the verdict never come from here.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { STORE_CONSENT } from "../src/data/registry.mjs";
import { loadManifest, resolveSource, writeAtomically } from "./sync-sources.mjs";

const root = process.cwd();
const generatedPath = path.join(root, ".generated", "registry.json");

/** The registry's index, at the root of the registry repository. */
const REGISTRY_SOURCE_PATH = "app-registry.json";

/**
 * Core's module that owns the Store's wording for a registry listing — the OTHER surface a
 * reader meets the same listing on. See `src/data/registry.mjs: STORE_CONSENT` for what is
 * being agreed about and why the public page must not be the more reassuring of the two.
 */
const STORE_CONSENT_SOURCE_PATH = "web/src/lib/provenance.ts";

/**
 * A file the registry repository carries beside its index, used only to tell two failures
 * apart when the index is missing. See `readRegistry`.
 */
const REGISTRY_SCHEMA_SENTINEL = "app-registry.schema.json";

/**
 * Core's Store catalog. A release whose Store lists community apps seeds the registry
 * repository as a git source here. See `coreListsRegistry`.
 */
const CORE_CATALOG_PATH = "src/personalclaw/apps/catalog.py";

/** Characters of README kept per listing. See fetchReadme for why there is a cap. */
const README_LIMIT = 96_000;

const githubHeaders = {
  Accept: "application/vnd.github.raw",
  "User-Agent": "personalclaw.dev-registry-sync",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {})
};

/**
 * The GitHub `owner/repo` a registry `repo` URL points at, or null when the URL is
 * not a GitHub repository. Only GitHub is resolvable to a raw README host, so
 * everything else is reported as un-fetched instead of being contacted.
 *
 * @param {string} repositoryUrl
 * @returns {string | null}
 */
export function githubSlug(repositoryUrl) {
  const match = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(
    repositoryUrl.trim()
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

/**
 * Fetch one listed app's README. Never throws: the result records either the text or
 * why there is none, and the per-app page renders that reason.
 *
 * @param {{ name: string, repo: string }} app
 */
async function fetchReadme(app) {
  const slug = githubSlug(app.repo);
  if (!slug) {
    return {
      status: "unsupported-host",
      reason:
        "Only GitHub repositories are read at build time, so this README was not fetched."
    };
  }

  // HEAD, not a pinned commit: the registry records a repository, not a revision, so
  // there is no ref to pin to. The page says so rather than implying the prose was
  // reviewed alongside the listing.
  const url = `https://raw.githubusercontent.com/${slug}/HEAD/README.md`;
  try {
    const response = await fetch(url, { headers: githubHeaders });
    if (!response.ok) {
      return {
        status: "unavailable",
        url,
        reason: `The repository's README could not be read (HTTP ${response.status}).`
      };
    }
    const text = await response.text();
    // Capped: a README is inlined into the generated artifact and then into one static
    // page, and the site holds every route to a transfer budget. A community repository
    // should not be able to blow that budget by writing a very long file.
    return text.length > README_LIMIT
      ? { status: "fetched", url, truncated: true, text: text.slice(0, README_LIMIT) }
      : { status: "fetched", url, truncated: false, text };
  } catch (error) {
    return {
      status: "unavailable",
      url,
      reason: `The repository's README could not be read (${
        error instanceof Error ? error.message : String(error)
      }).`
    };
  }
}

/**
 * Whether a read failure means "this path is not in the pinned tree" rather than
 * "the read went wrong". Remote reads carry the HTTP status (sync-sources.mjs
 * attaches it); a matching local checkout reads from disk and raises ENOENT.
 *
 * @param {unknown} error
 */
function isMissingPath(error) {
  const candidate = /** @type {{ status?: number, code?: string }} */ (error);
  return candidate?.status === 404 || candidate?.code === "ENOENT";
}

/**
 * Whether the pinned core release lists the registry in its Store: its catalog seeds the
 * registry repository as a git source.
 *
 * Read from the catalog's source rather than inferred from a version number, so the answer
 * is a property of the pinned tree and not of a comparison this script would have to keep
 * in step with core's changelog.
 *
 * 🔴 A MISSING CATALOG IS NOT "NOT IN THIS RELEASE". Every release carries core's Store
 * catalog, so a 404 here means this script is reading the wrong path. Recording
 * `absent-at-pin` for it would render "not part of this release yet" and hide the registry
 * indefinitely behind a build-configuration bug, so it throws instead.
 *
 * @param {{ readText: (p: string) => Promise<string> }} coreSource
 * @param {string} registryRepository the registry repository, `owner/name`
 * @param {string} pinDescription
 * @returns {Promise<boolean>}
 */
export async function coreListsRegistry(coreSource, registryRepository, pinDescription) {
  /** @type {string} */
  let catalog;
  try {
    catalog = await coreSource.readText(CORE_CATALOG_PATH);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    throw new Error(
      `${CORE_CATALOG_PATH} is missing from ${pinDescription}. Every release carries core's ` +
        `Store catalog, so this script is reading the wrong path. Refusing to record ` +
        `"absent-at-pin", which would render as "not part of this release yet" and hide the ` +
        `registry indefinitely. Update CORE_CATALOG_PATH in scripts/sync-registry.mjs to ` +
        `match core.`
    );
  }
  return catalog.includes(`"https://github.com/${registryRepository}.git"`);
}

/**
 * The registry index at its pin, parsed. Fail-closed on every miss, and the two misses are
 * told apart so the error names the one to fix: the index missing beside its schema is a
 * filename this script has wrong, and both missing is a pin that is not the registry
 * repository at all.
 *
 * @param {{ readText: (p: string) => Promise<string> }} registrySource
 * @param {string} registryPin `owner/name@commit`
 * @returns {Promise<unknown>}
 */
export async function readRegistry(registrySource, registryPin) {
  /** @type {string} */
  let text;
  try {
    text = await registrySource.readText(REGISTRY_SOURCE_PATH);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    let schemaPresent = true;
    try {
      await registrySource.readText(REGISTRY_SCHEMA_SENTINEL);
    } catch (sentinelError) {
      if (!isMissingPath(sentinelError)) throw sentinelError;
      schemaPresent = false;
    }
    throw new Error(
      schemaPresent
        ? `${REGISTRY_SOURCE_PATH} is missing from ${registryPin}, but ` +
            `${REGISTRY_SCHEMA_SENTINEL} IS present, so this script is reading the wrong ` +
            `filename. Update REGISTRY_SOURCE_PATH in scripts/sync-registry.mjs to match ` +
            `the registry.`
        : `Neither ${REGISTRY_SOURCE_PATH} nor ${REGISTRY_SCHEMA_SENTINEL} is in ` +
            `${registryPin}, so data.registry in sources/personalclaw.sources.json does not ` +
            `pin the registry repository. The site does not publish a consent surface it ` +
            `could not source.`
    );
  }
  return JSON.parse(text);
}

/**
 * Check this site's consent phrasing against the Store's own, at the pinned release.
 *
 * 🔑 WHY THIS IS A CHECK AND NOT A COPY. `src/data/registry.mjs: STORE_CONSENT` holds three
 * strings that are CORE's, not this repository's. Committing them would be exactly the
 * drifting copy of a consent surface this file's header forbids — so they are committed as
 * an ASSERTION about core's module, and this is where the assertion is paid for. Core
 * rewording its non-endorsement then reds this build instead of silently leaving the public
 * page saying something the product no longer says.
 *
 * 🔴 THE SAME TWO-FAILURES-ONE-404 TRAP AS `coreListsRegistry`, and the same
 * resolution. A missing module means either:
 *
 *   1. the pinned release predates the Store's registry-listing surface — true today:
 *      `web/src/lib/provenance.ts` is not in v0.1.3, and `RegistryPointer` there carries
 *      none of `maintainer`, `last_validated` or `last_scan_verdict`. There is nothing to
 *      compare against, which is a state; or
 *   2. core MOVED the module, and recording "absent" would retire this check permanently
 *      and silently.
 *
 * The two are separated by whether the pinned release's Store lists the registry
 * (`coreListsRegistry`). A release whose Store lists it, but that has no module rendering
 * its verdicts, is not a release that predates the surface — it is a path this script has
 * wrong. So that combination throws.
 *
 * @param {{ readText: (p: string) => Promise<string> }} coreSource
 * @param {string} pinDescription
 * @param {boolean} storeListsRegistry whether the pinned release's Store lists the registry
 * @returns {Promise<{ status: string, reason?: string }>}
 */
export async function checkStoreConsentParity(coreSource, pinDescription, storeListsRegistry) {
  /** @type {string} */
  let module;
  try {
    module = await coreSource.readText(STORE_CONSENT_SOURCE_PATH);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    if (storeListsRegistry) {
      throw new Error(
        `${STORE_CONSENT_SOURCE_PATH} is missing from ${pinDescription}, but that ` +
          `release's Store lists the registry, so this script cannot find the module that ` +
          `renders its verdicts in the Store. ` +
          `Refusing to record "absent-at-pin", which would retire the consent-parity ` +
          `check silently. Update STORE_CONSENT_SOURCE_PATH to match core.`
      );
    }
    return {
      status: "absent-at-pin",
      reason:
        `${STORE_CONSENT_SOURCE_PATH} does not exist in ${pinDescription}, so there is ` +
        `no Store consent surface to compare against yet.`
    };
  }

  const drifted = Object.entries(STORE_CONSENT).filter(
    ([, phrase]) => !module.includes(phrase)
  );
  if (drifted.length > 0) {
    throw new Error(
      `${STORE_CONSENT_SOURCE_PATH} at ${pinDescription} no longer contains ` +
        drifted.map(([key, phrase]) => `${key}: "${phrase}"`).join("; ") +
        `. src/data/registry.mjs: STORE_CONSENT claims these are the Store's own words, ` +
        `and this site renders them as such. Re-read core's registryListing() and update ` +
        `STORE_CONSENT — do not relax this check, which is the only thing keeping the ` +
        `public consent surface in step with the Store's.`
    );
  }
  return { status: "verified" };
}

async function main() {
  const manifest = await loadManifest();
  const coreSource = await resolveSource("core", manifest.sources.core);
  const registryPin = manifest.data.registry;
  const pinDescription = `${manifest.sources.core.repository}@${
    manifest.sources.core.tag ?? manifest.sources.core.commit
  }`;

  const storeListsRegistry = await coreListsRegistry(
    coreSource,
    registryPin.repository,
    pinDescription
  );

  /** @type {{ status: string, reason?: string }} */
  let availability = { status: "present" };
  /** @type {unknown} */
  let registry = null;
  if (storeListsRegistry) {
    registry = await readRegistry(
      await resolveSource("registry", registryPin),
      `${registryPin.repository}@${registryPin.commit}`
    );
  } else {
    // The registry exists; the release this site publishes does not list it. It is not
    // read at all, so nothing from it can reach the page.
    availability = {
      status: "absent-at-pin",
      reason: `${pinDescription} does not list ${registryPin.repository} in its Store.`
    };
  }

  const storeConsent = await checkStoreConsentParity(
    coreSource,
    pinDescription,
    storeListsRegistry
  );

  const apps =
    registry !== null && Array.isArray(/** @type {{ apps?: unknown }} */ (registry).apps)
      ? /** @type {{ apps: { name?: unknown, repo?: unknown }[] }} */ (registry).apps
      : [];
  /** @type {Record<string, unknown>} */
  const readmes = {};
  for (const app of apps) {
    // Keyed by name because the per-app page is routed by name. A row too malformed to
    // have a usable name/repo is dropped at render (src/data/registry.mjs) and simply
    // has no README entry.
    if (typeof app?.name !== "string" || typeof app?.repo !== "string") continue;
    readmes[app.name] = await fetchReadme(app);
  }

  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    // Where the listings come from: the registry, at its pin.
    source: {
      repository: registryPin.repository,
      commit: registryPin.commit,
      path: REGISTRY_SOURCE_PATH
    },
    // Which release decided whether they are shown: the core pin.
    release: {
      repository: manifest.sources.core.repository,
      commit: manifest.sources.core.commit,
      tag: manifest.sources.core.tag
    },
    availability,
    registry,
    readmes
  };

  await writeAtomically(generatedPath, `${JSON.stringify(artifact, null, 2)}\n`);
  const fetched = Object.values(readmes).filter(
    (entry) => /** @type {{ status: string }} */ (entry).status === "fetched"
  ).length;
  console.log(
    `Generated ${path.relative(root, generatedPath)}: registry ${availability.status}, ` +
      `${apps.length} listing(s) from ${artifact.source.repository}@` +
      `${artifact.source.commit.slice(0, 12)} (${pinDescription} ` +
      `${storeListsRegistry ? "lists" : "does not list"} it), ${fetched} README(s) fetched, ` +
      `Store consent parity ${storeConsent.status}.`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
