export const GITHUB_URL = "https://github.com/PersonalClaw/PersonalClaw";
export const APPS_URL = "https://github.com/PersonalClaw/PersonalClawApps";
// The released install path (core Distribution plan): one command via uv (which
// brings its own Python 3.12), then setup. The /install bootstrap this site
// serves wraps the same flow and installs uv first when it's absent. The old
// clone-and-build sequence is the CONTRIBUTOR path and lives in core's
// CONTRIBUTING.md — not the end-user quickstart.
export const INSTALL_COMMAND =
  "curl -fsSL https://personalclaw.dev/install | sh";

export const productViews = [
  {
    id: "home",
    label: "Home",
    title: "See the whole system",
    description:
      "Current work, recent conversations, scheduled runs, and system state stay visible from one home."
  },
  {
    id: "chat",
    label: "Chat",
    title: "Work with the right agent",
    description:
      "Move from conversation to tools and durable work without surrendering the approval boundary."
  },
  {
    id: "loops",
    label: "Loops",
    title: "Delegate goals, not prompts",
    description:
      "Autonomous loops plan, act, and report against a goal while remaining observable and pausable."
  },
  {
    id: "knowledge",
    label: "Knowledge",
    title: "Keep reference material distinct",
    description:
      "Knowledge is explicit, inspectable source material. Personal memory remains a separate system."
  },
  {
    id: "apps",
    label: "Apps",
    title: "Replace any provider",
    description:
      "Models, search, speech, channels, tools, and complete interfaces install through one app boundary."
  }
] as const;
