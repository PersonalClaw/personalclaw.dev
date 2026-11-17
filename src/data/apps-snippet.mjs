// The app.json the builders band on /apps shows, and the check that it is a manifest the
// pinned core release accepts.
//
// WHAT IS SHOWN. A real first-party manifest, verbatim: web-tools/app.json at the pinned
// apps commit. Not an authored example, because nothing holds an authored example to the
// contract. The snippet this replaced ("name", "provider.type", "permissions.network") was
// presented as what an app looks like, and core's own AppManifest.validate() refused it: no
// version, displayName or description, and a provider with no implementation.
//
// WHY A COPY IS COMMITTED. README.md says copied source content is never committed here. As
// with STORE_CONSENT in ./registry.mjs, this text is an assertion about the apps repository's
// file rather than a second source of it: scripts/sync-sources.mjs reads the file at the
// pinned apps commit and fails the sync when the two differ by a byte (snippetDrift), so a
// re-pin that changes the file cannot ship a stale copy. The page renders this export, and
// scripts/validate-build.mjs fails a build whose /apps snippet is not exactly this text, so
// what tests/apps-snippet.test.mjs checks is what ships.
//
// WHAT "THE PINNED RULES" ARE. appManifestProblems() ports the rules core's
// AppManifest.validate() and ProviderConfig.validate() apply to the fields this manifest
// uses. They were read at core v0.2.2 in src/personalclaw/apps/manifest.py, with the version
// rule in src/personalclaw/apps/core_version.py (app_version_problem) and
// src/personalclaw/versions.py (PEP 440, through `packaging`). The port is CLOSED: a field it
// does not read is a problem, never a pass, so a manifest it accepts is one core accepts.
// Where core coerces a value with str() (a numeric displayName, say), the port refuses it
// instead: stricter, never looser. `minPersonalClawVersion`, which the first-party apps carry from
// apps v0.3.0, was read at core v0.3.0: validate() takes any value (from_dict reads it with
// str()), and core_compatibility() refuses to host an app whose floor it cannot read, so the port
// refuses a floor that is not a string or does not start with MAJOR.MINOR.PATCH. Re-read at core
// v0.3.9: ProviderConfig, PROVIDER_TYPES and _HOOK_OR_ENTRYPOINT_RE are in
// src/personalclaw/apps/provider_config.py, unchanged. ProviderConfig.validate() adds
// settingsCheck, and AppManifest.validate() adds the refusals for provider ids, labels, renames
// and settings. None of them is on a field this port reads, and the port refuses each of those
// fields. From apps v0.3.9 the snippet's provider declares an id and a label, so the port reads
// those two by core v0.3.9's capability_refusals and _label_refusals: an id is kebab-case, and a
// label is never its id or a provider type. The sync holds the constants below to the pinned
// core's files that define them (manifestRulesDrift), and the two functions those id and label
// rules are ported from by their fingerprint (refusalsDrift), so a re-pin that adds a provider
// type, changes a pattern or changes either function fails until this port is re-read.

/** The first-party app whose manifest the builders band shows. */
const SNIPPET_APP = "web-tools";

/**
 * The manifest the builders band shows, exactly as the file reads at the pinned apps commit
 * (its \u escapes included: they are in the file).
 */
export const BUILDERS_SNIPPET = Object.freeze({
  app: SNIPPET_APP,
  path: `${SNIPPET_APP}/app.json`,
  text: String.raw`{
  "name": "web-tools",
  "version": "0.1.6",
  "displayName": "Web Tools",
  "description": "General web primitives the agent can call: web_search, web_fetch, and web_extract. web_search runs over the search provider you bind in Settings \u2192 Search, web_fetch is an SSRF-guarded page fetch + extraction, and web_extract does structured extraction. No key of its own \u2014 it uses the bound search provider's.",
  "icon": "Globe",
  "author": "PersonalClaw",
  "license": "MIT",
  "minPersonalClawVersion": "0.2.3",
  "tags": [
    "tool",
    "web"
  ],
  "prompts": [
    "prompts/web-extract.yaml"
  ],
  "permissions": {
    "network": true
  },
  "provider": {
    "id": "tools",
    "label": "Search, fetch and extract web pages",
    "type": "tool",
    "implementation": "provider:create_provider",
    "capabilities": [
      "web"
    ]
  }
}
`
});

