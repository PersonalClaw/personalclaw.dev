# PersonalClaw Website Evolution Roadmap

**Last aligned:** 2026-07-20 | **Core roadmap baseline:** PersonalClaw rev 10, 52 plans

Personalclaw.dev is the public release interface for PersonalClaw: marketing, documentation, installation, security, ecosystem discovery, and launch material. It must explain the product clearly without becoming an independent source of product truth.

## Core Alignment Principles

1. **Released behavior is the product truth.** Production claims describe tagged, reproducibly released behavior, never roadmap intent or an unmerged branch.
2. **Source-owned content stays source-owned.** Core documentation, security material, manifests, support data, and release notes are synchronized at build time from pinned source revisions. Generated copies are not committed to this repository.
3. **Zero telemetry is a feature.** The website ships no trackers, session replay, fingerprinting, adoption events, or conversion instrumentation. Decisions use public project signals, listing performance, moderated usability sessions, and manually recorded launch outcomes.
4. **Proof precedes promotion.** A platform, install method, capability, or security control is advertised only when its owning plan's acceptance evidence exists.
5. **The ecosystem expands in verified stages.** First-party apps can be published from tagged manifests. Community listings wait for the registry, validation, and disclosure contracts in core.
6. **Website work follows the core execution protocol.** Every task has explicit done criteria, is validated as a user, records deviations, and leaves no unverified claim behind.

## Source Of Truth And Release Channels

Every build uses an explicit source manifest that pins the core and first-party apps repositories by full commit SHA. A `released` build additionally pins and verifies release tags. A `pre-release` build asserts null tags and must identify itself visibly rather than presenting a branch snapshot as released behavior.

The first source-contract slice landed on 2026-07-20. Until actual tags exist, the committed manifest uses a fail-closed `pre-release` channel with full core and apps SHAs and null tags. The public `/release` surface identifies it as a pinned development snapshot. Switching to `released` requires both tags to resolve to their declared commits and the core tag to match the package version.

| Public surface | Canonical source | Publication rule |
|---|---|---|
| Product version, capabilities, and changelog | Tagged PersonalClaw release artifacts | Generate from the production source pin |
| Core documentation and navigation | `PersonalClaw/docs` | Synchronize during the build; never commit copied docs |
| Security posture | `SECURITY.md`, `docs/security/threat-model.md`, `docs/security/limitations.md` | Preserve source wording and control status |
| Install methods and `/install` | Core plan 34, `DISTRIBUTION` | Publish only methods that pass clean-machine release smoke tests |
| Platform support matrix | Core plan 39, `PLATFORM-REACH` | “Supported” requires CI or release-checklist evidence |
| First-party app catalog | Tagged PersonalClawApps manifests | Generate pages and counts from the pinned revision |
| Community app catalog | Registry data from core plan 38, `ECOSYSTEM-TOOLING` | Do not substitute hand-authored listings |
| Curated research | Owner-approved exports from `docs/research/learnings` | Build-time sync with a public-context preface |
| Public roadmap | Curated release-facing projection of the core roadmap | Clearly distinguish shipped, in progress, and planned work |

Every production build records source repository, tag, SHA, build time, and content-schema version so a published statement can be traced to its origin.

## Domain And Hosting Contract

PersonalClaw uses one canonical public origin and treats provider or owner domains as routing infrastructure, not competing identities.

- **Provider fallback:** the Vercel project is named `personalclaw`, with `https://personalclaw.vercel.app` retained as the provider-owned fallback and deployment-diagnostics origin.
- **Canonical production origin:** `https://personalclaw.dev` is the only canonical product domain. Canonical links, Open Graph URLs, sitemap entries, documentation URLs, install endpoints, and public launch material use this origin.
- **Secondary owner-domain entry:** `https://personalclaw.keyurgolani.name` is a convenience entry point only. Once `personalclaw.dev` is live, it is attached to the same Vercel project and returns a permanent path-and-query-preserving redirect to `https://personalclaw.dev`.
- **DNS and TLS:** Cloudflare remains authoritative DNS where applicable, using DNS-only records pointed at the exact target Vercel provides. Public website traffic does not depend on a `cloudflared` connector. Vercel owns edge routing and certificate issuance.
- **Preview isolation:** generated `*.vercel.app` preview URLs are non-canonical, excluded from indexing, and never used in launch material. The stable `personalclaw.vercel.app` origin remains available for rollback and provider diagnosis.

