export const GITHUB_URL = "https://github.com/PersonalClaw/PersonalClaw";
export const APPS_URL = "https://github.com/PersonalClaw/PersonalClawApps";
// The released install path, in two steps, so nothing on the site pipes a download into a shell
// (SITE-REDESIGN.md, section 5.3): download the installer the site serves, read it and check its
// checksum in Home's install panel, then run it. /install installs uv when it is absent, then
// PersonalClaw on the Python src/data/installer.mjs reads from it, then offers setup. The
// clone-and-build sequence is the CONTRIBUTOR path and lives in core's CONTRIBUTING.md.
export const INSTALL_DOWNLOAD_COMMAND = "curl -fsSLO https://personalclaw.dev/install";
export const INSTALL_RUN_COMMAND = "sh install";
/** The id of Home's install panel (src/components/InstallPanel.astro), which its buttons open. */
export const INSTALL_PANEL_ID = "install-panel";

export const productViews = [
  {
    id: "home",
    label: "Home",
    title: "See what waits on you",
    description:
      "Approvals, ready tasks, current work, and recent conversations stay visible from one home."
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
    // The app deliberately has no Loops nav tile — loops launch from within Projects (and
    // surface as chat widgets). Say so here, or a reader lands in the app hunting for a
    // marketed view that is not in the rail (AUD-X2).
    description:
      "Launched from within your projects, autonomous loops plan, act, and report against a goal while remaining observable and pausable."
  },
  {
    id: "apps",
    label: "Apps",
    title: "Replace any provider",
    description:
      "Models, search, speech, channels, tools, and complete interfaces install through one app boundary."
  }
] as const;
