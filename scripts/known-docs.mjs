// The core doc files this site publishes, per tree.
//
// Why an explicit list: a REMOTE (pinned-commit) sync has no directory listing —
// GitHub's tree API would work, but then a doc added to core would silently start
// appearing on the website without anyone deciding it should. Publishing is a
// decision; this file is where it is recorded.
//
// A LOCAL checkout lists the directory directly and ignores this file, which is how
// drift is detected: `scripts/validate-docs-sync.mjs` compares the two and fails when
// they disagree, so a new core doc surfaces as a red check rather than a silent
// omission.
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
  security: ["limitations.md", "threat-model.md"]
};