/** Where core defines the manifest's own rules below. The sync reads it at the pinned core commit. */
export const CORE_MANIFEST_PATH = "src/personalclaw/apps/manifest.py";
/** Where core defines a provider's rules below (ProviderConfig). The sync reads it at the pinned core commit. */
export const CORE_PROVIDER_CONFIG_PATH = "src/personalclaw/apps/provider_config.py";
/** Where core refuses a provider's id and label, the logic the port follows by hand. The sync reads it at the pinned core commit. */
export const CORE_CAPABILITY_IDS_PATH = "src/personalclaw/apps/capability_ids.py";

/**
 * The two functions in CORE_CAPABILITY_IDS_PATH the provider id and label rules are ported from,
 * held by a fingerprint: the SHA-256 of each one's source at the pin, from its `def` line to the
 * last line before the next one at the margin (topLevelFunction). The port reads no logic from
 * core, so a changed body is drift too, and so is a function that moved or is defined twice.
 */
export const REFUSAL_FINGERPRINTS = Object.freeze({
  capability_refusals: "23243a00d5fd202319ae96c172458d5c601ebd6574c01d83f639a36c10c025c9",
  _label_refusals: "1f31c9ddc8fe5c4cee0b529c5f8b3fa2434ad2597b6737356db0bc73a13bf506"
});

/**
 * Core's constants, as written in CORE_MANIFEST_PATH and CORE_PROVIDER_CONFIG_PATH (the patterns
 * are its raw strings).
 * Python's `$` also matches before a final newline; JavaScript's does not, which only makes
 * the port refuse a value core would take.
 */
export const MANIFEST_RULES = Object.freeze({
  /** `KEBAB_RE` (CORE_MANIFEST_PATH): an app's `name`. */
  kebabPattern: String.raw`^[a-z0-9]+(?:-[a-z0-9]+)*$`,
  /** `ICON_NAME_RE` (CORE_MANIFEST_PATH): a lucide component name. */
  iconPattern: String.raw`^[A-Za-z][A-Za-z0-9]*$`,
  /** `_HOOK_OR_ENTRYPOINT_RE` (CORE_PROVIDER_CONFIG_PATH): `provider.implementation`, as `module.path:factory_fn`. */
  implementationPattern: String.raw`^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*:[a-zA-Z_][a-zA-Z0-9_]*$`,
  /** `PROVIDER_TYPES` (CORE_PROVIDER_CONFIG_PATH), sorted. */
  providerTypes: Object.freeze([
    "action",
    "agent",
    "channel",
    "duty_gate",
    "inbox",
    "knowledge",
    "memory",
    "model",
    "notification",
    "ocr",
    "prompt",
    "sandbox",
    "search",
    "skills",
    "sync",
    "task",
    "tool",
    "trigger",
    "trigger_source",
    "vector_store",
    "workflow"
  ])
});

const KEBAB = new RegExp(MANIFEST_RULES.kebabPattern);
const ICON_NAME = new RegExp(MANIFEST_RULES.iconPattern);
const IMPLEMENTATION = new RegExp(MANIFEST_RULES.implementationPattern);
const PROVIDER_TYPES = new Set(MANIFEST_RULES.providerTypes);

