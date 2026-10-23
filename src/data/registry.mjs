// The community app registry as this website renders it.
//
// This module is the ONE normalizer. The pages render it, tests/support/site-contract.mjs
// derives the per-app route set from it, and scripts/validate-registry-render.mjs checks
// it. A second parser would be a second place for a pre-install consent surface to
// disagree with itself.
//
// Its input is .generated/registry.json, written by scripts/sync-registry.mjs from the
// registry repository at its pinned commit and gitignored (see that script for why
// nothing is committed, and for why the pinned core release decides what is shown).
//
// WHAT THIS SURFACE PROMISES A READER, and therefore what the rules below protect:
//
//   1. Permissions are the registry's `permissions_declared`, rendered VERBATIM. They
//      are never summarised, grouped, scored, or translated into a friendlier word.
//      The reader is deciding whether to trust an app; a paraphrase is a claim the
//      registry did not make.
//   2. An ABSENT scan verdict is not a passing one. `last_scan_verdict` is optional and
//      CI-owned, so most listings legitimately have none — and "no scan on record" must
//      be visibly distinct from "clean", never merely quieter. Only the exact value
//      "clean" is presented as passing; anything unrecognised is presented as blocking.
//   3. No trust signal is invented. Every field on the page is a registry field.
//   4. A row this file cannot read is NOT rendered, and the page says how many it
//      dropped. Fail-closed, but never silently: a swallowed row is an app that exists
//      and is not shown, which the reader would have no way to know.
//   5. This page says no LESS than the Store says about the same listing. See
//      STORE_CONSENT below — the Store is the other surface a reader meets this listing
//      on, and the public one must not be the more reassuring of the two.

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  COMPOSED_KEYS,
  DESCRIBE_KEYS,
  NOT_DECLARED,
  NOT_RECORDED,
  inheritsSentence
} from "../../scripts/app-sheet.mjs";

// The two synced artifacts a registry page reads. scripts/registry-probe.mjs names a folder of
// its own for a fixture build (PERSONALCLAW_REGISTRY_ARTIFACTS), so a probe never rewrites the
// live ones another process may be reading.

/** The value a command line gives `--outDir`, as `--outDir <dir>` or `--outDir=<dir>`. */
function outDirOf(argv) {
  const at = argv.indexOf("--outDir");
  if (at !== -1) return argv[at + 1];
  return argv.find((arg) => arg.startsWith("--outDir="))?.slice("--outDir=".length);
}

/**
 * The folder the registry artifacts are read from: `.generated/`, or the fixture probe's own.
 * The override is the probe's alone (scripts/registry-probe.mjs builds into a folder of its own
 * with `--outDir`), so it is refused on a deploy (`VERCEL` or `VERCEL_ENV` set) and for any build
 * that writes the real `dist`: a variable set by mistake must fail the build, never publish
 * fixture sheets on the live site.
 *
 * @param {{ env?: Record<string, string | undefined>, argv?: string[], cwd?: string }} [context]
 */
export function registryArtifactsDir({ env = process.env, argv = process.argv, cwd = process.cwd() } = {}) {
  const override = env.PERSONALCLAW_REGISTRY_ARTIFACTS;
  if (!override) return path.join(cwd, ".generated");
  if (env.VERCEL || env.VERCEL_ENV) {
    throw new Error("PERSONALCLAW_REGISTRY_ARTIFACTS is set on a deploy (VERCEL or VERCEL_ENV): it is for the fixture probe alone");
  }
  const outDir = outDirOf(argv);
  if (!outDir || path.resolve(cwd, outDir) === path.resolve(cwd, "dist")) {
    throw new Error("PERSONALCLAW_REGISTRY_ARTIFACTS is set for a build that writes the real dist: it is for the fixture probe's own --outDir alone");
  }
  return override;
}

const artifactsDir = registryArtifactsDir();
const artifactPath = path.join(artifactsDir, "registry.json");
const sheetsArtifactPath = path.join(artifactsDir, "app-sheets.json");

/** @type {ReturnType<typeof buildListing> | null} */
let cached = null;

