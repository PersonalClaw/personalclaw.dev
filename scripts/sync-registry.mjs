// Sync the community app registry from the pinned core commit, plus one README per
// listed app, into the ignored .generated/registry.json artifact the site renders.
//
//   node scripts/sync-registry.mjs
//
// WHY A SYNC AND NOT A COMMITTED SNAPSHOT: the registry is not this repository's
// content. It is owned by the PersonalClaw project (today at core's
// scratch/registry/app-registry.json; its own schema $id already points at a future
// standalone registry repo). This repository commits no copies of source content —
// the rule stated in README.md and enforced by .gitignore for the docs corpus and
// the release facts. A committed copy is a copy that drifts, and a stale copy of a
// PRE-INSTALL CONSENT SURFACE is worse than a stale marketing sentence: it would show
// a reader permissions and a scan verdict that the registry no longer claims.
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
// THE REGISTRY IS NOT IN THE PINNED RELEASE YET, and that is a state, not an error.
// Core's registry data tier landed on core main on 2026-08-18; the newest core release
// is v0.1.3 (2026-07-30), which this site pins. So `scratch/registry/app-registry.json`
// 404s at the pinned commit. Reading core main instead would publish unreleased core
// content as released state — the exact thing the projection rule forbids. So absence
// is recorded as `availability: "absent-at-pin"` and the page says so plainly. The
// listing surface goes live when the pin moves to a release that contains the registry;
// nothing about it needs to change then.
//
// NEITHER IS THE STORE'S OWN CONSENT COPY, and for the same reason. The Store is the other
// surface a reader meets a listing on, and core owns its wording in
// `web/src/lib/provenance.ts` — a file that also postdates v0.1.3 (and at that tag
// `RegistryPointer` carries none of `maintainer`, `last_validated` or `last_scan_verdict`).
// So `checkStoreConsentParity` records `absent-at-pin` today and starts ENFORCING the
// moment the pin moves to a release carrying both. That is what makes the three strings in
// `src/data/registry.mjs: STORE_CONSENT` an assertion about core rather than a copy of it.
//
// FAIL-OPEN vs FAIL-CLOSED, deliberately split:
//   - the REGISTRY read is fail-closed, EXCEPT for a 404/ENOENT at the pinned commit,
//     which is the documented absence above. Any other read failure, or a registry that
//     does not parse, exits non-zero and stops the build: the site does not publish a
//     consent surface it could not source.
//   - the STORE CONSENT PARITY check is fail-closed on drift and on a wrong path, and
//     absent-at-pin only while the pinned release predates the module. By the same rule as
//     the registry read: the site does not publish a consent surface it cannot show agrees
//     with the product's own.
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

/** The registry's path inside the core repository at the pinned commit. */
const REGISTRY_SOURCE_PATH = "scratch/registry/app-registry.json";

/**
 * Core's module that owns the Store's wording for a registry listing — the OTHER surface a
 * reader meets the same listing on. See `src/data/registry.mjs: STORE_CONSENT` for what is
 * being agreed about and why the public page must not be the more reassuring of the two.
 */
const STORE_CONSENT_SOURCE_PATH = "web/src/lib/provenance.ts";

/**
 * A file that exists whenever the registry DIRECTORY exists at the pinned commit, used
 * only to tell two different failures apart. See `classifyMissingRegistry`.
 */
const REGISTRY_DIRECTORY_SENTINEL = "scratch/registry/app-registry.schema.json";

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
 * Decide WHICH failure a missing registry file is, and fail closed on the wrong one.
 *
 * 🔴 A 404 answers "this path is not in the pinned tree" — and that is true of two
 * completely different situations which must not share a verdict:
 *
 *   1. the pinned release genuinely predates the registry → `absent-at-pin` is correct,
 *      and the page says "not part of this release yet";
 *   2. **this script is looking in the wrong place** → `absent-at-pin` is a LIE.
 *
 * Case 2 was live: this file read `scratch/registry/registry.json`, the name core renamed
 * to `app-registry.json` (ET-4a, 2026-08-27). The rename would have been swallowed
 * silently and permanently — once the core pin moves to a release carrying the registry,
 * the site would keep reporting "not part of this release yet" with the stamped verdicts
 * sitting right there in the source tree. Nothing downstream would notice, because
 * `validate-registry-render.mjs` builds against `tests/fixtures/registry-*.json` and never
 * asserts on the SYNCED artifact.
 *
 * So the two facts get separated by probing a file that exists whenever the registry
 * directory does. Directory present + registry file missing ⇒ our path is wrong ⇒ throw,
 * because a build-configuration bug must not render as a product state.
 *
 * @param {{ readText: (p: string) => Promise<string> }} coreSource
 * @param {string} pinDescription
 * @returns {Promise<{ status: string, reason: string }>}
 */