// `packaging`'s PEP 440 pattern (VERSION_PATTERN), anchored. Group 1 is the release segment.
const PEP_440 = new RegExp(
  String.raw`^v?(?:(?:[0-9]+!)?([0-9]+(?:\.[0-9]+)*)` +
    String.raw`(?:[-_.]?(?:alpha|a|beta|b|preview|pre|c|rc)[-_.]?(?:[0-9]+)?)?` +
    String.raw`(?:(?:-[0-9]+)|(?:[-_.]?(?:post|rev|r)[-_.]?(?:[0-9]+)?))?` +
    String.raw`(?:[-_.]?dev[-_.]?(?:[0-9]+)?)?)` +
    String.raw`(?:\+[a-z0-9]+(?:[-_.][a-z0-9]+)*)?$`,
  "i"
);
/** `versions._MAX_LENGTH`: a longer string is not read as a version. */
const MAX_VERSION_LENGTH = 128;

/** The fields the port reads. Any other is refused (see the header). */
const READ_FIELDS = new Set([
  "name",
  "version",
  "displayName",
  "description",
  "icon",
  "author",
  "license",
  "minPersonalClawVersion",
  "tags",
  "prompts",
  "permissions",
  "provider"
]);
const READ_PERMISSIONS = new Set(["network"]);
const READ_PROVIDER_FIELDS = new Set(["id", "label", "type", "implementation", "capabilities"]);

const isObject = (value) => value != null && typeof value === "object" && !Array.isArray(value);
const isNames = (value) =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry !== "");
const notRead = (field) =>
  `${field} is a field this check does not read, so it cannot say core accepts it`;

/** `core_version.app_version_problem`: "" when *version* is an app version. */
function versionProblem(version) {
  const parsed =
    typeof version === "string" &&
    version.length <= MAX_VERSION_LENGTH &&
    /^[0-9]/.test(version) &&
    version.match(PEP_440);
  if (!parsed || parsed[1].split(".").length !== 3) {
    return (
      "version must be MAJOR.MINOR.PATCH, optionally with a pre-release such as " +
      `1.0.0-rc.1, got: ${JSON.stringify(version)}`
    );
  }
  return "";
}

/**
 * The pinned core's refusals for *manifest* (a parsed app.json), in the order core's
 * AppManifest.validate() reports them, followed by any field this check does not read.
 * An empty list means core at the pin accepts it.
 *
 * @param {unknown} manifest
 * @returns {string[]}
 */