/**
 * ── PARITY WITH THE STORE'S OWN CONSENT COPY ───────────────────────────────────────────
 *
 * A reader meets a community listing TWICE: here, before they have the product, and in
 * the Store, at the moment they install. Core owns the Store's wording for exactly this
 * in one module — `web/src/lib/provenance.ts`, `registryListing()` — and states three
 * non-negotiable jobs for presenting a registry listing, in this order:
 *
 *   1. LEAD WITH THE NON-ENDORSEMENT, not the reassurance. Core's words: "a reader who
 *      stops after four words must have read 'community-listed', not 'clean'".
 *   2. ATTRIBUTE THE VERDICT — "registry check", never a bare "Verified"/"Scanned", and
 *      never PersonalClaw's voice. The check was the REGISTRY's, of the LISTING at that
 *      moment, not of the bytes about to be installed.
 *   3. POINT AT THE REAL GATE — the install-time rescan. That is the sentence that makes
 *      a stale or absent verdict harmless: the number that matters arrives later.
 *
 * 🔴 THIS PAGE DID NONE OF THE THREE. It rendered a bare green "Clean" badge, a detail
 * written in PersonalClaw's own voice ("The last recorded scan found nothing."), and said
 * nothing about the install-time rescan anywhere. So the PUBLIC surface was the more
 * reassuring of the two — trust-washing, in the one place a reader is deciding whether to
 * run a stranger's code, and the exact defect core centralised its module to prevent.
 *
 * The three strings below are CORE's, used verbatim so the agreement is byte-checkable
 * rather than argued: scripts/sync-registry.mjs reads core's module at the pinned release
 * and fails the build when they have drifted. They are therefore not the kind of committed
 * copy README.md forbids — they are an assertion about core's copy, and the assertion is
 * checked on every sync.
 */
export const STORE_CONSENT = {
  /** Job 1. Core's `NOT_ENDORSED`. */
  notEndorsed: "Community-listed, not endorsed",
  /** Job 2. Core's attribution prefix, from `registry check: ${verdict}`. */
  verdictAttribution: "registry check:",
  /** Job 3. Core's unconditional closing clause. */
  installGate: "rescanned when you install"
};

/**
 * Job 3 as a sentence this page can render. Unconditional on purpose: it is true whether
 * or not the registry recorded anything, and it is what makes an absent verdict safe to
 * show at all.
 */
export const INSTALL_GATE_SENTENCE =
  "PersonalClaw does not review or endorse listed apps. It runs its own scan of the " +
  `actual code instead: every listed app is ${STORE_CONSENT.installGate}, and that scan ` +
  "is what can stop an install.";

/**
 * Job 3 on a first-party sheet. A first-party app is not a listing, so the community sentence's
 * "does not review or endorse listed apps" is not true of it; the rescan is. The closing clause
 * stays the Store's.
 */
export const FIRST_PARTY_INSTALL_GATE_SENTENCE =
  "PersonalClaw runs its own scan of the actual code of every app it installs: this one is " +
  `${STORE_CONSENT.installGate}, and that scan is what can stop an install.`;

/**
 * The verdict values the registry schema defines. Everything outside this set — a typo,
 * a value added by a newer registry than this build knows about, a hand-edited row — is
 * presented as blocking, because the alternative is presenting an unknown string as if
 * it were reassuring.
 *
 * Every `detail` for a RECORDED verdict opens with `STORE_CONSENT.verdictAttribution`
 * (job 2). The two branches below it — no verdict, unreadable verdict — deliberately do
 * NOT, because prefixing them would claim a check happened when none did.
 */
const VERDICT_PRESENTATION = {
  clean: {
    key: "clean",
    label: "Clean",
    tone: "pass",
    detail:
      "registry check: clean — the registry's own last look at this listing found nothing."
  },
  low: {
    key: "low",
    label: "Low",
    tone: "caution",
    detail:
      "registry check: low — the registry's own last look raised low-severity findings."
  },
  warning: {
    key: "warning",
    label: "Warning",
    tone: "caution",
    detail:
      "registry check: warning — the registry's own last look raised findings worth " +
      "reading before installing."
  },
  dangerous: {
    key: "dangerous",
    label: "Dangerous",
    tone: "blocked",
    detail:
      "registry check: dangerous — the registry's own last look found dangerous " +
      "behaviour. Do not install this."
  }
};

const UNSCANNED = {
  key: "unscanned",
  label: "No scan on record",
  tone: "unscanned",
  detail:
    "No registry check is on record for this listing. It has not been reviewed — treat it as unscanned, not as clean."
};

/**
 * How to present a listing's `last_scan_verdict`.
 *
 * @param {unknown} verdict the raw registry value, which is legitimately absent
 */
