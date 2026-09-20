// The core doc files this site publishes, per tree.
//
// Why an explicit list: a REMOTE (pinned-commit) sync has no directory listing —
// GitHub's tree API would work, but then a doc added to core would silently start
// appearing on the website without anyone deciding it should. Publishing is a
// decision; this file is where it is recorded.
//
// A LOCAL checkout lists the directory directly and ignores this file. What joins the
// two is the route contract: every name here becomes a route in
// `tests/support/site-contract.mjs` (`docsRoutes`), and `scripts/validate-build.mjs`
// asserts set EQUALITY between the contracted routes and the pages the build actually
// generated — in both directions. So an entry added here without a matching route, or a
// route without a page, is a red check rather than a silent omission.
//
// (An earlier revision of this comment pointed at `scripts/validate-docs-sync.mjs`. No
// such file has ever existed in this repository; the equality check described above is
// the real rail. Corrected 2026-09-18.)
//
// Adding a name here REGISTERS A ROUTE; it does not publish a document. The body of the
// page comes from the sync reading that path out of the pinned commit, so an entry for a
// file the pin does not contain fails the sync outright — and an entry whose document
// renders empty is caught by `DOCS_BODY_TEXT_FLOOR`. Both are deliberate: a 200 served
// over a blank page is worse than a 404, because nothing reports it.
//
// Verified against PersonalClaw v0.1.3 (commit bc185c0) on 2026-07-31.
// Re-verified 2026-09-18: still exact for the pin. See the `guides` note below.
export const KNOWN_DOCS = {
  // THREE guides, and that is the complete set the pin has — not an omission.
  //
  // core@main carries eleven files in docs/guides/, so this list reads like it is eight
  // short, and core's README (on main) links all of them by relative path, so those
  // links work on GitHub and have no page here. That asymmetry is the projection rule
  // working, not failing: every one of the other eight was committed to core AFTER
  // v0.1.3 (2026-07-30) — chat-surface, use-from-your-ide, companion-apps, desktop and
  // skills between 2026-08-16 and 2026-09-18, platforms 2026-08-06, build-a-channel-app
  // 2026-08-11, workflow-templates 2026-08-01 — and v0.1.3 is still core's newest tag.
  // They document unreleased behavior.
  //
  // So they cannot be published from here by any means this repository owns. Listing one
  // hard-fails the sync (the pinned tree has no such path to read). Committing a copy
  // breaks the no-copies rule in sync-docs.mjs. Publishing them would need the PIN to
  // advance to a release that contains them, which is a release decision, not a docs
  // one — and pointing the pin at main would make this site advertise capabilities the
  // released product does not have.
  //
  // The cost of the gap is real and worth stating: use-from-your-ide.md is the project's
  // only MCP explainer. It stays unpublished until a release carries it. Measured
  // 2026-09-18 against core@main.
  guides: ["containers.md", "getting-started.md", "remote-access.md"],
  reference: [
    "CONFIG-REFERENCE.md",
    "api-overview.md",
    "cli.md",
    "configuration.md"
  ],
  architecture: [
    "app-platform.md",
    "chat-sessions.md",
    "inbox-channels.md",
    "knowledge-memory.md",
    "loops.md",
    "overview.md",
    "provider-boundary.md",
    "security.md",
    "tasks-triggers.md"
  ],
  security: ["limitations.md", "threat-model.md"],
  // The research-learnings corpus. Keyed by its SOURCE path, not by its site tree:
  // these files live two levels down in core (docs/research/learnings/) and are
  // published one level up on the site (/docs/research/), so the two identifiers
  // genuinely differ — see the `sourceDir` field in sync-docs.mjs.
  //
  // FOURTEEN topics, not fifteen files. The directory also holds README.md, which is
  // the corpus INDEX (a topic table plus a cross-corpus findings summary), not a
  // topic. The site replaces it with its own section index — an owner-voiced preface
  // over a generated topic table (src/prose/research-preface.md) — so republishing
  // README.md too would ship two indexes that disagree the moment one changes.
  // README.md is instead linked from the preface at the pinned commit.
  "research/learnings": [
    "agent-harness-engineering.md",
    "automation-and-triggers.md",
    "ecosystem-and-interop.md",
    "knowledge-pipelines.md",
    "local-models-and-inference.md",
    "memory-architectures.md",
    "multi-agent-orchestration.md",
    "planning-and-decomposition.md",
    "product-surfaces-and-ux.md",
    "security-and-guardrails.md",
    "self-improvement-loops.md",
    "skills-and-prompt-craft.md",
    "verification-and-judging.md",
    "workflow-engine-design.md"
  ]
};
