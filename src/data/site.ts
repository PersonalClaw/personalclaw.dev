export const GITHUB_URL = "https://github.com/PersonalClaw/PersonalClaw";
export const APPS_URL = "https://github.com/PersonalClaw/PersonalClawApps";
export const INSTALL_COMMAND =
  "git clone https://github.com/PersonalClaw/PersonalClaw.git personalclaw && cd personalclaw\npython3 -m venv .venv && source .venv/bin/activate\npip install -e .\nmake web-build\npersonalclaw gateway";

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
