import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import Ajv2020 from "ajv/dist/2020.js";
import { parse as parseToml } from "smol-toml";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const manifestPath = path.join(root, "sources", "personalclaw.sources.json");
const schemaPath = path.join(root, "sources", "personalclaw.sources.schema.json");
const cacheRoot = path.join(root, ".source-cache");
const generatedPath = path.join(root, ".generated", "release-facts.json");
const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "personalclaw.dev-source-sync",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {})
};
const categoryOrder = [
  "Models",
  "Search",
  "Agents",
  "Tools",
  "Speech",
  "Channels",
  "Actions",
  "Skills",
  "Products"
];
const providerCategory = {
  model: "Models",
  search: "Search",
  agent: "Agents",
  tool: "Tools",
  channel: "Channels",
  action: "Actions",
  skills: "Skills"
};
const speechCapabilities = new Set(["diarization", "stt", "tts"]);

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function formatAjvErrors(errors = []) {
  return errors
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
}

async function loadManifest() {
  const [manifest, schema] = await Promise.all([
    readJson(manifestPath),
    readJson(schemaPath)
  ]);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  if (!validate(manifest)) {
    throw new Error(`Invalid source manifest: ${formatAjvErrors(validate.errors)}`);
  }
  return manifest;
}

function normalizeGitHubRepository(remote) {
  const match = remote
    .trim()
    .match(
      /^(?:(?:https?|git):\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?\/?$/i
    );
  return match ? `${match[1]}/${match[2]}` : null;
}

async function runGit(directory, args) {
  const { stdout } = await execFileAsync("git", ["-C", directory, ...args], {
    encoding: "utf8"
  });
  return stdout.trim();
}

async function resolveLocalSource(key, source) {
  if (process.env.SOURCE_SYNC_REMOTE_ONLY === "1") return null;

  const environmentPath =
    key === "core"
      ? process.env.PERSONALCLAW_CORE_DIR
      : process.env.PERSONALCLAW_APPS_DIR;
  const repositoryName = source.repository.split("/").at(-1);
  const candidate = path.resolve(root, environmentPath ?? `../${repositoryName}`);

  if (!(await fileExists(path.join(candidate, ".git")))) {
    if (environmentPath) {
      throw new Error(`${key} source override is not a Git checkout: ${candidate}`);
    }
    return null;
  }

  const [head, remote] = await Promise.all([
    runGit(candidate, ["rev-parse", "HEAD"]),
    runGit(candidate, ["config", "--get", "remote.origin.url"])
  ]);
  const repository = normalizeGitHubRepository(remote);

  if (repository !== source.repository || head !== source.commit) {
    if (environmentPath) {
      throw new Error(
        `${key} source override does not match ${source.repository}@${source.commit}`
      );
    }
    console.log(
      `Ignoring local ${key} checkout (${repository ?? "unknown"}@${head}); expected ${source.repository}@${source.commit}.`
    );
    return null;
  }

  return {
    key,
    mode: "local",
    root: candidate,
    source,
    async listAppManifests() {
      const entries = await readdir(candidate, { withFileTypes: true });
      const manifests = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const relativePath = `${entry.name}/app.json`;
        if (await fileExists(path.join(candidate, relativePath))) {
          manifests.push(relativePath);
        }
      }
      return manifests.sort();
    },
    readText(relativePath) {
      return readFile(path.join(candidate, relativePath), "utf8");
    }
  };
}

function cacheDirectory(source) {
  const repositoryName = source.repository.replace("/", "--");
  return path.join(cacheRoot, repositoryName, source.commit);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: githubHeaders });
  if (!response.ok) {
    throw new Error(`GitHub request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": githubHeaders["User-Agent"] }
  });
  if (!response.ok) {
    throw new Error(`Pinned source request failed (${response.status}) for ${url}`);
  }
  return response.text();
}

async function verifyRemoteCommit(source, directory) {
  const metadataPath = path.join(directory, ".source.json");
  if (await fileExists(metadataPath)) {
    const metadata = await readJson(metadataPath);
    if (
      metadata.repository === source.repository &&
      metadata.commit === source.commit &&
      typeof metadata.tree === "string"
    ) {
      return metadata;
    }
  }

  const commit = await fetchJson(
    `https://api.github.com/repos/${source.repository}/commits/${source.commit}`
  );
  if (commit.sha !== source.commit || typeof commit.commit?.tree?.sha !== "string") {
    throw new Error(
      `GitHub did not resolve ${source.repository}@${source.commit} to the requested commit`
    );
  }

  const metadata = {
    repository: source.repository,
    commit: source.commit,
    tree: commit.commit.tree.sha
  };
  await mkdir(directory, { recursive: true });
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

async function writeAtomically(filePath, content) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(temporaryPath, content);
  await rename(temporaryPath, filePath);
}