### Domain Rollout

1. **Provider baseline (complete):** Vercel project `personalclaw` serves a ready production deployment at `personalclaw.vercel.app`.
2. **Canonical launch (complete):** the Vercel GitHub App is connected, `main` is the production branch, and `personalclaw.dev` serves the site with valid TLS while `personalclaw.vercel.app` remains available.
3. **Secondary redirect (planned):** attach `personalclaw.keyurgolani.name`, configure its Vercel-provided Cloudflare DNS record, and enforce an HTTPS 308 redirect to the equivalent path and query on `personalclaw.dev`.

## Core Plan Dependency Map

| Website capability | Owning core plans | Website consequence |
|---|---|---|
| Public repository and releases | 27 `PUBLICATION`, 33 `CI-RELEASE-ENGINEERING` | Production source pins begin with signed or otherwise verifiable releases |
| Website, docs, and launch assets | 36 `DISCOVERABILITY-LAUNCH` | Astro + Starlight `/docs`, `llms.txt`, screenshots, video, and listings share one launch contract |
| Installation | 34 `DISTRIBUTION`, 43 `ONBOARDING-UX` | `/install`, setup guidance, and first-run education follow tested distribution paths |
| Security explanations | 35 `SECURITY-LEGIBILITY`, 47 `SECURITY-HARDENING` | Hardening planned for Wave 4 is never represented as already enforced |
| Platform claims | 39 `PLATFORM-REACH`, 44 `MOBILE-COMPANION`, 45 `DESKTOP-CAPABILITIES` | ARM, Windows, mobile, and desktop surfaces launch only with proof-backed support |
| App ecosystem | 38 `ECOSYSTEM-TOOLING`, 48 `APP-PLATFORM-EVOLUTION` | First-party generation precedes the community registry and richer quality metadata |
| Product demonstrations | 1-26 and 40-52, as released | Feature pages and captures follow landed capabilities, not their planned wave |
| Visual consistency | 51 `DESIGN-SYSTEM-CONSISTENCY`, 52 `FLUID-MOTION` | Site demonstrations are refreshed when the product UI contract materially changes |

## Phase 1: Production And Launch Foundation

**Core dependencies:** plans 27, 33, 35, and 36 Sessions 1-3.

### Status

The CI quality-floor and first release-truth slices were implemented locally on 2026-07-20:

- GitHub Actions defines stable `static-contract`, `browser`, and `performance` jobs with locked npm installs, Chromium provisioning, concurrency cancellation, timeouts, and diagnostic artifacts.
- Production and Vercel-preview builds validate exact route inventory, internal links and fragments, metadata, JSON-LD, canonical URLs, sitemap, robots policy, local runtime assets, explicit image dimensions, preview `noindex`, tracker signatures, and Vercel output/security-header configuration.
- Playwright covers every current route across desktop, mobile, and reduced-motion projects with Axe, keyboard-only journeys, interaction state, layout/image integrity, same-origin-only network assertions, and committed responsive visual baselines.
- Lighthouse enforces Core Web Vitals and transfer budgets on every route. The implementation run scored 99-100 in all four categories; homepage LCP measured 2.18s after critical-path optimization.
- A JSON-Schema-validated source manifest pins full core and apps SHAs and distinguishes `pre-release` from `released` publication. Local matching checkouts are preferred; clean builds verify and fetch exact files from GitHub.
- Ignored generated facts derive the package version, matching changelog entries, 38 app manifests, nine app categories, 22 provider capabilities, source links, schema version, and build time.
- `/release` exposes the source channel, exact commits, tag state, ecosystem evidence, and changelog provenance. Homepage, apps, and footer version/count claims consume the same artifact.
- The build fails on invalid pins, tag/SHA mismatch in released mode, malformed source metadata, or public app-directory name/category drift.
- Vercel Git integration, protected `main`, the canonical `personalclaw.dev` domain, and the `personalclaw.vercel.app` fallback are active.

