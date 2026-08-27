---
title: "A personal agent you can audit"
description: "Every claim in this post names the file that proves it, checked against the tagged release this site publishes — including the claims that did not survive the check."
publishDate: 2026-08-26
verifiedAgainst: "v0.1.3"
---

## The pitch, in one paragraph

PersonalClaw is a self-hosted personal agent. It runs on your machine, talks to whichever
model provider you point it at, and keeps your sessions, memory, knowledge and config in a
directory you own. There is no account, no hosted control plane, and nothing to sign up
for. It is MIT-licensed, needs Python 3.12 or newer, and this release is 0.1.3.

That paragraph is easy to write and most projects write it. The rest of this post is the
part that is hard to fake: the mechanisms that make it true, and the places where it is
not true yet.

**How to read it.** Every claim below names the file that proves it, in the tagged release
this website publishes — `v0.1.3`, pinned commit `bc185c02`. Where a claim was true in
development but not in this release, it was cut, and the cut list at the end says which
ones and why. That list is the most informative part of the post.

### Receipts

- [`LICENSE`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/LICENSE) — MIT
- [`pyproject.toml`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/pyproject.toml) — `version = "0.1.3"`, `requires-python = ">=3.12"`

## Receipt 1: the core does not know your provider's name

Vendor-specific logic lives in removable app bundles, and the core stays
provider-agnostic. The boundary and its deliberate in-core exceptions are written down,
including a case study of moving one integration out of core — which is more useful than
the rule itself.

The receipt is not the document. The receipt is that an app cannot reach past the SDK even
by accident: an import lint asserts that installed apps reach core only through
`personalclaw.sdk.*`, and it runs per app file, so a failure names the offending path
instead of the offending repository. Apps extend the system through the fourteen provider
types this release declares: `action`, `agent`, `channel`, `inbox`, `knowledge`, `memory`,
`model`, `notification`, `prompt`, `search`, `skills`, `task`, `tool` and `workflow`.

### Receipts

- [The provider boundary](/docs/architecture/provider-boundary) — the rule, its in-core exceptions, and the case study of how Slack left core
- [`tests/test_apps_import_boundary.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/tests/test_apps_import_boundary.py) — the import lint, plus a per-file variant so a failure names the file
- [`apps/manifest.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/src/personalclaw/apps/manifest.py) — `PROVIDER_TYPES`, the fourteen

## Receipt 2: where the network is allowed to go

"No phone-home" is a sentence. A chokepoint is a control.

Every core fetch surface routes through one function, `evaluate` in `net/guard.py`,
deciding against a declared egress policy. Its order is worth reading, because the order
*is* the control: scheme allow-list, then the operator's `deny_hosts` (a deny always
wins), then the operator's allow match — all of that **before** DNS resolution, since a
DNS query is itself an egress signal — then resolve, classify every returned address,
block the loopback, private, link-local, multicast and reserved ranges, and pin the
validated addresses so the connection dials exactly what was checked. An unresolvable host
fails closed.

Now the part a launch post is tempted to overstate. **The default posture is
deny-by-default about private address ranges, not about destinations.** The `STRICT`
profile is the normal agent posture, and it reaches every public host; what it blocks is
the LAN, loopback and metadata-address class of target. In this release there is no "only
these hosts" stance at all: the tier resolver returns `STRICT` for both `all` and
`listed`, the curated `REGISTRY` preset for `registry`, and nothing for `off`.

Two things narrow the claim further, and both are in the code rather than in the
marketing.

**The operator allow-list does double duty.** One match against
`security.egress.allow_hosts` both waives the private-range block — the homelab
LAN-webhook case — and is unioned onto whichever preset a tier selected. So a host you
allowed once for a webhook is also allowed on a later `registry`-tier run, and "the
registry tier reaches development registries only" stops being true the moment you have an
operator allow-list at all.

**If the config cannot be read, the operator's layer is skipped.** The loader is lazy and
best-effort, and on any exception it returns the base profile unchanged — so on that path
your own `deny_hosts` do not apply. The comment says why it is best-effort: the `net`
package has to stay importable before a config exists. That is defensible, and it is still
a window.

