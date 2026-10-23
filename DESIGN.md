---
name: PersonalClaw
description: Coral first, then the machine: the brand speaks once on a coral field, and real product work fills the dark theater below it
colors:
  night: "#0b0c0d"
  night-soft: "#101112"
  well: "#090a0b"
  theater: "#121416"
  surface: "#171819"
  theater-high: "#202224"
  line: "#2b2d2f"
  line-strong: "#3b3e41"
  ink: "#f2f1ed"
  ink-soft: "#c4c4bf"
  ink-muted: "#92938f"
  coral: "#ff6b5b"
  coral-ink: "#3f1008"
  coral-bright: "#ff937d"
  ember: "#bd4537"
  amber: "#ffb454"
  success: "#57c989"
typography:
  display:
    fontFamily: "DM Sans Variable, DM Sans, system-ui, sans-serif"
    fontSize: "clamp(min(3.5rem, 14vw), 10vw, 6rem)"
    fontWeight: 300
    lineHeight: 0.96
  heading:
    fontFamily: "DM Sans Variable, DM Sans, system-ui, sans-serif"
    fontSize: "clamp(min(2.25rem, 9vw), 5vw, 4.5rem)"
    fontWeight: 380
    lineHeight: 1.02
  title:
    fontFamily: "DM Sans Variable, DM Sans, system-ui, sans-serif"
    fontSize: "clamp(1.4rem, 2.5vw, 2rem)"
    fontWeight: 500
    lineHeight: 1.15
  body:
    fontFamily: "DM Sans Variable, DM Sans, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "DM Sans Variable, DM Sans, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 550
    lineHeight: 1.3
  mono:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 450
    lineHeight: 1.6
rounded:
  control: "999px"
  surface: "8px"
  media: "8px"
  key: "4px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  2xl: "2rem"
  3xl: "3rem"
  4xl: "4rem"
  5xl: "6rem"
  6xl: "8rem"
components:
  coral-field:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.coral-ink}"
  theater:
    backgroundColor: "{colors.theater}"
    textColor: "{colors.ink}"
  primary-cta:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.night}"
    rounded: "{rounded.control}"
    height: "48px"
  primary-cta-on-coral:
    backgroundColor: "{colors.coral-ink}"
    textColor: "{colors.coral}"
    rounded: "{rounded.control}"
    height: "48px"
  secondary-cta:
    backgroundColor: "{colors.theater-high}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "48px"
  media-frame:
    backgroundColor: "{colors.theater}"
    rounded: "{rounded.media}"
---

# Design System: PersonalClaw Marketing

## Overview

**Creative North Star: "Coral First, Then the Machine"**

The brand speaks once, loudly, in coral, then gets out of the way so real product work fills the screen. Home opens on a coral field, continuous with the social card, carrying the mark, the name and the proposition in dark ink. Below it starts the dark theater, where every capture plays. The real System Window hangs across the boundary between the two, so the proposition, the product proof and the install action share the first screen. That crossing is the direction the maintainer chose on 2026-10-14 (#87), and it is the one thing on the site allowed to be loud.

Every other route is the theater from the top: a quiet dark page whose proof is the release's own evidence. /product is the recorded tour and one section per capability, /apps the counted catalog, /security the boundary drawn two ways, /compare the verification ledger, /release the pinned release and the steps to check it, /blog posts that say what they were checked against, and `/registry/<name>` one install-safety sheet per app. They read as records, not pitches: a fact, its source at the pinned tag, and the release it was last verified at.

The scene behind the theater is a technical owner at a personal desk after dark, moving between an editor, a terminal and PersonalClaw while autonomous work continues in view. That is why the captures are dark and the theater is near-black. Coral is the brand and the action, never a backdrop for product work.

The system rejects what PRODUCT.md rejects: the hosted-chat wrapper look, generic AI-tool marketing, glow and purple or blue gradients, fake product UI, and beige-paper calm. It also rejects the near-black-plus-one-accent cluster that most AI tools land in; the coral field is how this site leaves it without leaving the brand.

**Key Characteristics:**
- At most one coral field on screen at a time: Home's hero and the closing call to action. Everywhere else coral marks only actions, selection, focus and live agent states.
- The System Window is the one signature. It crosses from coral into the theater in the first viewport at 1440 x 900 and at 390 x 844 (`tests/browser/first-viewport.spec.ts`).
- Every hand-authored page keeps its headline and one factual support sentence inside the first viewport, at 1440, 768, 390 and 320 wide (`tests/browser/support-sentence.spec.ts`).
- Real captures only, recorded from a released build. Media is poster-first: nothing plays or loads before an explicit Play, and reduced motion or data saver keep the still.
- Every number and version comes from `releaseFacts` or the verification ledger. Nothing is typed into copy.
- Motion is functional only: 160 ms control feedback, 240 ms tab changes, and Home's one 650 ms window entrance. Every path has a no-motion equivalent, and no entrance hides content.

## Colors

Two grounds, coral and theater, and one ink for each. Coral carries Home's hero; the theater carries the product and every proof page.

### Primary
- **Claw Coral** (coral): the hero field, the closing call to action's field, primary buttons on dark, every selected control (the System Window tab, the /apps category, the /compare group, the /product chapter, the sheet's evidence tab), and live agent states. It is the app's `coral-primary`, the same value.
- **Coral Ink** (coral-ink): every word on the coral field, and the primary button that sits on it. 5.8:1 on coral; white on coral is 2.8:1 and fails. It is the app's `on-coral`.
- **Bright Coral** (coral-bright): links and text links on the theater, hover for coral actions, the focus ring on dark, and the "Narrower than it sounds" verdict, the ledger row a reader most needs to stop on.

