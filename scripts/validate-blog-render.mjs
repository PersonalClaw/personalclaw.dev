// Prove the blog actually renders the posts it has.
//
// THE FAILURE THIS EXISTS TO CATCH. A listing page is the one surface whose broken state
// is indistinguishable from its empty state: point it at a collection it cannot read —
// wrong collection name, wrong glob base, a schema the entries fail — and it renders zero
// items, looks clean, and passes every other gate in this repository VACUOUSLY. The
// metadata contract still passes (the page has a title), the axe scan still passes
// (nothing to fail), Lighthouse still passes (it got faster). /registry hit exactly this
// shape and carries scripts/validate-registry-render.mjs for it. This is the same guard
// for the blog tier, which additionally carries no pixel baseline (see the note in
// tests/support/site-contract.mjs), so no screenshot would catch it either.
//
// The floor is explicit and one-directional: readable posts on disk and zero rendered
// listing items is a FAILURE, not an empty state.
//
//   npm run validate:blog        # after a build; reads DIST_DIR (default: dist)
//
// WHAT IT CANNOT CLOSE. It does not read the post's prose for truthfulness. Whether a
// claim in a post matches the release it names is a human check against the owning
// repository (README → "Content And Release Truth"); what is mechanical here is that the
// post is published, reachable, contracted, and rendered from its own front matter.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { blogRoutes } from "../tests/support/site-contract.mjs";
import { feedProblems } from "./blog-feed.mjs";
import { currentRows } from "./ledger.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const postsDirectory = join(repositoryRoot, "src", "content", "blog");
const distDirectory = join(repositoryRoot, process.env.DIST_DIR ?? "dist");
const ledger = JSON.parse(readFileSync(join(repositoryRoot, "src", "data", "capabilities.json"), "utf8"));
const pinnedCore = JSON.parse(
  readFileSync(join(repositoryRoot, "sources", "personalclaw.sources.json"), "utf8")
).sources.core;
const currentIds = new Set(currentRows(ledger.rows ?? [], { tag: pinnedCore.tag }).map((row) => row.id));

const failures = [];
const fail = (message) => failures.push(message);

/**
 * Read a post's front matter without depending on the Astro build that consumes it: this
 * script has to be able to disagree with the rendered output, so it cannot share its
 * reader. Deliberately strict — an unterminated or unparseable block is a failure, not an
 * entry to skip, because a skipped entry is how a vacuous pass gets back in.
 *
 * @param {string} fileName
 * @returns {{ id: string, title: string, description: string, publishDate: string, verifiedAgainst: string }}
 */
function readPost(fileName) {
  const source = readFileSync(join(postsDirectory, fileName), "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!match) {
    fail(`${fileName}: no front-matter block — the collection schema would reject it`);
    return null;
  }
  /** @type {Record<string, string>} */
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z][A-Za-z0-9_]*):\s*(.+)$/.exec(line);
    if (!field) continue;
    data[field[1]] = field[2].trim().replace(/^["']|["']$/g, "");
  }
  const required = ["title", "description", "publishDate", "verifiedAgainst"];
  const missing = required.filter((key) => !data[key]);
  if (missing.length) {
    fail(`${fileName}: front matter is missing ${missing.join(", ")}`);
    return null;
  }
  // `claims` is a flow list of ledger row ids, `claims: ["license", "audit_log"]`.
  let claims = [];
  if (data.claims) {
    try {
      claims = JSON.parse(match[1].match(/^claims:\s*(\[.*\])\s*$/m)?.[1] ?? "[]");
    } catch {
      fail(`${fileName}: claims is not a list of ledger row ids`);
    }
  }
  return { id: fileName.replace(/\.md$/, ""), ...data, claims };
}

