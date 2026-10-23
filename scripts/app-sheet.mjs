// What an app's install-safety sheet (/registry/<name>) says, from the pinned sources only.
//
// The sheet is the page an owner reads before installing or switching an app on, so the rules
// that govern it are the consent surface's own (src/data/registry.mjs, header):
//
//   1. Every fact is the source's own, verbatim: a first-party app's `app.json` at the pinned
//      apps commit, or a community row of the registry at its pin. Nothing is summarised,
//      scored or inferred.
//   2. A field with no source says so, in words that cannot be read as a pass:
//      NOT_DECLARED for a first-party manifest that does not declare it, NOT_RECORDED for a
//      community row that does not carry it. It is never omitted.
//   3. The sheet discloses no less than install consent does. Core composes what consent shows
//      in one function, `describe()` in `src/personalclaw/apps/disclosure.py`, whose own header
//      warns that rebuilding it elsewhere is how a consent surface ends up disclosing less. So
//      the sheet does not rebuild it: it shows the manifest's declarations under describe()'s
//      keys, in describe()'s order, and `describeKeysFromSource()` reads that order from the
//      pinned tag, so a key core adds or moves fails the sync (scripts/sync-sources.mjs) instead
//      of leaving the sheet a section short.
//   4. Compatibility is core's rule, `check_core_compatibility()` in `apps/core_version.py`,
//      applied to the pinned release: every `requiresCoreFeatures` name must be in that
//      release's CORE_FEATURES (read from `apps/core_features.py` at the tag), and the release
//      must be at or above `minPersonalClawVersion`. An unreadable floor refuses, as core's does.
//
// Pure apart from the hash, so the sync, the pages and scripts/validate-registry-render.mjs share
// it, and tests/app-sheet.test.mjs drives each rule on planted input.

import { createHash } from "node:crypto";

/** A community row does not carry this field. */
export const NOT_RECORDED = "Not recorded for this listing";

/** A first-party manifest at the pinned release does not declare this field. */
export const NOT_DECLARED = "Not declared in this release's manifest";

/**
 * describe()'s keys, in its order, as read at core v0.2.4. The sync compares this list with the
 * pinned tag's own (`describeKeysFromSource`) and fails on any difference. `runsAsYou` is the one
 * key describe() composes from the others rather than reading from the manifest; the sheet leaves
 * that sentence to the Store, which composes it at install.
 */
export const DESCRIBE_KEYS = [
  "permissions",
  "crons",
  "pythonDependencies",
  "sidecarDependencies",
  "requires",
  "launches",
  "npmPackages",
  "writes",
  "hasUI",
  "uiComponents",
  "hasBackend",
  "backendSandbox",
  "providers",
  "onInstall",
  "onUpdate",
  "onEnable",
  "onDisable",
  "onUninstall",
  "cliSetup",
  "cliDoctor",
  "sources",
  "mcpServers",
  "skills",
  "runsAsYou"
];

/** The describe() keys the Store composes at install, which the sheet does not restate. */
export const COMPOSED_KEYS = new Set(["runsAsYou"]);

/**
 * describe()'s keys in order, read from `disclosure.py` at the pinned tag: the keys of the dict
 * literal it builds, then each key it sets after it (`d["runsAsYou"] = ...`).
 *
 * @param {string} source the text of `src/personalclaw/apps/disclosure.py`
 */
export function describeKeysFromSource(source) {
  const start = source.indexOf("def describe(");
  if (start < 0) throw new Error("disclosure.py has no describe()");
  const next = source.slice(start + 1).search(/\ndef [a-zA-Z_]/);
  const body = next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
  const literal = body.match(/\n\s+d: dict\[str, Any\] = \{\n([\s\S]*?)\n\s+\}\n/);
  if (!literal) throw new Error("describe() no longer builds its result as one dict literal");
  const keys = [...literal[1].matchAll(/^\s+"([A-Za-z]+)":/gm)].map((match) => match[1]);
  const after = body.slice(body.indexOf(literal[0]) + literal[0].length);
  keys.push(...[...after.matchAll(/\bd\["([A-Za-z]+)"\]\s*=/g)].map((match) => match[1]));
  return [...new Set(keys)];
}