export function appManifestProblems(manifest) {
  if (!isObject(manifest)) return ["app.json must be a JSON object"];
  const problems = [];

  if (manifest.name == null || manifest.name === "") {
    problems.push("missing required field: name");
  } else if (typeof manifest.name !== "string" || !KEBAB.test(manifest.name)) {
    problems.push(
      "name must be kebab-case (lowercase alphanumeric + hyphens), " +
        `got: ${JSON.stringify(manifest.name)}`
    );
  }

  if (manifest.version == null || manifest.version === "") {
    problems.push("missing required field: version");
  } else {
    const problem = versionProblem(manifest.version);
    if (problem) problems.push(problem);
  }

  for (const field of ["displayName", "description"]) {
    if (typeof manifest[field] !== "string" || manifest[field] === "") {
      problems.push(`missing required field: ${field}`);
    }
  }

  if (manifest.prompts !== undefined) {
    if (!isNames(manifest.prompts)) {
      problems.push("prompts must be a list of paths");
    } else {
      for (const prompt of manifest.prompts) {
        if (prompt.includes("..")) {
          problems.push(`prompts path contains path traversal: ${JSON.stringify(prompt)}`);
        }
      }
    }
  }

  if (manifest.icon !== undefined) {
    if (typeof manifest.icon !== "string" || (manifest.icon !== "" && !ICON_NAME.test(manifest.icon))) {
      problems.push(
        "icon must be a lucide icon name (letters and digits, e.g. 'SquareTerminal'), " +
          `got: ${JSON.stringify(manifest.icon)}`
      );
    }
  }

  for (const field of ["author", "license"]) {
    if (manifest[field] !== undefined && typeof manifest[field] !== "string") {
      problems.push(`${field} must be text`);
    }
  }
  if (manifest.tags !== undefined && !isNames(manifest.tags)) {
    problems.push("tags must be a list of names");
  }

  if (manifest.permissions !== undefined) {
    if (!isObject(manifest.permissions)) {
      problems.push("permissions must be an object");
    } else {
      for (const key of READ_PERMISSIONS) {
        const value = manifest.permissions[key];
        if (value !== undefined && typeof value !== "boolean") {
          problems.push(
            `permissions.${key} must be true or false, got ${JSON.stringify(value).slice(0, 60)}`
          );
        }
      }
    }
  }

  if (manifest.provider !== undefined) {
    const provider = manifest.provider;
    if (!isObject(provider)) {
      problems.push("provider must be an object");
    } else {
      if (provider.type == null || provider.type === "") {
        problems.push("provider.type is required");
      } else if (!PROVIDER_TYPES.has(provider.type)) {
        problems.push(
          `provider.type must be one of ${MANIFEST_RULES.providerTypes.join(", ")}, ` +
            `got: ${JSON.stringify(provider.type)}`
        );
      }
      if (provider.implementation == null || provider.implementation === "") {
        problems.push("provider.implementation is required");
      } else if (
        typeof provider.implementation !== "string" ||
        !IMPLEMENTATION.test(provider.implementation)
      ) {
        problems.push(
          "provider.implementation must be 'module.path:factory_fn', " +
            `got: ${JSON.stringify(provider.implementation)}`
        );
      }
      if (provider.capabilities !== undefined && !isNames(provider.capabilities)) {
        problems.push("provider.capabilities must be a list of names");
      }
      // capability_ids.capability_refusals and _label_refusals (core v0.3.9), for one provider.
      if (provider.id !== undefined && (typeof provider.id !== "string" || !KEBAB.test(provider.id))) {
        problems.push(`provider.id must be kebab-case, got: ${JSON.stringify(provider.id)}`);
      }
      if (provider.label !== undefined) {
        // Core compares with str.casefold(). Upper case then lower case folds the same letters it
        // does ("ß" to "ss", "ſ" to "s"), where lower case alone would leave them, and the port looser.
        const fold = (text) => text.toUpperCase().toLowerCase();
        const typeWords = new Set(
          MANIFEST_RULES.providerTypes.flatMap((type) => [type, type.replace(/_/g, " ")])
        );
        if (typeof provider.label !== "string" || provider.label === "") {
          problems.push("provider.label must be text");
        } else if (provider.id === undefined) {
          // Core compares a label to the id its type derives; the port reads no derived ids, so
          // it refuses a label without an id of its own: stricter, never looser.
          problems.push("provider.label is checked against provider.id, and this provider has none");
        } else if (fold(provider.label) === fold(String(provider.id))) {
          problems.push("provider.label is its id: say in plain words what it does");
        } else if (typeWords.has(fold(provider.label))) {
          problems.push(
            `provider.label ${JSON.stringify(provider.label)} is a provider type: say in plain words what it does`
          );
        }
      }
    }
  }

  if (manifest.minPersonalClawVersion !== undefined) {
    const floor = manifest.minPersonalClawVersion;
    if (typeof floor !== "string") {
      problems.push(`minPersonalClawVersion must be a string, got ${JSON.stringify(floor).slice(0, 60)}`);
    } else if (floor.trim() !== "" && !/^v?\d+\.\d+\.\d+/.test(floor.trim())) {
      problems.push(
        "minPersonalClawVersion must start with MAJOR.MINOR.PATCH, or core cannot read the floor " +
          `and refuses to host the app, got: ${JSON.stringify(floor)}`
      );
    }
  }

  for (const key of Object.keys(manifest)) {
    if (!READ_FIELDS.has(key)) problems.push(notRead(key));
  }
  if (isObject(manifest.permissions)) {
    for (const key of Object.keys(manifest.permissions)) {
      if (!READ_PERMISSIONS.has(key)) problems.push(notRead(`permissions.${key}`));
    }
  }
  if (isObject(manifest.provider)) {
    for (const key of Object.keys(manifest.provider)) {
      if (!READ_PROVIDER_FIELDS.has(key)) problems.push(notRead(`provider.${key}`));
    }
  }
  return problems;
}