/** @param {string} routePath */
function readHtml(routePath) {
  const filePath = join(distDirectory, routePath.replace(/^\//, ""), "index.html");
  return existsSync(filePath) ? load(readFileSync(filePath, "utf8")) : null;
}

if (!existsSync(distDirectory)) {
  console.error(`No build at ${distDirectory} — run \`npm run build\` first.`);
  process.exit(1);
}

const postFiles = existsSync(postsDirectory)
  ? readdirSync(postsDirectory).filter((entry) => entry.endsWith(".md")).sort()
  : [];

// The vacuity floor for this script itself: with no posts on disk every assertion below
// is trivially satisfiable, so a blog tier with no posts fails here rather than passing
// quietly. The tier is contracted in site-contract.mjs; it is not optional.
if (postFiles.length === 0) {
  console.error(
    `No posts found in ${postsDirectory}. The blog tier is contracted in ` +
      `tests/support/site-contract.mjs; a contracted tier with nothing to render is a ` +
      `broken build, not an empty state.`
  );
  process.exit(1);
}

const posts = postFiles.map(readPost).filter(Boolean);

// ---------------------------------------------------------------------------
// The listing renders one item per readable post.
// ---------------------------------------------------------------------------
const listing = readHtml("/blog");
if (!listing) {
  fail("/blog was not published — the listing route is missing from the build");
} else {
  const items = listing("[data-blog-entry]").toArray();

  if (posts.length > 0 && items.length === 0) {
    fail(
      `/blog rendered NO listing items while ${posts.length} readable post(s) exist ` +
        `(${posts.map((post) => post.id).join(", ")}). That is the vacuous pass this ` +
        `check exists for: the page is reading no collection, or reading one it cannot ` +
        `parse. An empty listing is only correct when src/content/blog/ is empty.`
    );
  }

  if (items.length !== posts.length) {
    fail(
      `/blog rendered ${items.length} listing item(s) for ${posts.length} post(s) on disk`
    );
  }

  const renderedIds = items.map((item) => listing(item).attr("data-blog-entry"));
  const missing = posts.map((post) => post.id).filter((id) => !renderedIds.includes(id));
  if (missing.length) {
    fail(`/blog does not list: ${missing.join(", ")}`);
  }

  for (const post of posts) {
    const item = listing(`[data-blog-entry="${post.id}"]`);
    if (item.length !== 1) continue;

    const href = item.find("a[href]").first().attr("href");
    if (href !== `/blog/${post.id}`) {
      fail(`/blog links ${post.id} to ${href ?? "nothing"}, expected /blog/${post.id}`);
    }

    // Byte-equal, not "contains": the listing must render the post's own front matter
    // rather than a copy that can drift from it.
    const title = item.find("[data-blog-title]").first().text().trim();
    if (title !== post.title) {
      fail(`/blog lists ${post.id} as "${title}", front matter says "${post.title}"`);
    }
    if (item.find('a[href="/release"][data-blog-verified]').length !== 1) {
      fail(`/blog's "Verified against" badge for ${post.id} does not link /release`);
    }
  }
}

// ---------------------------------------------------------------------------
// Every post is published, contracted, and has a rendered body.
// ---------------------------------------------------------------------------
for (const post of posts) {
  const routePath = `/blog/${post.id}`;
  const page = readHtml(routePath);
  if (!page) {
    fail(`${routePath} was not published — the post route is missing from the build`);
    continue;
  }

  const heading = page("h1").first().text().trim();
  if (heading !== post.title) {
    fail(`${routePath} renders h1 "${heading}", front matter says "${post.title}"`);
  }
  if (page("h1").length !== 1) {
    fail(`${routePath} renders ${page("h1").length} h1 elements, expected exactly 1`);
  }

  const description = page('meta[name="description"]').attr("content");
  if (description !== post.description) {
    fail(`${routePath} description does not match its front matter`);
  }

  // A rendered <Content /> is the other half of the vacuity trap: the collection can be
  // read (so the listing looks right) while the post body renders empty.
  const paragraphs = page(".post-body p").length;
  const links = page(".post-body a[href]").length;
  if (paragraphs === 0) {
    fail(`${routePath} rendered no prose — the post body is empty`);
  }
  if (links === 0) {
    fail(`${routePath} rendered no links — a post whose claims cite nothing`);
  }

  // The verification callout: what was checked, against which release, where corrections
  // go, and each ledger row the post names, current only when the ledger says so.
  const callout = page("[data-blog-callout]");
  if (callout.length !== 1) {
    fail(`${routePath} renders ${callout.length} verification callouts, expected one`);
  } else {
    if (!callout.text().includes(post.verifiedAgainst)) {
      fail(`${routePath}'s callout does not name ${post.verifiedAgainst}, the release it was checked against`);
    }
    if (callout.find('a[href*="/issues"]').length === 0) {
      fail(`${routePath}'s callout says nowhere where corrections go`);
    }
    for (const id of post.claims) {
      const ledgerRow = (ledger.rows ?? []).find((row) => row.id === id);
      if (!ledgerRow) {
        fail(`${routePath} names the claim "${id}", which the ledger does not hold`);
        continue;
      }
      if (!(ledgerRow.surfaces ?? []).includes("blog")) {
        fail(`${routePath} names "${id}", whose ledger row does not list blog among its surfaces`);
      }
      const current = callout.find(`[data-blog-claim="${id}"]`).length;
      const limit = callout.find(`[data-blog-claim-limit="${id}"]`).length;
      if (currentIds.has(id) ? current !== 1 || limit !== 0 : current !== 0 || limit !== 1) {
        fail(
          `${routePath} shows the claim "${id}" as ${current ? "current" : limit ? "a known limit" : "nothing"}, ` +
            `but the ledger has it ${currentIds.has(id) ? "verified" : "not verified"} at ${pinnedCore.tag}`
        );
      }
    }
  }
  if (page('a[href="/release"][data-blog-verified]').length !== 1) {
    fail(`${routePath}'s "Verified against" badge does not link /release`);
  }
}

// The feed, contracted the way validate-build contracts robots.txt and the llms.txt pair.
{
  const feedPath = join(distDirectory, "blog", "rss.xml");
  const origin = listing ? new URL(listing('link[rel="canonical"]').attr("href") ?? "https://invalid").origin : null;
  for (const problem of feedProblems(
    existsSync(feedPath) ? readFileSync(feedPath, "utf8") : null,
    posts.map((post) => post.id),
    origin ?? "https://invalid"
  )) {
    fail(problem);
  }
  if (listing && listing('a[href="/blog/rss.xml"]').length === 0) {
    fail("/blog does not link its feed");
  }
}

// ---------------------------------------------------------------------------
// The contract and the collection agree about what is published.
// ---------------------------------------------------------------------------
const contractedPostPaths = blogRoutes
  .map((route) => route.path)
  .filter((path) => path !== "/blog")
  .sort();
const collectionPostPaths = posts.map((post) => `/blog/${post.id}`).sort();
if (contractedPostPaths.join(",") !== collectionPostPaths.join(",")) {
  fail(
    `blogRoutes contracts [${contractedPostPaths.join(", ")}] but the collection holds ` +
      `[${collectionPostPaths.join(", ")}] — publishing or removing a post is a ` +
      `deliberate act and has to be recorded in tests/support/site-contract.mjs`
  );
}

if (failures.length) {
  console.error(`Blog render check FAILED:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log(
    `Validated the blog tier: ${posts.length} post(s) on disk, ${posts.length} listed ` +
      `at /blog, each published with a rendered body and a contracted route.`
  );
}