async function resolveRemoteSource(key, source) {
  const directory = cacheDirectory(source);
  const metadata = await verifyRemoteCommit(source, directory);

  return {
    key,
    mode: "remote",
    root: directory,
    source,
    async listAppManifests() {
      const indexPath = path.join(directory, ".app-manifests.json");
      if (await fileExists(indexPath)) return readJson(indexPath);

      const tree = await fetchJson(
        `https://api.github.com/repos/${source.repository}/git/trees/${metadata.tree}?recursive=1`
      );
      if (tree.sha !== metadata.tree || tree.truncated) {
        throw new Error(
          `Could not read the complete pinned tree for ${source.repository}@${source.commit}`
        );
      }
      const manifests = tree.tree
        .filter(
          (entry) =>
            entry.type === "blob" &&
            /^[^/]+\/app\.json$/.test(entry.path)
        )
        .map((entry) => entry.path)
        .sort();
      await writeAtomically(indexPath, `${JSON.stringify(manifests, null, 2)}\n`);
      return manifests;
    },
    async readText(relativePath) {
      const cachedPath = path.join(directory, relativePath);
      if (await fileExists(cachedPath)) return readFile(cachedPath, "utf8");

      const content = await fetchText(
        `https://raw.githubusercontent.com/${source.repository}/${source.commit}/${relativePath}`
      );
      await writeAtomically(cachedPath, content);
      return content;
    }
  };
}

async function resolveSource(key, source) {
  const local = await resolveLocalSource(key, source);
  const resolved = local ?? (await resolveRemoteSource(key, source));
  console.log(
    `Using ${resolved.mode} ${key} source ${source.repository}@${source.commit.slice(0, 12)}.`
  );
  return resolved;
}

async function resolveLocalTag(directory, tag) {
  try {
    return await runGit(directory, ["rev-list", "-n", "1", tag]);
  } catch {
    return null;
  }
}

async function resolveRemoteTag(repository, tag) {
  let object = (
    await fetchJson(
      `https://api.github.com/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`
    )
  ).object;

  for (let depth = 0; object?.type === "tag" && depth < 5; depth += 1) {
    object = (
      await fetchJson(
        `https://api.github.com/repos/${repository}/git/tags/${object.sha}`
      )
    ).object;
  }
  return object?.type === "commit" ? object.sha : null;
}

async function validateReleaseTags(manifest, sources) {
  if (manifest.channel === "pre-release") return;

  for (const [key, source] of Object.entries(manifest.sources)) {
    const resolved =
      sources[key].mode === "local"
        ? await resolveLocalTag(sources[key].root, source.tag)
        : await resolveRemoteTag(source.repository, source.tag);
    if (resolved !== source.commit) {
      throw new Error(
        `${source.repository} tag ${source.tag} resolves to ${resolved ?? "nothing"}, expected ${source.commit}`
      );
    }
  }
}

function cleanMarkdown(value) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*{1,2}|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseChangelogEntry(heading, date, body) {
  const lines = body.split(/\r?\n/);
  const leadLines = [];
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    const sectionMatch = line.match(/^###\s+(.+?)\s*$/);
    if (sectionMatch) {
      currentSection = { title: cleanMarkdown(sectionMatch[1]), items: [] };
      sections.push(currentSection);
      continue;
    }

    const itemMatch = line.match(/^-\s+(.+?)\s*$/);
    if (itemMatch && currentSection) {
      currentSection.items.push(cleanMarkdown(itemMatch[1]));
      continue;
    }

    if (/^\s{2,}\S/.test(line) && currentSection?.items.length) {
      const lastIndex = currentSection.items.length - 1;
      currentSection.items[lastIndex] = cleanMarkdown(
        `${currentSection.items[lastIndex]} ${line.trim()}`
      );
      continue;
    }

    if (!currentSection && line.trim()) leadLines.push(line.trim());
  }

  return {
    heading,
    date: date ?? null,
    summary: cleanMarkdown(leadLines.join(" ")),
    sections: sections.filter((section) => section.items.length > 0)
  };
}