### Secondary
- **Ember** (ember): the 2 px edge of a dangerous state, such as an unsafe sheet's decision box or the registry's blocked badge. Never a fill under text.
- **Amber** (amber): only the warm end of the mark's claw gradient.
- **Signal Green** (success): semantic status only: the window's live dot, a "Holds" verdict, a verified release, a passing check.

### Neutral
- **Night** (night): the page canvas and the header, and `theme-color`. Text on a selected coral control is night.
- **Night Soft** (night-soft) and **Well** (well): one step lighter for alternating bands such as /security's limits, and one darker for command blocks sunk below the canvas.
- **Theater** (theater): the System Window's shell, every capture and video frame, and the band the window lands in below Home's coral field. 16.3:1 under ink; coral on it is 6.6:1.
- **Theater High** (theater-high): raised controls and hovered rows on the theater: secondary buttons, the current header link, a hovered filter, the "Not in this release" verdict, the registry's caution badge.
- **Surface** (surface): quiet resting surfaces, such as secondary buttons and app cards.
- **Line** (line) and **Line Strong** (line-strong): hairlines between sections and rows, and borders on controls, frames and pills.
- **Ink** (ink), **Ink Soft** (ink-soft), **Ink Muted** (ink-muted): text on dark, by emphasis. Muted is the floor for running text (5.8:1 on the theater).

### Named Rules
**The Dark Ink on Coral Rule.** Text, icons and focus rings on the coral field are coral ink. Never white, never coral on coral, never a gray.

**The One Field Rule.** A page has at most one coral field at a time on screen, and it never fills the first viewport by itself.

**The Coral Means Something Rule.** Off the field, coral is an action, a selection, focus, a narrowed claim or a live agent. Decoration in coral is prohibited.

## Typography

**Display Font:** DM Sans Variable (with DM Sans, system-ui)
**Body Font:** DM Sans Variable
**Label/Mono Font:** JetBrains Mono Variable, for real commands, paths, digests, verdicts and versions

**Character:** One family, already part of PersonalClaw's product identity, with weight doing the expressive work: light, wide display type on the coral field, plain 17 px body on the theater. Mono marks what a reader can copy or check.

### Hierarchy
- **Display** (300, the display role, 0.96): the wordmark in Home's hero, capped by its column (16cqi), because "PersonalClaw" is one word, about 6em wide, that must never break.
- **Headline** (380, the heading role, 1.02): every page's h1 off Home, and section headings.
- **Title** (500, the title role, 1.15): sub-section, card and sheet-block titles.
- **Body** (400, 17 px, 1.65): running text, at 68 characters or less, and each page's support sentence.
- **Label** (550, 15 px, 1.3): navigation, buttons, filters, chapter names and short labels, in sentence case.
- **Mono** (450, 14 px, 1.6): commands, paths, digests, cited files, verdict pills and version labels.

The display and heading floors are capped by the screen's width as well as the text size (`min(3.5rem, 14vw)`, `min(2.25rem, 9vw)`), so at 200% text on a 320 px phone a heading's longest word still fits its line. Letter spacing is `0`; the display floor is no tighter than `-0.03em`. No functional text is smaller than 11 px.

### Named Rules
**The Sentence Case Rule.** No all-caps eyebrows, no tracked kicker above every section, no single accented word in a headline.

