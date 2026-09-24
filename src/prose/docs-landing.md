<!--
OWNER-EDITABLE PROSE — the /docs landing page.

This is the docs root: where the marketing header's "Docs" link lands, and for most
readers the first documentation page they see. It is one of six hand-written files under
src/prose/; everything else under /docs is synced from core by scripts/sync-docs.mjs and
must never be edited here.

The "The sections" list on the published page is GENERATED from the sections that
actually synced, and each section's description is its own preface's first sentence — so
do not restate a section here, and do not hand-maintain the list.

`{{coreRepoUrl}}` expands to the pinned core commit this site was built from.

The first paragraph's FIRST SENTENCE becomes this page's meta description
(scripts/sync-docs.mjs `extractSummary`), so keep it self-contained and under 220
characters.

This comment block is stripped before the page is written, so nothing here is published.
-->

# Documentation

This documentation is generated from the tagged PersonalClaw release this site publishes, not written alongside it — so it describes the version you can actually install. Every page below is core's own text, read out of the release commit at build time and published unedited. Nothing here is a second account of the product maintained by the website.

Three routes through it, depending on what you are doing.

**Running PersonalClaw.** Start with the [guides](/docs/guides) — install, first run, and the specific setups (containers, remote access) people hit first. When you need the exact name of a flag or a config key rather than a walkthrough, that is [reference](/docs/reference).

**Extending PersonalClaw.** [Architecture](/docs/architecture) is the section for app and provider authors: how the gateway, providers, memory, knowledge, loops and the app platform fit together, and which contracts an app is written against. The app boundary is deliberately narrow, and that section is where the narrowness is explained.

**Deciding whether to trust it.** [Security](/docs/security) carries the threat model and a written account of what PersonalClaw does not protect against. It is short and it is meant to be read before you point an autonomous agent at anything you care about.

[Research](/docs/research) sits apart from the three. It is the corpus the product was designed from rather than documentation of what it does, and its own index says so first.

Two things worth knowing about how this section behaves. Because the site publishes a release rather than a branch, a document written in core after that release has no page here until the next one — so a link in core's README can work on GitHub and not resolve here, and that asymmetry is the projection rule rather than a broken build. And because every page is generated, an "Edit this page" link goes to [core]({{coreRepoUrl}}), which is the only place a correction can land.

For the exact commits and tags behind this build, see [release provenance](/release). A machine-readable index of everything here is published at [/llms.txt](/llms.txt), with the full corpus in one file at [/llms-full.txt](/llms-full.txt).