export function verdictPresentation(verdict) {
  if (verdict === undefined || verdict === null) return UNSCANNED;
  if (typeof verdict === "string" && verdict in VERDICT_PRESENTATION) {
    return VERDICT_PRESENTATION[/** @type {keyof VERDICT_PRESENTATION} */ (verdict)];
  }
  return {
    key: "unrecognised",
    label: "Unrecognised verdict",
    tone: "blocked",
    detail:
      "The registry recorded a scan verdict this site does not recognise. It is not a pass."
  };
}

/**
 * The verdict vocabulary, for the legend on /registry.
 *
 * 🔑 DERIVED, not re-typed. This list used to be a hand-written array in
 * src/pages/registry.astro that restated every verdict's copy independently of the map
 * above — a second place for the verdict wording to live, in the module whose own header
 * says "a second parser would be a second place for a pre-install consent surface to
 * disagree with itself". Changing one and not the other would have shown a reader a
 * legend that did not describe the badges beside it.
 *
 * `low` and `warning` share a row because they share a tone; the row's detail is
 * `warning`'s, which is the stronger of the two and therefore the safe one to generalise.
 */
export const VERDICT_LEGEND = [
  verdictPresentation("clean"),
  {
    ...verdictPresentation("warning"),
    label: `${verdictPresentation("low").label} / ${verdictPresentation("warning").label}`
  },
  verdictPresentation("dangerous"),
  verdictPresentation(undefined)
];

/** The site path for one listing. */
export function registryAppPath(name) {
  return `/registry/${name}`;
}

/**
 * @param {unknown} value
 * @returns {value is string[]}
 */
function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Read one registry row, or say why it cannot be read.
 *
 * The checks are structural — enough to know the row is renderable and that its
 * security-relevant fields are really the shapes the schema promises. The registry
 * repository's own CI (its validate_registry.py) owns semantic validation such as the
 * capability-type enum; re-deriving that list here would be a second copy of it.
 *
 * @param {unknown} row
 * @param {number} index
 */
function readRow(row, index, reserved = new Set()) {
  const reject = (reason) => ({ app: null, problem: { index, reason } });

  if (typeof row !== "object" || row === null) return reject("the entry is not an object");
  const entry = /** @type {Record<string, unknown>} */ (row);

  // Kebab-case, per the schema, and load-bearing beyond validation: the name is the
  // per-app URL segment, so a row with a name outside this shape must not mint a route.
  if (typeof entry.name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) {
    return reject("the app name is missing or is not kebab-case");
  }
  const name = entry.name;
  // A first-party app's name is that app's route (/registry/<name>), so a community row that
  // takes one gets no card and no sheet. The registry's own look-alike rule is what refuses it.
  if (reserved.has(name)) {
    return reject(`${name}: the name is a first-party app's, so its route is that app's sheet`);
  }

  if (typeof entry.repo !== "string" || !entry.repo.startsWith("https://")) {
    return reject(`${name}: the repository URL is missing or is not https`);
  }
  if (!isStringArray(entry.types) || entry.types.length === 0) {
    return reject(`${name}: the declared capability types are missing`);
  }
  // Not "missing or empty": an app declaring NO permissions is a real, and the best
  // possible, listing. Only a wrong shape is a problem.
  if (!isStringArray(entry.permissions_declared)) {
    return reject(`${name}: the declared permissions are not a list of names`);
  }
  if (!nonEmptyString(entry.license)) return reject(`${name}: the license is missing`);
  if (!nonEmptyString(entry.maintainer)) return reject(`${name}: the maintainer is missing`);
  if (!nonEmptyString(entry.added)) return reject(`${name}: the added date is missing`);

  return {
    problem: null,
    app: {
      kind: "community",
      name,
      repo: entry.repo,
      types: entry.types,
      permissions: entry.permissions_declared,
      license: entry.license,
      maintainer: entry.maintainer,
      added: entry.added,
      lastValidated: nonEmptyString(entry.last_validated)
        ? /** @type {string} */ (entry.last_validated)
        : null,
      verdict: verdictPresentation(entry.last_scan_verdict),
      // The registry's own word, verbatim, for the sheet's scan field.
      verdictRecorded: typeof entry.last_scan_verdict === "string" ? entry.last_scan_verdict : null,
      signer: signerClaim(entry),
      path: registryAppPath(name)
    }
  };
}