function parseChangelog(markdown) {
  const headingPattern =
    /^## \[([^\]]+)\](?:\s+(?:\u2013|\u2014|-)\s+(.+?))?\s*$/gm;
  const matches = [...markdown.matchAll(headingPattern)];
  if (matches.length === 0) {
    throw new Error("Core CHANGELOG.md contains no version headings");
  }

  return matches.map((match, index) => {
    const bodyStart = match.index + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? markdown.length;
    return parseChangelogEntry(
      match[1],
      match[2],
      markdown.slice(bodyStart, bodyEnd)
    );
  });
}

function validateAppManifest(manifest, relativePath) {
  const folderName = relativePath.split("/")[0];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error(`${relativePath} must contain a JSON object`);
  }
  if (manifest.name !== folderName) {
    throw new Error(`${relativePath} name must match its directory`);
  }
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error(`${relativePath} has an invalid version`);
  }
  if (typeof manifest.description !== "string" || !manifest.description.trim()) {
    throw new Error(`${relativePath} needs a description`);
  }
  if (
    !Array.isArray(manifest.tags) ||
    manifest.tags.some((tag) => typeof tag !== "string" || !tag)
  ) {
    throw new Error(`${relativePath} needs string tags`);
  }

  if (manifest.provider != null) {
    if (
      typeof manifest.provider !== "object" ||
      !Object.hasOwn(providerCategory, manifest.provider.type) ||
      !Array.isArray(manifest.provider.capabilities) ||
      manifest.provider.capabilities.some(
        (capability) => typeof capability !== "string" || !capability
      )
    ) {
      throw new Error(`${relativePath} has an unsupported provider contract`);
    }
  } else if (manifest.ui == null && manifest.backend == null) {
    throw new Error(`${relativePath} is neither a provider nor a product app`);
  }
}

function deriveCategory(manifest) {
  if (manifest.provider == null) return "Products";
  const capabilities = manifest.provider.capabilities;
  if (
    manifest.provider.type === "model" &&
    capabilities.length > 0 &&
    capabilities.every((capability) => speechCapabilities.has(capability))
  ) {
    return "Speech";
  }
  return providerCategory[manifest.provider.type];
}

function displayCapability(capability) {
  const names = {
    acp: "ACP runtimes",
    chat: "Chat",
    code_tools: "Code tools",
    diarization: "Diarization",
    embedding: "Embeddings",
    execute: "Actions",
    fetch: "Page fetch",
    image_gen: "Image generation",
    install: "Skill install",
    messaging: "Messaging",
    reactions: "Reactions",
    search: "Search",
    streaming: "Streaming",
    stt: "Speech to text",
    threads: "Threads",
    tool_discovery: "Tool discovery",
    tool_execution: "Tool execution",
    tts: "Text to speech",
    uninstall: "Skill uninstall",
    video_gen: "Video generation",
    vision: "Vision",
    web: "Web tools"
  };
  return names[capability] ?? capability.replaceAll("_", " ");
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

async function buildAppFacts(source) {
  const manifestPaths = await source.listAppManifests();
  if (manifestPaths.length === 0) {
    throw new Error("Pinned apps source contains no app manifests");
  }

  const manifests = await Promise.all(
    manifestPaths.map(async (relativePath) => {
      let manifest;
      try {
        manifest = JSON.parse(await source.readText(relativePath));
      } catch (error) {
        throw new Error(`${relativePath} is not valid JSON: ${error.message}`);
      }
      validateAppManifest(manifest, relativePath);
      return {
        name: manifest.name,
        version: manifest.version,
        category: deriveCategory(manifest),
        capabilities: manifest.provider?.capabilities ?? []
      };
    })
  );

  const names = manifests.map((manifest) => manifest.name);
  if (new Set(names).size !== names.length) {
    throw new Error("Pinned apps source contains duplicate app names");
  }

  const categories = categoryOrder.map((name) => ({
    name,
    apps: manifests.filter((manifest) => manifest.category === name).length
  }));
  if (categories.some((category) => category.apps === 0)) {
    throw new Error("Pinned apps source no longer covers every public app category");
  }

  const capabilityCounts = new Map();
  for (const manifest of manifests) {
    for (const capability of new Set(manifest.capabilities)) {
      capabilityCounts.set(
        capability,
        (capabilityCounts.get(capability) ?? 0) + 1
      );
    }
  }
  const capabilities = [...capabilityCounts]
    .map(([id, apps]) => ({ id, name: displayCapability(id), apps }))
    .sort((left, right) => right.apps - left.apps || compareText(left.name, right.name));

  return {
    total: manifests.length,
    categoryCount: categories.length,
    categories,
    capabilityCount: capabilities.length,
    capabilities,
    manifests: manifests
      .map(({ name, version, category }) => ({ name, version, category }))
      .sort((left, right) => compareText(left.name, right.name))
  };
}

function buildTimestamp() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch == null) return new Date().toISOString();
  if (!/^\d+$/.test(epoch)) {
    throw new Error("SOURCE_DATE_EPOCH must be an integer number of seconds");
  }
  return new Date(Number(epoch) * 1000).toISOString();
}

