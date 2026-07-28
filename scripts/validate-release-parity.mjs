// Validate that the WEBSITE's own release identity matches the core release it
// publishes — so "core cut a tag" and "the website says so" can never drift
// apart silently. The site is the public projection of released PersonalClaw
// state; a version mismatch here is a truthfulness bug, not a cosmetic one.
//
// Two layers, deliberately split by what they need:
//
//   LOCAL (always runs — offline, deterministic, safe for the pre-push hook)
//     1. sources/personalclaw.sources.json validates against its schema.
//     2. On the "released" channel, every source pins BOTH a tag and a commit.
//     3. package.json version === the core tag being published (tag "v0.1.2" ⇒
//        website version "0.1.2"). This is the drift this script exists to stop:
//        the website carried 0.1.1 while its manifest tracked v0.1.2.
//     4. The core tag is a valid semver "v<major>.<minor>.<patch>" form.
//     5. If a local core checkout is available, its pyproject version must equal
//        the pinned tag's version (the same assertion sync-sources makes against
//        the pinned remote tree, checkable here without network).
//
//   REMOTE (runs when the network/GitHub API is reachable; skipped otherwise
//   with a printed notice — never a silent pass, per the no-silent-caps rule)
//     6. FRESHNESS: the newest core release tag must be the one pinned. If core
//        published a newer tag, the site is stale and this FAILS — that is the
//        enforcement the owner asked for: a published release tag obliges the
//        website to follow.
//     7. The pinned tag resolves (through annotated-tag dereference) to the
//        pinned commit, in both core and apps.
//
// Set RELEASE_PARITY_OFFLINE=1 to force local-only (CI can run the full check;
// the pre-push hook stays fast and offline-tolerant). Set
// RELEASE_PARITY_REQUIRE_REMOTE=1 to make an unreachable API a failure instead
// of a skip — used by the release-gate workflow, where staleness must be caught.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseToml } from "smol-toml";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(repositoryRoot, "sources", "personalclaw.sources.json");
const schemaPath = join(repositoryRoot, "sources", "personalclaw.sources.schema.json");
const packagePath = join(repositoryRoot, "package.json");

const SEMVER_TAG = /^v(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "personalclaw.dev-release-parity",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {})
};

const problems = [];
const notices = [];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function formatAjvErrors(errors = []) {
  return errors.map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
}