/** The registry schema's signer identity: what a PersonalClaw trust store names a signer by. */
const SIGNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * A row's `signer` in its four states. It is a CLAIM the registry records and does not verify:
 * signatures are checked at install on the owner's own machine. Omitted is "no claim", which is a
 * different fact from a declared `unsigned`, and a value outside the schema's shape is shown as
 * an invalid claim rather than as a signer.
 *
 * @param {Record<string, unknown>} entry
 * @returns {{ state: "named" | "unsigned" | "omitted" | "invalid", value: string | null }}
 */
export function signerClaim(entry) {
  if (!Object.hasOwn(entry, "signer")) return { state: "omitted", value: null };
  const value = entry.signer;
  if (value === "unsigned") return { state: "unsigned", value };
  if (typeof value === "string" && SIGNER_PATTERN.test(value)) return { state: "named", value };
  return { state: "invalid", value: typeof value === "string" ? value : JSON.stringify(value) };
}

/**
 * Normalize a raw registry document into what the pages render.
 *
 * @param {unknown} registry the `{ apps: [...] }` document
 */
export function normalizeRegistry(registry, reserved = new Set()) {
  const rows =
    typeof registry === "object" && registry !== null && Array.isArray(
      /** @type {Record<string, unknown>} */ (registry).apps
    )
      ? /** @type {unknown[]} */ (/** @type {Record<string, unknown>} */ (registry).apps)
      : null;

  if (rows === null) {
    return {
      apps: [],
      problems: [{ index: -1, reason: "the registry document has no `apps` list" }]
    };
  }

  const apps = [];
  const problems = [];
  for (const [index, row] of rows.entries()) {
    const { app, problem } = readRow(row, index, reserved);
    if (app) apps.push(app);
    else if (problem) problems.push(problem);
  }
  // Alphabetical, so the order on the page is a property of the data rather than of
  // whatever order a registry pull request happened to append in.
  apps.sort((left, right) => left.name.localeCompare(right.name));
  return { apps, problems };
}

/**
 * THREE STATES, rendered differently on purpose. Collapsing any pair of them would make
 * the page lie by omission:
 *
 *   absent-at-pin  the released core this site is generated from does not list the
 *                  registry in its Store (true of v0.1.3, which predates it), so the
 *                  registry is not read at all. "There is no registry here yet."
 *   empty          the registry exists and lists nothing. "The registry is open and
 *                  nothing has been accepted into it yet."
 *   listed         one or more listings. Cards.
 *
 * The first two look identical if you only count cards, which is exactly how a
 * generator written against today's registry ships broken and tests clean.
 */
function buildListing(artifact, reserved = new Set()) {
  const available = (artifact.availability?.status ?? "present") === "present";
  const { apps, problems } = available
    ? normalizeRegistry(artifact.registry, reserved)
    : { apps: [], problems: [] };
  return {
    source: artifact.source,
    release: artifact.release,
    generatedAt: artifact.generatedAt,
    availability: artifact.availability ?? { status: "present" },
    state: !available ? "absent-at-pin" : apps.length === 0 ? "empty" : "listed",
    apps,
    problems,
    scanner: artifact.scanner ?? null
  };
}

/**
 * The synced registry listing.
 *
 * Throws when the artifact is absent. That is deliberate: a missing artifact would
 * otherwise render an empty page that looks exactly like an empty registry, and every
 * check over it would pass while measuring nothing.
 */
export function registryListing() {
  if (cached) return cached;
  let raw;
  try {
    raw = readFileSync(artifactPath, "utf8");
  } catch {
    throw new Error(
      `Missing ${path.relative(process.cwd(), artifactPath)}. Run \`npm run sync\` ` +
        `(scripts/sync-registry.mjs) before building: an absent registry artifact ` +
        `renders identically to an empty registry, so it must fail instead.`
    );
  }
  cached = buildListing(JSON.parse(raw), firstPartyNames());
  return cached;
}

/** The first-party apps' names at the pinned release, which no community row may take. */
function firstPartyNames() {
  try {
    return new Set(JSON.parse(readFileSync(sheetsArtifactPath, "utf8")).sheets.map((sheet) => sheet.name));
  } catch {
    return new Set();
  }
}

/** Whether the registry artifact has been synced yet. */
export function registryArtifactExists() {
  try {
    readFileSync(artifactPath);
    return true;
  } catch {
    return false;
  }
}

