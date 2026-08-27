export const siteOrigin = "https://personalclaw.dev";

export const routes = [
  {
    name: "home",
    path: "/",
    title: "PersonalClaw \u00b7 Your personal agentic OS",
    description:
      "A self-hosted agentic operating system for chat, autonomous goals, memory, knowledge, automation, and replaceable apps."
  },
  {
    name: "product",
    path: "/product",
    title: "Product \u00b7 PersonalClaw",
    description:
      "Explore PersonalClaw's agentic chat, autonomous goal loops, memory, knowledge, automation, and agent runtimes."
  },
  {
    name: "apps",
    path: "/apps",
    title: "Apps \u00b7 PersonalClaw",
    description:
      "Browse the first-party PersonalClaw app ecosystem: models, search, agents, tools, speech, channels, actions, skills, and full product apps."
  },
  {
    name: "security",
    path: "/security",
    title: "Security \u00b7 PersonalClaw",
    description:
      "How PersonalClaw constrains agent autonomy with host approvals, command policy, guarded egress, scoped app tokens, scanning, and tamper-evident logs."
  },
  {
    name: "release",
    path: "/release",
    title: "Release provenance \u00b7 PersonalClaw",
    description:
      "Trace the PersonalClaw version, changelog, app catalog, capabilities, and website claims to exact source commits."
  }
];

// The DOCS tier is contracted differently from the marketing routes above, on
// purpose. Those five are hand-authored here, so their exact title and description
// are part of the contract. The /docs pages are GENERATED from the pinned core repo
// (scripts/sync-docs.mjs): their titles are core's H1s and their descriptions are
// core's first paragraph, so pinning those strings here would mean editing this file
// every time core rewords a heading — and the whole point is that core owns the words.
//
// What IS contracted: the set of published doc paths (a doc appearing or vanishing is
// a deliberate act, recorded in scripts/known-docs.mjs), that every page carries a
// non-empty title and description, and that they live under /docs/ so they never
// collide with a marketing route.
export const docsPrefix = "/docs";

export const docsRoutes = [
  "/docs/guides/containers",
  "/docs/guides/getting-started",
  "/docs/guides/remote-access",
  "/docs/reference/api-overview",
  "/docs/reference/cli",
  "/docs/reference/config-reference",
  "/docs/reference/configuration",
  "/docs/architecture/app-platform",
  "/docs/architecture/chat-sessions",
  "/docs/architecture/inbox-channels",
  "/docs/architecture/knowledge-memory",
  "/docs/architecture/loops",
  "/docs/architecture/overview",
  "/docs/architecture/provider-boundary",
  "/docs/architecture/security",
  "/docs/architecture/tasks-triggers",
  "/docs/security/limitations",
  "/docs/security/threat-model",
  // The research corpus: an owner-voiced section index authored HERE, over fourteen
  // topics synced from core's docs/research/learnings/. Fourteen, not fifteen: that
  // directory's README.md is its index and is superseded by the preface below.
  "/docs/research",
  "/docs/research/agent-harness-engineering",
  "/docs/research/automation-and-triggers",
  "/docs/research/ecosystem-and-interop",
  "/docs/research/knowledge-pipelines",
  "/docs/research/local-models-and-inference",
  "/docs/research/memory-architectures",
  "/docs/research/multi-agent-orchestration",
  "/docs/research/planning-and-decomposition",
  "/docs/research/product-surfaces-and-ux",
  "/docs/research/security-and-guardrails",
  "/docs/research/self-improvement-loops",
  "/docs/research/skills-and-prompt-craft",
  "/docs/research/verification-and-judging",
  "/docs/research/workflow-engine-design"
];

/**
 * Doc routes that republish a cross-linked corpus. Their in-site links are swept
 * individually by validate-build.mjs, with a floor on how many it must find: a
 * link sweep that happens to check nothing passes just as quietly as a clean one.
 */
export const crossLinkedDocsRoutes = docsRoutes.filter((route) =>
  route.startsWith("/docs/research/")
);

/**
 * The observed number of in-site cross-links across the research corpus at the pinned
 * commit: 117 relative links across the 14 topic files (the excluded README.md holds a
 * further 14). Contracted as a FLOOR, not an equality — core rewording a paragraph
 * should not red the website — but a floor this specific still fails loudly if the
 * rewriter degrades, which is the failure that renders as ordinary-looking 404s.
 */