**And one destination is contacted without you asking.** The dashboard's update check asks
GitHub whether a newer release exists, cached to at most once every twelve hours. The
request carries a product-identifying `User-Agent` of `personalclaw-update-check` and,
necessarily, your IP address. Nothing suppresses it, and the config field that looks like
it would says so itself: the description of `auto_update` reads "update checks always run;
this gates the unattended pull + rebuild + restart".

So the accurate claim is: no analytics, no crash reporting, no usage telemetry, and one
unprompted release check to GitHub.

One detail belongs here precisely because it looks bad on a grep and turns out to be fine.
Your PersonalClaw home contains a file called `telemetry_salt`, and `GET /api/status`
returns an `owner_id_hash` — an HMAC-SHA256 of your hostname and username. That is exactly
the shape of a pseudonymous analytics identifier. It is not one: it is a field served to
your own dashboard by your own local gateway, no code sends it anywhere, and the salt is
handled as a secret — excluded from sync shards ("Deliberately NOT `telemetry_salt`: that
is marked `secret=True`") and filed under `security` in the snapshot manifest. The name is
aspirational for infrastructure that does not exist. Grep it yourself rather than taking
the sentence.

### Receipts

- [`net/guard.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/src/personalclaw/net/guard.py) — `evaluate`, the order, the classification, the address pinning
- [`net/policy.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/src/personalclaw/net/policy.py) — the profiles, `egress_policy_for_tier`, and the operator union in `egress_policy_for`
- [`handlers/updates.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/src/personalclaw/dashboard/handlers/updates.py) — the twelve-hour interval
- [`handlers/updates_kind.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/src/personalclaw/dashboard/handlers/updates_kind.py) — the `personalclaw-update-check` user agent
- [`config/loader.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/src/personalclaw/config/loader.py) — the `auto_update` field and its own description
- [`handlers_system.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/src/personalclaw/dashboard/handlers_system.py) — where `owner_id_hash` is derived and served
- [`durability/shards.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/src/personalclaw/durability/shards.py) — the salt's exclusion from sync

## Receipt 3: an audit trail that notices tampering

The Security Event Log is an append-only JSONL record of tool and MCP actions, carrying
the timestamp, the caller identity, the operation, the resources touched, the outcome and
the downstream server where one applies. Each entry is signed with HMAC-SHA256 over the
previous entry's hash, so the chain is tamper-evident rather than merely append-only.
Retention defaults to 365 days. It is a local file in your PersonalClaw home, and nothing
ships it anywhere.

### Receipts

- [`sel.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/src/personalclaw/sel.py) — the HMAC chain, the `prev_hash` field, the 365-day default

## Receipt 4: which gates are gates, and which are only reports

This distinction is where most projects quietly overclaim, so here it is explicitly.

**A real gate.** The full workflow's `matrix` job runs the entire pytest suite across
Python 3.12 and 3.13 on Ubuntu and macOS, with no `continue-on-error`. The supply-chain
scanner that inspects an app before it is installed is covered inside that suite, by
`tests/test_supply_chain_scanner.py` and `tests/test_supply_chain_gates.py`. A regression
there fails the job.

**Not a gate.** In the same workflow, the `audit` job — `pip-audit` plus `npm audit` —
runs under `continue-on-error: true` with a trailing `|| true`, and its comment says why
in as many words: "Report-only supply-chain scan — visibility, not a merge gate." A
finding there blocks nothing. If you read "we run pip-audit" elsewhere as "vulnerable
dependencies cannot merge", that inference does not hold here — and the code says so in a
comment rather than hiding it.

### Receipts

- [`.github/workflows/full.yml`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/.github/workflows/full.yml) — the `matrix` job, and the `audit` job's own comment
- [`tests/test_supply_chain_scanner.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/tests/test_supply_chain_scanner.py) and [`tests/test_supply_chain_gates.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/tests/test_supply_chain_gates.py)

## Receipt 5: fail-closed, and precisely where

The gateway defaults to token authentication; unauthenticated mode is something you opt
into rather than something you forget to turn off, and when you do opt in, the bind host
is forced to loopback. The credential store states its own failure posture in its module
docstring — fail-closed — and an unreadable or malformed credential file means "no
credential" instead of "no check", with a warning that says it is treating login as
unconfigured.

The most interesting receipt in this release is a field that does nothing yet and says so.
`SafetyProfile.tool_grants` is declared, with a `tool_allowlist` beside it, and the
module's own docstring records that graduated per-template profiles "arrive when that
engine lands and consumes `tool_grants`; until then the profile decides approval + egress
+ budget + scan for the unattended paths that exist today". A read-only promise resting on
that field would deny nothing. Naming which of two plausible mechanisms is actually
holding the line, in the file, is the shape of receipt worth trusting.

### Receipts

- [`auth/modes.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/src/personalclaw/auth/modes.py) — `LOCAL_TOKEN` by default, loopback forced under `none`
- [`auth/credentials.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/src/personalclaw/auth/credentials.py) — "Failure posture is FAIL-CLOSED"
- [`guardrails/policy.py`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/src/personalclaw/guardrails/policy.py) — `tool_grants`, declared and not yet consumed

## Receipt 6: the limitations page is a feature

The reporting policy lives in `SECURITY.md` and the model lives in the threat model, but
the page to read first is the one that enumerates what PersonalClaw does **not** enforce
yet. At this release it lists two things:

1. Agents running under auto-approve rely on system-prompt framing, not on rails.
2. An app's `network` permission is declaration-only — disclosure at install time, not
   per-app egress isolation.

Both are real constraints on what you should let this software do unattended today. They
are listed, with reasons, rather than deferred to a changelog nobody reads.

### Receipts

- [Security limitations](/docs/security/limitations) — the two, with reasons
- [Threat model](/docs/security/threat-model) and [security architecture](/docs/architecture/security)

## The honest limitations paragraph

PersonalClaw is pre-1.0 and the README says so in a badge: upcoming 0.x releases may
introduce breaking changes **with no automatic migration** of your sessions, memory,
knowledge, config or app state. That is a deliberate choice rather than an oversight —
migration-backed change discipline binds once the architecture stops moving, and gating a
half-built architecture is worse than breaking it honestly now. Take a snapshot before
upgrading, and read the release notes.

The egress chokepoint needs its own sentence, because "all network access goes through one
guarded function" is what a reader will reasonably assume from Receipt 2, and it is not
what the code says. The guard governs **core's** fetch surfaces. An installed app's
backend is its own operating-system process with its own network stack, so its outbound
traffic never reaches the guard at all — the threat model lists an app's own network
traffic under what PersonalClaw deliberately does not defend against, and the `network`
permission is disclosure at install consent rather than a boundary. What is enforced for
apps is the supply-chain scan on what you install and the gateway-mediated reach an app
declares. Alongside that: the default posture reaches any public host, one operator
allow-list entry widens a later exclusive-looking run, and operator denials do not apply on
the path where the egress config cannot be read. Each of those is defensible in isolation.
Together they mean the honest summary is "a real chokepoint with a configurable ceiling,
covering core and not apps", not "nothing leaves without passing the guard".

The threat model is also explicit that a compromised host operating system or account,
physical access to an unlocked machine, and the owner's own auto-approve choices are all
outside the model. Those are scope statements rather than bugs — but a reader deciding
whether to trust this software unattended should read them as limits, because that is what
they are.

## How the work is checked

The roadmap is executed as small atoms, each with a written execution log. Those logs are
unusual in one respect: they record what a session tried to **disprove**, not only what it
built, alongside deviations, adjacent problems found and deliberately not fixed, and
blocks with reasons.

Counted at the tag this site publishes, 7 of the 70 plan files carry an explicit
falsification note. The habit is more widespread in development than a released tag can
show — but this site publishes the tag, so the tag is what gets counted, and you can run
the count yourself against `docs/roadmap/plans/` at `v0.1.3`.

Worth stating plainly: that is a convention visible in the logs, not a rule written into
the contributor guide. `CONTRIBUTING.md` and `AGENTS.md` require the deviations ledger;
neither uses the word "falsification". The habit is stronger in practice than in policy.

### Receipts

- [`docs/roadmap/plans/`](https://github.com/PersonalClaw/PersonalClaw/tree/v0.1.3/docs/roadmap/plans) — 70 plan files, with their execution logs
- [`AGENTS.md`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/AGENTS.md) — the deviations ledger requirement, and no mention of falsification

## Who should not use this yet

If you want a managed product with migrations, a support channel and a stability
guarantee, wait. If you want a personal agent whose boundaries you can read, whose
enforcement points are named in the files that hold them, and whose unfinished edges are
written down where you can find them before they surprise you — that is what is on offer,
at 0.1.3, honestly labelled.

### Receipts

- [`README.md`](https://github.com/PersonalClaw/PersonalClaw/blob/v0.1.3/README.md) — installation, and the pre-1.0 heads-up
- [CLI reference](/docs/reference/cli) and [getting started](/docs/guides/getting-started)

## Claims cut from this post, and why

There are two kinds of cut here, and the second kind is specific to this website.

The first kind is a claim that is not true in any version, and never was.

- **"Zero telemetry."** Cut to "no analytics, no crash reporting, no usage telemetry, plus
  one unprompted release check". The GitHub release check is real, is unprompted, carries
  an identifying user agent, and has no off switch.
- **"You can disable the update check."** Cut entirely. `auto_update` gates the apply, not
  the check, and its own description says so.
- **"Vulnerable dependencies cannot merge."** Cut. Those scans are report-only by explicit
  design, in a comment.
- **"Sandboxed apps" and "per-app network policy."** Cut. The `network` permission is
  declaration-only.
- **"All network access goes through one guarded chokepoint."** Cut. It is a real
  chokepoint for core's fetch surfaces, and an app backend is a separate process with its
  own network stack.
- **"Egress is deny-by-default."** Cut as written. It is deny-by-default about private,
  loopback and link-local ranges; the default profile reaches any public host.
- **"The registry egress tier reaches package registries only."** Cut. The operator's
  allow-list is unioned onto the tier preset, and one match serves both the private-range
  waiver and the allow-list, so any operator entry widens the tier.
- **"Our contributor guide mandates falsification."** Softened to a convention observed in
  the logs, because neither `CONTRIBUTING.md` nor `AGENTS.md` uses the word.
- **A comparison against named competitors.** Omitted. No peer set has been chosen, and
  naming peers is positioning rather than implementation.

The second kind is specific to the rule this website runs on: it publishes released state,
never the development branch. Each claim below was in this post's draft, is true in
development, and is **not** in 0.1.3 — so it was cut when it was checked against the tag.

- **A build-time census of every network destination**, and the sweep that reds when a new
  host literal appears. Neither the census file nor its test exists at `v0.1.3`. The
  runtime chokepoint above is what this release actually has.
- **An exclusive "only these hosts" egress tier.** The flag that makes a tier exclusive is
  not in this release's `net/policy.py`; `listed` and `all` both start from `STRICT`.
- **`on_violation: "warn"` as a documented operator escape hatch.** The field is declared
  on the egress policy in this release, and nothing reads it — one grep, zero consumers.
  Publishing an inert field as a control would have been precisely the overclaim this post
  is about.
- **A dedicated adversarial `security-corpus` merge job**, and the published
  scanner-testing methodology it runs. Both are later work. This release's gate is the
  ordinary suite described in Receipt 4.
- **The headless one-shot run and its task-mode boundary.** That module does not exist at
  this tag.
- **App-to-app messages denied with a 403 on an undeclared pair.** That module does not
  exist at this tag either.
- **"Nineteen provider types."** Fourteen at this tag.

If you want to know what the next release adds, that is what a changelog is for. What this
page will not do is describe the development branch and call it a release.
