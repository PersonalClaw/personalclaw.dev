# Site audit

What today's site does against the v0.3.0 redesign brief ([`SITE-REDESIGN.md`](../SITE-REDESIGN.md)),
route by route: what stays, what is replaced, and which child of [#84] fixes each finding. This is
the record [#86] asks for and the first half of Gate A. Each page PR ([#88] to [#93], and [#112])
quotes its route's findings by ID.

Read at website `main` `e543502451e0b53d9c861a8753a4de9765d0ed4f` on 2026-10-20, built against the
pins in `sources/personalclaw.sources.json`: core v0.2.3 (`c705b30264b9`), apps v0.2.2
(`467cda1ae36d`) and the registry at `53c1bcd13757`, which lists no apps.

## How it was read

- **The build.** `npm run build` at that commit: 73 pages, of which 63 are the generated `/docs`
  tier (the landing, five section indexes and 57 synced documents). The registry lists nothing at
  its pin, so one listing page was read from a build against `tests/fixtures/registry-listed.json`,
  the fixture `npm run validate:registry` builds with.
- **The measurements.** The built `dist/` was served locally and driven in Chromium (Playwright
  1.64, the locked version):
  - widths 320, 390 and 412 at 844 px tall, 768 and 1024 at 1000, and 1440 at 900;
  - 200% text zoom as a doubled root font size, at 1440 and at 320;
  - long copy as every visible text node lengthened by 40%, at 390 and 320;
  - keyboard as Tab from the top of the page until focus comes back round, with reduced motion so
    focus scrolls finish at once;
  - reduced motion and forced colors through Chromium's emulation;
  - the screen reader as Chromium's accessibility tree. No assistive technology was run;
  - contrast three ways: axe at WCAG 2.2 AA, a computed pass over every text colour against its
    opaque background, and a pixel pass for text that sits over a capture (the text is hidden, the
    box behind it photographed, and the text colour compared with its lightest pixel);
  - URL state by click, reload, back and forward.
- **The skill pass.** `redesign-existing-projects` read at its pin (`github.com/leonxlnx/taste-skill`,
  `skills/redesign-skill/SKILL.md` at `d237dd399d57524945c0c81327da5da19f7a468d`, one file). Its
  method is Scan, Diagnose, Fix. This audit does the first two; fixing is the page PRs' job. Where
  its defaults contradict PRODUCT.md, PRODUCT.md wins (brief section 3), and those items are listed as
  set aside in [the skill's checklist](#the-redesign-skills-checklist-site-wide).
- **Not done here.** Impeccable `critique`, the second pass #86's design names. It runs from npm and
  this audit installs nothing; every page PR runs it at its gate anyway (brief section 2). No
  screenshots are attached: every layout fact below comes from the measured page.

**Severity**

- **High:** the page says more than the pinned release does, shows an install path that runs code
  the reader has not seen, or loses content, a control or legibility (a WCAG 2.2 AA failure).
- **Medium:** a hard rule (brief section 4) is broken, a cross-route contract (section 5) is
  missing, or the site's own floor is missed (PRODUCT.md's 44 px targets, state and focus that
  survive forced colors).
- **Low:** drift from DESIGN.md or the brief that breaks no hard rule.

Each finding names the child issue that fixes it. A selector is in the file named, at `e543502`.

## The findings that matter most

| ID | Finding | Severity | Owner |
|---|---|---|---|
| H1 | Home's only install command pipes the download into `sh`, and shows no checksum, signature or script | High | #88 |
| X1 | From 721 to about 851 px wide, and at 200% text on desktop, the header's primary button runs off the right edge | High | #89 |
| X2 | At 200% text on a 320 px screen, display type and the header overflow the viewport on every marketing route | High | #89 |
| D1 | The docs light theme keeps the dark surfaces, so its darker coral sits on them at 2.9:1 | High | #89 |
| P1, P2 | `/product` says "no product telemetry" and "react to webhooks", both wider than their `/compare` rows | High | #90 |
| S1 | `/security` calls the security log "HMAC-linked" and says alteration is visible; deletions are not caught | High | #92 |
| B1 | The launch post says, in the present tense, that this site publishes v0.1.3 | High | #93 |
| X3 | All-caps eyebrows head nearly every section on every marketing route | Medium | #89 |

## Global chrome and tokens

Every route built on `src/layouts/BaseLayout.astro`: `/`, `/product`, `/apps`, `/security`,
`/release`, `/compare`, `/blog`, `/blog/launch`, `/registry` and each listing page. The `/docs` tier
has its own chrome (see [the docs tier](#the-docs-tier-docs)).

**What stays**

- The skip link, `main#main-content`, and one `banner`, `navigation`, `main` and `contentinfo` per
  page.
- The focus ring (`:focus-visible`, a 2 px `--coral-bright` outline), visible on every Tab stop
  measured, at 1440 and 390, on every route.
- The mobile menu: it opens with the six links and the repository link, closes on Escape and
  returns focus to its button.
- Reduced motion: `@media (prefers-reduced-motion: reduce)` in `src/styles/global.css` stops every
  animation and smooth scrolling.
- The footer's facts (MIT licensed, no usage tracking, the version and its release state).
- Zero third-party and zero failed requests on every route at every width.

**What is replaced**

- The near-black palette in `src/styles/tokens.css` (`--night: #0b0c0d` through `--success`) gives
  way to direction A's tokens ([#87]); the header loses Compare and its glued arrow, and GitHub moves
  to the right ([#89]).

| ID | Today | The brief wants | Severity | Owner |
|---|---|---|---|---|
| X1 | The header switches to its menu only at `max-width: 720px` (`src/styles/global.css`). From 721 to about 851 px wide the header's `.header-github` button ("Get PersonalClaw") ends past the viewport, and `body { overflow-x: hidden }` clips it: at 768 it ends at 852 px and wraps to two lines. At 1440 with 200% text it ends at 1,703 px, so it is off screen on every marketing route. | Every width and 200% text keep every control on screen (section 5.7); labels stay on one line (DESIGN.md) | High | #89 |
| X2 | At 200% text on a 320 px screen the brand name pushes the menu button partly off the right edge, and display type (`--fs-display: clamp(3.5rem, 10vw, 6rem)`) and headings run past it, cut mid-word: 452 elements end outside the viewport on `/apps`, 99 on `/compare`, 34 on `/security`, 31 on `/release`, 21 on `/`. | Reflow at 200% text (section 5.7, PRODUCT.md) | High | #89, then each page's issue |
| X3 | `.kicker` (`src/styles/global.css`) is an uppercase eyebrow with a rule before it, and heads 6 sections on `/`, 13 on `/product`, 5 on `/security` and `/release`, 3 on `/apps`, 2 on `/registry`. Uppercase mono micro-labels repeat it: `.app-category`, `.system-path article > span`, `.zone > span`, `.decision-path span`, `.source-status`, `.source-name > span`, `.entry-heading > span`, `.change-group h4`, `.registry-field-label`, and `/compare`'s own `.kicker`. | No all-caps eyebrows (section 4); PRODUCT.md's anti-references name mono micro-labels | Medium | #89, page issues for page-scoped labels |
| X4 | `ArrowUpRight` is glued to "Get PersonalClaw" in the header and the mobile menu (`src/components/Header.astro`). | No arrows glued to links (section 4) | Medium | #89 |
| X5 | Under forced colors the header's current page looks like every other link: `.desktop-nav a[aria-current="page"]` is marked by a background only. Measured on every marketing route. | An accessible active state (section 5.5), visible without colour | Medium | #89 |
| X6 | `body` draws a coral grid (two `linear-gradient` lines at 2 to 2.5% alpha, 72 px cells) behind every page. It is coral as ambient decoration, and it stops axe from deciding contrast on most text: 93 nodes on `/`, 426 on `/apps`, 236 on `/blog/launch`. | Coral only for selection, focus, primary action and live activity (section 1); the app's backdrop is off by default | Low | #89 |
| X7 | The header holds six links (Compare among them) and a primary button to the repository. `tests/browser/cta.spec.ts` pins the label. | Five links and GitHub on the right; the primary action is the install path ([#84] shared decisions) | Medium | #89, #88 |
| X8 | Every unknown URL gets Starlight's docs 404: "PersonalClaw docs" in the header, a "404" heading and 62 characters of text, with no marketing navigation. | The skill's "custom 404"; one chrome across the site | Medium | #89 |
| X9 | `aria-current` is set only on an exact path, so `/blog/launch`, listing pages and every `/docs` page mark nothing in the header. Blog and Registry are footer-only. | An accessible active state wherever the reader is (section 5.5) | Low | #89 |
| X10 | `BaseLayout.astro` hard-codes `<meta name="theme-color" content="#0b0c0d">`. | The new canvas | Low | #89 |

## `/`

| Job | Strongest proof | Primary action |
|---|---|---|
| One-pass understanding, along the belief ladder | Real captures plus release-derived facts | Install, downloaded for review first, with the checksum, signature and script shown before it runs |

**What stays**

- The System Window (`src/components/SystemWindow.tsx`): real captures from the pinned release, tab
  semantics (`role="tab"`, `aria-selected`, Arrow, Home and End), a first view that renders without
  JavaScript, and the eager, high-priority first image.
- The line "One agentic OS. Your machine. Your rules." and a one-sentence support line.
- Every count from `releaseFacts`, and apps named by slug through `src/data/apps.ts`, so a renamed
  app fails the build.
- The quickstart's facts: the installer's Python from `installerPython()`, the dashboard address,
  and the pointer to the install guide for the other paths.

**What is replaced**

- The hero composition, by the coral field and the System Window crossing into the dark theater
  ([#87], [#88]).
- The 01 to 03 trio, the arrow chain, the stat tiles, the tape and the security band, by the five
  chapters ([#88]). Where their content goes is [below](#where-homes-dropped-sections-go).
- The piped one-liner, by the install panel ([#88]).

**The layout matrix**

| Check | Result |
|---|---|
| 320 px | One column. The header is the menu button. The System Window comes first (76 to 355 px), then the h1 (389), the line, the support sentence and "Get PersonalClaw" (599), all inside the 844 px first viewport. The tab strip and the install command scroll sideways inside their own boxes. The trio, the arrow chain and the tiles stack. 8,144 px tall. |
| 390 px | As 320. System Window 76 to 394, h1 at 427, the action at 636. 7,838 px. |
| 412 px | As 390. 7,865 px. |
| 768 px | Header links show and the header button runs off the edge (X1). System Window 85 to 587; the h1 (415) sits over the capture's lower edge, which the hero gradient darkens. The trio and the ecosystem stay one column; the arrow chain goes to two. 7,885 px. |
| 1024 px | Two-column hero, with the System Window (120 to 821) bleeding past the right edge under the copy. The trio is three equal columns; the story and the ecosystem two; the arrow chain three. 6,198 px. |
| 1440 px | As 1024, with the arrow chain on one row (five cards, four arrows). The System Window (120 to 829), the h1 (246) and the action (575) are inside the 900 px first viewport. The quickstart starts 5,769 px down. 7,210 px. |
| 200% text | At 1440 the header button leaves the screen (X1) and the page grows to 10,901 px. At 320, 21 elements end past the right edge, the h1 is cut, and the hero copy overlaps the System Window (X2). |
| Keyboard | 32 stops at 1440 and 26 at 390, each with a visible ring, none hidden. The skip link is first. The five System Window tabs come before the h1 and the hero actions (H3). |
| Reduced motion | By default the window's entrance and the System Window's infinite activity trace run. With reduce, nothing runs and scrolling is instant. |
| Forced colors | The selected System Window tab looks like the others (H10), and the header's current page mark is lost (X5). Focus rings survive. |
| Screen reader | Banner, primary navigation, main, contentinfo, footer navigation. The tablist and its panel come before the h1. The trio reads "01", "02", "03" as text before each heading. The tiles read as term "69", definition "First-party apps", so the number is announced as the term. |

- **Mobile:** a safe reflow of the desktop composition, with the hero restacked so the System Window
  leads, and the header turned into a menu. Not a new composition.
- **Long copy:** with every text node 40% longer, nothing overflows at 390 or 320.
- **Empty and error states:** without JavaScript the System Window shows its first view and its tabs
  do nothing; the install command still shows and can be selected. A copy that fails has no message:
  `CopyCommand` awaits `navigator.clipboard.writeText` with no `catch`.
- **URL round-trip:** the System Window view is not in the URL. Choose Chat and reload, and Home is
  back (H11). `#system` works.
- **Rendered contrast:** nothing under AA in the computed pass. The lowest pair is `--ink-muted`
  (`#92938f`) on the window chrome at 5.97:1. Over the capture, the h1's lightest background pixel
  measures 10.2:1 at 768 and 8.7:1 at 1024, and the support line's 6.5:1 at 1024. The primary button
  is `--night` on `--coral`, 7.0:1.

**Trust claims**

| Claim | Evidence | Verified release | Status |
|---|---|---|---|
| "MIT licensed" (hero, footer) | `/compare` row `license`; `LICENSE` | v0.2.3, rows checked 2026-10-20 | Holds; the page cites nothing |
| "No usage tracking" (hero, footer) | `/compare` row `telemetry` (partial): no usage reporting of any kind | v0.2.3 | Holds as worded; the unprompted update check goes unsaid on Home |
| "Self-hosted" | None on the page | None recorded | Needs a ledger row (H17) |
| "{total} apps. No permanent provider." and the tiles | `releaseFacts.apps`, from every manifest at apps v0.2.2 | Derived at build | Holds |
| "Core operation remains available without a network connection" | None on the page. The nearest row, `local_models` (yes), says the bundled model downloads once when you click for it | v0.2.3 for the row | Wider than its evidence (H16) |
| The trio: state under one home, loops you can pause, vendors through the app boundary | None on the page; row `provider_agnostic` (partial) | v0.2.3 for the row | Needs ledger rows (H17) |
| The security band: host approval gate, quarantine and scanner gate, scoped app tokens whose code still runs as you | None on the page; rows `tool_approval` and `app_sandbox` (partial) | v0.2.3 for the rows | Holds as worded |
| The quickstart: the installer brings its own Python; uv, pipx and pip install one wheel; Compose runs an image pair | `installerPython()` reads `public/install`; a note in the frontmatter of `src/pages/index.astro` | Python derived at build; the rest not recorded | Partly derived |
| The install command | The served `/install` is core's `deploy/website/install.sh` at `c705b30`, sha256 `f46f3a3b…`, matching core's `deploy/website/install.sh.sha256` and the manifest's `installSha256` | v0.2.3 | A checksum exists and the page shows none; nothing signs the file (H1) |
| "Package version v0.2.3." and the release summary | `releaseFacts.core` | Derived at build | Holds |

**Shots placed:** `dashboard`, `chat`, `loops`, `knowledge` and `apps` in the System Window
(placement `hero-system-window` in `src/data/site.ts`); `loops` and `apps` as section images.

| ID | Today | The brief wants | Severity | Owner |
|---|---|---|---|---|
| H1 | `section.quickstart` copies `INSTALL_COMMAND` (`src/data/site.ts`), `curl -fsSL https://personalclaw.dev/install \| sh`, 5,769 px down at 1440. No checksum, signature, platform or script is shown. Core v0.2.3 has the checksum file; nothing signs the installer, and the release attaches neither the installer nor a checksum file. | A download step that runs nothing, then the checksum, signature, platform and exact script before the run step (section 5.3); say plainly that the file is unsigned until it is signed | High | #88 |
| H2 | The h1, the System Window and an action share the first viewport at 1440 and 390, but the action goes to the repository, there is no coral field, and nothing crosses a coral-to-dark boundary. | The proposition, a real System Window and the safe install path together, the window crossing the boundary (section 5.2) | Medium | #87, #88 |
| H3 | `.hero-window` comes before `.hero-copy` in `src/pages/index.astro`, so the accessibility tree and Tab order meet the five tabs before the h1. At 390 the fourth Tab stop is the Home tab. | The proposition first | Medium | #88 |
| H4 | `.ownership-grid` numbers three cards 01 to 03 (`article > .index`), three equal columns from 1024 up. | No numbered section labels and no three equal cards (section 4) | Medium | #88 |
| H5 | `.system-path`: five cards joined by four `.path-arrow` "→" spans, with uppercase mono labels. | No arrow chains (section 4); chapter 3's drawn ownership boundary | Medium | #88 |
| H6 | `.ecosystem-note dl`: three stat tiles, one of them a typed "1" ("App contract"). | No stat tiles and no typed counts (sections 4 and 6) | Medium | #88 |
| H7 | "Watch the 84-second tour" (`.hero-tour-link`) types the length, and links a tour recorded at v0.1.3 (P3). | No typed number; "Watch the tour" | Medium | #88 |
| H8 | `ArrowRight` glued to "Explore the system", "Tour the product", "Browse all apps" and "Inspect the security model". | No arrows glued to links (section 4) | Medium | #88 |
| H9 | Two hero actions, a filled one and a ghost one ("Explore the system"), plus a third text link to the tour. | One primary action, with "Watch the tour" as the quiet second (#88) | Low | #88 |
| H10 | Under forced colors the selected tab looks like the others: `.system-tabs button[aria-selected="true"]` is a coral background only. | An accessible active state (section 5.5) | Medium | #88, #89 |
| H11 | The System Window's view lives in component state only. | The view survives reload, back, forward and a copied link (section 5.5) | Medium | #89 |
| H12 | The `apps` capture beside the heading shows the Store's own count (64 under "All apps") and its tag categories (Bundled, Model, LLM, Tool and on), while the heading says {total} apps and the site lists its own 14 categories. | One grouping, read from the Store ([#91]'s comment of 2026-10-14) | Low | #88, #91 |
| H13 | `.security-band` lays a coral wash (`linear-gradient`, coral at 10%) over its section, and the System Window's status dot carries a soft halo. | Coral only where it means something (section 1); no glow (section 4) | Low | #88 |
| H14 | The hero's design note, an HTML comment about layout and LCP headroom, ships in the built page. | Notes in the frontmatter, as the page already does for retracted claims | Low | #88 |
| H15 | A hand-picked tape of 12 app names (`featuredSlugs`, `.app-tape`). | Chapter 4's belt by category, each linking `/apps?category=<name>` | Low | #88 |
| H16 | "Core operation remains available without a network connection" cites nothing, and the nearest row says the offline model downloads first. | Every trust claim with its evidence and verified release (section 5.4) | Medium | #88, #93 |
| H17 | The hero chips, the trio and the band state trust facts with no source type or verified release. | Trust rows: claim, evidence type, last verified release (section 5.4) | Medium | #88 |

### Where Home's dropped sections go

#86 asks whether the sections [#88]'s order drops move or go. They move, except where a hard rule
removes them.

1. **The security band** (`section.security-band`). The host approval gate goes to chapter 2, with
   the approval beat. The quarantine and scanner gate goes to chapter 4's "Build on it" lifecycle.
   Scoped app tokens, with "their own code still runs as you", go to chapter 4's two security
   sentences, linking `/security`. The coral wash goes.
2. **The quickstart** (`section.quickstart`). The installer's Python, the dashboard address and the
   pointer to the other install paths go into chapter 1's install panel. "Package version …" and the
   release summary go to chapter 5, beside the three latest releases, never to the hero (section 4).
   The second "Get PersonalClaw" becomes the closing install action on coral. The piped command goes.
3. **The trio.** State under one home goes to chapter 3, visible autonomy to chapter 2, removable
   vendors to chapter 4. The numbers go.
4. **The arrow chain** becomes chapter 3's drawn boundary. **The tape and the tiles** become chapter
   4's category belt; the tiles go.

## `/product`

| Job | Strongest proof | Primary action |
|---|---|---|
| The guided tour | The video plus annotated captures | Install, or open the docs |

**What stays**

- The tour's player: click to play, `preload="none"`, a poster, a captions track, and a 16:9 frame
  that adds no layout shift. Before play the page requests the captions file and no video bytes.
- The frontmatter record of claims narrowed to the release, and the rule it states: a retracted
  claim never ships in the page.
- Real captures for every capability, each with dimensions and alt text.

**What is replaced**

- The hero over `chat.png`, by the tour at the top ([#90]); the tour itself, by the chaptered rebuild
  ([#96]).
- Nine capability sections, by six (P6).

**The layout matrix**

| Check | Result |
|---|---|
| 320 px | One column. The h1 (168), the lede and "Start the tour" (612) sit inside the first viewport over the darkened chat capture. The tour keeps its 16:9 box; the five beats and every feature stack. 14,377 px. |
| 390 px | As 320, with the action at 500. 13,987 px. |
| 412 px | As 390. 14,085 px. |
| 768 px | Header button off the edge (X1). Beats in two columns, Observe, Intervene and Bound in three equal columns, the paired captures in two, the features still one. The hero text crosses bright parts of the capture (P10). 13,400 px. |
| 1024 px | Features in two columns, capture and text alternating; the beats five across. 11,895 px. |
| 1440 px | As 1024. The tour starts 1,504 px down. 13,808 px. |
| 200% text | At 1440 the header button leaves the screen and "Start the tour" leaves the first viewport; 22,076 px. At 320, six elements end past the edge; 37,385 px. |
| Keyboard | 27 stops at 1440, 21 at 390, each with a visible ring. The video takes focus with a 3 px ring. |
| Reduced motion | Nothing animates by default; reduce turns smooth scrolling off. Nothing autoplays. |
| Forced colors | The header's current page mark is lost (X5). |
| Screen reader | One h1 and an h2 per section, 20 headings. Eleven images, each with alt text. The beats are an ordered list named "What the tour shows, in order". |

- **Mobile:** a safe reflow.
- **Long copy:** nothing overflows at 390 or 320.
- **Empty and error states:** if the video fails, the poster is all that remains. There is no line
  saying it could not play and no text outline of the beats.
- **URL round-trip:** `#tour` and `#chat` work. There is no chapter state yet.
- **Rendered contrast:** nothing under AA in the computed pass. `.autonomy-band` is already a coral
  field, with `--night` text at 78% opacity, 5.15:1. Over the capture, the hero text holds at 1440
  (7.3:1 at its lightest pixel) and 390 (17.2:1), and fails at 768 (P10).

**Trust claims**

| Claim | Evidence | Verified release | Status |
|---|---|---|---|
| "no product telemetry" (closing section) | `/compare` row `telemetry` (partial) | v0.2.3 | Wider than the row (P1) |
| "react to webhooks"; "an inbound webhook endpoint" | `/compare` row `webhooks` (partial): the inbound endpoint answers programs on this machine only | v0.2.3 | Wider than the row (P2) |
| "Python 3.12 or 3.13" | `requires-python = ">=3.12,<3.14"` in core's `pyproject.toml` | v0.2.3, read for this audit | Holds, but typed (P4) |
| The kill switch holds scheduled runs, triggers, script hooks, loop cycles and unattended subagent spawns | `guardrails/incident.py`, its module docstring | v0.2.3, read for this audit | Holds; the frontmatter note still says four paths |
| "Token and dollar budgets per day" | `guardrails/budgets.py` (run and day scopes) | v0.2.3, read for this audit | Holds |
| Four ACP agent apps meet the host approval gate for every call they ask about | The four apps exist at apps v0.2.2; the gate is not in any row | Apps v0.2.2; gate not recorded | Needs a ledger row |
| The dashboard Doctor's probes are read-only; the memory layers; artifact previews | Frontmatter notes in `src/pages/product.astro` | Not recorded | Needs ledger rows |
| The tour | `public/media/personalclaw-tour.mp4`, recorded at v0.1.3, as the page says | v0.1.3 | Shows an older release (P3) |

**Shots placed:** `chat`, `knowledge`, `agents`, `memory`, `triggers`, `doctor`, `guardrails`,
`inbox`, `notification-rules` and `artifacts`. The tour video is outside the manifest ([#94]).

| ID | Today | The brief wants | Severity | Owner |
|---|---|---|---|---|
| P1 | The closing paragraph (`.product-cta p`) ends "and no product telemetry". By default PersonalClaw asks GitHub for a newer release at start and every twelve hours. | No claim wider than its row (section 5.4) | High | #90 |
| P2 | The automation section says "react to webhooks" and lists "an inbound webhook endpoint". At v0.2.3 the endpoint refuses any request that is not from this machine. | No claim wider than its row (section 5.4) | High | #90 |
| P3 | The tour is "a single recording of v0.1.3", shown on a site that publishes v0.2.3. The page says so. | The site never shows a look the app no longer has (section 1) | Medium | #96 |
| P4 | Typed numbers and versions: "The 84-second tour", "v0.1.3", "Python 3.12 or 3.13", "across five services". | No typed count or version (section 6); derive the Python line or drop it | Medium | #90 |
| P5 | `ArrowRight` glued to "Start the tour", "Explore agent apps" and the closing "Get PersonalClaw". | No arrows glued to links (section 4) | Medium | #90 |
| P6 | Nine capability sections: chat, goals, memory and knowledge, automation, the inbox and notification rules, artifacts, agents, guardrails, the Doctor. | Six: chat, goal loops, memory, knowledge, automation, agent runtimes ([#90]) | Medium | #90 |
| P7 | `.autonomy-points`: Observe, Intervene and Bound as three equal cards from 768 up. | No three equal cards (section 4) | Medium | #90 |
| P8 | No chapter control and no chapter state. | Chapters in the URL, restored on reload, back and forward (section 5.5) | Medium | #90, #96 |
| P9 | A failed video leaves the poster alone. | The poster, the chapters as a text outline and one line saying the video could not play ([#96], settled) | Medium | #96 |
| P10 | At 768 the hero heading and lede cross bright parts of the capture: their lightest background pixels measure 2.5:1 and 3.3:1 (95% of the pixels behind them measure 9.0:1 or more). | Rendered contrast measured wherever text sits on a gradient (section 7) | Medium | #90 |
| P11 | `.tour-beats` numbers the beats 01 to 05. The tour is a real sequence, so the numbers may stay. | A chapter list that seeks the video ([#96]) | Low | #96 |
| P12 | The tour's design note, an HTML comment about `preload`, ships in the built page. | Notes in the frontmatter | Low | #90 |

## `/apps`

| Job | Strongest proof | Primary action |
|---|---|---|
| The app directory and a build-an-app path | The live catalog from the pinned manifest | Browse, or read the app contract |

**What stays**

- `AppDirectory`: search and category filters, `?q=` and `?category=` written with `replaceState`
  and read on load, a polite live result count, and the empty state with "Reset filters". With
  JavaScript off, all cards render.
- The builders band's snippet, `web-tools/app.json` at apps v0.2.2 byte for byte
  (`src/data/apps-snippet.mjs`, held by `tests/apps-snippet.test.mjs`).
- Every card and guide link built from the pinned apps commit.
- The install band's numbered steps (quarantine, scan, consent, enable): a real sequence.

**What is replaced**

- The hero's four tiles, the chip row and the card links, by derived counts on the controls, a
  select-style control on narrow screens and a sheet per app ([#91], [#112]).

**The layout matrix**

| Check | Result |
|---|---|
| 320 px | One column. The 15 category buttons scroll sideways in `.filter-scroll`; 69 cards stack; "Read the app creation guide" is 23,070 px down. 23,965 px tall. |
| 390 px | As 320. 23,238 px. |
| 412 px | As 320. 23,147 px. |
| 768 px | Header button off the edge (X1). Tiles two by two, cards in two columns, the install steps two by two; the chip row still scrolls. 14,862 px. |
| 1024 px | Two-column intro, tiles four across, cards in three columns, the install steps four across. The chip row still scrolls sideways. 10,342 px. |
| 1440 px | As 1024; the 15 buttons still do not fit and scroll. 10,676 px. |
| 200% text | At 1440 the header button leaves the screen. At 320, 452 elements end past the edge and the h1 is cut mid-word (X2). |
| Keyboard | 109 stops at 1440 and 103 at 390, among them the search, 15 filters and 69 cards. The search field's ring is on its wrapper. |
| Reduced motion | Nothing animates. |
| Forced colors | The pressed category and the search field's focus look like their resting state (A3); the header's current page mark is lost (X5). |
| Screen reader | Each card is one link whose name runs the category, the name, the description and its list's label together. The 69 card titles are h2s, with no heading over the directory. The snippet is a named region. |

- **Mobile:** a safe reflow, with the category row scrolling sideways instead of a select (A2).
- **Long copy:** nothing overflows at 390 or 320.
- **Empty and error states:** "No apps match those filters." and "Reset filters". There is no error
  or unavailable-catalog state. With JavaScript off the cards show, and search and filters do
  nothing, with no note saying so.
- **URL round-trip:** `?q=keyless&category=speech` loads three apps and survives a reload. An unknown
  category falls back to All. A filter change replaces the history entry, so Back leaves the page.
- **Rendered contrast:** nothing under AA; the lowest pair is a card's tags, `--ink-muted` on the
  card, 6.08:1.

**Trust claims**

| Claim | Evidence | Verified release | Status |
|---|---|---|---|
| The tile counts, derived | `releaseFacts.apps` | Derived at build | Holds |
| "1 Permission-aware contract", "0 Required cloud vendors" | Typed; `local` and `keyless` in `src/data/apps.ts` | Not recorded | Typed (A1) |
| Two integrations ship inside core, so the directory does not list them | Both are native apps under `src/personalclaw/apps/native/` | v0.2.3, read for this audit | Holds |
| Dangerous scan findings cannot be overridden | `supply_chain.py`: the dangerous verdict is terminal | v0.2.3, read for this audit | Holds; not in a row |
| The network permission "is a declaration, not a fence" | `/compare` row `app_sandbox` (partial) | v0.2.3 | Holds |
| The snippet is a manifest core accepts | `web-tools/app.json` at apps v0.2.2, checked against core's manifest rules by `sync:sources` | Apps v0.2.2, core v0.2.3 | Holds |
| The cards' Local and Keyless facts | Curated in `src/data/apps.ts` | Not recorded | Needs a source per field ([#112]) |

**Shots placed:** none.

| ID | Today | The brief wants | Severity | Owner |
|---|---|---|---|---|
| A1 | `.app-ledger`: four stat tiles, two of them typed ("1 Permission-aware contract", "0 Required cloud vendors"). | No stat tiles and no typed counts (sections 4 and 6) | Medium | #91 |
| A2 | The category control is a row of 15 buttons that scrolls sideways at every width measured, 320 to 1440. | A native or select-style control on narrow screens ([#91] approved update) | Medium | #91 |
| A3 | Under forced colors the pressed category differs from the rest only by a 10% background, and the search field's focus (a border colour and a box shadow; the input sets `outline: 0`) disappears. | Visible state and focus in forced colors | Medium | #91 |
| A4 | Only the empty state exists. | Empty, error and unavailable-catalog states ([#91] approved update) | Medium | #91 |
| A5 | Cards open the apps repository at the pinned commit. | Each card leads to its install-safety sheet first ([#91], [#112]) | Medium | #91, #112 |
| A6 | `ArrowRight` glued to "Open the app repository", "See declared permissions and scan verdicts before you install" and "Read the app creation guide"; an `ArrowUpRight` on every card. | No arrows glued to links (section 4) | Medium | #91 |
| A7 | The site keeps its own 14 categories, while the Store groups apps by tags. | The Store's categories from the pinned release ([#91]'s comment) | Low | #91 |
| A8 | Card links carry very long accessible names, and 243 lists sit in the tree. | A short name per card, with its facts as text | Low | #91 |

## `/security`

| Job | Strongest proof | Primary action |
|---|---|---|
| Trust boundaries and known limits | Enforced controls with code citations | Read the threat model |

**What stays**

- The hero's candor: "not an operating-system jail", and the opt-in container and VM tier named as
  opt-in.
- The narrowed egress card, matching the `egress_default_deny`, `single_chokepoint` and
  `egress_allowlist_exclusive` rows.
- The in-site threat model and limitations links, and `SECURITY.md` at the pinned commit.
- The supply-chain lifecycle, a real sequence.

**What is replaced**

- The arrow chain and the decision path, by the Authority and Network views with one table fallback;
  the numbered grid, by cited control rows; the limits, moved near the top ([#92]).

**The layout matrix**

| Check | Result |
|---|---|
| 320 px | One column. "Inspect the controls" is at 1,009 px, below the first viewport. The zones and the seven controls stack. 8,618 px. |
| 390 px | As 320, with the action at 896. 8,145 px. |
| 412 px | As 320; the action just makes the first viewport (838). 7,932 px. |
| 768 px | Header button off the edge (X1). The zones three across, the controls two, the decision path three. 6,163 px. |
| 1024 px | Two-column hero; the boundary chain and the decision path each on one row; the controls three across. 5,337 px. |
| 1440 px | As 1024. The limits start 4,357 px down a 5,730 px page (6,504 of 8,145 at 390). |
| 200% text | At 1440 the header button leaves the screen and the h1 leaves the first viewport. At 320, 34 elements end past the edge (X2). |
| Keyboard | 24 stops at 1440, 18 at 390, each with a visible ring. |
| Reduced motion | Nothing animates. |
| Forced colors | The header's current page mark is lost (X5). |
| Screen reader | Twelve headings. "01" to "07" are read before each control. The zones read as loose text, and two zones' labels run together ("Deterministic enforcement Untrusted requests"). |

- **Mobile:** a safe reflow.
- **Long copy:** nothing overflows at 390 or 320.
- **Empty and error states:** none apply; the page is static.
- **URL round-trip:** `#controls` works. There are no views yet to keep in the URL.
- **Rendered contrast:** nothing under AA; the lowest pair is `--ink-muted` on the host zone's tint,
  5.84:1.

**Trust claims**

| Claim | Evidence | Verified release | Status |
|---|---|---|---|
| Approval modes | Threat model: `task_modes.py`, `trust_mode.py`; row `tool_approval` (partial) | v0.2.3 | Holds; not cited on the page |
| Command denylist | Threat model: `shell_denylist.py` (`BUILTIN_DENIED_COMMAND_PATTERNS`) | v0.2.3 | Holds; not cited |
| Guarded egress | Rows `egress_default_deny`, `single_chokepoint`, `egress_allowlist_exclusive` (partial) | v0.2.3 | Holds as narrowed |
| Scoped app tokens | Threat model: `dashboard/token_auth.py::app_session_token`; row `app_sandbox` | v0.2.3 | Holds; not cited |
| Scanner gate | `apps/app_manager.py`, `supply_chain.py` | v0.2.3 | Holds; not cited |
| "HMAC-linked security events make alteration visible" | Row `audit_log` (partial): edits caught, deletions not | v0.2.3 | Wider than the row (S1) |
| Optional sign-in, off by default, additive | `auth/credentials.py`, `auth/totp.py`; the threat model cites nothing | Files present at v0.2.3; behaviour not re-read | Needs a citation (S3) |
| "Five trust boundaries" and an OWASP Agentic Top 10 mapping | `docs/security/threat-model.md` | v0.2.3, read for this audit | Holds, but typed (S6) |

**Shots placed:** none.

| ID | Today | The brief wants | Severity | Owner |
|---|---|---|---|---|
| S1 | The sixth control (`src/pages/security.astro:164`) says "HMAC-linked security events make alteration visible during later review", and the decision path's last step says "Security event is linked". The verifier ignores chain breaks, so a deleted entry goes unreported. | The row's truth: an edited entry is caught, a deleted one is not | High | #92 |
| S2 | The limits section (`section.honesty`) is the last on the page. | Known limits near the top, naming the last verified release ([#92]) | Medium | #92 |
| S3 | `.control-grid` numbers seven controls 01 to 07 and cites no file. At v0.2.3 the threat model names files for six; Optional sign-in has none. | One row per control, each linking the file it cites at the tag, no numbers ([#92]) | Medium | #92 |
| S4 | `.trust-boundary`: three zones joined by `.boundary-arrow` "→" spans, with uppercase mono zone labels; `.decision-path`: five steps with uppercase mono labels. | The Authority and Network views with a table fallback, drawn in HTML or SVG with live text ([#92]) | Medium | #92 |
| S5 | `ArrowRight` glued to "Inspect the controls", "Read the threat model", "Known limitations" and "Report a vulnerability". | No arrows glued to links (section 4) | Medium | #92 |
| S6 | "five trust boundaries" is typed. It holds at v0.2.3. | No typed count (section 6) | Low | #92 |

## `/release`

| Job | Strongest proof | Primary action |
|---|---|---|
| Exactly what shipped, and how to verify it | Commits, SBOM, attestations | Verify a release |

**What stays**

- The two pinned commits and tags, with links, held by `validate:release-parity`.
- The derived counts, and the `data-release-provenance` attributes on the hero.
- The changelog read from the pinned `CHANGELOG.md`, and the plain sentence the page writes when
  nothing sits above the current version.
- The publication steps (pin, parse, record): a real sequence, so the numbers may stay.

**What is replaced**

- Nothing on the page verifies a release. [#93] adds the checksums, SBOMs, attestation commands and
  numbered steps, and [#97] the release clip.

**The layout matrix**

| Check | Result |
|---|---|
| 320 px | One column: the summary list, the category counts two across, the capabilities one column. 10,943 px. |
| 390 px | As 320. 10,248 px. |
| 412 px | As 320. 10,166 px. |
| 768 px | Header button off the edge (X1). Category counts three across, capabilities two. 7,378 px. |
| 1024 px | Two-column hero; counts three across, capabilities three. 6,371 px. |
| 1440 px | Category counts nine across. 6,211 px. |
| 200% text | At 1440 the header button and three summary values leave the screen. At 320, 31 elements end past the edge (X2). |
| Keyboard | 26 stops at 1440, 20 at 390, each with a visible ring. |
| Reduced motion | Nothing animates. |
| Forced colors | The header's current page mark is lost (X5). |
| Screen reader | Thirteen headings. The changelog heading reads "v0.2.32026-10-19" (R4). |

- **Mobile:** a safe reflow.
- **Long copy:** nothing overflows at 390 or 320.
- **Empty and error states:** the empty "Unreleased" entry says so in words; a pre-release build
  shows its caveat.
- **URL round-trip:** no state to keep.
- **Rendered contrast:** nothing under AA; the lowest pair is `--ink-muted` on `--surface`, 5.75:1.

**Trust claims**

| Claim | Evidence | Verified release | Status |
|---|---|---|---|
| "Two repositories. Two immutable commits." | `sources/personalclaw.sources.json`; `validate:release-parity` | v0.2.3 and apps v0.2.2 | Holds |
| The counts are computed, and the build fails when the directory drifts | `src/data/release.ts` | Derived at build | Holds |
| The changelog | Core's `CHANGELOG.md` at `c705b30` | v0.2.3 | Holds |
| What a reader needs to verify the release | Nothing on the page. The v0.2.3 release carries a SHA-256 digest per asset and five SPDX SBOMs, the wheel's among them | v0.2.3, read for this audit | Missing (R1) |

**Shots placed:** none.

| ID | Today | The brief wants | Severity | Owner |
|---|---|---|---|---|
| R1 | No checksums, SBOM links, attestation commands or verification steps. | All four, built from the release record ([#93] approved update) | Medium | #93 |
| R2 | `.category-ledger` is a grid of number-and-label tiles, one per category (14 at the pin, nine across at 1440). | No stat tiles (section 4); the same evidence as a list or table | Medium | #93 |
| R3 | `ArrowUpRight` glued to "View the source manifest", the commit and tag links and "Read the pinned changelog". | No arrows glued to links (section 4) | Medium | #93 |
| R4 | `<h3>v0.2.3<small>2026-10-19</small></h3>` gives the heading the accessible name "v0.2.32026-10-19". | Words kept apart in the accessibility tree | Low | #93 |
| R5 | "View the source manifest" opens `sources/personalclaw.sources.json` on this repository's `main`, which can differ from the commit that built the page. `validate:source-pins` does not cover links into this repository. | Every provenance link at the revision it describes | Low | #93 |
| R6 | "Declare full 40-character commits" is typed. | No typed count (section 6) | Low | #93 |

## `/compare`

| Job | Strongest proof | Primary action |
|---|---|---|
| What it does and doesn't do | Every row sourced to a file at the tag | Install |

**What stays**

- 27 rows in five groups, each citing a file at v0.2.3 and checked on 2026-10-20: 11 hold, 12 are
  partial, 4 do not. `npm run validate:compare` refuses an empty matrix, drifted text, a branch link,
  or a matrix with no partial or no rows.
- The rule against claims about other projects, and the correction line.

**What is replaced**

- The row shape grows into the verification ledger ([#93]), with filters and an anchor per row.

**The layout matrix**

| Check | Result |
|---|---|
| 320 px | One column of rows. 20,954 px. |
| 390 px | As 320. 17,742 px. |
| 412 px | As 320. 17,003 px. |
| 768 px | Header button off the edge (X1). 12,239 px. |
| 1024 px | One column inside the shell. 12,075 px. |
| 1440 px | As 1024. 12,333 px. |
| 200% text | At 1440 the header button leaves the screen. At 320, 99 elements end past the edge, row text and source links among them (X2). |
| Keyboard | 50 stops at 1440, 44 at 390, each with a visible ring. |
| Reduced motion | Nothing animates. |
| Forced colors | The header's current page mark is lost (X5). Verdicts are words, so they survive. |
| Screen reader | A named region per group, each claim an h3, the verdict a paragraph before it. Each source link's name runs its label into the release ("LICENSEat v0.2.3"). |

- **Mobile:** a safe reflow.
- **Long copy:** nothing overflows at 390 or 320.
- **Empty and error states:** an incomplete row is counted and named in the build output instead of
  shown; the build refuses an empty matrix.
- **URL round-trip:** `/compare#telemetry` resolves to nothing; no row has an `id` (C1).
- **Rendered contrast:** nothing under AA; the lowest pair is the footer's line, `--ink-muted` on
  `--night-soft`, 6.11:1.

**Trust claims:** every row is a claim with its source file and release. What the rows lack is the
ledger's other fields (C3).

**Shots placed:** none.

| ID | Today | The brief wants | Severity | Owner |
|---|---|---|---|---|
| C1 | Rows carry `data-capability-row` but no `id`. | `id={row.id}`, so Home's trust rows and FAQ can link `/compare#telemetry` ([#88], [#93]) | Medium | #93 |
| C2 | No filters and no URL state. | Filters by group, in the URL, the page still whole without JavaScript ([#93]) | Medium | #93 |
| C3 | `src/data/capabilities.json` has one release block for the whole file, and rows with no wording, evidence type, apps revision or verified release of their own. | The verification ledger's fields on every row (section 5.4) | Medium | #93 |
| C4 | `ArrowUpRight` on every row's source link, and on "The security posture" and "Known limitations", which stay on this site. | No arrows glued to links (section 4) | Medium | #93 |
| C5 | Each source link's accessible name glues its label to the release. | A space between them | Low | #93 |
| C6 | "Roughly half of these rows are not a clean pass" is typed. At v0.2.3, 16 of 27 are not. | Derive it from the counts, or drop it (section 6) | Low | #93 |

## `/blog` and `/blog/launch`

| Job | Strongest proof | Primary action |
|---|---|---|
| Posts verified against a named release | The release each claim was checked on | Follow by feed |

**What stays**

- `verifiedAgainst`, required by the blog schema (`src/content.config.ts`), shown on the listing and
  the post.
- `npm run validate:blog`, and the listing's empty state, which says there are no posts rather than
  pretending.
- Every source link in the post, pinned to `v0.1.3`.

**What is replaced**

- A verification callout, a claims list against the ledger, a badge linked to `/release`, and a feed
  ([#93]).

**The layout matrix** (both pages share one narrow column)

| Check | Result |
|---|---|
| 320 px | One narrow column. The listing is 1,646 px, the post 15,390. |
| 390 px | As 320. 1,522 and 13,144 px. |
| 412 px | As 320. 1,468 and 12,632 px. |
| 768 px | Header button off the edge (X1). 1,210 and 8,469 px. |
| 1024 px | The column centred. 1,150 and 8,549 px. |
| 1440 px | As 1024. 1,328 and 8,975 px. |
| 200% text | At 1440 the header button leaves the screen. At 320 only the menu button and one link end past the edge. |
| Keyboard | Listing 21 stops at 1440, 15 at 390; post 46 and 40. Rings visible. |
| Reduced motion | Nothing animates. |
| Forced colors | No state to lose on either page. |
| Screen reader | The listing has one heading. The post has 13, eight of them "Receipts" (B3). The listing's link reads its title, date and badge as one run ("A personal agent you can audit26 August 2026Verified against v0.1.3"). |

- **Mobile:** a safe reflow.
- **Long copy:** nothing overflows at 390 or 320.
- **Empty and error states:** the listing states it has no posts when it has none.
- **URL round-trip:** no state to keep.
- **Rendered contrast:** nothing under AA; the lowest pair is the date, `--ink-muted` on `--surface`,
  5.75:1.

**Trust claims**

| Claim | Evidence | Verified release | Status |
|---|---|---|---|
| "Verified against v0.1.3" | The post's frontmatter; its links point at `blob/v0.1.3/` | v0.1.3 | Holds |
| "the tagged release this website publishes, v0.1.3, pinned commit `04389c96`"; "this release is 0.1.3" | The site pins v0.2.3 | v0.2.3 | Untrue at the pin (B1) |
| The post's description: "checked against the tagged release this site publishes" (`tests/support/site-contract.mjs`) | The same | v0.2.3 | Untrue at the pin (B1) |

**Shots placed:** none.

| ID | Today | The brief wants | Severity | Owner |
|---|---|---|---|---|
| B1 | `src/content/blog/launch.md` says in the present tense that the release this website publishes is v0.1.3, and its contracted description says the same. The site publishes v0.2.3. | A claim last verified at an older release reads as a known limit, never as current ([#93], [#98]) | High | #93 |
| B2 | No verification callout, no claims list, no feed, and a badge that links nowhere. | The callout, `claims` against the ledger, a contracted feed, the badge linked to `/release` ([#93]) | Medium | #93 |
| B3 | Eight h3 headings in the post are all "Receipts". | Headings a reader can tell apart | Low | #93 |
| B4 | The listing link's accessible name runs its parts together. | Words kept apart in the accessibility tree | Low | #93 |

## `/registry` and its listing pages

| Job | Strongest proof | Primary action |
|---|---|---|
| What a community app asks for, before install | Declared permissions and the last scan verdict, at the registry's pin | Read a listing's sheet ([#112]) |

At the pin the registry lists no apps, so `/registry` renders its empty state and no
`/registry/<app>` page exists. One listing page (`/registry/registry-fixture-clean`) and the listed
index were read from the fixture build.

**What stays**

- The Store's consent contract in the Store's order (`STORE_CONSENT` in `src/data/registry.mjs`):
  "Community-listed, not endorsed" before the verdict, the verdict attributed to the registry, the
  install-time rescan last. `sync:registry` checks the phrases against core v0.2.3.
- An unreadable row is dropped and counted, never guessed at; permissions shown verbatim.
- The empty and not-at-this-release states, each in plain words.

**What is replaced**

- The listing page becomes the install-safety sheet for both kinds of app ([#112]).

**The layout matrix**

| Check | Result |
|---|---|
| 320 px | One column. At the pin, 3,332 px; the fixture index 4,688 and the listing 2,635. |
| 390 px | As 320. 3,001; 4,239; 2,475 px. |
| 412 px | As 320. 2,952; 4,167; 2,450 px. |
| 768 px | Header button off the edge (X1). 2,644; 3,589; 2,241 px. |
| 1024 px | Two-column intro and legend. 2,160; 2,844; 2,048 px. |
| 1440 px | As 1024. 2,259; 2,921; 2,191 px. |
| 200% text | At 1440 the header button leaves the screen. At 320, 42 elements end past the edge on the fixture index and 23 on the listing (X2). |
| Keyboard | At the pin 21 stops at 1440 and 15 at 390; the fixture index 24, the listing 23. Rings visible. |
| Reduced motion | Nothing animates. |
| Forced colors | Verdicts are words, so they survive. |
| Screen reader | The fixture index jumps from the h1 to h3 card titles (G3). The listing has an h1 and three h2s, and a named region for the README. |

- **Mobile:** a safe reflow.
- **Long copy:** nothing overflows at 390 or 320.
- **Empty and error states:** empty, absent at the release, and unreadable rows counted; each has its
  own words. There is no unsafe, incompatible or unavailable state yet ([#112]).
- **URL round-trip:** a listing is its own path; there are no panels yet.
- **Rendered contrast:** nothing under AA. The legend's "Dangerous" badge, `--ink` on `--ember`,
  measures 4.57:1, inside AA by 0.07.

**Trust claims**

| Claim | Evidence | Verified release | Status |
|---|---|---|---|
| Every listing publishes its declared permissions and the verdict of its last scan | `app-registry.json` at registry `53c1bcd` | Registry pin; consent phrases checked against core v0.2.3 | Holds |
| The install-time rescan | `INSTALL_GATE_SENTENCE`, checked against core's own module | v0.2.3 | Holds; not yet a ledger row ([#112]) |

**Shots placed:** none.

| ID | Today | The brief wants | Severity | Owner |
|---|---|---|---|---|
| G1 | First-party apps have no sheet, and at the pin no community app has one either. | A sheet per app at `/registry/<name>`, first-party apps included ([#112]) | Medium | #112 |
| G2 | The listing page has no hosts, scanner version, signer, compatibility or secrets, and shows a README from the default branch. | Every field from a pinned source or "not recorded"; no README panel ([#112], settled) | Medium | #112 |
| G3 | The listed index goes from the h1 to h3 card titles. | No skipped heading level | Low | #112 |
| G4 | `ArrowUpRight` glued to "Read the registry and its listing policy" and "Open the repository", and on every card. | No arrows glued to links (section 4) | Medium | #112 |
| G5 | The "Dangerous" badge measures 4.57:1. | Contrast with room to spare in the new tokens | Low | #89 |

## The docs tier (`/docs`)

Read: the landing `/docs`; the five section indexes `/docs/guides`, `/docs/reference`,
`/docs/architecture`, `/docs/security` and `/docs/research`; and one synced page per tree:
`/docs/guides/getting-started`, `/docs/reference/cli`, `/docs/architecture/overview`,
`/docs/security/threat-model` and `/docs/research/security-and-guardrails`. Core owns the synced
words, so only the theme and the docs layer are findings here.

| Job | Strongest proof | Primary action |
|---|---|---|
| Running, extending, trusting | Generated from the pinned core commit | The getting-started guide |

**What stays**

- Search first: Pagefind, local, the first control in the header, opening with Ctrl+K.
- Tables in their own focusable scroll regions with a visible ring (`rehypeScrollableTables`).
- Code that wraps instead of scrolling, and code tokens at 4.98:1 or more in the dark theme.
- Clean reflow: no element past the edge at any width or at 200% text, on all eleven pages.
- The generated corpus and its contracts: set equality with the build, the body floor, the
  cross-link floor.

**What is replaced**

- The colour mapping in `src/styles/docs.css`, by the new tokens, and a usability pass on top
  ([#89]).

**The layout matrix** (all eleven pages; differences named)

| Check | Result |
|---|---|
| 320 px | Starlight's narrow layout: the sidebar behind a menu button, the contents in a disclosure. Tables scroll inside their region on the getting-started, CLI, overview and threat-model pages. |
| 390 px | As 320. |
| 412 px | As 320. |
| 768 px | As 320; tables fit except on the threat model. |
| 1024 px | Sidebar, page and "On this page" in three columns. |
| 1440 px | As 1024. |
| 200% text | Nothing past the edge at 1440 or 320 on any of the eleven pages. |
| Keyboard | 92 stops on the landing and 149 on getting-started at 1440 (22 and 64 at 390, where the sidebar sits behind its button). Rings visible. |
| Reduced motion | Nothing animates. |
| Forced colors | The sidebar's current page looks like the other links on every page read except the landing (D4). |
| Screen reader | Banner, navigation "Main", complementary, navigation "On this page", main. "On this page" (an h2) comes before the h1 on every page (D6). |

- **Mobile:** Starlight's own reflow.
- **Long copy:** nothing overflows except the heading anchor links on three pages (D7).
- **Empty and error states:** a missing page gets Starlight's 404 (X8); a search with no results gets
  Pagefind's message.
- **URL round-trip:** headings carry anchors; the search dialog is not in the URL, which is fine.
- **Rendered contrast:** nothing under AA in the dark theme. The light theme fails (D1).

**Trust claims**

| Claim | Evidence | Verified release | Status |
|---|---|---|---|
| The docs are generated from the tagged release this site publishes and published unedited | `scripts/sync-docs.mjs`: 57 documents synced from core `c705b30` | v0.2.3 | Holds; no page says which release (D2) |

**Shots placed:** none.

| ID | Today | The brief wants | Severity | Owner |
|---|---|---|---|---|
| D1 | With a light colour-scheme preference, Starlight sets `data-theme="light"` and `docs.css` re-points only the accent, to `#b8351f`. The dark ramp it sets on `:root` stays, so the light accent sits on dark surfaces at 2.9:1 (`#b8351f` on `#1a1c1d`). axe counts 17 contrast failures on `/docs`, 136 on `/docs/guides/getting-started` and 20 on `/docs/security/threat-model`. The browser suite runs dark only, so CI does not see it. | A light theme that is light, with an accent at 4.5:1 or more ([#89]) | High | #89 |
| D2 | No docs page shows which core release it was generated from: no version on the landing, the indexes or the five pages read. | Visible version context on every page (section 5.8) | Medium | #89 |
| D3 | "Edit page" opens `github.com/PersonalClaw/PersonalClaw/edit/main/src/content/docs/docs/<tree>/<page>.md`, this site's synced path. Core keeps the file at `docs/<tree>/<page>.md`, so the link opens a path core does not have (`editLink.baseUrl` in `astro.config.mjs`). | A working edit link into core | Medium | #89 |
| D4 | Starlight's chrome misses 44 px: the skip link is 28 px tall, the search button 40, the menu button and the GitHub link 32 by 32, sidebar links 32 tall. Under forced colors the sidebar's current page is lost. `/docs` is outside the browser suite's 44 px check and Lighthouse. | 44 px targets and a visible current page (section 7) | Medium | #89 |
| D5 | The site title reads "PersonalClaw docs" and links to `/`, the only way back to the marketing site from the docs header. | One chrome across the site ([#89]) | Low | #89 |
| D6 | "On this page" comes before the h1 in the accessibility tree. | Focus and reading order that start with the page (section 5.8) | Low | #89 |
| D7 | With 40% longer text, heading anchor links run past the edge on the CLI page at 390 and the overview and research pages at 320. | Long copy that reflows | Low | #89 |

## Context findings, confirmed or corrected

The findings #86 lists, and the ones its siblings record, read again on the built site at
`e543502`.

| Finding | Verdict | Where |
|---|---|---|
| Home's near-black canvas with one coral accent | Confirmed | `--night: #0b0c0d` in `src/styles/tokens.css` |
| The numbered 01 to 03 trio | Confirmed (H4) | `src/pages/index.astro`, `.ownership-grid article > .index` |
| The five-step arrow chain with all-caps mono labels | Confirmed (H5) | `.system-path`, `.path-arrow`, `.system-path article > span` |
| Three stat tiles, one a typed "1" | Confirmed (H6) | `.ecosystem-note dl` |
| A hand-picked tape of 12 app names | Confirmed (H15) | `featuredSlugs`, `.app-tape`; resolved through `src/data/apps.ts` |
| "Watch the 84-second tour" | Confirmed (H7) | `.hero-tour-link` |
| `/security`'s 01 to 07 grid without citations | Confirmed (S3). Corrected detail: at v0.2.3 the threat model cites `shell_denylist.py` for command screening, not `security.py` | `.control-grid article > span` |
| `/security`'s trust boundary as an arrow chain | Confirmed (S4) | `.trust-boundary .boundary-arrow` |
| The limits and threat model links at the bottom | Confirmed (S2) | `section.honesty`, 4,357 px down a 5,730 px page at 1440 |
| "not an operating-system jail" in the hero | Confirmed, and kept | `.hero-copy`, second paragraph |
| `/apps`'s four hero tiles, two typed | Confirmed (A1) | `.app-ledger` |
| The builders band's `app.json` would not validate | Corrected. Since `393dc5f` the band shows `web-tools/app.json` at apps v0.2.2 byte for byte, and `sync:sources` fails when that file or core's manifest rules move | `src/data/apps-snippet.mjs`, `tests/apps-snippet.test.mjs` |
| `/product`'s typed "The 84-second tour" | Confirmed (P4), with "v0.1.3" also typed in the support line | `.tour-head .kicker`, `.tour-support` |
| More capability sections than the six [#90] plans | Confirmed: nine (P6) | `src/pages/product.astro` |
| Arrows glued to labels, and `ArrowUpRight` on the header's button | Confirmed (X4, H8, P5, A6, S5, R3, C4, G4) | Every marketing route |
| The tamper-evident card reads wider than the truth ([#92]) | Confirmed (S1) | `src/pages/security.astro:164` |
| The `llms.txt` lead overstates telemetry ([#98]) | Corrected. Since `c4dba9d` the lead says there is no analytics, crash reporting or usage telemetry, that PersonalClaw asks GitHub for a newer release by default, and that `updates.check_enabled` turns it off. `scripts/llms-lead.mjs` refuses the short forms | `dist/llms.txt` |
| The wheel SBOM is not a release asset ([#88], [#93]) | Corrected at v0.2.3: `personalclaw-wheel.spdx.json` is attached. The release still attaches no checksum file and no installer | The v0.2.3 release record |
| `public/install` is served with no checksum beside it ([#88]) | Partly corrected. Core v0.2.3 carries `deploy/website/install.sh.sha256` and the manifest records `installSha256`. Nothing sits beside `/install` on the site, and nothing signs it | `sources/personalclaw.sources.json` |
| 30 visual baselines across macOS and Linux (#86's machinery list) | Corrected: 15 baselines, one Linux set made and compared inside the pinned Playwright image | `tests/browser/__screenshots__/`, `tests/browser/visual-image.json` |
| Home's LCP headroom, about 2.18 s against 2.5 s ([#88]) | Not re-measured here; the Lighthouse gate still holds the 2.5 s budget | `scripts/lighthouse-audit.mjs` |

## The machinery kept

Each holds at `e543502`. The pre-push gate (`npm run test:prepush`) ran green on this change.

| Machinery | Holds | Note |
|---|---|---|
| Release parity and source pins (`scripts/validate-release-parity.mjs`, `scripts/validate-source-pins.mjs`, `sources/personalclaw.sources.json`) | Yes | Released channel: core v0.2.3, apps v0.2.2, the registry by commit |
| The marketing manifest and its validator (`marketing/screenshots.manifest.json`, `scripts/validate-marketing-manifest.mjs`) | Yes | 13 shipping shots, `targetRelease` 0.2.3. The tour video is outside it ([#94]) |
| The head contract and route inventory (`scripts/validate-build.mjs`) | Yes | Every generated page, derived from the build |
| The browser suite: axe, keyboard, 44 px targets, `monitorRuntime` | Yes | Zero third-party and zero failed requests measured on every route at every width. Its gaps: dark theme only (D1), contrast axe cannot decide under the body grid (X6), `/docs` outside the 44 px check (D4), no forced-colors or text-zoom project (X1, X2, X5) |
| Visual baselines | Yes | 15, Linux, inside the pinned image |
| The Lighthouse budgets (`scripts/lighthouse-audit.mjs`) | Yes | Performance 0.9; accessibility, best practices and SEO 0.95; FCP 2.0 s, LCP 2.5 s, CLS 0.1, TBT 200 ms, speed index 3.4 s, 2.5 MiB a page; script 160 KiB, fonts 280 KiB, images 2.25 MiB. Over the nine contracted routes, not `/docs` |
| `/compare`'s every-row-sourced rule (`npm run validate:compare`) | Yes | 27 rows at v0.2.3 |
| Starlight docs with search first | Yes | Pagefind, local |
| The no-tracking stance | Yes | No third-party request anywhere; `llms.txt` states the update check |

## The redesign skill's checklist, site-wide

`redesign-existing-projects`, Diagnose step, against the whole site.

| Area | Hits | Set aside, and why |
|---|---|---|
| Typography | All-caps eyebrows and labels (X3). Prose holds a 68-character measure, headings use `text-wrap: balance`, and DM Sans already spans 300 to 650 weights. | A font swap: DM Sans is the product's own face (DESIGN.md) |
| Colour and surfaces | Ambient coral: the body grid (X6) and Home's band (H13). No pure black, no purple or blue gradient, one accent. | Grain, noise and background imagery: real captures only (section 4) |
| Layout | Three equal cards (H4, P7). A 1440 px shell, `100dvh` where the hero needs it. | None |
| Interaction and states | Missing error states (A4, P9), a dead edit link (D3), current-page state lost in forced colors (X5, D4). Focus rings, current-page marks, empty states and reduced motion already hold. | None |
| Content | None. No banned words or exclamation marks in the copy; headings in sentence case. | Invented names and messy numbers: the site shows only real data |
| Components | One filled and one ghost button in Home's hero (H9). [#88]'s FAQ should not be an accordion by default. | None |
| Iconography | A favicon is present. | Swapping `lucide-react`: the site uses it (brief section 3) |
| Code quality | Design notes shipped as HTML comments (H14, P12). Landmarks, meta tags and alt text hold. | None |
| Strategic omissions | The 404 (X8). The skip link and back links hold. | Cookie consent and a privacy policy: the site sets no cookies and tracks nothing |

## Questions for Gate A

1. #86's "Done when" asks for screenshots at four widths. This audit has none; every layout fact
   comes from the measured page. Attach captures at Gate A, or accept the measurements?
2. Impeccable `critique`, #86's second pass, was not run here. Run it at Gate A, or leave it to each
   page PR's gate, where section 2 already requires it?
3. The screen-reader rows come from Chromium's accessibility tree, not from a screen reader. Accept
   them for Gate A, and record a real reader per route at Gates C and D?

[#84]: https://github.com/PersonalClaw/personalclaw.dev/issues/84
[#86]: https://github.com/PersonalClaw/personalclaw.dev/issues/86
[#87]: https://github.com/PersonalClaw/personalclaw.dev/issues/87
[#88]: https://github.com/PersonalClaw/personalclaw.dev/issues/88
[#89]: https://github.com/PersonalClaw/personalclaw.dev/issues/89
[#90]: https://github.com/PersonalClaw/personalclaw.dev/issues/90
[#91]: https://github.com/PersonalClaw/personalclaw.dev/issues/91
[#92]: https://github.com/PersonalClaw/personalclaw.dev/issues/92
[#93]: https://github.com/PersonalClaw/personalclaw.dev/issues/93
[#94]: https://github.com/PersonalClaw/personalclaw.dev/issues/94
[#96]: https://github.com/PersonalClaw/personalclaw.dev/issues/96
[#97]: https://github.com/PersonalClaw/personalclaw.dev/issues/97
[#98]: https://github.com/PersonalClaw/personalclaw.dev/issues/98
[#112]: https://github.com/PersonalClaw/personalclaw.dev/issues/112
