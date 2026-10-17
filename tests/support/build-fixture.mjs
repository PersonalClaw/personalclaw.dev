// A throwaway checkout with a shared build in it, for the build-record tests: a git
// repository holding the files the record reads (.node-version, package.json, the lock,
// the sources manifest), and an artifact (dist/, .preview-dist/, the generated data, the
// synced docs and llms pair) beside it, ignored the way the real ones are. It lives
// under .generated/, which git ignores, and `remove()` deletes it.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const FIXTURE_NODE = "v22.23.3";
export const FIXTURE_NPM = "10.9.9";

const IDENTITY = {
  GIT_AUTHOR_NAME: "Example",
  GIT_AUTHOR_EMAIL: "ci@example.com",
  GIT_COMMITTER_NAME: "Example",
  GIT_COMMITTER_EMAIL: "ci@example.com",
};

function git(directory, args) {
  return execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, ...IDENTITY },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function write(directory, file, content) {
  const target = path.join(directory, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

// Commits the working tree with plumbing (no hooks, no signing: this is a fixture, not
// a change anyone publishes) and points HEAD at it.
export function commitAll(directory) {
  git(directory, ["add", "-A"]);
  const tree = git(directory, ["write-tree"]);
  const parent = (() => {
    try {
      return git(directory, ["rev-parse", "--verify", "-q", "HEAD"]);
    } catch {
      return "";
    }
  })();
  const commit = git(directory, ["commit-tree", "--no-gpg-sign", tree, ...(parent ? ["-p", parent] : []), "-m", "fixture"]);
  git(directory, ["update-ref", "HEAD", commit]);
  return { commit, tree };
}

export function createBuildFixture() {
  const scratch = path.join(root, ".generated");
  fs.mkdirSync(scratch, { recursive: true });
  const directory = fs.mkdtempSync(path.join(scratch, "build-record-test-"));
  git(directory, ["init", "-q"]);

  write(directory, ".node-version", "22.23.3\n");
  write(
    directory,
    "package.json",
    `${JSON.stringify({ name: "example", private: true, packageManager: "npm@10.9.9", engines: { node: ">=22.19.0 <23" } }, null, 2)}\n`,
  );
  write(directory, "package-lock.json", `${JSON.stringify({ name: "example", lockfileVersion: 3, packages: {} }, null, 2)}\n`);
  write(
    directory,
    "sources/personalclaw.sources.json",
    fs.readFileSync(path.join(root, "sources", "personalclaw.sources.json"), "utf8"),
  );
  write(
    directory,
    ".gitignore",
    ["dist/", ".preview-dist/", ".generated/", "src/content/docs/", "public/llms.txt", "public/llms-full.txt", ""].join("\n"),
  );
  commitAll(directory);

  write(directory, "dist/index.html", '<!doctype html><script src="/_astro/index.abc123.js"></script>\n');
  write(directory, "dist/docs/index.html", "<!doctype html><title>Docs</title>\n");
  write(directory, ".preview-dist/index.html", '<!doctype html><meta name="robots" content="noindex">\n');
  write(directory, ".generated/release-facts.json", '{"schemaVersion":1,"generatedAt":"2026-10-17T00:00:00.000Z"}\n');
  write(directory, ".generated/registry.json", '{"schemaVersion":1,"generatedAt":"2026-10-17T00:00:01.000Z"}\n');
  write(directory, ".generated/docs-index.json", '{"schemaVersion":1,"trees":[]}\n');
  write(directory, "src/content/docs/docs/index.md", "# Docs\n");
  write(directory, "public/llms.txt", "# example.com\n");
  write(directory, "public/llms-full.txt", "# example.com, in full\n");

  return {
    root: directory,
    write: (file, content) => write(directory, file, content),
    read: (file) => fs.readFileSync(path.join(directory, file), "utf8"),
    remove: (file) => fs.rmSync(path.join(directory, file), { recursive: true, force: true }),
    commitAll: () => commitAll(directory),
    dispose: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}