/**
 * The feature names a core release offers, read from `apps/core_features.py` at its tag: each
 * `NAME = "value"` constant that the `CORE_FEATURES` frozenset literal names.
 *
 * @param {string} source
 */
export function parseCoreFeatures(source) {
  const constants = new Map(
    [...source.matchAll(/^([A-Z][A-Z0-9_]*)\s*=\s*"([a-z0-9-]+)"\s*$/gm)].map((match) => [
      match[1],
      match[2]
    ])
  );
  const literal = source.match(/^CORE_FEATURES\b[^=]*=\s*frozenset\(\s*\{([\s\S]*?)\}\s*\)/m);
  if (!literal) throw new Error("core_features.py no longer declares CORE_FEATURES as a frozenset");
  const names = [...literal[1].matchAll(/\b([A-Z][A-Z0-9_]*)\b/g)].map((match) => {
    const value = constants.get(match[1]);
    if (value === undefined) throw new Error(`CORE_FEATURES names ${match[1]}, which has no value`);
    return value;
  });
  if (names.length === 0) throw new Error("CORE_FEATURES is empty");
  return [...new Set(names)].sort();
}

/** `major.minor.patch` as numbers, or null, as core's `parse_version` reads a floor. */
function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(text ?? "").trim());
  return match ? match.slice(1).map(Number) : null;
}

function below(have, want) {
  for (let index = 0; index < 3; index += 1) {
    if (have[index] !== want[index]) return have[index] < want[index];
  }
  return false;
}

/**
 * Core's compatibility rule at the pinned release.
 *
 * @param {{ requiresCoreFeatures?: string[], minPersonalClawVersion?: string }} needs
 * @param {{ features: string[], version: string }} release
 * @returns {{ compatible: boolean, missing: string[], floor: string, reason: string }}
 */
export function coreCompatibility(needs, release) {
  const offered = new Set(release.features);
  const missing = [...new Set(needs.requiresCoreFeatures ?? [])].filter((name) => !offered.has(name));
  const floor = String(needs.minPersonalClawVersion ?? "").trim();
  if (missing.length > 0) {
    return { compatible: false, missing, floor, reason: "missing-features" };
  }
  if (!floor) return { compatible: true, missing: [], floor: "", reason: "no-floor" };
  const want = parseVersion(floor);
  if (!want) return { compatible: false, missing: [], floor, reason: "unreadable-floor" };
  const have = parseVersion(release.version);
  if (!have) return { compatible: false, missing: [], floor, reason: "unreadable-release" };
  if (below(have, want)) return { compatible: false, missing: [], floor, reason: "floor-above" };
  return { compatible: true, missing: [], floor, reason: "at-or-above-floor" };
}

/**
 * The scanner the registry's validation runs, from its `requirements.txt` at the registry pin:
 * `{ name, version }` for an exact `name==version` pin of `personalclaw`, or null when the file
 * is missing or pins anything but one exact version.
 *
 * @param {string | null} text
 */
export function scannerPin(text) {
  if (typeof text !== "string") return null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    const match = /^personalclaw\s*(==|===)\s*([0-9][0-9A-Za-z.+-]*)$/i.exec(line);
    if (match) return { name: "personalclaw", version: match[2] };
    if (/^personalclaw\b/i.test(line)) return null;
  }
  return null;
}

/** The blob hash git lists for these bytes in a tree. */
export function gitBlobSha(text) {
  const bytes = Buffer.from(text, "utf8");
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest("hex");
}

const present = (value) =>
  value !== undefined &&
  value !== null &&
  value !== "" &&
  !(Array.isArray(value) && value.length === 0) &&
  !(typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);

/**
 * The manifest's own declaration under each describe() key, verbatim: the value, or undefined
 * when this manifest does not declare it. Nothing is computed beyond picking the field: what
 * describe() derives (a cron's cadence in words, whether it is scheduled, the run-as-you
 * sentence) is the Store's to say at install.
 *
 * @param {Record<string, any>} manifest
 */
