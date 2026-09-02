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
// FAIL-OPEN vs FAIL-CLOSED, deliberately split:
//   - the REGISTRY read is fail-closed, EXCEPT for a 404/ENOENT at the pinned commit,
//     which is the documented absence above. Any other read failure, or a registry that
//     does not parse, exits non-zero and stops the build: the site does not publish a
//     consent surface it could not source.
//   - each README fetch is fail-OPEN, per app, with the reason recorded and rendered.
//     A community repository deleting its README, renaming its default branch, or
//     going private must not red the whole website build; and a README is prose, not
//     a security claim. The permissions and the verdict never come from here.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadManifest, resolveSource, writeAtomically } from "./sync-sources.mjs";

const root = process.cwd();
const generatedPath = path.join(root, ".generated", "registry.json");

/** The registry's path inside the core repository at the pinned commit. */
const REGISTRY_SOURCE_PATH = "scratch/registry/app-registry.json";

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

async function main() {
  const manifest = await loadManifest();
  const coreSource = await resolveSource("core", manifest.sources.core);

  /** @type {{ status: string, reason?: string }} */
  let availability = { status: "present" };
  /** @type {unknown} */
  let registry = null;
  try {
    registry = JSON.parse(await coreSource.readText(REGISTRY_SOURCE_PATH));
  } catch (error) {
    if (!isMissingPath(error)) throw error;
    availability = {
      status: "absent-at-pin",
      reason:
        `${REGISTRY_SOURCE_PATH} does not exist in ` +
        `${manifest.sources.core.repository}@${manifest.sources.core.tag ?? manifest.sources.core.commit}.`
    };
  }

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
      `${artifact.source.commit.slice(0, 12)}, ${fetched} README(s) fetched.`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