// ── THE INSTALL-SAFETY SHEET ──────────────────────────────────────────────────────────────
//
// One sheet per app at /registry/<name>, for both kinds: every first-party app the pinned apps
// release ships (.generated/app-sheets.json, scripts/sync-sources.mjs) and every readable
// community listing. The rules above hold for every field, and two more:
//
//   - A FIELD WITH NO SOURCE SAYS SO, in one of three fixed lines (NOT_RECORDED for a community
//     row, NOT_DECLARED for a first-party manifest, NO_SCAN_PUBLISHED for a first-party app's
//     scan fields). It is never omitted and never inferred. scripts/validate-registry-render.mjs
//     holds each field to its raw source, or to its exact line.
//   - THE ENABLE STEPS ARE THE SHEET'S ONE ACTION, and an unsafe or incompatible sheet has none.
//     Unsafe is the blocked tone (a dangerous or unrecognised verdict); incompatible is core's
//     compatibility rule failing at the pinned release.
//
// A community row with a first-party app's name gets no sheet: the name is the first-party
// app's route, and the registry's own look-alike rule is what refuses such a row. It is dropped
// and counted, with its reason, like an unreadable row.

/** A first-party app's scan fields: PersonalClaw publishes no scan of its own apps. */
export const NO_SCAN_PUBLISHED = "No scan is published before install";

/** How a first-party sheet presents its scan, beside a community listing's attributed verdict. */
export const FIRST_PARTY_SCAN = {
  key: "none-before-install",
  label: "No scan on record before install",
  tone: "unscanned",
  // One sentence: the install-time rescan beside it (FIRST_PARTY_INSTALL_GATE_SENTENCE) says
  // which scan can stop the install.
  detail: "PersonalClaw publishes no scan of its own apps before you install one."
};

/** The verification-ledger rows (src/data/capabilities.json) the sheet's sequence rests on. */
export const SHEET_CLAIMS = [
  "install_rescan",
  "dangerous_refused",
  "consent_bound_to_review",
  "secrets_in_credential_store"
];

/** The sheet's evidence panels, in order. The first is the default. */
export const EVIDENCE_PANELS = [
  { id: "manifest", label: "Manifest" },
  { id: "scan", label: "Scan record" },
  { id: "claims", label: "Claims and evidence" }
];

/** The plain heading for each describe() key the sheet shows, in describe()'s order. */
const DECLARATION_LABELS = {
  permissions: "Permissions it is granted",
  crons: "Scheduled jobs",
  pythonDependencies: "Python packages installed for it",
  sidecarDependencies: "Engine packages it can install",
  requires: "What it needs that PersonalClaw does not install",
  launches: "Programs on this machine it starts",
  npmPackages: "npm packages installed for it",
  writes: "Places outside its folder it writes",
  hasUI: "Pages it adds to the dashboard",
  uiComponents: "Components it adds to the dashboard",
  hasBackend: "A server process of its own",
  backendSandbox: "The sandbox tier its server runs in",
  providers: "Provider modules the gateway loads",
  onInstall: "Command run after install",
  onUpdate: "Command run after an update",
  onEnable: "Command run when it is switched on",
  onDisable: "Command run when it is switched off",
  onUninstall: "Command run before it is removed",
  cliSetup: "What it runs for personalclaw setup",
  cliDoctor: "What it runs for personalclaw doctor",
  sources: "Connector sources it parses",
  mcpServers: "MCP servers it adds",
  skills: "Skills it installs"
};

/** @type {{ release: { version: string, tag: string, commit: string }, sheets: any[], dropped: { name: string, reason: string }[] } | null} */
let sheetsCache = null;

function readSheetsArtifact() {
  try {
    return JSON.parse(readFileSync(sheetsArtifactPath, "utf8"));
  } catch {
    throw new Error(
      `Missing ${path.relative(process.cwd(), sheetsArtifactPath)}. Run \`npm run sync\` ` +
        `(scripts/sync-sources.mjs) before building: without it no first-party app has a sheet, ` +
        `and a sheet set short of the release is not an empty one.`
    );
  }
}

/** A field on the sheet: its value, or the exact line that says it has no source. */
const field = (id, label, value, missing) => ({
  id,
  label,
  value: value === undefined || value === null || (Array.isArray(value) && value.length === 0) ? null : value,
  missing
});