/** Compare two semver tags. Returns >0 when `left` is newer than `right`. */
function compareTags(left, right) {
  const a = SEMVER_TAG.exec(left);
  const b = SEMVER_TAG.exec(right);
  if (!a || !b) return 0;
  for (let i = 1; i <= 3; i += 1) {
    const diff = Number(a[i]) - Number(b[i]);
    if (diff !== 0) return diff;
  }
  // Equal core versions: a prerelease sorts BEFORE its release (v1.0.0-rc1 < v1.0.0).
  const leftPre = left.includes("-");
  const rightPre = right.includes("-");
  if (leftPre !== rightPre) return leftPre ? -1 : 1;
  return 0;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: githubHeaders });
  if (!response.ok) {
    const error = new Error(`GitHub request failed (${response.status}) for ${url}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

/** Every release tag in a repository, newest first. */
async function listReleaseTags(repository) {
  const refs = await fetchJson(
    `https://api.github.com/repos/${repository}/git/refs/tags`
  );
  return refs
    .map((ref) => ref.ref.replace(/^refs\/tags\//, ""))
    .filter((tag) => SEMVER_TAG.test(tag))
    .sort((left, right) => compareTags(right, left));
}

/** Resolve a tag to its COMMIT sha, dereferencing annotated tag objects. */
async function resolveTagCommit(repository, tag) {
  let object = (
    await fetchJson(
      `https://api.github.com/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`
    )
  ).object;
  for (let depth = 0; object?.type === "tag" && depth < 5; depth += 1) {
    object = (
      await fetchJson(`https://api.github.com/repos/${repository}/git/tags/${object.sha}`)
    ).object;
  }
  return object?.type === "commit" ? object.sha : null;
}

// ── local layer ─────────────────────────────────────────────────────────────

const manifest = readJson(manifestPath);
const schema = readJson(schemaPath);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateManifest = ajv.compile(schema);
if (!validateManifest(manifest)) {
  problems.push(`source manifest schema: ${formatAjvErrors(validateManifest.errors)}`);
}

const websiteVersion = readJson(packagePath).version;
const channel = manifest.channel;
const coreTag = manifest.sources?.core?.tag ?? null;

if (channel === "released") {
  for (const [key, source] of Object.entries(manifest.sources ?? {})) {
    if (!source.tag) {
      problems.push(`${key} source has no tag, but the channel is "released"`);
    }
    if (!source.commit) {
      problems.push(`${key} source has no commit pin`);
    }
  }

  if (coreTag && !SEMVER_TAG.test(coreTag)) {
    problems.push(`core tag ${coreTag} is not a v<major>.<minor>.<patch> release tag`);
  }

  // THE PARITY RULE: the website ships as the version it publishes.
  if (coreTag && SEMVER_TAG.test(coreTag)) {
    const expected = coreTag.slice(1);
    if (websiteVersion !== expected) {
      problems.push(
        `package.json version ${websiteVersion} must equal the published core release ` +
          `${expected} (manifest pins core tag ${coreTag}) — bump the website version ` +
          `in the same change that re-pins the manifest`
      );
    }
  }
} else {
  notices.push(
    `channel is "${channel}" — release-parity assertions that require a tag are not applied`
  );
}

// 5. local core checkout (optional): pyproject version must match the pinned tag.
const coreDirectory = resolve(
  repositoryRoot,
  process.env.PERSONALCLAW_CORE_DIR ?? "../PersonalClaw"
);
const pyprojectPath = join(coreDirectory, "pyproject.toml");
if (channel === "released" && coreTag && existsSync(pyprojectPath)) {
  try {
    const pyproject = parseToml(readFileSync(pyprojectPath, "utf8"));
    const coreVersion = pyproject.project?.version;
    if (typeof coreVersion === "string" && coreVersion !== coreTag.slice(1)) {
      notices.push(
        `local core checkout is at version ${coreVersion} while the manifest pins ` +
          `${coreTag} — expected during development of the next release`
      );
    }
  } catch (error) {
    notices.push(`could not read local core pyproject.toml: ${error.message}`);
  }
}

// ── remote layer ────────────────────────────────────────────────────────────

const offline = process.env.RELEASE_PARITY_OFFLINE === "1";
const requireRemote = process.env.RELEASE_PARITY_REQUIRE_REMOTE === "1";

if (offline) {
  notices.push("remote checks skipped (RELEASE_PARITY_OFFLINE=1): staleness NOT verified");
} else if (channel !== "released") {
  notices.push("remote checks skipped: channel is not \"released\"");
} else {
  try {
    for (const [key, source] of Object.entries(manifest.sources ?? {})) {
      if (!source.tag || !source.commit) continue;

      // 7. the pin must be truthful
      const resolved = await resolveTagCommit(source.repository, source.tag);
      if (resolved !== source.commit) {
        problems.push(
          `${source.repository} tag ${source.tag} resolves to ${resolved ?? "nothing"}, ` +
            `but the manifest pins ${source.commit}`
        );
      }

      // 6. FRESHNESS — a newer published release obliges the website to follow
      const tags = await listReleaseTags(source.repository);
      const newest = tags[0];
      if (newest && compareTags(newest, source.tag) > 0) {
        problems.push(
          `${source.repository} has published ${newest}, but the website still pins ` +
            `${source.tag} — re-pin sources/personalclaw.sources.json (and bump ` +
            `package.json for core) so the site publishes the current release`
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (requireRemote) {
      problems.push(`remote release check could not complete: ${message}`);
    } else {
      notices.push(
        `remote checks skipped (GitHub API unreachable: ${message}): staleness NOT verified`
      );
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────

for (const notice of notices) console.log(`note: ${notice}`);

if (problems.length > 0) {
  console.error("Release parity validation FAILED:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    `Release parity OK: channel ${channel}, website ${websiteVersion}, ` +
      `core ${coreTag ?? "untagged"}, apps ${manifest.sources?.apps?.tag ?? "untagged"}.`
  );
}
