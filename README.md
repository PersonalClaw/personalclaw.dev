<p align="center">
  <img src="./public/brand/personalclaw-mark.svg" width="88" height="88" alt="PersonalClaw mark">
</p>

<h1 align="center">personalclaw.dev</h1>

<p align="center">
  <strong>The public product, documentation, security, installation, and ecosystem surface for PersonalClaw.</strong>
</p>

<p align="center">
  <a href="https://github.com/PersonalClaw/personalclaw.dev/actions/workflows/ci.yml">
    <img src="https://github.com/PersonalClaw/personalclaw.dev/actions/workflows/ci.yml/badge.svg" alt="Website CI status">
  </a>
</p>

<p align="center">
  <a href="https://personalclaw.dev">Website</a>
  ·
  <a href="https://github.com/PersonalClaw/PersonalClaw">Core</a>
  ·
  <a href="https://github.com/PersonalClaw/PersonalClawApps">First-party apps</a>
  ·
  <a href="./docs/roadmap/roadmap.md">Roadmap</a>
</p>

![PersonalClaw website preview](./public/brand/social-preview.png)

## What This Repository Is

This repository contains the source for [personalclaw.dev](https://personalclaw.dev), the public release interface for PersonalClaw.

It has a broader job than a conventional marketing site:

- Show the real product through real, reproducible captures.
- Explain how chat, goal loops, memory, knowledge, automation, and apps fit together.
- Make the ownership, trust, and permission boundaries understandable.
- Publish documentation and installation paths tied to verifiable releases.
- Represent the first-party app ecosystem without duplicating its source of truth.
- Help operators and builders evaluate the project without tracking them.

The website should be persuasive because it is specific and checkable, not because it hides the product's maturity or tradeoffs.

> [!IMPORTANT]
> The source manifest is on the `released` channel: it pins the exact core and apps commits of a **tagged** release, and the site identifies itself as a verified release of that version. The website's own `package.json` version tracks the core release it publishes, and that agreement is enforced mechanically — see [Release parity](#release-parity) and [docs/release-runbook.md](./docs/release-runbook.md). Canonical `/docs` and the production `/install` contract remain roadmap work.

## Experience Map

| Route | Purpose |
|---|---|
| `/` | Product thesis, system overview, ecosystem proof, security posture, and source quickstart |
| `/product` | Guided tour of chat, autonomous goals, memory, knowledge, automation, and agent runtimes |
| `/apps` | Searchable first-party app directory and app-platform explanation |
| `/security` | Trust boundaries, enforced controls, supply-chain lifecycle, and known limitations |
| `/release` | Build channel, exact source commits, package/changelog facts, and manifest-derived ecosystem evidence |
| `/blog` | Posts written here, each naming the release its claims were verified against |
| `/compare` | Row-by-row account of what PersonalClaw does and does not do at the released version, each row sourced to a file at the tag |

The next major public surfaces are synchronized documentation, release provenance, stable installation, changelog, and app detail routes. Their sequencing and acceptance gates are defined in the [website evolution roadmap](./docs/roadmap/roadmap.md).

## Product Principles

### Show the product

Product captures carry the argument. The site does not use fabricated dashboards, generic AI illustrations, or abstract decoration where an actual interface can explain the capability.

### Publish release truth

Production copy must describe tagged, reproducibly released behavior. Product capabilities, version numbers, security controls, platform support, app metadata, and install methods should be generated or synchronized from their owning repositories.

### Name the boundary

Security language distinguishes enforced controls, work in progress, and documented limitations. Planned hardening is never presented as an existing guarantee.

### Respect the visitor

Zero telemetry is part of the product position. The site has no visitor analytics, session replay, fingerprinting, conversion events, or tracking pixels. Astro's own telemetry is disabled in every repository script.

### Design for inspection

The interface targets WCAG 2.2 AA, keyboard access, 44px touch targets, reduced-motion support, stable responsive media, and readable technical content.

## Technical Architecture

The site is a static Astro application with small React islands only where client-side state is useful.

- **Astro 7** for routing, static rendering, metadata, and responsive image generation.
- **React 19** for the interactive system window, app search, and command copying.
- **TypeScript** across application and component code.
- **Lucide** for interface iconography.
- **Local variable fonts** through Fontsource; no runtime font dependency.
- **Plain CSS and design tokens** for the visual system; no utility framework or component runtime.
- **Playwright Test and Axe** for responsive behavior, accessibility, privacy, keyboard, and visual regression.
- **Lighthouse** for mobile-simulated performance, accessibility, best-practice, SEO, and transfer budgets.

```mermaid
flowchart LR
    Core["PersonalClaw release<br>docs · security · capabilities"]
    Apps["PersonalClawApps release<br>manifests · permissions · versions"]
    Pins["Pinned source manifest<br>tag · SHA · schema version"]
    Build["Astro build<br>validate · synchronize · generate"]
    Site["personalclaw.dev<br>static release surface"]

    Core --> Pins
    Apps --> Pins
    Pins --> Build
    Build --> Site
```

This source flow is active. `sources/personalclaw.sources.json` pins full commits, `scripts/sync-sources.mjs` validates and reads only those revisions, and the ignored `.generated/release-facts.json` artifact feeds the site build. The app directory's descriptions remain curated in `src/data/apps.ts`, but its names and categories are checked against every pinned app manifest so drift fails the build.

## Design Direction

The creative north star is **The Friendly Machine, Seen at Work**.

PersonalClaw is presented as a capable machine working beside one owner in a quiet night studio. Near-black surfaces establish the environment; coral marks action, focus, and active intelligence. The visual system stays warm without becoming ornamental and technical without falling into terminal cosplay.

The complete rationale, token system, interaction rules, responsive behavior, and content voice live in:

- [PRODUCT.md](./PRODUCT.md) for audience, positioning, proof, and product language.
- [DESIGN.md](./DESIGN.md) for visual direction, layout, typography, motion, and component rules.

When implementation and those documents disagree, treat the disagreement as a design decision to resolve, not permission for silent drift.

## Getting Started

### Prerequisites

- Node.js `22.12.0` (the exact CI runtime in `.node-version`)
- npm
- [mise](https://mise.jdx.dev/) recommended for automatic runtime selection

### Local Development

```bash
git clone https://github.com/PersonalClaw/personalclaw.dev.git
cd personalclaw.dev
npm ci
npm run hooks:install
npm run dev
```

Astro serves the site at [http://localhost:4321](http://localhost:4321) by default.

Source synchronization first looks for exact matching sibling checkouts at `../PersonalClaw` and `../PersonalClawApps`. If either checkout is absent, points at another origin, or has a different HEAD, the synchronizer verifies the pinned commit with GitHub and fetches only the required files. `PERSONALCLAW_CORE_DIR` and `PERSONALCLAW_APPS_DIR` can provide explicit checkout paths; explicit mismatches fail instead of falling back.

### Production Build

```bash
npm run build
npm run preview
```

The build runs Astro diagnostics before producing the static site in `dist/`.

## Commands

| Command | What it does |
|---|---|
| `npm run sync:sources` | Validates source pins and generates ignored release facts from exact revisions |
| `npm run sync:registry` | Reads the community app registry, and one README per listing, from the pinned core commit |
| `npm run dev` | Starts the local Astro development server |
| `npm run check` | Runs Astro and TypeScript diagnostics |
| `npm run build` | Runs diagnostics and creates the production static build |
| `npm run preview` | Serves the production build locally |
| `npm run validate:release-parity` | Checks the website version against the pinned + newest published core release (see [Release parity](#release-parity)) |
| `npm run validate:registry` | Rebuilds `/registry` against fixture registries that carry listings and asserts what it renders |
| `npm run validate:blog` | Asserts `/blog` renders one listing item per readable post, and that each post is published, contracted, and not an empty body |
| `npm run validate:compare` | Refuses a `/compare` matrix that renders no rows, drifts from its data, sources a row to a branch instead of the pinned release, or stops carrying the rows that do not hold |
| `npm run test:static` | Validates production and preview publication artifacts |
| `npm run test:browser` | Builds and runs the complete Playwright suite |
| `npm run test:lighthouse` | Builds and enforces Lighthouse budgets on every route |
| `npm run test:ci` | Runs the same aggregate quality floor used by CI |
| `npm run test:prepush` | Installs the lockfile and runs the aggregate gate under the exact CI Node runtime |
| `npm run test:visual:update` | Deliberately refreshes committed visual baselines |
| `npm run hooks:install` | Enables the repository-owned pre-push hook |

All scripts set `ASTRO_TELEMETRY_DISABLED=1`.

## Quality Floor

The route contract in `tests/support/site-contract.mjs` is shared by static, browser, and performance gates. A new generated page fails validation until it is added to that contract and receives the same coverage as every existing route.

Three tiers are contracted differently, and the contract says why in place: the generated
`/docs` corpus (core owns its words), the community **registry** tier, and the **blog**
tier. `/registry` is
held to the metadata, runtime, accessibility and Lighthouse contracts like every other
route, but carries **no pixel baseline** — it renders a registry owned by another
repository, so a committed screenshot would be invalidated by a registry pull request
rather than by a change here. What replaces the baseline is `npm run validate:registry`,
which rebuilds the page against fixture registries that carry listings. That check exists
because the production registry is empty — a listing surface built against it renders
nothing, looks clean, and passes every other gate vacuously.

`/blog` carries no pixel baseline either, for a different reason: a post's page height is a
function of prose length and the listing's height is a function of post count, so a
committed screenshot there would be refreshed by publishing writing rather than by changing
a design — on two platforms, one of which only CI can regenerate. Its design is pixel-locked
where it lives, in the shared shell and card treatment the five marketing routes already
baseline. Everything else applies, and `npm run validate:blog` replaces the screenshot with
the assertion a screenshot would have made: a collection with readable posts must not
render an empty listing.

The required checks are:

- **Static publication contract:** Astro and TypeScript diagnostics, exact route inventory, internal links and fragments, local runtime assets, canonical URLs, descriptions, Open Graph and Twitter metadata, JSON-LD, sitemap, robots policy, explicit image dimensions, tracker signatures, preview `noindex`, and Vercel output/security-header configuration.
- **Browser contract:** every route under desktop, mobile, and reduced-motion projects; Axe WCAG A/AA scans; keyboard-only critical journeys; app query/category URL state; tab behavior; command copy; focus-safe mobile navigation; image loading; horizontal overflow; 44px targets; console/page/request failures; and a same-origin-only network assertion through meaningful interaction states.
- **Visual contract:** committed full-page desktop and mobile baselines for every route plus loop, app-filter, and mobile-menu states.
- **Performance contract:** Lighthouse scores of at least 90 performance and 95 accessibility/best-practices/SEO, with LCP at most 2.5s, CLS at most 0.1, TBT at most 200ms, and explicit page, script, font, and image transfer budgets.

Install the repository's Chromium build once, then run all gates:

```bash
npx playwright install chromium
npm run hooks:install
npm run test:prepush
```

Playwright HTML reports, traces, videos, screenshots from failed tests, and Lighthouse reports are generated locally but ignored. The reviewed visual baselines under `tests/browser/__screenshots__/` are source-controlled.

GitHub Actions exposes three stable jobs that can be required by branch protection: `static-contract`, `browser`, and `performance`. Dependabot checks npm and action updates weekly.

The pre-push hook is a local mirror of those three jobs and is mandatory for this
repository. It starts from `npm ci`, so tests always use the committed lockfile. Do
not use `--no-verify` to bypass it. If a gate is red or cannot run, stop and fix the
gate or its environment before publishing commits. Visual baselines are
platform-qualified for macOS development and Linux CI; update them only after
inspecting the rendered result on the platform that produced it.

## Repository Structure

```text
.
├── .github/             CI workflow and dependency update policy
├── docs/roadmap/        Website evolution and core-plan alignment
├── public/brand/        Public brand mark and social preview
├── scripts/             Artifact and Lighthouse quality gates
├── sources/             Committed source manifest and JSON Schema
├── src/assets/          Product captures optimized by Astro
├── src/components/      Astro components and focused React islands
├── src/data/            Transitional site and app content
├── src/layouts/         Shared document shell and metadata
├── src/pages/           Route entry points
├── src/styles/          Global styles and design tokens
├── tests/browser/       User, accessibility, privacy, and visual coverage
├── tests/fixtures/      Registry inputs the render check rebuilds against
├── tests/support/       Shared public route contract
├── DESIGN.md            Visual and interaction specification
└── PRODUCT.md           Audience, positioning, and product brief
```

## Content And Release Truth

PersonalClaw spans three repositories, with deliberately separate ownership:

| Content | Owning source |
|---|---|
| Product capabilities, version, docs, security posture, and changelog | [PersonalClaw](https://github.com/PersonalClaw/PersonalClaw) |
| First-party app manifests, permissions, requirements, and compatibility | [PersonalClawApps](https://github.com/PersonalClaw/PersonalClawApps) |
| Community app listings, their declared permissions, and their scan verdicts | [PersonalClaw](https://github.com/PersonalClaw/PersonalClaw) `scratch/registry/` |
| Presentation, public routing, synchronized docs build, and `/install` endpoint | This repository |

Every build pins full source SHAs. The manifest supports two fail-closed channels:

- `pre-release` requires both tags to be `null` and renders a pinned development snapshot.
- `released` requires tags for both repositories, verifies that each tag resolves to its declared SHA, and requires the core tag to match the package version.

The manifest is currently on `released`. Generated files and fetched source caches are ignored; copied source content is never committed to this repository.

That rule has a visible consequence today. The community registry landed in core **after** the pinned release, so there is no registry file to read at the pinned commit and `/registry` says so rather than reading core's default branch — which would publish unreleased core state as released state. The listing surface starts showing listings when the pin moves to a release that contains the registry; nothing about the page changes then.

### Claims about our own capabilities

`/compare` is the site's densest concentration of capability claims, so it runs on a
stricter rule than prose elsewhere. It states what PersonalClaw does **and does not** do,
and it is held to the release, not to the branch.

- **Every row cites a file at the pinned release tag, with the ISO date it was read.**
  `npm run validate:compare` fails if a row's link does not point into that tag — a row
  sourced to a branch can be true in development and false in the release a reader can
  actually install. That is not hypothetical: the launch post had to cut ten claim families
  for exactly this reason, one of them a field declared on a policy object with zero
  consumers, which would have shipped an inert control as a security feature.
- **`partial` is a first-class verdict.** Most overclaims are not inventions; they are true
  readings stated wider than the release supports. A two-state matrix forces each of those
  into a `yes` that overstates or a `no` that undersells, and the overstatement is the one
  that gets picked. A `partial` row must write out the narrower truth.
- **The rows that do not hold are the point.** The check fails if the matrix stops carrying
  `no` rows or stops carrying `partial` rows. A page where everything passes renders
  perfectly and is a brochure, so its honesty is a gate rather than an intention.
- **A declared knob is not a capability.** A field with no consumer at the tag is reported
  as not shipped, and named as declared-and-inert so a reader who greps and finds it is not
  misled.
- **No claims about other projects.** Comparing peers responsibly means auditing somebody
  else's software to this same standard, and that is deliberately out of scope while this
  project is still finding overstatements in its own drafts. An accurate account of our own
  scope serves a reader better than our characterisation of anyone else's.
- **Corrections outrank the page.** A row that cannot be re-sourced gets removed rather than
  defended.

### <a name="release-parity"></a>Release parity

Because the site publishes a released version, its own release identity must match core's: **`package.json` version == the pinned core tag == core's `pyproject.toml` version.** `npm run validate:release-parity` enforces that, plus two things a schema can't:

- **Truthful pins** — each tag must dereference to the pinned commit (these repositories use annotated tags, so a tag object's SHA is not the commit).
- **Freshness** — if core has published a newer release tag than the manifest pins, the check FAILS. A published core release is an obligation on this repository, not an optional follow-up.

It runs inside `test:static` (so `test:ci` and the pre-push hook include it) and as a dedicated strict CI job; a daily **Release follow** workflow re-checks freshness between pushes and files a tracking issue when the site falls behind. Strict runs treat an unreachable GitHub API as a failure rather than a skip. The step-by-step release sequence is [docs/release-runbook.md](./docs/release-runbook.md).

Before changing public product copy:

1. Verify the behavior in its owning repository.
2. Determine whether it is shipped, preview, planned, or a documented limitation.
3. Link the claim to canonical documentation or reproducible evidence.
4. Refresh affected captures when the product UI has materially changed.
5. Run the complete quality floor from a visitor's perspective.

Do not commit copied core documentation as an independent source. The planned docs pipeline synchronizes a pinned core checkout into an ignored build workspace.

## Working On The Site

Keep changes narrow and evidence-led:

1. Create a focused branch.
2. Preserve the existing Astro/React boundary; add client JavaScript only for real interaction.
3. Use existing tokens, typography, and layout patterns before introducing new primitives.
4. Import product images through Astro so responsive formats and dimensions remain stable.
5. Validate keyboard behavior, reduced motion, narrow screens, and long text.
6. Run `npm run test:prepush`.
7. Refresh visual baselines only after inspecting and accepting an intentional visual change.

Generated output, dependency directories, and diagnostic reports are intentionally ignored. Reviewed visual baselines are committed.

## Roadmap

The [website evolution roadmap](./docs/roadmap/roadmap.md) coordinates this repository with the PersonalClaw core program. Its immediate direction is:

1. Synchronize canonical docs and machine-readable exports from the pinned core revision.
2. Synchronize security status and limitations.
3. Generate first-party app pages from manifests.
4. Automate launch captures.
5. Publish the one-line installer only after clean-machine distribution gates pass.

The governing rule is simple: **personalclaw.dev should be the clearest projection of released PersonalClaw state, never a competing version of it.**
