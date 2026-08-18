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

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

// The doc trees the website publishes, in nav order. `label` heads the sidebar
// group; `blurb` explains the group in llms.txt, where an LLM has no sidebar to read.
//
// A tree may set `sourceDir` when its location in core differs from its location on
// the site (the research corpus lives two levels down in core), `exclude` to withhold
// a file the directory contains but the site does not publish, and `preface` to point
// at a committed, website-authored section index that the sync writes as the tree's
// `index.md`. Those three fields are the whole of the research extension: the corpus
// still flows through the same source resolution, the same link rewriter, and the same
// llms.txt generation as every other tree.
//
// Deliberately NOT synced: docs/roadmap/ (intent, not released behavior — the
// projection rule), docs/maintainers/ (internal process), docs/design/ +
// docs/screenshots/ (assets).
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
  },
  {
    dir: "research",
    // Core path: docs/research/learnings/. Site path: /docs/research/.
    sourceDir: "research/learnings",
    // README.md is the corpus index, not a topic — the site publishes its own index
    // (`preface` below) instead, so there is exactly one. See known-docs.mjs.
    exclude: ["README.md"],
    // …but it is still READ. Its topic table carries a curated one-line "what it
    // covers" per topic, which makes a far better page description than anything
    // extractable from a topic that opens straight into `## Principles` — two of the
    // fourteen otherwise took a mid-document implementation fragment as their
    // description. Withholding the index page and using its prose are not in tension.
    descriptionsFrom: "README.md",
    preface: path.join("src", "prose", "research-preface.md"),
    label: "Research",
    blurb:
      "The competitive-research corpus PersonalClaw was designed from: 14 topics distilled from 95 sources, published as-written."
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

/** Where a tree's files live inside core's docs/ — `sourceDir` when it differs. */
function sourceDirOf(tree) {
  return tree.sourceDir ?? tree.dir;
}

const TREE_BY_SOURCE_DIR = new Map(TREES.map((tree) => [sourceDirOf(tree), tree]));

/**
 * Rewrite one relative link target; returns the new target and whether it escaped.
 *
 * `published` maps a tree's source dir to the set of filenames actually synced, and
 * it is load-bearing rather than defensive: a link into a synced directory whose
 * target is NOT published (core's docs/research/learnings/README.md is the live case)
 * must go to GitHub. Rewriting it to an in-site URL would produce a 404 that renders
 * as a perfectly ordinary link — the exact failure this corpus's 117 cross-links make
 * cheap to ship.
 */
function rewriteLink(target, tree, repository, commit, published) {
  const [rawPath, fragment] = target.split("#");
  const hash = fragment ? `#${fragment}` : "";

  // Resolve against the doc's real location in core to learn where it actually points.
  const from = sourceDirOf(tree);
  const resolved = path.posix.normalize(path.posix.join(from, rawPath));
  const directory = path.posix.dirname(resolved);
  const file = path.posix.basename(resolved);

  // Landing inside a synced directory, on a file that directory publishes, is the
  // only in-site case — and it covers both same-tree (`x.md`) and cross-tree
  // (`../reference/cli.md`) links, at any source depth.
  const owner = TREE_BY_SOURCE_DIR.get(directory);
  if (owner && file.endsWith(".md") && published.get(directory)?.has(file)) {
    return { target: `/docs/${owner.dir}/${slugify(file)}${hash}`, escaped: false };
  }
  // Anything else leaves the published corpus — send it to the source of truth.
  //
  // Resolve against the doc's REAL repo location (docs/<sourceDir>/), not by stripping
  // `../` prefixes: `../roadmap/roadmap.md` from docs/guides/ is docs/roadmap/…, and
  // naive stripping produced /roadmap/… — a 404 that looks plausible.
  const repoPath = path.posix.normalize(path.posix.join("docs", from, rawPath));
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

/**
 * First real prose paragraph — the one-line description llms.txt needs.
 *
 * `allowEmphasisLead` relaxes exactly one rule: a paragraph opening with a `**bold
 * lead-in.**` counts as prose. It is off by default and used only as a SECOND pass,
 * because relaxing it for the first pass would change the descriptions of pages that
 * already have one. Nine of the fourteen research topics need it — they go straight
 * from the title into `## Principles`, whose every paragraph opens with its claim in
 * bold, so the strict scan finds nothing and the page ships with no meta description.
 */
function extractSummary(markdown, { allowEmphasisLead = false } = {}) {
  const body = markdown
    .replace(/^#\s+.+$/m, "")
    .replace(/^---\n[\s\S]*?\n---\n/, "");
  for (const block of body.split(/\n\s*\n/)) {
    const line = block.trim();
    if (!line) continue;
    // A bold lead-in is `**word`; a bullet is `* word` or `- word`. The space is what
    // separates the two, so this stays blind to list items.
    const emphasisLead = allowEmphasisLead && /^\*\*\S/.test(line);
    // Skip headings, tables, code fences, lists, blockquotes, images/badges.
    if ((!emphasisLead && /^[#|>\-*`!]/.test(line)) || line.startsWith("<")) continue;
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

/** Flatten inline markdown to one line and cap it at a meta-description length. */
function condense(text) {
  const flattened = text
    .replace(/\s+/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*]/g, "")
    .trim();
  return flattened.length > 220 ? `${flattened.slice(0, 217)}…` : flattened;
}

/**
 * Read a tree's curated per-topic descriptions out of its index file — the two-column
 * `| [topic](topic.md) | what it covers |` table core's corpus README already carries.
 *
 * Hard-fails when the table covers fewer topics than the tree publishes. The pin is
 * what makes that safe: this can only go red when someone deliberately advances the
 * pinned commit, never on an unattended build, and a half-parsed table would otherwise
 * degrade silently into per-page fragments nobody re-reads.
 */
async function loadIndexDescriptions(source, tree, publishedFiles) {
  if (!tree.descriptionsFrom) return new Map();
  const indexPath = `docs/${sourceDirOf(tree)}/${tree.descriptionsFrom}`;
  const raw = await source.readText(indexPath);
  const descriptions = new Map();
  const row = /^\|\s*\[[^\]]+\]\(([^)\s]+\.md)\)\s*\|\s*(.+?)\s*\|\s*$/gm;
  for (const [, target, text] of raw.matchAll(row)) {
    descriptions.set(path.posix.basename(target), condense(text));
  }
  const missing = publishedFiles.filter((file) => !descriptions.has(file));
  if (missing.length) {
    throw new Error(
      `${indexPath} describes ${descriptions.size} topic(s) but ` +
        `docs/${sourceDirOf(tree)} publishes ${publishedFiles.length}; no row for ` +
        `${missing.join(", ")} — the index table's shape changed at the pinned commit`
    );
  }
  return descriptions;
}

/** Frontmatter for Starlight. Values are quoted, so escape embedded quotes. */
function frontmatter(title, description) {
  const esc = (s) => s.replace(/"/g, '\\"');
  const lines = [`title: "${esc(title)}"`];
  if (description) lines.push(`description: "${esc(description)}"`);
  return `---\n${lines.join("\n")}\n---\n`;
}

async function listTree(source, tree) {
  const dir = sourceDirOf(tree);
  // Both resolvers expose readText(); only the local one can list a directory, so
  // remote runs read an explicit file list. Keeping the list here (rather than
  // globbing the API) means a new core doc is a deliberate addition on this side —
  // the drift check below is what tells us when that is out of date.
  //
  // `exclude` is applied to BOTH modes: a local listing would otherwise pick up a
  // file the pinned list deliberately withholds, so the same commit would publish a
  // different page count depending on which machine ran the sync.
  const excluded = new Set(tree.exclude ?? []);
  if (source.mode === "local") {
    const entries = await readdir(path.join(source.root, "docs", dir), {
      withFileTypes: true
    });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md") && !excluded.has(e.name))
      .map((e) => e.name)
      .sort();
  }
  const { KNOWN_DOCS } = await import("./known-docs.mjs");
  return (KNOWN_DOCS[dir] ?? []).filter((name) => !excluded.has(name));
}

/**
 * Write a tree's section index from its committed, website-authored preface.
 *
 * The prose is owned by this repo (it is commentary ON core's corpus, not a copy of
 * it) but the topic list under it is GENERATED from what actually synced, so the index
 * cannot come to advertise a page that no longer exists. A leading HTML comment block
 * in the source file is stripped: that is where the file's own editing notice lives,
 * and it has no business in the published page.
 */
async function writePreface(tree, synced, core) {
  const source = await readFile(path.join(root, tree.preface), "utf8");
  const repoUrl = `https://github.com/${core.repository}/blob/${core.commit}`;
  const prose = source
    .replace(/^(?:\s*<!--[\s\S]*?-->\s*)+/, "")
    .replaceAll("{{coreRepoUrl}}", repoUrl);
  if (prose.includes("{{")) {
    throw new Error(`${tree.preface} contains an unexpanded {{placeholder}}`);
  }
  const title = extractTitle(prose, tree.label);
  const summary = extractSummary(prose);
  if (!summary) {
    throw new Error(
      `${tree.preface} has no prose paragraph to use as the page description — ` +
        `a docs page without a meta description fails validate:build`
    );
  }

  const pages = synced.filter((page) => page.tree === tree.dir);
  const body = [
    prose.replace(/^#\s+.+\n+/, "").trimEnd(),
    "",
    "## The topics",
    ""
  ];
  for (const page of pages) {
    body.push(
      page.summary
        ? `- **[${page.title}](/docs/${tree.dir}/${page.slug})** — ${page.summary}`
        : `- **[${page.title}](/docs/${tree.dir}/${page.slug})**`
    );
  }
  body.push("");

  const markdown = body.join("\n");
  await writeFile(
    path.join(contentRoot, tree.dir, "index.md"),
    frontmatter(title, summary) + "\n" + markdown,
    "utf8"
  );
  // Returned rather than pushed into `synced`: that list is "pages generated from a
  // core file", and the two llms.txt writers both dereference `page.source` against
  // the core source. A preface has no core file behind it.
  return { title, summary, markdown };
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
  // Source dir → the filenames that dir publishes. Resolved for EVERY tree before any
  // body is rewritten, because a cross-tree link has to be judged against the target
  // tree's published set, not the current one's.
  const published = new Map();
  const files = new Map();
  for (const tree of TREES) {
    const listing = await listTree(coreSource, tree);
    if (!listing.length) {
      throw new Error(
        `No markdown found for docs/${sourceDirOf(tree)} — the pinned core tree is missing a documented directory`
      );
    }
    files.set(tree.dir, listing);
    published.set(sourceDirOf(tree), new Set(listing));
  }

  // Internal links kept inside the site, per tree. A tree whose docs cross-reference
  // each other in core and yet produce ZERO in-site links is not a clean tree — it is
  // a rewriter that stopped matching, and every one of those links ships as a `.md`
  // href that 404s while looking entirely ordinary. Counted here, asserted below.
  const internalLinks = new Map(TREES.map((tree) => [tree.dir, 0]));
  const prefaces = new Map(); // tree dir → the generated section index

  for (const tree of TREES) {
    await mkdir(path.join(contentRoot, tree.dir), { recursive: true });
    const curated = await loadIndexDescriptions(coreSource, tree, files.get(tree.dir));

    for (const file of files.get(tree.dir)) {
      const relativePath = `docs/${sourceDirOf(tree)}/${file}`;
      const markdown = await coreSource.readText(relativePath);
      const slug = slugify(file);
      const title = extractTitle(markdown, slug.replace(/-/g, " "));
      const summary =
        curated.get(file) ||
        extractSummary(markdown) ||
        extractSummary(markdown, { allowEmphasisLead: true });
      if (!summary) {
        throw new Error(
          `${relativePath} yielded no description — every published page needs one ` +
            `(validate:build enforces it), so this is a sync bug, not a core doc bug`
        );
      }

      // Strip the leading H1: Starlight renders the frontmatter title as the page
      // heading, so keeping both shows the title twice.
      let body = markdown.replace(/^#\s+.+\n+/, "");

      body = body.replace(MARKDOWN_LINK, (whole, target) => {
        const { target: next, escaped } = rewriteLink(
          target,
          tree,
          manifest.sources.core.repository,
          manifest.sources.core.commit,
          published
        );
        if (escaped) rewritten.push(`${relativePath} → ${target}`);
        else internalLinks.set(tree.dir, internalLinks.get(tree.dir) + 1);
        return `](${next})`;
      });

      await writeFile(
        path.join(contentRoot, tree.dir, `${slug}.md`),
        frontmatter(title, summary) + "\n" + body,
        "utf8"
      );
      synced.push({ tree: tree.dir, slug, title, summary, source: relativePath });
    }

    if (tree.preface) {
      prefaces.set(tree.dir, await writePreface(tree, synced, manifest.sources.core));
    }
  }

  // Every tree that declares a preface republishes a cross-linked corpus, so its
  // in-site link count must be non-zero. Without this floor the whole "intact
  // cross-links" property is unobserved: a sweep for broken links passes trivially
  // when there are no links left to break.
  for (const tree of TREES) {
    if (!tree.preface) continue;
    if (internalLinks.get(tree.dir) === 0) {
      throw new Error(
        `docs/${sourceDirOf(tree)} produced 0 in-site cross-links. Either the link ` +
          `pattern matched nothing (every cross-reference ships as a raw .md path and ` +
          `404s) or every one was classified as leaving the corpus (they all ship as ` +
          `GitHub links, so the republished section silently stops being part of the ` +
          `site). Both are rewriter bugs; neither is a corpus without links.`
      );
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
    const preface = prefaces.get(tree.dir);
    if (preface) {
      llms.push(`- [${preface.title}](${site}/docs/${tree.dir}): ${preface.summary}`);
    }
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
    const preface = prefaces.get(tree.dir);
    if (preface) {
      full.push(
        "---",
        "",
        `# ${preface.title}`,
        "",
        `*Source: \`${tree.preface}\` (personalclaw.dev) · ${tree.label}*`,
        "",
        preface.markdown,
        ""
      );
    }
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
      `into src/content/docs/ (${TREES.length} trees, ${prefaces.size} section preface(s)); ` +
      `wrote public/llms.txt and public/llms-full.txt (${Math.round(bytes / 1024)} KB).`
  );
  // The census, printed so "no broken links" can be read against a real denominator:
  // a zero here is a rewriter that matched nothing, not a corpus without links.
  const internalTotal = [...internalLinks.values()].reduce((a, b) => a + b, 0);
  console.log(
    `Rewrote ${internalTotal} relative link(s) to in-site /docs URLs ` +
      `(${TREES.map((t) => `${t.dir}: ${internalLinks.get(t.dir)}`).join(", ")}).`
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