/**
 * Why BUILDERS_SNIPPET is not the file at the pinned apps commit, or [] when it is.
 *
 * @param {string} pinnedText the file's text at the pinned apps commit
 * @returns {string[]}
 */
export function snippetDrift(pinnedText) {
  if (pinnedText === BUILDERS_SNIPPET.text) return [];
  return [
    `${BUILDERS_SNIPPET.path} at the pinned apps commit is not the text ` +
      "src/data/apps-snippet.mjs: BUILDERS_SNIPPET shows as that file. Replace the text " +
      "with the pinned file, and run the unit test: it must still pass the pinned core's rules."
  ];
}

/** The raw string of `<name> = re.compile(r"...")` in a core source file, or null. */
function compiledPattern(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`(?:^|\\n)${escaped} = re\\.compile\\(\\s*r"([^"\\n]*)"\\s*\\)`));
  return match ? match[1] : null;
}

/** How many lines of *source* bind *name* at the margin (`NAME =` or `NAME: type =`). */
function definitions(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (source.match(new RegExp(`^${escaped}\\s*(?::[^=\\n]*)?=(?!=)`, "gm")) ?? []).length;
}

/**
 * The string literals of core's `PROVIDER_TYPES = frozenset({...})`, comments skipped, or null.
 * The read ends where the call's own parenthesis closes, so a set that closes on its own line
 * reads as empty, never as the strings of whatever follows it.
 */
function providerTypes(source) {
  // At the file's start or a line's, as compiledPattern reads a pattern.
  const opener = "PROVIDER_TYPES = frozenset(";
  const at = source.startsWith(opener) ? 0 : source.indexOf(`\n${opener}`);
  if (at === -1) return null;
  const start = source.indexOf(opener, at) + opener.length;
  const found = [];
  let depth = 1;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === "#") {
      const eol = source.indexOf("\n", i);
      i = eol === -1 ? source.length : eol;
    } else if (char === '"' || char === "'") {
      const close = source.indexOf(char, i + 1);
      if (close === -1) return null;
      found.push(source.slice(i + 1, close));
      i = close;
    } else if (char === "(" || char === "{" || char === "[") {
      depth++;
    } else if (char === ")" || char === "}" || char === "]") {
      depth--;
      if (depth === 0) return found.sort();
    }
  }
  return null;
}

/**
 * Where MANIFEST_RULES differs from core's files at the pin, or [] when it does not. Each rule
 * is read from the file that defines it. A rule this cannot find is drift too: a check that
 * reads nothing must not pass.
 *
 * @param {string} manifestSource core's CORE_MANIFEST_PATH at the pinned commit
 * @param {string} providerSource core's CORE_PROVIDER_CONFIG_PATH at the pinned commit
 * @returns {string[]}
 */