function sourceFacts(source) {
  const repositoryUrl = `https://github.com/${source.repository}`;
  return {
    repository: source.repository,
    repositoryUrl,
    commit: source.commit,
    shortCommit: source.commit.slice(0, 12),
    commitUrl: `${repositoryUrl}/commit/${source.commit}`,
    tag: source.tag,
    tagUrl: source.tag ? `${repositoryUrl}/releases/tag/${source.tag}` : null
  };
}

async function main() {
  const manifest = await loadManifest();
  const [coreSource, appsSource] = await Promise.all([
    resolveSource("core", manifest.sources.core),
    resolveSource("apps", manifest.sources.apps)
  ]);
  const resolvedSources = { core: coreSource, apps: appsSource };
  await validateReleaseTags(manifest, resolvedSources);

  const [projectText, changelogText, apps] = await Promise.all([
    coreSource.readText("pyproject.toml"),
    coreSource.readText("CHANGELOG.md"),
    buildAppFacts(appsSource)
  ]);

  const project = parseToml(projectText);
  const version = project.project?.version;
  if (
    typeof version !== "string" ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)
  ) {
    throw new Error("Core pyproject.toml has no valid project.version");
  }

  const changelog = parseChangelog(changelogText);
  const unreleased = changelog.find((entry) => entry.heading === "Unreleased");
  const currentVersion = changelog.find((entry) => entry.heading === version);
  if (!unreleased || !currentVersion) {
    throw new Error(
      `Core changelog must contain Unreleased and ${version} entries`
    );
  }
  if (
    manifest.channel === "released" &&
    manifest.sources.core.tag !== `v${version}`
  ) {
    throw new Error(
      `Released core tag must match pyproject.toml version v${version}`
    );
  }

  const facts = {
    schemaVersion: manifest.schemaVersion,
    generatedAt: buildTimestamp(),
    channel: manifest.channel,
    status:
      manifest.channel === "released"
        ? {
            label: "Verified release",
            summary: `This website is generated from the exact source behind PersonalClaw v${version}.`
          }
        : {
            label: "Pinned development snapshot",
            summary:
              "This website is generated from exact development commits. No release tag has been verified for this source set."
          },
    core: {
      version,
      versionLabel: `v${version}`,
      source: sourceFacts(manifest.sources.core),
      changelog: {
        currentVersion,
        unreleased
      }
    },
    apps: {
      ...apps,
      source: sourceFacts(manifest.sources.apps)
    }
  };

  await writeAtomically(generatedPath, `${JSON.stringify(facts, null, 2)}\n`);
  console.log(
    `Generated ${path.relative(root, generatedPath)}: ${facts.status.label}, ${facts.core.versionLabel}, ${facts.apps.total} apps, ${facts.apps.capabilityCount} capabilities.`
  );
}

main().catch(async (error) => {
  await rm(`${generatedPath}.${process.pid}.tmp`, { force: true });
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