The next engineering slice is synchronized canonical documentation and machine-readable exports from the same pinned core revision.

### Deliverables

- **Implemented:** Establish required CI checks for build, type safety, Axe, keyboard-only critical flows, visual regression, and Lighthouse budgets.
- **Implemented:** Add automated checks for links, metadata, structured data, canonical URLs, sitemap, robots policy, source provenance, and content-schema compatibility.
- **Implemented:** Assert in browser tests that production pages and meaningful interaction states make no tracker, analytics, or other third-party network requests.
- Add reproducible preview and production deployments with a documented rollback procedure.
- **Implemented:** Authorize the Vercel GitHub App for the `PersonalClaw` organization and connect this repository so branch pushes create previews while `main` is production.
- **Implemented:** Publish the website to `personalclaw.dev`, keeping `personalclaw.vercel.app` as the provider fallback rather than the canonical origin.
- After canonical launch, route `personalclaw.keyurgolani.name` through Vercel and permanently redirect it to the same path and query on `personalclaw.dev`.
- **Implemented:** Build the pinned-source manifest and expose build provenance in a human-readable release surface.
- Synchronize security content with the core security sources. Use the statuses `enforced`, `in progress (plan N)`, and `documented limitation`.
- Add synthetic uptime and availability checks that do not identify or follow visitors.
- Create a deterministic seeded demo home and scripted capture workflow for the five launch screenshots required by core plan 36.
- Produce a reproducible 60-90 second silent product capture and define a refresh gate for material product UI changes.

### Exit Criteria

- Every production change passes the quality, provenance, no-tracker, and release-truth gates.
- Key routes meet WCAG 2.2 AA and agreed performance budgets at supported breakpoints.
- Every security statement maps to a synchronized source statement and an explicit status.
- Launch captures can be regenerated from a documented seed and tagged product build.
- A production release can be reproduced and rolled back without reconstructing state manually.
- `personalclaw.dev` serves valid TLS and is the only indexable canonical origin; Vercel previews are non-indexable.
- `personalclaw.keyurgolani.name/<path>?<query>` returns an HTTPS 308 to `personalclaw.dev/<path>?<query>` without redirect loops.

## Phase 2: Synchronized Docs And Machine-Readable Surfaces

**Core dependency:** plan 36, `DISCOVERABILITY-LAUNCH`.

### Deliverables

- Serve canonical product documentation at `/docs` using Astro + Starlight.
- Add `scripts/sync-docs.mjs` to check out or consume the pinned core revision and synchronize docs into an ignored build workspace.
- Generate documentation navigation from source metadata instead of maintaining a second hierarchy by hand.
- Add docs drift, broken-link, anchor, code-sample, and orphan-page checks to CI.
- Generate `llms.txt` and `llms-full.txt` from the same pinned documentation corpus.
- Support version-aware documentation, with older versions retained only when their corresponding release remains supported.
- Label preview documentation clearly and prevent search indexing when it describes unreleased behavior.

### Exit Criteria

- No copied core documentation is committed to personalclaw.dev.
- `/docs`, navigation, search, and machine-readable exports are produced from one pinned source revision.
- A core docs change either appears in the corresponding preview or fails the website drift check.
- Every documentation page exposes its applicable PersonalClaw version and source provenance.

## Phase 3: Distribution And First-Run Education

**Core dependencies:** plans 34, 35, 39, and 43.

### Deliverables

