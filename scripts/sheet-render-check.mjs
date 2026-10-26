// What a built install-safety sheet (/registry/<name>) must say, checked against the RAW source:
// the pinned `app.json` text for a first-party app, the registry row for a community listing.
//
// THE FAILURE THIS EXISTS TO CATCH. A sheet is a pre-install consent surface: a field that
// renders the wrong permission, drops a host, or reads a missing value as a pass misleads the one
// reader who is deciding whether to run the app. src/data/registry.mjs builds the sheet, so a
// check that read the sheet's facts back through it would agree with any mistake it made. This
// module never imports it: it reads the raw manifest or row and states, field by field, what the
// page must show, or the exact line that says the field has no source.
//
// scripts/validate-registry-render.mjs runs it over every sheet a fixture build yields;
// tests/sheet-render-check.test.mjs breaks each field's rendering in turn and requires the check
// to fail naming that field.

import { gitBlobSha, NOT_DECLARED, NOT_RECORDED } from "./app-sheet.mjs";

export const NO_SCAN_PUBLISHED = "No scan is published before install";

/**
 * The install-time rescan in words true of each kind of sheet: a community listing is not
 * reviewed or endorsed, and a first-party app is not a listing at all. Both keep the Store's
 * closing clause, "rescanned when you install". Stated here apart from src/data/registry.mjs, so
 * a sheet that renders the other kind's sentence, or a reworded one, fails.
 */
export const INSTALL_GATE = {
  community:
    "PersonalClaw does not review or endorse listed apps. It runs its own scan of the actual code " +
    "instead: every listed app is rescanned when you install, and that scan is what can stop an install.",
  "first-party":
    "PersonalClaw runs its own scan of the actual code of every app it installs: this one is " +
    "rescanned when you install, and that scan is what can stop an install."
};

/** The fields every sheet carries, by `data-field`. */
export const SHEET_FIELDS = [
  "permissions",
  "network",
  "hosts",
  "scanVerdict",
  "scanTime",
  "findings",
  "scanner",
  "source",
  "publisher",
  "license",
  "commit",
  "compatibility",
  "signer",
  "secrets"
];

const SIGNER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** The verdicts the registry's schema defines (`last_scan_verdict`'s enum at its pin). */
export const SCHEMA_VERDICTS = new Set(["clean", "low", "warning", "dangerous"]);

function sensitiveLabels(manifest) {
  const schemas = [
    manifest.settingsSchema,
    manifest.provider?.settingsSchema,
    ...(manifest.providers ?? []).map((provider) => provider?.settingsSchema)
  ].filter(Boolean);
  const labels = [];
  for (const schema of schemas) {
    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      if (property?.["x-meta"]?.sensitive === true) labels.push(String(property["x-meta"].label ?? key));
    }
  }
  return [...new Set(labels)];
}

function hostLines(manifest) {
  const lines = [];
  for (const launch of manifest.launches ?? []) {
    if (launch?.hosts?.length) lines.push(`the program ${launch.program}: ${launch.hosts.join(", ")}`);
  }
  for (const [name, server] of Object.entries(manifest.mcpServers ?? {})) {
    if (server?.url) lines.push(`the MCP server ${name}: ${server.url}`);
  }
  for (const source of manifest.sources ?? []) {
    if (source?.fetchSpec?.url) lines.push(`the source ${source.name}: ${source.fetchSpec.url}`);
  }
  return lines;
}

/** `major.minor.patch` at the start of *text*, as core reads a floor, or null. Read here on its own. */
const versionAt = (text) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(text ?? "").trim());
  return match ? match.slice(1).map(Number) : null;
};

/**
 * What the compatibility field must say of an app needing no missing feature, from its raw floor:
 * none or one at or below the release works, one above it is named, and one this check cannot read
 * as MAJOR.MINOR.PATCH is said to be one the site cannot compare (core reads any PEP 440 version).
 *
 * @param {unknown} floor the manifest's `minPersonalClawVersion`, as written
 * @param {string} tag the release the sheet is read at
 */
function floorWords(floor, tag) {
  const written = String(floor ?? "").trim();
  if (!written) return `Works with PersonalClaw ${tag}`;
  const want = versionAt(written);
  const have = versionAt(tag);
  if (!want || !have) return `Its version floor, ${written}, is not a version this site can compare with ${tag}`;
  const index = want.findIndex((part, i) => part !== have[i]);
  const above = index !== -1 && want[index] > have[index];
  return above ? `Needs PersonalClaw ${written} or later, above ${tag}` : `Works with PersonalClaw ${tag}`;
}

/**
 * What a first-party sheet must show, from its raw `app.json` text and the release it is read at.
 *
 * @param {string} text the manifest's exact bytes
 * @param {{ tag: string, features: string[], appsRepositoryUrl: string, appsCommit: string, path: string }} at
 */
