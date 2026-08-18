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

/** Every published path: the contracted marketing routes plus the docs corpus. */
export const allRoutePaths = [...routes.map((r) => r.path), ...docsRoutes];

export function canonicalUrl(path) {
  return new URL(path, siteOrigin).toString();
}

export function routeOutputPath(path) {
  return path === "/" ? "index.html" : `${path.slice(1)}/index.html`;
}