**The Scale Rule.** A size comes from the six roles in the frontmatter, through `--fs-*` in `tokens.css`. `validate:design-tokens` reports every size off the scale, and its debt ceiling only goes down.

## Layout

A 1440 px shell (`--shell`) with a 12-column grid on wide screens and a single column below it. Sections are separated by `--section-space` (`clamp(6rem, 11vw, 10rem)`) and a hairline, never by a frame. Prose stays at 68 characters or less, and capability sections alternate capture and text.

Every route is held to one matrix: 320, 390, 412, 768, 1024 and 1440 px, and 200% text on a 320 px screen, with nothing past the right edge except what scrolls inside its own named region (a code block, a wide table). On narrow screens, controls that would scroll sideways change form instead. The /apps category rail becomes a native select, filter pills wrap onto more rows, /release's asset table stacks by file, and the sheet's tabs wrap.

Stateful views live in the URL and survive reload, back, forward and a copied link: the System Window's `?view=`, /security's `?view=`, the tour's `?chapter=`, /apps' `?q=` and `?category=`, /compare's `?group=` and the sheet's `?panel=`. An unknown value falls back to the default view and says so where it matters.

### Named Rules
**The Reflow Rule.** At 200% text on a 320 px screen, nothing scrolls sideways that is not a named scroll region (`tests/browser/reflow.spec.ts`).

## Elevation & Depth

The system is flat and tonal. Depth comes from the step between night, night soft, theater and theater high, and from hairlines. Shadows are reserved for what sits above the page: the System Window, which crosses two grounds at once, the tour's frame, and the install panel when it opens. The header and the window's caption are the only translucent layers.

### Shadow Vocabulary
- **Window on dark** (`box-shadow: 0 40px 100px rgba(0, 0, 0, 0.48)`): the System Window anywhere on the theater, and the tour's frame on /product.
- **Raised panel** (`box-shadow: 0 40px 100px` night at 80%): Home's install panel, the one surface that opens over the page.
- **Window on coral** (`box-shadow: 0 32px 80px` coral ink at 45%): the hero's window, where a black shadow would muddy the field.

### Named Rules
**The No Glow Rule.** No glow, no coloured blur halos, no glass cards. The header's blur and the window's caption over a capture are the only backdrop filters.

## Shapes

Two corner radii and a pill. Controls are full pills (999 px): buttons, tabs, filters, chapter buttons, verdicts and the Play control. Surfaces and media are gently curved (8 px): capture frames, the System Window, video frames, ledger rows, the sheet's decision box, tables and command wells. Keycaps alone take 4 px. Borders are one pixel, line for rest and line strong for controls and frames; a dangerous state adds a 2 px ember edge. Every interactive target is at least 44 px tall.

## Components

### Buttons
- **Shape:** a full pill (999 px), 48 px tall, label weight 650.
- **Primary on dark:** coral fill, night label.
- **Primary on coral:** coral-ink fill with a coral label (5.8:1), because a coral button would vanish on the field. Hover deepens it to night with a bright-coral label.
- **Secondary:** a surface fill with a strong line; hover raises it to theater high.
- **Text links:** bright coral, 44 px tall, named for where they go. No arrow or icon is glued to a link.
- **Keycaps:** a key named in copy (`⌘`, `Enter`) sits in a small cap with 4 px corners, a strong line and theater high, in mono.
- **Hover / Focus:** 160 ms colour transitions. Focus is a 2 px ring offset 3 px, bright coral on dark and coral ink on the coral field. A link that stretches over its card draws the ring on its `::after`, and a search field draws it on its wrapper.

### Filters, tabs and chapters
- **Style:** transparent pills with a line border on the theater; hover raises them to theater high.
- **Selected:** a coral pill with night text, marked by `aria-pressed` or `aria-selected`, and kept in the URL. Under forced colours the selected one keeps a 2 px Highlight outline, because its fill is gone.
- Tabs use a roving tabindex: one Tab stop, then Arrow, Home and End.

### Verdict pills
- Mono, full pill, one line border. "Holds" is signal green, "Narrower than it sounds" is bright coral, and "Not in this release" is ink on theater high, solid and never dashed, because it is a settled fact.

### Ledger rows
- One bordered entry per claim (8 px corners, line border): the claim, its verdict, the statement held verbatim, and one source link to the file at the pinned tag. Each row has an anchor, so other pages deep-link it.
- A row not checked again at the pinned release leaves the current rows and reads "Not re-checked for <release>:", then its last verified statement and its source at that older release.

### Cards / Containers
- Cards are only for app entries: 8 px corners, surface fill, a line border, no shadow. The card's one link is the app's name, leading to its sheet. Cards never nest, and sections stay unframed.