export function expectedFirstParty(text, at) {
  const manifest = JSON.parse(text);
  const permissions = Object.entries(manifest.permissions ?? {}).map(
    ([key, value]) => `${key}: ${JSON.stringify(value)}`
  );
  const network = manifest.permissions?.network;
  const missing = (manifest.requiresCoreFeatures ?? []).filter((name) => !at.features.includes(name));
  const secrets = sensitiveLabels(manifest);
  return {
    permissions: { value: permissions.length ? permissions : null, missing: NOT_DECLARED },
    network: {
      value:
        network === true
          ? "On. Its own network permission is a declaration, not a fence."
          : network === false
            ? "Off. Its own network permission is a declaration, not a fence."
            : null,
      missing: NOT_DECLARED
    },
    hosts: { value: hostLines(manifest).length ? hostLines(manifest) : null, missing: NOT_DECLARED },
    scanVerdict: { value: "No scan on record before install", missing: NO_SCAN_PUBLISHED },
    scanTime: { value: null, missing: NO_SCAN_PUBLISHED },
    findings: { value: null, missing: NO_SCAN_PUBLISHED },
    scanner: { value: null, missing: NO_SCAN_PUBLISHED },
    source: {
      value: `${at.appsRepositoryUrl}/tree/${at.appsCommit}/${at.path.split("/")[0]}`,
      missing: NOT_DECLARED
    },
    publisher: { value: manifest.author || null, missing: NOT_DECLARED },
    license: { value: manifest.license || null, missing: NOT_DECLARED },
    commit: { value: at.appsCommit, missing: NOT_DECLARED },
    compatibility: {
      // Compatible says exactly that; incompatible must name every feature the release lacks, or
      // the version floor it fails.
      value: missing.length === 0 ? floorWords(manifest.minPersonalClawVersion, at.tag) : null,
      names: missing,
      missing: NOT_DECLARED
    },
    signer: { value: null, missing: NOT_DECLARED },
    secrets: { value: secrets.length ? secrets : null, missing: NOT_DECLARED }
  };
}

/**
 * What a community sheet must show, from its raw registry row and the registry's recorded scanner.
 *
 * @param {Record<string, any>} row
 * @param {{ name: string, version: string } | null} scanner
 */
export function expectedCommunity(row, scanner) {
  const permissions = row.permissions_declared;
  let signer = null;
  if (row.signer === "unsigned") signer = "Unsigned, as the listing declares";
  else if (typeof row.signer === "string" && SIGNER.test(row.signer)) signer = { startsWith: row.signer };
  else if (Object.hasOwn(row, "signer")) signer = { includes: String(row.signer) };
  return {
    permissions: { value: permissions.length ? permissions : null, missing: "This app declares no permissions." },
    network: { value: permissions.includes("network") ? "Declared in the listing's permissions" : null, missing: NOT_RECORDED },
    hosts: { value: null, missing: NOT_RECORDED },
    scanVerdict: {
      value:
        row.last_scan_verdict === undefined
          ? null
          : SCHEMA_VERDICTS.has(row.last_scan_verdict)
            ? `registry check: ${row.last_scan_verdict}`
            : `Unrecognised verdict: ${row.last_scan_verdict}`,
      missing: NOT_RECORDED
    },
    scanTime: { value: row.last_validated ?? null, missing: NOT_RECORDED },
    findings: { value: null, missing: NOT_RECORDED },
    scanner: { value: scanner ? `${scanner.name} ${scanner.version}` : null, missing: NOT_RECORDED },
    source: { value: row.repo, missing: NOT_RECORDED },
    publisher: { value: row.maintainer, missing: NOT_RECORDED },
    license: { value: row.license, missing: NOT_RECORDED },
    commit: { value: null, missing: NOT_RECORDED },
    compatibility: { value: null, missing: NOT_RECORDED },
    signer: { value: signer, missing: NOT_RECORDED },
    secrets: { value: null, missing: NOT_RECORDED }
  };
}

const squash = (text) => text.replace(/\s+/g, " ").trim();

/**
 * What is wrong with one built sheet's fields, against what its raw source says.
 *
 * @param {import("cheerio").CheerioAPI} $ the built page
 * @param {string} name the app's name
 * @param {ReturnType<typeof expectedFirstParty> | ReturnType<typeof expectedCommunity>} expected
 */
