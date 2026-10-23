# Site redesign brief

The rules the v0.3.0 site redesign ([#84]) is checked against: where each source of truth lives,
which design skill applies when, the hard rules, the contracts every route keeps, and what "done"
means for a redesign PR. Every child of #84 names the section of this brief it implements.

The skills named here are pinned in [`.agents/skills/README.md`](.agents/skills/README.md). None is
vendored: each one is installed per machine at its pinned commit, the way core holds its own review
skills ([core `web/REDESIGN.md` §2][core-redesign-skills]).

## 1. Sources of truth

- [`PRODUCT.md`](PRODUCT.md) and [`DESIGN.md`](DESIGN.md) win every conflict, including one with
  this brief. `scripts/validate-design-tokens.mjs` reads DESIGN.md's front matter (the
  `typography.<role>.fontSize` roles and the colours), so that format stays.
- The direction is chosen ([#87]): coral, warm editorial surfaces and the real System Window, which
  crosses the coral-to-dark boundary inside the first viewport. DESIGN.md is seeded with its
  tokens, then regenerated from the built result with Impeccable `document`.
- [`marketing/screenshots.manifest.json`](marketing/screenshots.manifest.json) owns every capture and
  every video composition ([#94]). [`marketing/README.md`](marketing/README.md) is the per-release
  capture procedure.
- `releaseFacts` owns every number and version. `src/data/release.ts` exports it from
  `.generated/release-facts.json`, which `npm run sync:sources` writes from the pinned sources. No
  count or version is typed into copy.
- The app's [`web/DESIGN.md`][core-design] owns the coral rules, and
  [`docs/design/agent-orb.md`][core-orb] owns the agent orb ([PersonalClaw/PersonalClaw#3807][core-3807]).
  Its One Voice Rule gives coral four meanings: selection, focus, primary action and live activity.
  The site never shows a look the app no longer has.
- Links into core and apps use the tag or commit the site pins (`sources/personalclaw.sources.json`),
  never a branch. That is the rule `npm run validate:source-pins` holds for `src/`, applied here too.

## 2. Skills, one moment each

Their rules overlap and sometimes disagree, so none is loaded for everything.

- **Audit** ([#86]): `redesign-existing-projects`, the redesign skill that ships beside
  design-taste-frontend.
- **Direction** ([#87]): frontend-design plans the chosen direction's first viewport against this
  brief, and Impeccable `craft` builds it. No comps are made, since the owner chose the coral
  direction in #87's approved update.
- **Build:** Impeccable, `craft` then `polish`. ui-taste's layout playbooks are left out: it ships
  from a website, with no commit to pin.
- **Gates**, on every redesign PR:
  - design-taste-frontend's pre-flight check and its AI tells, with its dials set to
    `DESIGN_VARIANCE: 6`, `MOTION_INTENSITY: 4` and `VISUAL_DENSITY: 4`;
  - Impeccable `critique`, `audit` and `polish`;
  - ui-ux-pro-max's priority-ranked rules, accessibility first (1 to 10 at the pin, the tenth being
    charts). It is a rulebook only. Its database of popular styles pulls toward the median, so it
    never chooses the look;
  - web-design-guidelines on every changed file, with its rules read at their own pin;
  - `review-animations`, with `emil-design-eng`, on every motion change;
  - webapp-testing to drive Playwright against a changed page.
- **Copy and search** ([#98]): `copywriting`, `cro`, `seo-audit`, `ai-seo` and `schema` from
  marketingskills, and nothing else from it. Its v2.0 renamed `page-cro` to `cro` (merged with
  `form-cro`) and `schema-markup` to `schema`.
- **Video** ([#94] to [#97]): `hyperframes` (the entry point, which holds the composition
  contract, the animation and the keyframes since v0.8.186), `hyperframes-cli` and
  `hyperframes-registry`, and `media-use`; brag for the release clip ([#97]).

**Not used**

- marketingskills' `analytics`, `conversion-tracking`, `ab-testing` and `popups` (before its v2.0,
  `analytics-tracking`, `ab-test-setup` and `popup-cro`). They contradict the no-tracking promise.
- marketingskills' `competitors` (before v2.0, `competitor-alternatives`). Its one use would be rows
  about other projects, and `/compare` carries none ([#93]).
- ui-taste and its paid MCP.
- Any hosted service: brag's, and the HeyGen account features `media-use` offers (catalog search,
  voices, avatars).
- Any React-only video stack. There is one video stack, Hyperframes, and its licence stays
  Apache-2.0.

## 3. Precedence

PRODUCT.md, then DESIGN.md, then this brief, then frontend-design, then design-taste-frontend, then
ui-ux-pro-max and web-design-guidelines. Every other skill gives way to PRODUCT.md, DESIGN.md and
this brief.

Some skill defaults contradict PRODUCT.md, and PRODUCT.md wins. At its pin, design-taste-frontend
discourages `lucide-react`, which the site uses, reaches for an image generator or placeholder photos
before real ones, and assumes Next.js and Tailwind, where this site is Astro with React islands and
shows real captures only. `cro` proposes A/B tests and popups, and the site runs neither.

## 4. Hard rules

- Real captures only: no fake UI, stock photos or generated imagery.
- Text on the coral field uses dark ink. `#3f1008` on `#ff6b5b` measures 5.8:1; white on coral is
  2.8:1 and fails.
- None of these: glow, purple or blue gradients, gradient text, all-caps eyebrows, numbered section
  labels, arrows glued to links, three equal cards, stat tiles, arrow chains, or a version label in
  the hero. The version-label ban covers the marketing heroes only (`/`, `/product` and `/apps`):
  the proof pages (`/compare`, `/release` and `/security`'s limits) name the checked release in their
  lede, because naming it is the claim.
- One signature element, the System Window. Everything around it stays quiet.
- No analytics, cookies or third-party scripts. Measure with public aggregates only.
- Every video has a real, release-pinned poster, captions for narrative, muted loops that pause
  offscreen and while the page is hidden, and a size budget. Reduced motion and data saver always
  keep the poster.
- Pre-1.0 candor sits near install, never in the hero.

## 5. Cross-route contracts

Each is built by the item named, and every page after it keeps it.

1. **Home in five chapters:** proof and install; delegation and control; the ownership boundary;
   apps and security; current maturity ([#88]).
2. **Proof in the first viewport:** the proposition, a real System Window and the safe install path
   appear together, with the System Window crossing the coral-to-dark boundary. No full-screen
   brand preamble delays the product proof ([#87], [#88]).
3. **Safe installation:** the default command downloads the installer without piping it into a
   shell. The next step shows its checksum, signature, platform and exact script contents before
   anything runs ([#88]).
4. **One verification ledger** across Compare, Release, Blog and Registry. Each row carries the
   claim, its current wording, its source type and evidence, the exact core and apps revision where
   relevant, and the last verified release. A claim without current evidence is removed or labelled
   a known limit. Structured data and assistant descriptions never say more than the ledger
   ([#93], [#98], and [#112] for the app sheet).
5. **URL state:** the System Window view, the proof view, the tour chapter, the apps search and
   category, and the app sheet's selected evidence survive reload, back, forward and a copied link,
   with an accessible active state ([#89], [#90], [#91], [#112]).
6. **Poster-first media:** every video shows a real, release-pinned poster first. No video byte
   loads before an explicit play, or an idle hint the entry's load policy allows when reduced
   motion and data saver are both off. Media pauses offscreen and while the page is hidden, and
   every route keeps a no-media fallback ([#94], [#95], [#96], [#97]).
7. **Adaptive layout matrix:** every route at 320, 390, 412, 768, 1024 and 1440 px and at 200% text
   zoom, operated keyboard-only, with reduced motion, forced colors and a screen reader. Its shape
   is one table per route: a row for each width and one for 200% zoom, each with its layout notes,
   then the keyboard, reduced-motion, forced-colors and screen-reader results. The PR that builds or
   changes a route attaches its table ([#88] to [#93], [#112]), and gates C and D check it.
8. **Docs usability:** search, in-page navigation, code readability, focus order, mobile tables and
   visible version context ([#89]).

## 6. Working rules

- One page per PR. Each PR names the section of this brief it implements.
- Never type a number or a version into copy.
- PRODUCT.md moves first: where the redesign changes it, the same PR edits it.
- Stop at each gate for the maintainer's review. The gates are #84's: A the audit ([#86]), B the
  direction ([#87]), C Home and chrome ([#88], [#89]), D the other pages ([#90] to [#93], [#112]),
  E video ([#94] to [#96]), F launch ([#97], [#98]).
- Ask the maintainer before removing any route.
- Skills run at their pins with `DO_NOT_TRACK=1`, and a skill never updates itself or installs
  another skill ([`.agents/skills/README.md`](.agents/skills/README.md) says how).
- Impeccable's detector keeps its ignores in `.impeccable/config.json`, never inline in source, and
  once it is set up here its hook scans every UI edit.

## 7. Definition of done

- `npm run test:ci` passes: the unit tests, the static gates (visual baselines, marketing manifest,
  design tokens, source pins, release parity, the registry render), the build and its checks, the
  preview build, the browser suite and Lighthouse.
- `npm run test:prepush` runs before every push, and the site's CI passes on the PR.
- Visual baselines change only on purpose. They are made and compared only inside the pinned
  Playwright image: refresh them with the **Refresh visual baselines** workflow, inspect the diffs,
  and commit them with the environment manifest ([Visual baselines](README.md#visual-baselines),
  and step 7 of `marketing/README.md`).
- The Impeccable critique and the design-taste-frontend pre-flight report are attached to the PR.
- The route's layout matrix table (section 5) and the design review checklist are attached. The
  checklist covers:
  - rendered contrast wherever text sits on a gradient or the coral-to-dark boundary;
  - 44 px compact targets;
  - 200% text zoom;
  - forced colors;
  - reduced motion;
  - keyboard-only operation and focus order;
  - the accessibility-tree output.
- Screenshots at 320, 390, 412, 768, 1024 and 1440 px, plus 200% text zoom and reduced motion.

## Decided on 2026-10-20

These were the open questions; each now has the maintainer's default.

- **Network use while a skill runs.** Public, keyless reads only: open media collections, registry
  blocks, CDN libraries in a composition, and a PR's public data and contributor avatars. No skill
  is given a key for a hosted model or voice service, so the captioning, voice and image paths that
  need one stay off. The pin table records what each one reaches.
- **brag's bundled music and sound effects.** Not used. The release clip ([#97]) uses no bundled
  audio until its licence terms are checked and recorded; `media-use`'s sound effects are under the
  Pixabay Content License, by its `CREDITS.md`, and follow the same rule until the PR that first
  uses one records it.
- **design-taste-frontend v2.** The pin stays on the last v1 commit, the version the gate in section
  2 is written for. Moving to v2 means rewriting that gate, in its own PR.
- **Global install.** `-g`, following core. The maintainer installs the skills on their own machine;
  an agent working in this repository never installs one.

**Settled here**

- Nothing is vendored, following core. Skills install per machine at their pins, so this repository
  holds no third-party skill code. Vendoring one later is a supply-chain change and gets a security
  review.
- The pins and reviews are recorded in [`.agents/skills/README.md`](.agents/skills/README.md). With
  `-g`, the installer's own lock sits in the user's home, not here.
- The `skills` installer reports installs, and Impeccable, the Hyperframes CLI and `media-use` report
  usage. `DO_NOT_TRACK=1` turns all of them off.
- ui-taste is left out.
- The layout matrix is a table per route (section 5).

[#84]: https://github.com/PersonalClaw/personalclaw.dev/issues/84
[#86]: https://github.com/PersonalClaw/personalclaw.dev/issues/86
[#87]: https://github.com/PersonalClaw/personalclaw.dev/issues/87
[#88]: https://github.com/PersonalClaw/personalclaw.dev/issues/88
[#89]: https://github.com/PersonalClaw/personalclaw.dev/issues/89
[#90]: https://github.com/PersonalClaw/personalclaw.dev/issues/90
[#91]: https://github.com/PersonalClaw/personalclaw.dev/issues/91
[#93]: https://github.com/PersonalClaw/personalclaw.dev/issues/93
[#94]: https://github.com/PersonalClaw/personalclaw.dev/issues/94
[#95]: https://github.com/PersonalClaw/personalclaw.dev/issues/95
[#96]: https://github.com/PersonalClaw/personalclaw.dev/issues/96
[#97]: https://github.com/PersonalClaw/personalclaw.dev/issues/97
[#98]: https://github.com/PersonalClaw/personalclaw.dev/issues/98
[#112]: https://github.com/PersonalClaw/personalclaw.dev/issues/112
[core-3807]: https://github.com/PersonalClaw/PersonalClaw/issues/3807
[core-design]: https://github.com/PersonalClaw/PersonalClaw/blob/v0.2.3/web/DESIGN.md
[core-orb]: https://github.com/PersonalClaw/PersonalClaw/blob/v0.2.3/docs/design/agent-orb.md
[core-redesign-skills]: https://github.com/PersonalClaw/PersonalClaw/blob/v0.2.3/web/REDESIGN.md#2-review-skills-and-on-what