- Build `/install` as the stable web endpoint owned by the core distribution contract.
- Make `curl -fsSL https://personalclaw.dev/install | sh` the canonical quickstart only after wheel, PyPI/`uv`, bootstrap, and clean-machine smoke-test gates pass.
- Present an installation chooser containing only released and tested methods such as `uv`, containers, desktop packages, or other supported channels.
- Generate prerequisites, commands, version constraints, update instructions, and troubleshooting from release artifacts where possible.
- Integrate doctor output and onboarding guidance into a coherent install-to-first-conversation path.
- Publish a proof-backed platform matrix. A platform is `supported` only when a named CI job or release checklist verifies it; otherwise use `experimental`, `planned`, or `not supported`.
- Add concise recovery paths for failed installs, provider configuration, local model setup, and upgrades.

### Exit Criteria

- A new user can move from the homepage to a talking agent using a clean machine and a released artifact.
- Every displayed command is exercised in release CI or a documented release checklist.
- `/install` fails safely, identifies its source release, and never silently serves an unreleased bootstrap.
- Installation and platform claims match the distribution and platform-reach evidence exactly.

## Phase 4: Ecosystem And Registry Platform

**Core dependencies:** plans 38, 47, and 48.

### Deliverables

- Generate first-party app index and detail routes directly from version-pinned PersonalClawApps manifests.
- Include capabilities, declared permissions, requirements, compatibility, install commands, source links, and release status for each first-party app.
- Validate manifest schemas and compatibility against the website build in CI.
- Publish contributor and app-builder paths from the official scaffold, templates, examples, and SDK contracts.
- Launch community listings only when the registry data tier from core plan 38 exists.
- Show maintainer, declared permissions, last validation time, scan verdict, compatibility, and the disclosure `community-listed, scanned at install` on every community listing.
- Add app quality signals and richer native-capability metadata when plan 48 lands.
- Add manifest-signature status only after the signed-manifest controls in plan 47 are enforced and externally reviewable.

### Exit Criteria

- Catalog content and app counts cannot drift from the pinned source manifests or registry.
- Every first-party listing is accurate, indexable, and actionable for its tagged release.
- Community and first-party provenance are visually and semantically unambiguous.
- Builders can move from documentation to a validated app skeleton without undocumented steps.

## Phase 5: Evidence-Led Discoverability

**Core dependency:** plan 36 Sessions 4-5, plus released product evidence.

### Deliverables

- Define clear discovery paths for operators, contributors, and app developers without tracking individual journeys.
- Build use-case pages around repeatable workflows demonstrated against released builds.
- Publish technical comparison pages in Wave 1. Every competitor claim includes a source URL, retrieval date, scope, and an honest `Choose them if` section.
- Synchronize owner-approved research learnings from core at build time with a preface explaining selection, scope, and limitations.
- Add release, changelog, showcase, public roadmap, listing, and launch surfaces grounded in tagged artifacts.
- Establish documentation SEO, structured data, reusable social assets, and listing-specific copy.
- Evaluate content with public GitHub signals, PyPI downloads, search/listing performance, moderated usability sessions, and manually recorded launch outcomes.
- Keep a decision log connecting material content changes to the evidence used, without introducing visitor-level instrumentation.

### Exit Criteria

- Organic discovery is driven by useful technical evidence rather than generic AI claims.
- Every comparison and use-case claim has a source, date, and reproducible product basis.
- Discoverability reviews can explain what changed and why using only zero-telemetry-compatible evidence.
- Research publication preserves owner review and cannot drift silently from the approved core export.

## Phase 6: Product Evolution Surfaces

**Core dependencies:** the applicable released plans across Pillars A-D and F.

### Deliverables