export function fieldProblems($, name, expected) {
  const problems = [];
  for (const id of SHEET_FIELDS) {
    const want = expected[id];
    const cell = $(`[data-field="${id}"]`);
    if (cell.length !== 1) {
      problems.push(`${name}: the ${id} field is shown ${cell.length} times, not once`);
      continue;
    }
    const missing = cell.find("[data-field-missing]");
    const value = cell.find("[data-field-value]");
    const items = value.find("li").toArray().map((li) => squash($(li).text()));
    const text = squash(value.text());
    if (want.value === null && !want.names?.length) {
      if (missing.length !== 1 || squash(missing.text()) !== want.missing) {
        problems.push(`${name}: the ${id} field must read "${want.missing}" exactly, but reads "${squash(cell.find("dd").text())}"`);
      }
      continue;
    }
    if (missing.length > 0) {
      problems.push(`${name}: the ${id} field reads "${squash(missing.text())}", but its source has a value`);
      continue;
    }
    if (want.names?.length) {
      for (const feature of want.names) {
        if (!text.includes(feature)) problems.push(`${name}: the ${id} field does not name ${feature}`);
      }
    } else if (Array.isArray(want.value)) {
      if (JSON.stringify(items) !== JSON.stringify(want.value)) {
        problems.push(`${name}: the ${id} field lists ${JSON.stringify(items)}, its source ${JSON.stringify(want.value)}`);
      }
    } else if (typeof want.value === "object") {
      const ok = want.value.startsWith ? text.startsWith(want.value.startsWith) : text.includes(want.value.includes);
      if (!ok || (want.value.includes && !/not a signer identity/.test(text))) {
        problems.push(`${name}: the ${id} field reads "${text}", which does not state its source's ${JSON.stringify(want.value)}`);
      }
    } else if (text !== want.value) {
      problems.push(`${name}: the ${id} field reads "${text}", its source "${want.value}"`);
    }
  }
  return problems;
}

/**
 * What is wrong with a first-party sheet's manifest panel: its text must be the pinned bytes, and
 * both those bytes and the hash it shows must be the blob the pinned tree lists for its app.json.
 *
 * @param {import("cheerio").CheerioAPI} $
 * @param {string} name
 * @param {{ text: string, treeBlob: string }} raw
 */
export function manifestProblems($, name, raw) {
  const problems = [];
  const shown = $("[data-manifest]").first();
  // Cheerio's .text() decodes the escaped page text back to the bytes as written.
  const text = shown.text();
  if (text !== raw.text) problems.push(`${name}: the manifest panel's text is not the pinned app.json`);
  if (gitBlobSha(text) !== raw.treeBlob) problems.push(`${name}: the manifest panel's text does not hash to the blob the pinned tree lists`);
  if (squash($("[data-manifest-blob]").text()) !== raw.treeBlob) problems.push(`${name}: the manifest panel shows a hash that is not the pinned tree's`);
  return problems;
}

/**
 * What is wrong with a sheet's action: an unsafe or incompatible sheet carries no enable steps
 * and nothing that installs or enables, and says why; any other carries the steps.
 *
 * @param {import("cheerio").CheerioAPI} $
 * @param {string} name
 * @param {boolean} blocked
 */
/**
 * What is wrong with a sheet's install-time rescan sentence for its kind.
 *
 * @param {import("cheerio").CheerioAPI} $
 * @param {string} name
 * @param {"community" | "first-party"} kind
 */
export function installGateProblems($, name, kind) {
  const shown = $(".install-gate").first().text().replace(/\s+/g, " ").trim();
  if (!shown) return [`${name}: the sheet names no install-time rescan`];
  if (shown !== INSTALL_GATE[kind]) return [`${name}: a ${kind} sheet must read "${INSTALL_GATE[kind]}", not "${shown}"`];
  // The rescan is a ledger claim: its /compare row sits beside the sentence, in the decision.
  if ($("[data-decision]").find('a[href="/compare#install_rescan"]').length === 0) {
    return [`${name}: the install-time rescan does not link its row, /compare#install_rescan, beside it`];
  }
  return [];
}

export function actionProblems($, name, blocked) {
  const problems = [];
  const steps = $("[data-enable-steps]");
  // An action is a link or button that installs, enables or switches the app on, or a command
  // that does; disabled ones count too. A link that only names a claim ("The row on Compare:
  // install rescan") is not one.
  const commands = $("a, button, code, pre")
    .toArray()
    .filter((element) => {
      const text = squash($(element).text());
      const tag = element.tagName?.toLowerCase();
      const action = tag === "a" || tag === "button"
        ? /^(install|enable|switch\b.*\bon\b)/i.test(text)
        : /\bpersonalclaw\s+(app\s+)?(install|enable)\b/i.test(text);
      return action && $(element).closest("[data-enable-steps]").length === 0;
    });
  if (blocked) {
    if (steps.length > 0) problems.push(`${name}: an unsafe or incompatible sheet shows the enable steps`);
    if ($("[data-no-enable]").length !== 1) problems.push(`${name}: an unsafe or incompatible sheet does not say why it has no action`);
    for (const element of commands) problems.push(`${name}: an unsafe or incompatible sheet carries "${squash($(element).text())}"`);
  } else if (steps.length !== 1) {
    problems.push(`${name}: the sheet has no enable steps, so the blocked sheets' check would pass on a page with none`);
  }
  return problems;
}