async function classifyMissingRegistry(coreSource, pinDescription) {
  try {
    await coreSource.readText(REGISTRY_DIRECTORY_SENTINEL);
  } catch (sentinelError) {
    if (isMissingPath(sentinelError)) {
      // Neither the registry nor its directory is there: a genuine absence.
      return {
        status: "absent-at-pin",
        reason: `${REGISTRY_SOURCE_PATH} does not exist in ${pinDescription}.`
      };
    }
    throw sentinelError;
  }
  throw new Error(
    `${REGISTRY_SOURCE_PATH} is missing from ${pinDescription}, but ` +
      `${REGISTRY_DIRECTORY_SENTINEL} IS present — so the registry directory exists and this ` +
      `script is reading the wrong filename. Refusing to record "absent-at-pin", which would ` +
      `render as "not part of this release yet" and hide the registry indefinitely. Update ` +
      `REGISTRY_SOURCE_PATH in scripts/sync-registry.mjs to match core.`
  );
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
 * 🔴 THE SAME TWO-FAILURES-ONE-404 TRAP AS `classifyMissingRegistry`, and the same
 * resolution. A missing module means either:
 *
 *   1. the pinned release predates the Store's registry-listing surface — true today:
 *      `web/src/lib/provenance.ts` is not in v0.1.3, and `RegistryPointer` there carries
 *      none of `maintainer`, `last_validated` or `last_scan_verdict`. There is nothing to
 *      compare against, which is a state; or
 *   2. core MOVED the module, and recording "absent" would retire this check permanently
 *      and silently.
 *
 * The two are separated by whether the REGISTRY is in the pinned tree. A release that
 * carries the registry but not the module that renders its verdicts is not a release that
 * predates the surface — it is a path this script has wrong. So that combination throws.
 *
 * @param {{ readText: (p: string) => Promise<string> }} coreSource
 * @param {string} pinDescription
 * @param {boolean} registryPresent whether the registry itself was readable at the pin
 * @returns {Promise<{ status: string, reason?: string }>}
 */
async function checkStoreConsentParity(coreSource, pinDescription, registryPresent) {
  /** @type {string} */
  let module;
  try {
    module = await coreSource.readText(STORE_CONSENT_SOURCE_PATH);
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    if (registryPresent) {
      throw new Error(
        `${STORE_CONSENT_SOURCE_PATH} is missing from ${pinDescription}, but ` +
          `${REGISTRY_SOURCE_PATH} IS present — so this release publishes a registry and ` +
          `this script cannot find the module that renders its verdicts in the Store. ` +
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
  const pinDescription = `${manifest.sources.core.repository}@${
    manifest.sources.core.tag ?? manifest.sources.core.commit
  }`;

  /** @type {{ status: string, reason?: string }} */
  let availability = { status: "present" };
  /** @type {unknown} */
  let registry = null;
  try {
    registry = JSON.parse(await coreSource.readText(REGISTRY_SOURCE_PATH));
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    // A 404 is not self-explaining — it may mean this script is looking in the wrong place,
    // which must fail closed rather than render as a product state.
    availability = await classifyMissingRegistry(coreSource, pinDescription);
  }

  const storeConsent = await checkStoreConsentParity(
    coreSource,
    pinDescription,
    registry !== null
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
    source: {
      repository: manifest.sources.core.repository,
      commit: manifest.sources.core.commit,
      tag: manifest.sources.core.tag,
      path: REGISTRY_SOURCE_PATH
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
      `${artifact.source.commit.slice(0, 12)}, ${fetched} README(s) fetched, ` +
      `Store consent parity ${storeConsent.status}.`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
