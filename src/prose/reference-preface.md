<!--
OWNER-EDITABLE PROSE — the /docs/reference section index.

This is also the API documentation space. There is no separate /docs/api route: the
gateway's HTTP, WebSocket and MCP surfaces are documented in core's reference tree, and a
second landing page for them would be a second place to describe one API.

The reference pages themselves are synced verbatim from core (docs/reference/) by
scripts/sync-docs.mjs and must never be edited here. The "The reference pages" list on
the published page is GENERATED from what actually synced.

The two page links below (api-overview, cli) are deliberate and deliberately load-bearing:
scripts/validate-build.mjs resolves every in-site link on this page against the built
output, so if core renames or drops either file this page reds the build with a broken-link
failure instead of quietly shipping a dead link. Do not add links to pages that are not
worth that coupling.

The paragraph about hand-maintained route tables is not editorialising. It restates what
core's own api-overview.md says at the pinned commit: "the handler docstrings are the
authoritative per-route contract." Do not soften it into a completeness claim.

`{{coreRepoUrl}}` expands to the pinned core commit this site was built from.

The first paragraph's FIRST SENTENCE becomes this page's meta description, so keep it
self-contained and under 220 characters.

Do not end that first sentence on an UPPERCASE word. `extractSummary`'s sentence split is
`(?<=[a-z0-9)"”])\.\s+(?=[A-Z])`, so a sentence ending "…the gateway's HTTP API." does not
split — the lookbehind rejects the capital I — and the whole paragraph is then truncated
mid-word at 217 characters with an ellipsis. That is how this page's description first
shipped on the /docs landing.

This comment block is stripped before the page is written, so nothing here is published.
-->

# Reference

Reference is the exact-surface section: the command-line interface, every configuration key, and the HTTP API the gateway serves. Use it when you know what you want to do and need the precise name of the thing that does it — a guide will not list every flag, and this section will not explain when to reach for one.

## The API

PersonalClaw's gateway is a real HTTP service, not only a dashboard backend. It serves a REST API under `/api/*` on the dashboard port, a WebSocket at `/api/ws` for chat streaming and event fan-out, and MCP in both directions — PersonalClaw consumes MCP servers, and exposes its own tools over MCP. [API overview](/docs/reference/api-overview) is the route index for all of it, grouped by domain, and it states the auth model each route runs under.

One caveat, and it is core's own: those route tables are maintained by hand, and the page names the handler docstrings — not the table — as the authoritative per-route contract. So treat the overview as a map rather than a specification, and read the handler when a field matters. If you are automating against this API, read it out of the release you are running rather than out of a page you cached.

The [CLI reference](/docs/reference/cli) covers the same system from the other side. Most of what the API does has a command, and for one-off work the command is usually the shorter path.

These pages are core's text, published from the release this site was built from — see [release provenance](/release) for which one. Corrections land in [core]({{coreRepoUrl}}/docs/reference), not here.