- Add focused pages for shipped workflows, goal loops, memory, knowledge, automation, skills, apps, learning, sessions, and ambient surfaces.
- Build interactive architecture and trust-boundary diagrams whose labels link to canonical documentation.
- Publish model, provider, feature, and deployment compatibility matrices generated from release-owned data.
- Produce concise workflow demonstrations and Remotion sequences from deterministic seeded states.
- Add launch surfaces for the PWA companion, desktop capabilities, remote access, channels, and new distribution formats only after their owning core milestones pass release gates.
- Refresh product imagery, demos, and explanatory copy whenever design-system or capability changes make existing assets materially inaccurate.
- Distinguish `shipped`, `preview`, and `planned` product surfaces consistently; planned work never receives an install CTA.

### Exit Criteria

- A technical evaluator can understand the released architecture, trust boundaries, compatibility, and deployment options without reading source first.
- Every product claim links to canonical documentation, a tagged release, a real capture, or a reproducible demonstration.
- No future platform or capability is presented with the visual weight or calls to action of a shipped feature.

## Phase 7: Operational Maturity

**Core dependencies:** ongoing release engineering, OSS operations, lifecycle doctrine, and support policy.

### Deliverables

- Assign owners and freshness expectations to product, docs, security, ecosystem, comparison, and release content.
- Automate dependency, link, metadata, schema, provenance, security-header, and no-tracker checks.
- Expand browser and device coverage with real-device spot checks for release-critical journeys.
- Maintain an accessibility test matrix and recurring manual audit cadence.
- Prepare routing and content schemas for internationalization before translation begins.
- Document deployment rollback, incident response, source-pin recovery, and stale-content containment.
- Maintain a domain runbook covering Vercel project ownership, Cloudflare DNS records, certificate renewal, canonical-host assertions, redirect behavior, and emergency fallback to `personalclaw.vercel.app`.
- Add privacy-preserving synthetic monitoring for availability and public performance budgets.
- Review design, content, accessibility, source contracts, and support matrices at each release boundary.

### Exit Criteria

- Every public surface has an owner, source, review trigger, and freshness guarantee.
- Stale or incompatible source content fails closed rather than publishing plausible but incorrect claims.
- Releases can be detected, diagnosed, and rolled back using documented procedures.
- The site remains useful and observable without tracking visitors or product adoption.

## Cross-Cutting Quality Contract

The following checks apply from the phase in which their prerequisite becomes available:

- Build, type, schema, and content-source validation.
- Axe automation plus keyboard-only and screen-reader spot checks.
- Visual regression across supported desktop and mobile viewports.
- Lighthouse budgets for LCP, CLS, INP, JavaScript, fonts, and image weight.
- Link, anchor, canonical, structured-data, sitemap, and robots validation.
- Canonical-host, preview `noindex`, TLS, and path-preserving redirect assertions for all public hostnames.
- Documentation drift and generated-navigation validation.
- Tracker/network-request assertions and privacy-header checks.
- Source provenance and release-status validation; tagged mode activates only when real tags exist.
- Screenshot and video freshness checks tied to relevant product UI revisions.
- Clean-machine smoke tests for every published installation path.

## Recommended Next Milestone

Complete one release-truth vertical slice spanning the core, apps, and website repositories:

1. **Complete:** Add the website CI quality floor, including accessibility, keyboard, visual, performance, link, and no-tracker gates.
2. **Complete:** Define the source manifest and generate version, capabilities, release notes, app count, and provenance from exact commits. It remains explicitly pre-release until real tags are available.
3. **Next:** Implement Starlight `/docs` with build-time core-doc synchronization, generated navigation, drift checks, `llms.txt`, and `llms-full.txt`.
4. Synchronize the security overview, threat model, limitations, and explicit control statuses.
5. Generate first-party app pages from pinned manifests.
6. Automate the seeded launch screenshots and silent product capture.
7. Prepare `/install`, but keep the one-line installer non-canonical until core plan 34's clean-machine distribution gates pass.
8. **Partially complete:** Vercel Git integration and the canonical `personalclaw.dev` launch are live. Add the path-preserving `personalclaw.keyurgolani.name` redirect.

This milestone establishes the website as a trustworthy projection of released PersonalClaw state before expanding discoverability, community registry features, or future-product surfaces.