export function manifestRulesDrift(manifestSource, providerSource) {
  const problems = [];
  const reread = "Re-read core's AppManifest.validate() and ProviderConfig.validate(), and update src/data/apps-snippet.mjs.";
  for (const [path, source, name, pattern] of [
    [CORE_MANIFEST_PATH, manifestSource, "KEBAB_RE", MANIFEST_RULES.kebabPattern],
    [CORE_MANIFEST_PATH, manifestSource, "ICON_NAME_RE", MANIFEST_RULES.iconPattern],
    [CORE_PROVIDER_CONFIG_PATH, providerSource, "_HOOK_OR_ENTRYPOINT_RE", MANIFEST_RULES.implementationPattern]
  ]) {
    const pinned = compiledPattern(source, name);
    const count = definitions(source, name);
    if (count > 1) {
      // Python keeps the last binding; the check reads one, so two is drift until re-read.
      problems.push(`${path} at the pin defines ${name} ${count} times. ${reread}`);
    } else if (pinned == null) {
      problems.push(`${path} at the pin defines no ${name} this check can read. ${reread}`);
    } else if (pinned !== pattern) {
      problems.push(`${path} at the pin has ${name} r"${pinned}", not r"${pattern}". ${reread}`);
    }
  }
  const pinnedTypes = providerTypes(providerSource);
  const typeDefinitions = definitions(providerSource, "PROVIDER_TYPES");
  if (typeDefinitions > 1) {
    problems.push(`${CORE_PROVIDER_CONFIG_PATH} at the pin defines PROVIDER_TYPES ${typeDefinitions} times. ${reread}`);
  } else if (pinnedTypes == null || pinnedTypes.length === 0) {
    problems.push(`${CORE_PROVIDER_CONFIG_PATH} at the pin defines no PROVIDER_TYPES this check can read. ${reread}`);
  } else {
    const added = pinnedTypes.filter((type) => !PROVIDER_TYPES.has(type));
    const dropped = MANIFEST_RULES.providerTypes.filter((type) => !pinnedTypes.includes(type));
    if (added.length > 0 || dropped.length > 0) {
      problems.push(
        `${CORE_PROVIDER_CONFIG_PATH} at the pin has PROVIDER_TYPES ` +
          [
            added.length > 0 ? `with ${added.join(", ")}` : "",
            dropped.length > 0 ? `without ${dropped.join(", ")}` : ""
          ]
            .filter(Boolean)
            .join(" and ") +
          `. ${reread}`
      );
    }
  }
  return problems;
}

/**
 * The source of the one top-level `def <name>(` in *source*: from its `def` line to the last
 * line before the next one at the margin, trailing blank lines dropped. `count` is how many such
 * definitions there are; `text` is null unless there is exactly one.
 *
 * @param {string} source
 * @param {string} name
 * @returns {{ count: number, text: string | null }}
 */
export function topLevelFunction(source, name) {
  const lines = source.split("\n");
  const starts = lines.flatMap((line, index) => (line.startsWith(`def ${name}(`) ? [index] : []));
  if (starts.length !== 1) return { count: starts.length, text: null };
  let end = starts[0] + 1;
  while (end < lines.length && (lines[end].trim() === "" || /^\s/.test(lines[end]))) end++;
  while (end > starts[0] + 1 && lines[end - 1].trim() === "") end--;
  return { count: 1, text: lines.slice(starts[0], end).join("\n") };
}

/**
 * Where core's refusals at the pin differ from the ones the port was read from, or []. A function
 * the check cannot find, or finds twice, is drift too.
 *
 * @param {string} capabilitySource core's CORE_CAPABILITY_IDS_PATH at the pinned commit
 * @param {(text: string) => string} sha256 the hex SHA-256 of a string (this module imports no Node built-in)
 * @param {Record<string, string>} [expected] each function's fingerprint, REFUSAL_FINGERPRINTS by default
 * @returns {string[]}
 */
export function refusalsDrift(capabilitySource, sha256, expected = REFUSAL_FINGERPRINTS) {
  const reread =
    "Re-read core's capability_refusals and _label_refusals, port what changed into appManifestProblems, " +
    "and update REFUSAL_FINGERPRINTS in src/data/apps-snippet.mjs.";
  return Object.entries(expected).flatMap(([name, fingerprint]) => {
    const { count, text } = topLevelFunction(capabilitySource, name);
    if (count === 0) return [`${CORE_CAPABILITY_IDS_PATH} at the pin defines no ${name} this check can read. ${reread}`];
    if (count > 1) return [`${CORE_CAPABILITY_IDS_PATH} at the pin defines ${name} ${count} times. ${reread}`];
    return sha256(text) === fingerprint ? [] : [`${CORE_CAPABILITY_IDS_PATH} at the pin has a changed ${name}. ${reread}`];
  });
}
