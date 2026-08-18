<!--
OWNER-EDITABLE PROSE — DRAFT, NOT YET APPROVED.

This file is the ONLY hand-written part of /docs/research. The fourteen topic pages
under it are synced verbatim from core (docs/research/learnings/) by
scripts/sync-docs.mjs and must never be edited here. The "The topics" list on the
published page is GENERATED from what actually synced, so do not hand-maintain it.

`{{coreRepoUrl}}` expands to the pinned core commit this site was built from.

This comment block is stripped before the page is written, so nothing here is
published. Two things in the prose below are the OWNER'S calls, not the author's:

  1. The second paragraph's claim about how PersonalClaw is built. It is stated
     plainly and without hedging on purpose, but it is a claim about the owner's own
     process and only the owner can confirm the wording is the one he wants to make.
  2. Whether this section should be published at all before 1.0.

DL-9 requires owner approval of this preface. Until that is recorded, the atom is
PARTIAL — this file is a draft to edit, not a finished page.
-->

# Research

PersonalClaw was designed from a competitive-research corpus before most of it was built, and this section publishes that corpus rather than summarising it. Fourteen topic files, distilled on 2026-07-13 from 95 individually-read sources — agent frameworks, workflow engines, memory systems, harnesses, judging setups, local-inference stacks — each compressed into two sections: **Principles**, the findings that turned up independently across several systems, and **Mechanisms**, implementation-ready designs carrying the actual schemas, state machines, thresholds and formulas.

It is here because PersonalClaw is built agentically — researched, planned and largely written by agents, under one owner who reviews and signs every change — and a project that makes that claim should show its working rather than assert it. This corpus is one of the artifacts of that process, published as it was written, unedited for an audience. The 95 source files behind it were read and distilled by agents; the topics they produced are what the roadmap plans were then argued from.

Three things it is not.

**It is not documentation of PersonalClaw.** Nothing here describes what the shipped product does — the [architecture](/docs/architecture/overview) and [reference](/docs/reference/cli) sections do that, and they are generated from the released source. Some of what follows describes designs PersonalClaw has not built and may never build.

**It is not a survey, and it is not neutral.** The corpus was read to build one product for one person. It says self-grading is structurally broken rather than that opinions differ on self-evaluation, because that is what the evidence said; hedging it would have cost the reader the finding.

**It is not maintained.** These files record what the sources said in July 2026. The systems they describe have moved on and the files have not. The 95 per-source notes were retired once the topics were written, so the topics are the record — there is no rawer version to consult.

Cross-references between topics resolve inside this site. Everything else, including the corpus's own index and the roadmap plans these findings fed into, links back to core at the exact commit this site was built from: [docs/research/learnings/README.md]({{coreRepoUrl}}/docs/research/learnings/README.md).
