import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { routes } from "../tests/support/site-contract.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const snapshotDirectory = join(
  repositoryRoot,
  "tests/browser/__screenshots__/visual.spec.ts"
);
const platforms = ["darwin", "linux"];
const responsiveProjects = ["desktop", "mobile"];

const expected = new Set();

for (const platform of platforms) {
  for (const project of responsiveProjects) {
    for (const route of routes) {
      expected.add(`${route.name}-page-${project}-${platform}.png`);
    }
    expected.add(`home-loops-state-${project}-${platform}.png`);
    expected.add(`apps-filtered-state-${project}-${platform}.png`);
  }
  expected.add(`mobile-navigation-open-mobile-${platform}.png`);
}

const actual = readdirSync(snapshotDirectory)
  .filter((entry) => entry.endsWith(".png"))
  .sort();
const missing = [...expected].filter((entry) => !actual.includes(entry)).sort();
const unexpected = actual.filter((entry) => !expected.has(entry));

if (missing.length || unexpected.length) {
  if (missing.length) {
    console.error(`Missing visual baselines:\n- ${missing.join("\n- ")}`);
  }
  if (unexpected.length) {
    console.error(`Unexpected visual baselines:\n- ${unexpected.join("\n- ")}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${actual.length} visual baselines across ${platforms.join(" and ")}.`
  );
}
