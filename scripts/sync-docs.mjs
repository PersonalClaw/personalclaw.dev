// Sync the pinned core documentation tree into Starlight content, and generate the
// machine-readable llms.txt pair from the same corpus.
//
// The rule this script exists to enforce: personalclaw.dev commits NO copies of core
// docs. One canonical source (the core repo, at the pinned commit); everything under
// src/content/docs/ is generated at build time and gitignored. A committed copy is a
// copy that drifts, and a docs page that silently contradicts the product is worse
// than no docs page.
//
//   node scripts/sync-docs.mjs
//
// Source resolution is REUSED from sync-sources.mjs (local checkout when it matches
// the pin, else the verified pinned remote), so the docs corpus and the release facts
// can never come from different commits.

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  loadManifest,
  resolveSource,
  validateReleaseTags
} from "./sync-sources.mjs";

const root = process.cwd();
// Starlight injects a catch-all `[...slug]` at the SITE ROOT and derives each URL from
// the path inside its collection. So content written to `<collection>/guides/x.md`
// serves at `/guides/x`, not `/docs/guides/x` — which both misses the intended prefix
// and collides with the existing `/security` marketing route. Nesting the synced trees
// one level deeper under `docs/` inside the collection is what produces `/docs/...`.
const contentRoot = path.join(root, "src", "content", "docs", "docs");
const publicRoot = path.join(root, "public");

// The four doc trees the website publishes, in nav order. `label` heads the sidebar
// group; `blurb` explains the group in llms.txt, where an LLM has no sidebar to read.
//
// Deliberately NOT synced: docs/roadmap/ (intent, not released behavior — the
// projection rule), docs/research/ (owner-gated republication, DISCOVERABILITY S5),
// docs/maintainers/ (internal process), docs/design/ + docs/screenshots/ (assets).
const TREES = [
  {
    dir: "guides",
    label: "Guides",
    blurb: "Task-oriented walkthroughs: install, first run, containers, remote access."
  },
  {
    dir: "reference",
    label: "Reference",
    blurb: "Exact surfaces: CLI commands, configuration keys, the HTTP API, file formats."
  },
  {
    dir: "architecture",
    label: "Architecture",
    blurb: "How the parts fit: the gateway, providers, memory and knowledge, loops, apps."
  },
  {
    dir: "security",
    label: "Security",
    blurb: "The threat model and an honest account of what PersonalClaw does not protect against."
  }
];

