// Runs the visual specs inside the pinned Playwright image (tests/browser/visual-image.json),
// the one environment the committed baselines are made and compared in.
//
//     node scripts/run-visual.mjs                        (npm run test:visual)
//     node scripts/run-visual.mjs --update-snapshots=all (npm run test:visual:update, after a build)
//
// It runs only on a linux/amd64 host with a container runtime: the image is linux/amd64,
// and the host's exact Node (the one .node-version pins) and its installed node_modules
// are mounted into the container, so the preview server and Playwright run on the same
// Node and packages as the rest of CI. On any other host it refuses and says where the
// baselines are compared instead: Website CI's browser job, and the Refresh visual
// baselines workflow, which regenerates them. It never installs anything.
//
// Before the specs run it probes the container (scripts/visual-environment.mjs) for the
// browser build, renderer and fonts. A compare run fails when that environment differs
// from the one the committed manifest records, or when there is no manifest, so a pixel
// diff is never the first sign that the environment moved. A refresh writes the manifest
// from the probe and rewrites every baseline. A compare run passes --update-snapshots=none,
// so a missing baseline fails rather than being written.
// tests/visual-environment.test.mjs plants each refusal through main() with a fake runner.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PIN_FILE, checkPin, readPin } from "../tests/support/visual-image.mjs";

export const MANIFEST = "tests/browser/__screenshots__/visual-environment.json";
export const COMPARED = ["image", "platform", "playwright", "browser", "renderer", "fonts"];
const CONTAINER_NODE = "/opt/node/bin/node";
const CONTAINER_PATH = "/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";
const ELSEWHERE =
  "Compare and refresh them on CI instead: Website CI's browser job compares them, and the " +
  "Refresh visual baselines workflow (.github/workflows/visual-baselines.yml) regenerates them.";

class Refusal extends Error {
  constructor(message, status = 2) {
    super(message);
    this.status = status;
  }
}

const tail = (text) => String(text ?? "").trim().split("\n").slice(-5).join("\n").slice(-600);

export function compareEnvironment(manifest, current, pin) {
  const problems = [];
  const missing = COMPARED.filter((field) => manifest?.[field] === undefined);
  if (missing.length > 0) problems.push(`${MANIFEST}: missing ${missing.join(", ")}`);
  if (manifest?.image !== undefined && manifest.image !== pin.image) {
    problems.push(`${MANIFEST} names image ${manifest.image}, not the pinned ${pin.image}: regenerate the baselines`);
    return problems;
  }
  for (const field of COMPARED) {
    if (manifest?.[field] === undefined) continue;
    const made = JSON.stringify(manifest[field]);
    const now = JSON.stringify(current?.[field]);
    if (made !== now) problems.push(`${field}: the baselines were made with ${made}, this run has ${now}`);
  }
  return problems;
}

export function dockerArgs({ root, nodePrefix, pin, uid, gid, command }) {
  const env = {
    HOME: "/tmp",
    PATH: CONTAINER_PATH,
    PLAYWRIGHT_VISUAL: "1",
    VISUAL_IMAGE: pin.image,
    PLAYWRIGHT_HTML_OUTPUT_DIR: "playwright-report/visual",
    ASTRO_TELEMETRY_DISABLED: "1",
    ...(process.env.CI ? { CI: process.env.CI } : {}),
  };
  return [
    "run",
    "--rm",
    "--platform", pin.platform,
    "--ipc=host",
    "--user", `${uid}:${gid}`,
    ...Object.entries(env).flatMap(([name, value]) => ["-e", `${name}=${value}`]),
    "-v", `${nodePrefix}:/opt/node:ro`,
    "-v", `${root}:/work`,
    "-w", "/work",
    pin.image,
    ...command,
  ];
}

function parseArgs(argv) {
  const update = argv.includes("--update-snapshots=all");
  for (const arg of argv) {
    if (arg !== "--update-snapshots=all") throw new Refusal(`unknown argument ${arg} (usage: node scripts/run-visual.mjs [--update-snapshots=all])`);
  }
  return { update };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function main(argv = [], options = {}) {
  const root = options.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const execPath = options.execPath ?? process.execPath;
  const uid = options.uid ?? process.getuid?.() ?? 0;
  const gid = options.gid ?? process.getgid?.() ?? 0;
  const log = options.log ?? ((line) => console.log(line));
  const run = options.run ?? ((command, args) => spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: args.includes("scripts/visual-environment.mjs") ? "pipe" : "inherit", maxBuffer: 64 * 1024 * 1024 }));

  try {
    const { update } = parseArgs(argv);
    if (platform !== "linux" || arch !== "x64") {
      throw new Refusal(`The visual specs run only on a linux/amd64 host, inside the pinned image; this host is ${platform}/${arch}. ${ELSEWHERE}`);
    }
    let pin;
    try {
      pin = readPin(root);
    } catch (error) {
      throw new Refusal(`${PIN_FILE} cannot be read: ${error.message}`);
    }
    const pinProblems = checkPin(pin, readJson(path.join(root, "package-lock.json")));
    if (pinProblems.length > 0) throw new Refusal(pinProblems.join("\n"));

    const container = (command) => dockerArgs({ root, nodePrefix: path.dirname(path.dirname(execPath)), pin, uid, gid, command });
    const probe = run("docker", container([CONTAINER_NODE, "scripts/visual-environment.mjs"]));
    if (probe.error) {
      throw new Refusal(probe.error.code === "ENOENT" ? `The visual specs need docker, and none was found. ${ELSEWHERE}` : `docker could not be started: ${probe.error.message}`);
    }
    if (probe.status !== 0) throw new Refusal(`the environment probe failed (exit ${probe.status}): ${tail(probe.stderr || probe.stdout)}`);
    let current;
    try {
      current = JSON.parse(probe.stdout);
    } catch {
      throw new Refusal(`the environment probe printed no JSON: ${tail(probe.stdout)}`);
    }
    log(`visual environment: ${JSON.stringify(current)}`);

    if (update) {
      fs.mkdirSync(path.dirname(path.join(root, MANIFEST)), { recursive: true });
      fs.writeFileSync(path.join(root, MANIFEST), `${JSON.stringify(current, null, 2)}\n`);
      log(`wrote ${MANIFEST}`);
    } else {
      const manifest = readJson(path.join(root, MANIFEST));
      if (!manifest) {
        throw new Refusal(`There is no environment manifest at ${MANIFEST}, so these baselines were not made in the pinned image. Run the Refresh visual baselines workflow and commit its artifact.`, 1);
      }
      const problems = compareEnvironment(manifest, current, pin);
      if (problems.length > 0) {
        throw new Refusal(`This run's environment is not the one the baselines were made in; regenerate them with the Refresh visual baselines workflow:\n${problems.join("\n")}`, 1);
      }
    }

    const suite = run("docker", container([
      CONTAINER_NODE,
      "node_modules/@playwright/test/cli.js",
      "test",
      "--output=test-results/visual",
      update ? "--update-snapshots=all" : "--update-snapshots=none",
    ]));
    if (suite.error) throw new Refusal(`docker could not be started: ${suite.error.message}`);
    if (suite.status !== 0) throw new Refusal(`The visual specs failed in the pinned image (exit ${suite.status ?? suite.signal}).`, 1);
    log(update ? "Every visual baseline was rewritten in the pinned image; review the diff before committing it." : "The visual specs match their baselines in the pinned image.");
    return 0;
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    log(`::error title=visual specs::${error.message.split("\n")[0]}`);
    log(error.message);
    return error.status;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