export function declarations(manifest) {
  const dependencies = manifest.dependencies ?? {};
  const setup = manifest.setup ?? {};
  const cli = manifest.cli ?? {};
  const providers = [manifest.provider, ...(manifest.providers ?? [])].filter(Boolean);
  const pick = (value) => (present(value) ? value : undefined);
  return {
    permissions: pick(manifest.permissions),
    crons: pick(manifest.crons),
    pythonDependencies: pick(dependencies.pythonDependencies),
    sidecarDependencies: pick(dependencies.sidecarDependencies),
    requires: pick(manifest.requires),
    launches: pick(manifest.launches),
    npmPackages: pick(dependencies.npmPackages),
    writes: pick(manifest.writes),
    hasUI: pick(manifest.ui?.pages),
    uiComponents: pick(manifest.ui?.components),
    hasBackend: pick(manifest.backend?.entryPoint),
    backendSandbox: pick(manifest.backend?.sandbox),
    providers: pick(
      providers.map((provider) => ({
        type: provider.type,
        implementation: provider.implementation,
        ...(provider.execution ? { execution: provider.execution } : {})
      }))
    ),
    onInstall: pick(setup.onInstall),
    onUpdate: pick(setup.onUpdate),
    onEnable: pick(setup.onEnable),
    onDisable: pick(setup.onDisable),
    onUninstall: pick(setup.onUninstall),
    cliSetup: pick(cli.setup),
    cliDoctor: pick(cli.doctor),
    sources: pick(manifest.sources),
    mcpServers: pick(manifest.mcpServers),
    skills: pick(manifest.skills)
  };
}

/**
 * Every host or URL the manifest names for something it starts or fetches: each launched
 * program's `hosts`, each MCP server's `url`, and each connector source's `fetchSpec.url`. This is
 * NOT the app's reach: an app's own code (its backend, its provider module) has no host list at
 * this release, and the sheet says so beside this list.
 *
 * @param {Record<string, any>} manifest
 * @returns {{ by: string, why: string, hosts: string[] }[]}
 */
export function namedReach(manifest) {
  const reach = [];
  for (const launch of manifest.launches ?? []) {
    if (Array.isArray(launch?.hosts) && launch.hosts.length > 0) {
      reach.push({ by: `the program ${launch.program}`, why: launch.why ?? "", hosts: [...launch.hosts] });
    }
  }
  for (const [name, server] of Object.entries(manifest.mcpServers ?? {})) {
    if (typeof server?.url === "string" && server.url) {
      reach.push({ by: `the MCP server ${name}`, why: "", hosts: [server.url] });
    }
  }
  for (const source of manifest.sources ?? []) {
    const url = source?.fetchSpec?.url;
    if (typeof url === "string" && url) {
      reach.push({ by: `the source ${source.name}`, why: "", hosts: [url] });
    }
  }
  return reach;
}

/**
 * The app's own network permission in its three states, as core's `network_declared` keeps them:
 * on, off, or not declared.
 *
 * @param {Record<string, any>} manifest
 * @returns {"on" | "off" | "not-declared"}
 */
export function networkPermission(manifest) {
  const value = manifest.permissions?.network;
  if (value === true) return "on";
  if (value === false) return "off";
  return "not-declared";
}

/** Every settings schema a manifest carries: the app's own, its provider's, and each provider's. */
function settingsSchemas(manifest) {
  return [
    manifest.settingsSchema,
    manifest.provider?.settingsSchema,
    ...(manifest.providers ?? []).map((provider) => provider?.settingsSchema)
  ].filter(Boolean);
}

/** The program of a launch whose program the owner names (core's `PROGRAM_YOU_NAME`). */
export const PROGRAM_YOU_NAME = "*";

/** What a launched program runs with, in install consent's words (core's `LAUNCH_INHERITS`). */
export const INHERIT_WORDS = {
  "sign-in": "sign-in",
  settings: "settings",
  "auto-approve-rules": "auto-approve rules",
  "folder-settings": "the settings of the folder it works in"
};

/**
 * Each program the app starts, as install consent names it: what it is for, the npm package an
 * `npx` entry fetches and runs, the hosts it reaches, what of the owner's own (and of the folder
 * it works in) it runs with, and the app setting that decides that, resolved as describe()'s
 * `_launches` resolves it: from the providers' settings schemas, to its label (else its key) and
 * the boolean it starts out at.
 *
 * @param {Record<string, any>} manifest
 */