const NETWORK_WORDS = {
  on: "On. Its own network permission is a declaration, not a fence.",
  off: "Off. Its own network permission is a declaration, not a fence.",
  "not-declared": NOT_DECLARED
};

function compatibilityWords(compatibility, release) {
  if (compatibility.compatible) return `Works with PersonalClaw ${release.tag}`;
  if (compatibility.missing.length > 0) {
    return `Needs ${compatibility.missing.join(", ")}, which PersonalClaw ${release.tag} does not offer`;
  }
  if (compatibility.reason === "floor-above") {
    return `Needs PersonalClaw ${compatibility.floor} or later, above ${release.tag}`;
  }
  return `Its version floor, ${compatibility.floor}, cannot be read, so PersonalClaw ${release.tag} refuses it`;
}

function signerWords(signer) {
  switch (signer.state) {
    case "named":
      return `${signer.value}, a claim the registry records and does not verify`;
    case "unsigned":
      return "Unsigned, as the listing declares";
    case "invalid":
      return `${signer.value}, which is not a signer identity the registry's schema allows`;
    default:
      return null;
  }
}

function firstPartySheet(facts, artifact) {
  const { release, apps } = artifact;
  const blobUrl = `${apps.repositoryUrl}/blob/${apps.commit}/${facts.path}`;
  const folderUrl = `${apps.repositoryUrl}/tree/${apps.commit}/${facts.path.split("/")[0]}`;
  const incompatible = !facts.compatibility.compatible;
  const permissions = facts.declarations.permissions
    ? Object.entries(facts.declarations.permissions).map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    : null;
  return {
    kind: "first-party",
    name: facts.name,
    path: registryAppPath(facts.name),
    subtitle: facts.displayName,
    description: facts.description,
    verdict: FIRST_PARTY_SCAN,
    state: incompatible ? "incompatible" : "available",
    blockedBecause: incompatible
      ? `This app cannot be installed or switched on with PersonalClaw ${release.tag}: ${compatibilityWords(facts.compatibility, release).toLowerCase()}. PersonalClaw refuses it, so this sheet gives no steps to enable it.`
      : null,
    facts: [
      field("permissions", "Permissions", permissions, NOT_DECLARED),
      field("network", "Its own network permission", facts.network === "not-declared" ? null : NETWORK_WORDS[facts.network], NOT_DECLARED),
      field(
        "hosts",
        "Hosts it names",
        facts.reach.map((reach) => `${reach.by}: ${reach.hosts.join(", ")}`),
        NOT_DECLARED
      ),
      field("scanVerdict", "Scan verdict", FIRST_PARTY_SCAN.label, NO_SCAN_PUBLISHED),
      field("scanTime", "Scan time", null, NO_SCAN_PUBLISHED),
      field("findings", "Blocking findings", null, NO_SCAN_PUBLISHED),
      field("scanner", "Scanner version", null, NO_SCAN_PUBLISHED),
      field("source", "Source", folderUrl, NOT_DECLARED),
      field("publisher", "Publisher", facts.author || null, NOT_DECLARED),
      field("license", "License", facts.license || null, NOT_DECLARED),
      field("commit", "Pinned commit", apps.commit, NOT_DECLARED),
      field("compatibility", "Compatibility", compatibilityWords(facts.compatibility, release), NOT_DECLARED),
      field("signer", "Signer", null, NOT_DECLARED),
      field("secrets", "Settings marked secret", facts.secrets.map((secret) => secret.label), NOT_DECLARED)
    ],
    declarations: DESCRIBE_KEYS.filter((key) => !COMPOSED_KEYS.has(key)).map((key) =>
      field(key, DECLARATION_LABELS[key], facts.declarations[key] === undefined ? null : JSON.stringify(facts.declarations[key], null, 2), NOT_DECLARED)
    ),
    reach: facts.reach,
    // Each program it starts, with what it runs with in install consent's words.
    launches: facts.launches.map((launch) => ({ ...launch, runsWith: inheritsSentence(launch) })),
    secrets: facts.secrets,
    manifest: { text: facts.manifest.text, blob: facts.manifest.blob, path: facts.path, url: blobUrl },
    sourceUrl: folderUrl,
    provenance: `${apps.repository} @ ${apps.commit.slice(0, 12)} · ${facts.path}`
  };
}

