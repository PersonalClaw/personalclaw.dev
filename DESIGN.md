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

## 1. Overview

**Creative North Star: "Coral First, Then the Machine"**

The brand speaks once, loudly, in coral, then gets out of the way so real product work fills the screen. Home opens on a coral field, continuous with the social card, carrying the mark, the name and the proposition in dark ink. Below it starts the dark theater, where every capture plays. The real System Window hangs across the boundary between the two, so the proposition, the product proof and the install action share the first screen. That crossing is the direction the maintainer chose on 2026-10-14 (#87), and it is the one thing on the page allowed to be loud.

The scene behind the theater is a technical owner at a personal desk after dark, moving between an editor, a terminal and PersonalClaw while autonomous work continues in view. That is why the captures are dark and the theater is near-black. Coral is the brand and the action, never a backdrop for product work.

The system rejects what PRODUCT.md rejects: the hosted-chat wrapper look, generic AI-tool marketing, glow and purple or blue gradients, fake product UI, and beige-paper calm. It also rejects the near-black-plus-one-accent cluster that most AI tools land in; the coral field is how this site leaves it without leaving the brand.

**Key Characteristics:**
- At most one coral field on screen at a time: the hero, the final call to action, a brand moment. Everywhere else coral marks only actions and live agent states.
- The System Window is the one signature. It crosses from coral into the theater in the first viewport at 1440 x 900 and at 390 x 844, and a browser test holds it there (`tests/browser/first-viewport.spec.ts`).
- No full-screen brand preamble: the coral field ends inside the first viewport, so the product proof is never a scroll away.
- A 12-column grid in a 1440 px shell; captures may bleed full width; prose stays at 68 characters or less, and features alternate capture and text.
- Real captures only, from core's reproducible capture pipeline, optimized through Astro assets. The mark is its source SVG.
- One orchestrated entrance (the window rising into place over 650 ms), then motion is functional only: 160 ms control feedback, 240 ms tab changes, 450 to 650 ms media reveals. Every path has a no-motion equivalent, and no entrance ever hides content: a paused animation still shows the window.
- Active, concrete copy ("Run agents", "Pause a loop", "Keep state on your machine"). Every number and version comes from `releaseFacts`. Pre-1.0 candor sits near install, never in the hero.

## 2. Colors: The Coral and Theater Palette

Two grounds, coral and theater, and one ink for each. Coral carries the hero; the theater carries the product.

### Primary
- **Claw Coral** (coral): the hero field, the final call to action's field, primary buttons on dark, the selected System Window tab, focus on dark and live agent states. It is the app's `coral-primary`, the same value.
- **Coral Ink** (coral-ink): every word on the coral field, and the primary button that sits on it. 5.8:1 on coral; white on coral is 2.8:1 and fails. It is the app's `on-coral`.
- **Bright Coral** (coral-bright): hover for coral actions, the focus ring on dark, kickers and inline accents on the theater.

### Secondary
- **Ember** (ember): the 2 px edge of a dangerous state (the registry's blocked badge). Never a fill under text.
- **Amber** (amber): only the warm end of the mark's claw gradient.
- **Signal Green** (success): semantic status only (the window's live dot, a passing check).

### Neutral
- **Night** (night): the page canvas and the header, and `theme-color`.
- **Night Soft** (night-soft) and **Well** (well): one step lighter for alternating bands, and one darker for command blocks sunk below the canvas.
- **Theater** (theater): the System Window's shell and screenshot frame, and the band the window lands in below Home's coral field. 16.3:1 under ink; coral on it is 6.6:1.
- **Theater High** (theater-high): raised controls and hovered rows on the theater: secondary buttons, the current header link, the registry's caution badge.
- **Surface** (surface): quiet resting surfaces, such as secondary buttons and app cards.
- **Line** (line) and **Line Strong** (line-strong): hairlines between sections, and borders on controls and frames.
- **Ink** (ink), **Ink Soft** (ink-soft), **Ink Muted** (ink-muted): text on dark, by emphasis. Muted is the floor for running text (5.8:1 on the theater).

### Named Rules
**The Dark Ink on Coral Rule.** Text, icons and focus rings on the coral field are coral ink. Never white, never coral on coral, never a gray.

**The One Field Rule.** A page has at most one coral field at a time on screen, and it never fills the first viewport by itself.

**The Coral Means Something Rule.** Off the field, coral is an action, a selection, focus or a live agent. Decoration in coral is prohibited.

## 3. Typography

**Display Font:** DM Sans Variable (with DM Sans, system-ui)
**Body Font:** DM Sans Variable
**Label/Mono Font:** JetBrains Mono Variable, for real commands, paths and provider names only

**Character:** One family, already part of PersonalClaw's product identity, with weight doing the expressive work: light, wide display type on the coral field, plain 17 px body on the theater.

### Hierarchy
- **Display** (300, the display role, 0.96): the wordmark in the hero. In the hero it is also capped by its column (16cqi), because "PersonalClaw" is one word, about 6em wide, that must never break.
- **Headline** (380, the heading role, 1.02): section headings.
- **Title** (500, the title role, 1.15): sub-section and card titles.
- **Body** (400, 17 px, 1.65): running text, at 68 characters or less.
- **Label** (550, 15 px, 1.3): navigation, buttons and short labels, in sentence case.
- **Mono** (450, 14 px, 1.6): commands and paths.

The display and heading floors are capped by the screen's width as well as the text size (`min(3.5rem, 14vw)`, `min(2.25rem, 9vw)`), so at 200% text on a 320 px phone a heading's longest word still fits its line. Letter spacing is `0`; the display floor is no tighter than `-0.03em`.

### Named Rules
**The Sentence Case Rule.** No all-caps eyebrows, no tracked kicker above every section, no single accented word in a headline.

## 4. Elevation

The system is flat and tonal: depth comes from the step between night, theater and theater high, and from hairlines. There is one shadow that means something: the System Window's, because it is the one object that sits above two grounds at once.

### Shadow Vocabulary
- **Window on dark** (`box-shadow: 0 40px 100px rgba(0, 0, 0, 0.48)`): the System Window anywhere on the theater.
- **Window on coral** (`box-shadow: 0 32px 80px` coral ink at 45%): the hero's window, where a black shadow would muddy the field.

### Named Rules
**The No Glow Rule.** No glow, no coloured blur halos, no glass cards. The window's own blurred caption is the only backdrop filter, and it sits over a capture.

## 5. Components

### Buttons
- **Shape:** a full pill (999 px), 48 px tall, label weight 650.
- **Primary on dark:** coral fill, night label.
- **Primary on coral:** coral-ink fill with a coral label (5.8:1), because a coral button would vanish on the field. Hover deepens it to night with a bright-coral label.
- **Secondary:** a surface fill with a strong line; hover raises it to theater high.
- **Quiet link on coral:** coral-ink text, underlined, with a leading icon: "Watch the tour".
- **Keycaps:** a key named in copy (`⌘`, `Enter`) sits in a small cap with 4 px corners, a strong line and theater high, in mono.
- **Hover / Focus:** 160 ms colour transitions and a 2 px lift. Focus is a 2 px ring offset 3 px, bright coral on dark and coral ink on the coral field.
- No arrow is glued to a label.

### Navigation
- The header is night at 86% with a blur, sticky, with Product, Apps, Security, Docs and Release, and a quiet GitHub link on the right. No primary button in it.
- The current link sits on theater high; under forced colours it is underlined. On phones the same links live in a menu that opens and closes with focus restored.

### Cards / Containers
- Cards are only for app entries and compact facts: 8 px corners, surface fill, a line border, no shadow. Cards never nest, and sections stay unframed.

### System Window (signature)
- A dark frame (theater, 8 px corners, line-strong border) with a bar of window controls, a pill tab strip and a live status, over one real capture at 16:9.6.
- Tabs switch captures in 240 ms; the selected tab is a coral pill with night text, and its view is kept in the URL (`?view=`). Arrow, Home and End move between tabs; tab labels never break, and the strip scrolls on phones.
- In the hero it sits in the copy's right-hand seven columns on desktop and below the copy on phones, and reaches past the coral field's lower edge by `clamp(6.5rem, 13vw, 12.5rem)` into the theater.

### Hero
- The coral field holds the mark (in coral ink, from the source SVG), the wordmark, the line "One agentic OS. Your machine. Your rules.", one plain sentence, the primary action "Install PersonalClaw" (it opens the install panel) and "Watch the tour". No version label and no facts in it.
- The window's lower half lands on the theater, where Home's first chapter, the trust rows, begins beside it. Trust facts never sit in the hero as bare chips: each is a row with its evidence and the release it was checked at.

### Install panel
- A native popover, not a modal: Escape and a click outside close it, focus starts on its heading and returns to the button that opened it, and it opens with no script.
- Three numbered steps, the one numbered list on Home because the order is the safety: download (runs nothing), check (the SHA-256, a pasteable check, the signature state, platforms, the Python, and the whole script behind "Read the script"), then run, with the pre-1.0 snapshot line.
- Night soft, 8 px corners, a strong line and the raised-frame shadow; every command in a well with its copy button.

## 6. Do's and Don'ts

### Do:
- **Do** put the proposition, a real System Window capture and the install action inside the first viewport at 1440 x 900 and 390 x 844, with the window crossing from coral into the theater.
- **Do** set every word on coral in coral ink (5.8:1), and measure any new pair before it ships.
- **Do** show real captures from core's capture pipeline, one dominant capture per section.
- **Do** keep coral for actions, selection, focus and live agents once the field ends.
- **Do** take every number and version from `releaseFacts`.

### Don't:
- **Don't** open with a full-screen coral preamble that pushes the product proof below the fold.
- **Don't** put white or coral text on the coral field.
- **Don't** use glow, purple or blue gradients, gradient text, all-caps eyebrows, numbered section labels, arrows glued to links, three equal cards, stat tiles, arrow chains, or a version label in the hero.
- **Don't** fake product UI, use stock photography, hand-draw decorative SVG, or rasterize marketing copy.
- **Don't** hide content behind an entrance animation; a paused animation must still show the page.
- **Don't** look like a hosted chat wrapper or generic AI-tool marketing, and don't fall back to the near-black-plus-one-accent look the coral field exists to leave.