export function launchedPrograms(manifest) {
  const providers = [manifest.provider, ...(manifest.providers ?? [])].filter(Boolean);
  const properties = Object.assign({}, ...providers.map((provider) => provider.settingsSchema?.properties ?? {}));
  return (manifest.launches ?? [])
    .filter((launch) => typeof launch?.program === "string" && launch.program)
    .map((launch) => {
      const condition = launch.inheritsWhile;
      const property = condition ? properties[condition.setting] : undefined;
      return {
        program: launch.program,
        why: launch.why ?? "",
        npmPackage: launch.npmPackage ?? "",
        hosts: [...(launch.hosts ?? [])],
        inherits: [...(launch.inherits ?? [])],
        inheritsWhile:
          condition && typeof condition.setting === "string"
            ? {
                label: String(property?.["x-meta"]?.label || condition.setting),
                value: condition.value === true,
                default: typeof property?.default === "boolean" ? property.default : null
              }
            : null
      };
    });
}

const andList = (words) =>
  words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
const onOff = (value) => (value ? "on" : "off");

/**
 * What a launched program runs with, as install consent says it (core's `InheritsSentence` in
 * web/src/pages/apps/installConsent.tsx), or "" when it runs with nothing of either. A word core
 * does not define is shown as written, never dropped.
 *
 * @param {ReturnType<typeof launchedPrograms>[number]} launch
 */
export function inheritsSentence(launch) {
  if (launch.inherits.length === 0) return "";
  const yours = launch.program === PROGRAM_YOU_NAME;
  const folder = launch.inherits.includes("folder-settings");
  const own = andList(launch.inherits.filter((word) => word !== "folder-settings").map((word) => INHERIT_WORDS[word] ?? word));
  const rules = launch.inherits.includes("auto-approve-rules") || folder ? " What those rules allow, it does without asking you here first." : "";
  const what =
    (own ? (yours ? `your own ${own} for that program` : `your own ${launch.program} ${own}`) : "") +
    (own && folder ? ", and with " : "") +
    (folder ? `the ${yours ? "" : `${launch.program} `}settings of the folder it works in, which can add rules of their own and commands for it to run` : "") +
    `.${rules}`;
  const runs = yours ? "each program it starts runs" : "it runs";
  const condition = launch.inheritsWhile;
  if (!condition) return `${runs[0].toUpperCase()}${runs.slice(1)} with ${what}`;
  const start =
    condition.default === null
      ? ""
      : condition.default === condition.value
        ? ` ${condition.label} starts out ${onOff(condition.value)}.`
        : ` ${condition.label} is ${onOff(condition.default)} until you turn it ${onOff(!condition.default)}.`;
  return `While ${condition.label} is ${onOff(condition.value)}, ${runs} with ${what}${start}`;
}

/**
 * Each setting the owner enters that PersonalClaw keeps as a secret: every property of a
 * `settingsSchema` (the app's provider, or its own) whose `x-meta.sensitive` is true, by its key
 * and its `x-meta.label`.
 *
 * @param {Record<string, any>} manifest
 * @returns {{ key: string, label: string }[]}
 */
export function sensitiveSettings(manifest) {
  const out = [];
  const seen = new Set();
  for (const schema of settingsSchemas(manifest)) {
    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      if (property?.["x-meta"]?.sensitive === true && !seen.has(key)) {
        seen.add(key);
        out.push({ key, label: String(property["x-meta"].label ?? key) });
      }
    }
  }
  return out;
}

/**
 * What the sync keeps of one first-party manifest for its sheet: the provenance and
 * compatibility fields, the declarations under describe()'s keys, the named reach, the sensitive
 * settings, and the manifest's exact text with the blob hash git lists for it.
 *
 * @param {Record<string, any>} manifest
 * @param {string} text the manifest file's exact bytes, as UTF-8
 */
export function firstPartySheetFacts(manifest, text) {
  return {
    name: manifest.name,
    version: manifest.version,
    displayName: manifest.displayName ?? "",
    description: manifest.description ?? "",
    author: manifest.author ?? "",
    license: manifest.license ?? "",
    minPersonalClawVersion: manifest.minPersonalClawVersion ?? "",
    requiresCoreFeatures: [...(manifest.requiresCoreFeatures ?? [])],
    network: networkPermission(manifest),
    declarations: declarations(manifest),
    reach: namedReach(manifest),
    launches: launchedPrograms(manifest),
    secrets: sensitiveSettings(manifest),
    manifest: { text, blob: gitBlobSha(text) }
  };
}