function communitySheet(app, listing, release) {
  const unsafe = app.verdict.tone === "blocked";
  const scanner = listing.scanner;
  const network = app.permissions.includes("network") ? "Declared in the listing's permissions" : null;
  const facts = [
    field("permissions", "Permissions", app.permissions.length > 0 ? app.permissions : null, "This app declares no permissions."),
    field("network", "Its own network permission", network, NOT_RECORDED),
    field("hosts", "Hosts it names", null, NOT_RECORDED),
    // A verdict the registry's schema defines is attributed to the registry; one it does not is
    // shown as written and called unrecognised, never as a check this site can vouch for.
    field(
      "scanVerdict",
      "Scan verdict",
      app.verdict.key === "unscanned"
        ? null
        : app.verdict.key === "unrecognised"
          ? `Unrecognised verdict: ${app.verdictRecorded ?? "not a string"}`
          : `${STORE_CONSENT.verdictAttribution} ${app.verdictRecorded}`,
      NOT_RECORDED
    ),
    field("scanTime", "Scan time", app.lastValidated, NOT_RECORDED),
    field("findings", "Blocking findings", null, NOT_RECORDED),
    field("scanner", "Scanner version", scanner ? `${scanner.name} ${scanner.version}` : null, NOT_RECORDED),
    field("source", "Source", app.repo, NOT_RECORDED),
    field("publisher", "Listed by", app.maintainer, NOT_RECORDED),
    field("license", "License", app.license, NOT_RECORDED),
    field("commit", "Pinned commit", null, NOT_RECORDED),
    field("compatibility", "Compatibility", null, NOT_RECORDED),
    field("signer", "Signer", signerWords(app.signer), NOT_RECORDED),
    field("secrets", "Settings marked secret", null, NOT_RECORDED)
  ];
  return {
    kind: "community",
    name: app.name,
    path: app.path,
    subtitle: app.types.join(" · "),
    description: "",
    verdict: app.verdict,
    state: unsafe ? "unsafe" : "available",
    blockedBecause: unsafe
      ? `${app.verdict.detail} PersonalClaw refuses a dangerous app at install, so this sheet gives no steps to enable it.`
      : null,
    facts,
    // A permissions list that is empty is a declaration, not a gap.
    missingFields: facts.filter((entry) => entry.value === null && entry.missing === NOT_RECORDED).map((entry) => entry.label),
    declarations: DESCRIBE_KEYS.filter((key) => !COMPOSED_KEYS.has(key)).map((key) =>
      field(key, DECLARATION_LABELS[key], null, NOT_RECORDED)
    ),
    reach: null,
    launches: null,
    secrets: null,
    manifest: null,
    sourceUrl: app.repo,
    provenance: `${listing.source.repository} @ ${listing.source.commit.slice(0, 12)} · ${listing.source.path}`,
    release
  };
}

/**
 * Every install-safety sheet, first-party then community, each in name order, and the
 * community rows that got none, with why.
 */
export function appSheets() {
  if (sheetsCache) return sheetsCache;
  sheetsCache = buildSheets(readSheetsArtifact(), registryListing());
  return sheetsCache;
}

/**
 * The sheets from the two synced artifacts: .generated/app-sheets.json as written, and the
 * registry listing as `registryListing()` reads it. Pure, so tests/registry-sheets.test.mjs can
 * hand it planted artifacts.
 *
 * @param {any} artifact
 * @param {ReturnType<typeof buildListing>} listing
 */
export function buildSheets(artifact, listing) {
  const firstParty = artifact.sheets.map((facts) => firstPartySheet(facts, artifact));
  const reserved = new Set(firstParty.map((sheet) => sheet.name));
  // registryListing() already refuses a row with a first-party name (readRow); a listing handed
  // in from elsewhere is held to the same rule here, so no route is minted twice.
  const dropped = listing.problems
    .filter((problem) => /first-party app's/.test(problem.reason))
    .map((problem) => ({ name: problem.reason.split(":")[0], reason: problem.reason }));
  const community = [];
  for (const app of listing.apps) {
    if (reserved.has(app.name)) {
      dropped.push({ name: app.name, reason: `${app.name}: the name is a first-party app's, so its route is that app's sheet` });
    } else {
      community.push(communitySheet(app, listing, artifact.release));
    }
  }
  return { release: artifact.release, sheets: [...firstParty, ...community], dropped };
}

/** The registry listing a raw registry artifact yields, as `registryListing()` reads one. */
export function listingFrom(artifact, reserved = new Set()) {
  return buildListing(artifact, reserved);
}