### Navigation
- The header is night at 86% with a blur, sticky, with Product, Apps, Security, Docs and Release, and a quiet GitHub link on the right. No primary button in it.
- The current link sits on theater high; under forced colours it is underlined. On phones the same links live in a menu that opens and closes with focus restored.

### System Window (signature)
- A dark frame (theater, 8 px corners, line-strong border) with a bar of window controls, a pill tab strip and a live status, over one real capture at 16:9.6.
- Tabs switch captures in 240 ms; the selected tab is a coral pill with night text, and its view is kept in the URL (`?view=`). A tab may hold its own loop, which plays only from its Play control and pauses when its tab is left.
- In the hero it sits in the copy's right-hand seven columns on desktop and below the copy on phones, and reaches past the coral field's lower edge by `clamp(6.5rem, 13vw, 12.5rem)` into the theater.

### Hero
- Home's coral field holds the mark (in coral ink, from the source SVG), the wordmark, the line "One agentic OS. Your machine. Your rules.", one factual sentence, the primary action "Install PersonalClaw" (it opens the install panel) and "Watch the tour". No version label and no facts in it.
- Every other page's hero is its headline and one factual support sentence on the theater. Marketing heroes (Home, /product, /apps) name no version. Proof pages (/compare, /release, /security's limits) name the release they were checked against, because that is their claim.

### Media player
- One player for every loop and the release clip: a theater frame with 8 px corners and a line-strong border, a real still or poster first, and a pill Play control in a corner. Nothing is requested before Play; the player pauses offscreen and while the page is hidden; under reduced motion or data saver the still stays and the control is gone. A video that fails keeps its still and says so in one line.
- The tour is its own native player, click to play with `preload="none"`, a captions track and a chapters track, and a list of chapter buttons beside it. With the video blocked, the chapters read as a text outline.

### Install panel
- A native popover, not a modal: Escape and a click outside close it, focus starts on its heading and returns to the button that opened it, and it opens with no script.
- Three numbered steps, the one numbered list on Home because the order is the safety: download (runs nothing), check (the SHA-256, a pasteable check, the signature state, platforms, the Python, and the whole script behind "Read the script"), then run, with the pre-1.0 snapshot line.
- Night soft, 8 px corners, a strong line and the raised panel's shadow; every command in a well with its copy button.

### Verify steps and evidence tables
- /release's four verify steps are the other real sequence on the site, a numbered list of commands built from the pin, each in a well with its copy button, wrapping rather than clipping.
- Evidence tables (/release's assets, /security's boundaries) keep their roles at every width: a scroll region named by its caption on wide screens, or stacked rows with their labels on phones.

### Install-safety sheet
- The app's name as the h1, then a decision box (8 px, line border; a 2 px ember edge when unsafe or incompatible) that states the verdict, the scan, the install-time rescan and compatibility before anything else.
- Then what the app gets, starts, reaches and runs, its secrets, where it comes from, and the steps from review to enable, each fact from its pinned source or a fixed "not recorded" line. An unsafe or incompatible sheet has no enable steps and says why.
- The evidence panels (the manifest, the scan record, the claims) are pill tabs with `?panel=` in the URL.

## Do's and Don'ts

### Do:
- **Do** put the proposition, a real System Window capture and the install action inside Home's first viewport at 1440 x 900 and 390 x 844, with the window crossing from coral into the theater.
- **Do** keep every page's headline and its one factual support sentence inside the first viewport.
- **Do** set every word on coral in coral ink (5.8:1), and measure any new pair before it ships.
- **Do** show real captures and recordings from a released build, poster first, one dominant media surface per section.
- **Do** keep coral for actions, selection, focus, narrowed claims and live agents once the field ends.
- **Do** take every number and version from `releaseFacts` or a ledger row, and link every claim to its evidence at the pinned tag.

### Don't:
- **Don't** open with a full-screen coral preamble that pushes the product proof below the fold.
- **Don't** put white or coral text on the coral field.
- **Don't** use glow, purple or blue gradients, gradient text, all-caps eyebrows, numbered section labels, arrows glued to links, three equal cards, stat tiles, arrow chains, or a version label in a marketing hero.
- **Don't** fake product UI, use stock photography, hand-draw decorative SVG, or rasterize marketing copy.
- **Don't** request a media byte before Play, or hide content behind an entrance animation.
- **Don't** look like a hosted chat wrapper or generic AI-tool marketing, and don't fall back to the near-black-plus-one-accent look the coral field exists to leave.
