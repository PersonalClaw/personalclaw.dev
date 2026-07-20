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
  }
];

export function canonicalUrl(path) {
  return new URL(path, siteOrigin).toString();
}

export function routeOutputPath(path) {
  return path === "/" ? "index.html" : `${path.slice(1)}/index.html`;
}
