<!--
OWNER-EDITABLE PROSE — the /docs/architecture section index.

This is the platform-documentation section: the one an app or provider author reads. The
subsystem pages are synced verbatim from core (docs/architecture/) by
scripts/sync-docs.mjs and must never be edited here, and the "The subsystems" list on the
published page is GENERATED from what actually synced.

The three page links below (overview, app-platform, provider-boundary) are deliberate and
load-bearing: validate-build.mjs resolves them against the built output, so a core rename
reds the build rather than shipping a dead link. All three exist at the pinned commit.

Do NOT restate the app contract here — not the app.json fields, not the permission names,
not the list of provider kinds. Those belong to core's pages, which are published in full
two clicks away, and a summary on this page is a copy that drifts. This page's job is to
say which page answers which question.

`{{coreRepoUrl}}` expands to the pinned core commit this site was built from.

The first paragraph's FIRST SENTENCE becomes this page's meta description, so keep it
self-contained and under 220 characters.

This comment block is stripped before the page is written, so nothing here is published.
-->

# Architecture

Architecture explains how PersonalClaw is put together: the gateway process, the provider boundary, memory and knowledge, loops, tasks and triggers, and the app platform. It is the section to read if you are extending the system rather than running it.

Start with the [system overview](/docs/architecture/overview) — it names the parts and how a request moves through them, and the rest of the section assumes it.

Two pages define the contracts an extension is written against, and they are worth reading before writing any code. [App platform](/docs/architecture/app-platform) covers what an app is: its manifest, the permissions that manifest declares and how they are enforced, and the install lifecycle — which stages an app in quarantine and scans it before it runs, on the invariant that the bytes scanned are the bytes installed. [Provider boundary](/docs/architecture/provider-boundary) covers the rule that makes those apps removable — vendor-specific logic lives in app bundles, apps import core through one narrow surface and nothing else, and the page enumerates the in-core exceptions rather than leaving them implicit. If an app you are writing wants an import the boundary does not offer, that page is the one that says why.

The remaining pages describe subsystems an app can participate in. They are descriptions of shipped behaviour, not proposals — this section carries no roadmap, and designs PersonalClaw has considered and not built are in [research](/docs/research) instead.

These pages are core's text, published from the release this site was built from — see [release provenance](/release). Corrections land in [core]({{coreRepoUrl}}/docs/architecture), not here.