export const RESEARCH_CROSS_LINK_FLOOR = 100;

// The REGISTRY tier, contracted differently from the marketing routes above for the
// same kind of reason the docs tier is: this repository does not own the content.
//
// Its title and description ARE contracted here (unlike a docs page, they are written
// on this site). What is deliberately NOT contracted is a pixel baseline. The page
// renders the community app registry, which changes in ANOTHER repository — so a
// committed screenshot would be invalidated by a registry pull request rather than by a
// change here, and the website suite would go red for a reason nobody in this repository
// did. Everything else applies: the metadata contract, the runtime contract (console,
// requests, same-origin, 44px targets, overflow), the axe WCAG A/AA scan, and the
// Lighthouse budgets. See `qualityRoutes`.
export const registryIndexRoute = {
  name: "registry",
  path: "/registry",
  title: "Community registry · PersonalClaw",
  description:
    "Browse community PersonalClaw apps with the permissions each one declares and the verdict of its last supply-chain scan, before installing anything."
};

export const registryRoutes = [registryIndexRoute];

// The BLOG tier. Its words ARE written here (src/content/blog/*.md is source-controlled,
// unlike the generated /docs corpus), so its titles and descriptions are contracted below
// and a post appearing or vanishing is a deliberate act recorded in this file.
//
// What it deliberately does NOT carry is a pixel baseline, and the reason is not the
// registry's reason. A post's full-page height is a function of prose length, and this
// listing's height is a function of post count — so a committed screenshot here would be
// invalidated by PUBLISHING WRITING rather than by changing a design, on two platforms,
// one of which only CI can regenerate (.github/workflows/visual-baselines.yml). That
// trains exactly the habit the README forbids: refreshing baselines without inspecting a
// visual change. The surface's design is pixel-locked where it actually lives — the
// shared shell, tokens and card treatment already baselined on the five marketing routes.
//
// Everything else applies, via `qualityRoutes`: the metadata contract, the runtime
// contract (console, requests, same-origin, 44px targets, overflow), the axe WCAG A/AA
// scan, and the Lighthouse budgets. What replaces the baseline is
// `npm run validate:blog`, which asserts the listing renders one item per readable post.
// That check exists because a listing built against a collection it cannot read renders
// nothing, looks clean, and passes every other gate vacuously.
export const blogIndexRoute = {
  name: "blog",
  path: "/blog",
  title: "Writing · PersonalClaw",
  description:
    "Posts about what PersonalClaw shipped, how each claim is checked against the release this site publishes, and which claims did not survive the check."
};

export const blogRoutes = [
  blogIndexRoute,
  {
    name: "blog-launch",
    path: "/blog/launch",
    title: "A personal agent you can audit · PersonalClaw",
    description:
      "Every claim in this post names the file that proves it, checked against the tagged release this site publishes — including the claims that did not survive the check."
  }
];

/**
 * Every route held to the metadata, runtime, accessibility and performance contract:
 * the visually-baselined marketing routes plus the registry and blog tiers. `routes`
 * alone is what the VISUAL contract covers.
 */
export const qualityRoutes = [...routes, ...registryRoutes, ...blogRoutes];

/**
 * The per-listing pages, derived from the same normalizer the pages render
 * (src/data/registry.mjs) so the generated pages and this contract cannot disagree
 * about how many there are or what they are called.
 *
 * A function, not a constant: the registry artifact is generated by `npm run sync`, and
 * some gates (validate:visual-baselines) import this module before any sync has run.
 * Callers that need the per-listing routes are the ones that run after a build.
 *
 * @returns {Promise<string[]>}
 */
export async function registryAppRoutePaths() {
  const { registryListing } = await import("../../src/data/registry.mjs");
  return registryListing().apps.map((app) => app.path);
}

/**
 * Every published path with a FIXED name: the contracted marketing routes, the docs
 * corpus, the registry index, and the blog. The per-listing registry pages are
 * registry-derived, so they come from `registryAppRoutePaths()` instead.
 */
export const allRoutePaths = [
  ...routes.map((r) => r.path),
  ...docsRoutes,
  ...registryRoutes.map((r) => r.path),
  ...blogRoutes.map((r) => r.path)
];

export function canonicalUrl(path) {
  return new URL(path, siteOrigin).toString();
}

export function routeOutputPath(path) {
  return path === "/" ? "index.html" : `${path.slice(1)}/index.html`;
}
