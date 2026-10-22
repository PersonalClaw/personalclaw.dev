// Prove /security cites what it claims: every control links the file that enforces it at the
// pinned release tag, the boundary table holds one row per boundary with its five columns, and
// the known limits come before the controls, name the release they were verified against and
// point at a /compare row or a section of the limitations page that still states them.
//
//   npm run validate:security      # after a build; reads DIST_DIR (default: dist)
//
// The rules are scripts/security-page.mjs, and tests/security-page.test.mjs plants each failure.
// It reads src/data/security.json and src/data/capabilities.json DIRECTLY, and the pinned tag from
// sources/personalclaw.sources.json, so a data file re-pinned without being re-read fails here.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { declaredSecurityProblems, renderedSecurityProblems } from "./security-page.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDirectory = join(repositoryRoot, process.env.DIST_DIR ?? "dist");
const readJson = (...parts) => JSON.parse(readFileSync(join(repositoryRoot, ...parts), "utf8"));

const data = readJson("src", "data", "security.json");
const compareRows = readJson("src", "data", "capabilities.json").rows;
const { repository, tag } = readJson("sources", "personalclaw.sources.json").sources.core;

const problems = declaredSecurityProblems(data, { repository, tag, compareRows });

const page = join(distDirectory, "security", "index.html");
const limitations = join(distDirectory, "docs", "security", "limitations", "index.html");
if (!existsSync(page)) {
  problems.push(`${page} does not exist: run a build first`);
} else {
  const limitationIds = existsSync(limitations)
    ? new Set(load(readFileSync(limitations, "utf8"))("[id]").map((_, element) => element.attribs.id).get())
    : undefined;
  if (!limitationIds) problems.push(`${limitations} does not exist, so the limits' sections cannot be checked`);
  problems.push(...renderedSecurityProblems(readFileSync(page, "utf8"), data, { repository, tag, limitationIds }));
}

if (problems.length > 0) {
  console.error(`validate:security: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `validate:security: ${data.controls.length} controls cited at ${tag}, ${data.boundaries.length} boundaries in the table, ` +
    `${data.limits.length} known limits before the controls`,
);