// Relative links in core docs fall into two classes, and they need opposite handling.
//
// CROSS-TREE (`../reference/cli.md`) resolves correctly on the docs site once the .md
// suffix is dropped — Starlight serves /docs/reference/cli. Rewrite the suffix.
//
// REPO-ESCAPING (`../../CONTRIBUTING.md`, `../roadmap/roadmap.md`) points at files that
// are deliberately NOT published here. Those would 404, so they are rewritten to
// absolute GitHub URLs at the pinned commit — the reader still gets the document, and
// pinning means the link matches the docs they are reading rather than main's drift.
const MARKDOWN_LINK = /\]\((?!https?:|#|mailto:)([^)\s]+)\)/g;

const SYNCED_DIRS = new Set(["guides", "reference", "architecture", "security"]);

/** Rewrite one relative link target; returns the new target and whether it escaped. */
function rewriteLink(target, currentTree, repository, commit) {
  const [rawPath, fragment] = target.split("#");
  const hash = fragment ? `#${fragment}` : "";

  // Resolve against the current tree to learn where it actually points.
  const resolved = path.posix.normalize(path.posix.join(currentTree, rawPath));
  const segments = resolved.split("/").filter((s) => s && s !== ".");

  // `../<tree>/<file>.md` → an in-site docs link.
  if (segments.length === 2 && SYNCED_DIRS.has(segments[0]) && segments[1].endsWith(".md")) {
    return { target: `/docs/${segments[0]}/${slugify(segments[1])}${hash}`, escaped: false };
  }
  // `<file>.md` in the same tree.
  if (segments.length === 1 && segments[0].endsWith(".md")) {
    return { target: `/docs/${currentTree}/${slugify(segments[0])}${hash}`, escaped: false };
  }
  // Anything else leaves the published corpus — send it to the source of truth.
  //
  // Resolve against the doc's REAL repo location (docs/<tree>/), not by stripping
  // `../` prefixes: `../roadmap/roadmap.md` from docs/guides/ is docs/roadmap/…, and
  // naive stripping produced /roadmap/… — a 404 that looks plausible.
  const repoPath = path.posix.normalize(path.posix.join("docs", currentTree, rawPath));
  return {
    target: `https://github.com/${repository}/blob/${commit}/${repoPath}${hash}`,
    escaped: true
  };
}

function slugify(name) {
  return name
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** First `# Heading` in the document, else a title derived from the filename. */
function extractTitle(markdown, fallback) {
  const m = markdown.match(/^#\s+(.+)$/m);
  if (!m) return fallback;
  return m[1].replace(/[`*_]/g, "").trim();
}

/** First real prose paragraph — the one-line description llms.txt needs. */
function extractSummary(markdown) {
  const body = markdown
    .replace(/^#\s+.+$/m, "")
    .replace(/^---\n[\s\S]*?\n---\n/, "");
  for (const block of body.split(/\n\s*\n/)) {
    const line = block.trim();
    if (!line) continue;
    // Skip headings, tables, code fences, lists, blockquotes, images/badges.
    if (/^[#|>\-*`!]/.test(line) || line.startsWith("<")) continue;
    const flattened = line
      .replace(/\s+/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → their text
      // Strip emphasis markers but NOT underscores: `PERSONALCLAW_HOME` became
      // `PERSONALCLAWHOME`, which is a wrong env-var name in a machine-read file.
      .replace(/[`*]/g, "")
      .trim();
    if (flattened.length < 24) continue;
    // Split on sentence ends, but not on abbreviations or a trailing `.` inside code
    // (`pip install -e .`) — that truncated the CLI page's summary mid-thought.
    const sentences = flattened.split(/(?<=[a-z0-9)"”])\.\s+(?=[A-Z])/);
    const sentence = sentences[0].replace(/\.$/, "") + ".";
    return sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence;
  }
  return "";
}

/** Frontmatter for Starlight. Values are quoted, so escape embedded quotes. */
function frontmatter(title, description) {
  const esc = (s) => s.replace(/"/g, '\\"');
  const lines = [`title: "${esc(title)}"`];
  if (description) lines.push(`description: "${esc(description)}"`);
  return `---\n${lines.join("\n")}\n---\n`;
}

async function listTree(source, dir) {
  // Both resolvers expose readText(); only the local one can list a directory, so
  // remote runs read an explicit file list. Keeping the list here (rather than
  // globbing the API) means a new core doc is a deliberate addition on this side —
  // the drift check below is what tells us when that is out of date.
  if (source.mode === "local") {
    const entries = await readdir(path.join(source.root, "docs", dir), {
      withFileTypes: true
    });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
  }
  const { KNOWN_DOCS } = await import("./known-docs.mjs");
  return KNOWN_DOCS[dir] ?? [];
}

async function main() {
  const manifest = await loadManifest();
  const [coreSource, appsSource] = await Promise.all([
    resolveSource("core", manifest.sources.core),
    resolveSource("apps", manifest.sources.apps)
  ]);
  await validateReleaseTags(manifest, { core: coreSource, apps: appsSource });

  await rm(contentRoot, { recursive: true, force: true });
  await mkdir(contentRoot, { recursive: true });

  const synced = [];
  const rewritten = []; // repo-escaping links sent to GitHub

  for (const tree of TREES) {
    const files = await listTree(coreSource, tree.dir);
    if (!files.length) {
      throw new Error(
        `No markdown found for docs/${tree.dir} — the pinned core tree is missing a documented directory`
      );
    }
    await mkdir(path.join(contentRoot, tree.dir), { recursive: true });

    for (const file of files) {
      const relativePath = `docs/${tree.dir}/${file}`;
      const markdown = await coreSource.readText(relativePath);
      const slug = slugify(file);
      const title = extractTitle(markdown, slug.replace(/-/g, " "));
      const summary = extractSummary(markdown);

      // Strip the leading H1: Starlight renders the frontmatter title as the page
      // heading, so keeping both shows the title twice.
      let body = markdown.replace(/^#\s+.+\n+/, "");

      body = body.replace(MARKDOWN_LINK, (whole, target) => {
        const { target: next, escaped } = rewriteLink(
          target,
          tree.dir,
          manifest.sources.core.repository,
          manifest.sources.core.commit
        );
        if (escaped) rewritten.push(`${relativePath} → ${target}`);
        return `](${next})`;
      });

      await writeFile(
        path.join(contentRoot, tree.dir, `${slug}.md`),
        frontmatter(title, summary) + "\n" + body,
        "utf8"
      );
      synced.push({ tree: tree.dir, slug, title, summary, source: relativePath });
    }
  }

  // ── llms.txt: the curated index ────────────────────────────────────────────
  const version = manifest.sources.core.tag ?? manifest.sources.core.commit.slice(0, 12);
  const site = "https://personalclaw.dev";

  const llms = [
    "# PersonalClaw",
    "",
    "> A self-hosted personal AI agent — an agentic operating system for one person.",
    "> Chat, autonomous goal loops, long-term memory, a knowledge base, skills, scheduled",
    "> automation and channel integrations, behind one gateway process and one web",
    "> dashboard you own. Local-first, provider-agnostic, zero telemetry, MIT.",
    "",
    `Documentation below describes PersonalClaw ${version} exactly — it is generated from`,
    "the tagged source, not written separately. PersonalClaw sends no telemetry: there is",
    "no adoption instrumentation in the product or on this site.",
    "",
    "## Install",
    "",
    "```",
    "uv tool install personalclaw && personalclaw gateway",
    "```",
    ""
  ];

  for (const tree of TREES) {
    const pages = synced.filter((p) => p.tree === tree.dir);
    if (!pages.length) continue;
    llms.push(`## ${tree.label}`, "", `${tree.blurb}`, "");
    for (const page of pages) {
      const url = `${site}/docs/${tree.dir}/${page.slug}`;
      llms.push(page.summary ? `- [${page.title}](${url}): ${page.summary}` : `- [${page.title}](${url})`);
    }
    llms.push("");
  }

  llms.push(
    "## Source",
    "",
    `- [Repository](https://github.com/${manifest.sources.core.repository}): the product; docs live in \`docs/\`.`,
    `- [Apps](https://github.com/${manifest.sources.apps.repository}): first-party app bundles.`,
    `- [Release provenance](${site}/release): the exact commits and tags this site was built from.`,
    ""
  );

  await writeFile(path.join(publicRoot, "llms.txt"), llms.join("\n"), "utf8");

  // ── llms-full.txt: the whole corpus, one file ──────────────────────────────
  const full = [
    `# PersonalClaw ${version} — complete documentation`,
    "",
    "Generated from the pinned source tree. Sections appear in navigation order;",
    "each records the core repository path it came from.",
    ""
  ];
  for (const tree of TREES) {
    for (const page of synced.filter((p) => p.tree === tree.dir)) {
      const markdown = await coreSource.readText(page.source);
      full.push(
        "---",
        "",
        `# ${page.title}`,
        "",
        `*Source: \`${page.source}\` · ${tree.label}*`,
        "",
        markdown.replace(/^#\s+.+\n+/, ""),
        ""
      );
    }
  }
  await writeFile(path.join(publicRoot, "llms-full.txt"), full.join("\n"), "utf8");

  const bytes = full.join("\n").length;
  console.log(
    `Synced ${synced.length} docs from ${manifest.sources.core.repository}@${version} ` +
      `into src/content/docs/ (${TREES.length} trees); ` +
      `wrote public/llms.txt and public/llms-full.txt (${Math.round(bytes / 1024)} KB).`
  );
  if (rewritten.length) {
    // Not a warning: these are handled. Reported so a doc that suddenly starts
    // pointing outside the corpus is visible rather than silently redirected.
    const unique = [...new Set(rewritten)];
    console.log(
      `\n${unique.length} link(s) pointed outside the published corpus and were ` +
        `rewritten to GitHub at the pinned commit:`
    );
    for (const item of unique.slice(0, 12)) console.log(`  ${item}`);
    if (unique.length > 12) console.log(`  … and ${unique.length - 12} more`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
