<!--
OWNER-EDITABLE PROSE — the /docs/security section index.

This section is TWO documents and they are asymmetric: the threat model says what is
defended, and limitations says what is not. The prose below must not flatten that into
"security documentation" — the second document is the one a reader is least likely to
find on their own and most needs.

Both pages are synced verbatim from core (docs/security/) by scripts/sync-docs.mjs and
must never be edited here. The "The documents" list on the published page is GENERATED
from what actually synced.

The two page links are load-bearing (validate-build.mjs resolves them) and both exist at
the pinned commit. Do NOT restate a specific limitation here: the set changes as core
fixes them, a stale copy on this page would understate or overstate the current position,
and the page itself is one click away.

Do not describe this section as a security guarantee, and do not add a reassuring summary
sentence. README.md ("Name the boundary") forbids presenting planned hardening as an
existing control, and a section index is exactly where that slip is easiest.

`{{coreRepoUrl}}` expands to the pinned core commit this site was built from.

The first paragraph's FIRST SENTENCE becomes this page's meta description, so keep it
self-contained and under 220 characters.

This comment block is stripped before the page is written, so nothing here is published.
-->

# Security

This section is core's own security account of PersonalClaw: a threat model that names the trust boundaries the system is designed around, and a written list of what it does not enforce yet. Read both — the second is the shorter one and the one that will change how you configure it.

The [threat model](/docs/security/threat-model) works through the boundaries in turn — owner to agent to tools, core to apps, the gateway to inbound channels, the install pipeline to its sources, and the system to persisted or exported state — and maps them against the OWASP Agentic Security Top-10. It closes with what PersonalClaw deliberately does not defend against, which is a design position rather than a backlog.

[Limitations](/docs/security/limitations) is the honest half. It lists controls that are declared but not yet enforced, each with what an attacker or a careless prompt could do as a result, and it explains why they are published rather than quietly fixed later. If you are deciding how much autonomy to grant on a machine that matters, that page is the one to read first.

Neither document is a guarantee, and this project is pre-1.0. The marketing site's [security page](/security) summarises the same posture for a reader who has not installed anything yet; these two are the source it summarises.

Both pages are core's text, published from the release this site was built from — see [release provenance](/release) for which one, because a limitation fixed after that release is still listed here. Corrections land in [core]({{coreRepoUrl}}/docs/security), not here.
