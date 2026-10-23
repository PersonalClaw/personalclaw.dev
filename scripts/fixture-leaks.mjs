// Fixture apps on a real build (#112). The registry sheets' fixture build (scripts/registry-probe.mjs)
// renders apps that exist only in tests/fixtures; one of them on the live site would be a sheet for
// an app nobody publishes. scripts/validate-build.mjs fails a real build that names any of them,
// in a page's text or in a file's path; tests/registry-sheets.test.mjs plants both.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Every fixture app name: the first-party fixture manifests' and the registry fixtures' rows', each
 * named for a fixture. A row that borrows a real app's name (the look-alike row takes a
 * first-party name on purpose) is that app's, not a fixture's, so it is not one.
 */
export function fixtureAppNames(fixturesDir) {
  const names = new Set();
  const firstParty = path.join(fixturesDir, "first-party");
  for (const file of readdirSync(firstParty).filter((name) => name.endsWith(".json"))) {
    names.add(JSON.parse(readFileSync(path.join(firstParty, file), "utf8")).name);
  }
  for (const file of readdirSync(fixturesDir).filter((name) => /^registry-.*\.json$/.test(name))) {
    for (const row of JSON.parse(readFileSync(path.join(fixturesDir, file), "utf8")).registry?.apps ?? []) {
      if (typeof row?.name === "string" && row.name) names.add(row.name);
    }
  }
  return [...names].filter((name) => /fixture/i.test(name)).sort();
}

/**
 * Where a build names a fixture app: a file whose path does, and a text file whose text does.
 *
 * @param {{ path: string, text?: string }[]} files build-relative paths, with text for text files
 * @param {string[]} names
 * @returns {string[]}
 */
export function fixtureLeaks(files, names) {
  if (names.length === 0) return [];
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(?<![A-Za-z0-9-])(${escaped.join("|")})(?![A-Za-z0-9-])`);
  const problems = [];
  for (const file of files) {
    const inPath = pattern.exec(file.path);
    if (inPath) {
      problems.push(`${file.path}: a fixture app (${inPath[1]}) is in the build`);
      continue;
    }
    const inText = file.text === undefined ? null : pattern.exec(file.text);
    if (inText) problems.push(`${file.path}: names the fixture app ${inText[1]}`);
  }
  return problems;
}
