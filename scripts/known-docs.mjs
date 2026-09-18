// The core doc files this site publishes, per tree.
//
// Why an explicit list: a REMOTE (pinned-commit) sync has no directory listing —
// GitHub's tree API would work, but then a doc added to core would silently start
// appearing on the website without anyone deciding it should. Publishing is a
// decision; this file is where it is recorded.
//
// A LOCAL checkout lists the directory directly and ignores this file (only
// `scripts/sync-docs.mjs:266` reads it, and only in remote mode), which is how drift is
// detected. There is NO `scripts/validate-docs-sync.mjs` — that name was a comment that
// never had a file behind it. The rail is `scripts/validate-build.mjs`, which compares
// the generated pages against `docsRoutes` in `tests/support/site-contract.mjs` in BOTH
// directions: a page this list omits reds as "generated route … is missing from the route
// contract", and a contracted route with no page reds as "route contract references
// missing generated page".
//
// So adding a filename here is two edits, not one — this list AND `docsRoutes` — and it
// only works if the file exists AT THE PINNED COMMIT below. `readText` fetches
// raw.githubusercontent.com at that exact SHA, so a name core added after the pin fails
// the sync outright ("Pinned source request failed (404)"). It cannot ship a blank page;
// publishing a newer doc means moving the pin to a newer release, which is a decision
// about what the site projects, not a sync.
//
// Verified against PersonalClaw v0.1.3 (commit bc185c0) on 2026-07-31.
export const KNOWN_DOCS = {
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
