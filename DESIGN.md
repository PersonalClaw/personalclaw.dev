---
name: PersonalClaw
description: An immersive product theater for the self-hosted agentic operating system
colors:
  night: "#0b0c0d"
  night-soft: "#101112"
  surface: "#171819"
  surface-high: "#202224"
  line: "#343638"
  ink: "#f2f1ed"
  ink-soft: "#c4c4bf"
  ink-muted: "#92938f"
  coral: "#ff6b5b"
  coral-bright: "#ff937d"
  ember: "#bd4537"
  amber: "#ffb454"
  success: "#57c989"
typography:
  display:
    fontFamily: "DM Sans Variable, DM Sans, system-ui, sans-serif"
    fontSize: "clamp(3.5rem, 10vw, 6rem)"
    fontWeight: 300
    lineHeight: 0.96
  heading:
    fontFamily: "DM Sans Variable, DM Sans, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 4.5rem)"
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
  primary-cta:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.night}"
    rounded: "{rounded.control}"
    minHeight: "48px"
  secondary-cta:
    backgroundColor: "{colors.surface-high}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    minHeight: "48px"
  media-frame:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.media}"
  focus-ring:
    color: "{colors.coral-bright}"
    width: "2px"
---

# Design System: PersonalClaw Marketing

## Creative North Star

**The Friendly Machine, Seen at Work**

The website is the public window into PersonalClaw's night studio. The interface is not represented by an abstract AI illustration or a fabricated dashboard. Real product captures form a continuous visual field, and the warm claw signal moves through them only when the system is active.

The physical scene is a technical owner at a personal desk after dark, moving between an editor, terminal, and PersonalClaw while autonomous work continues in view. This forces a dark-first site and makes the existing dark product captures the natural material.

## Color Strategy

The site uses a **Committed** color strategy. Near-black surfaces establish the studio; coral carries roughly one third of the visible color in hero actions, active controls, and selected system paths. Amber is only the end of the existing claw gradient. Green is semantic status only.

Neutrals stay close to true gray with a slight red tint for cohesion. There are no blue-slate sections, purple glows, cream paper surfaces, or decorative multicolor gradients.

## Typography

DM Sans remains because it is already embedded in PersonalClaw's product identity. Marketing scale comes from its variable weight and wide display range rather than adding a fashionable second family. JetBrains Mono is limited to real commands, paths, provider names, and architecture labels.

Display copy uses lighter fractional weights and solid color. Body copy stays at 17px with a maximum measure of 68 characters. Letter spacing is `0`; the display floor is no tighter than `-0.03em`.

## Layout

The page uses a 12-column content grid inside a maximum 1440px shell, but the hero and key media can break to the viewport edge. Section rhythm alternates between:

1. Full-bleed product theater.
2. Anchored narrative with one dominant capture.
3. Horizontal system maps with compact evidence.
4. Dense but unboxed app directories.
5. A direct quickstart and candid release note.

Cards are reserved for distinct app entries and compact facts. Sections remain unframed. Cards never nest.

### Hero Wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ mark  Product  Apps  Security                     GitHub     │
│                                                              │
│ PERSONALCLAW                                                 │
│ One agentic OS.                                              │
│ Your machine. Your rules.                                    │
│ [Get PersonalClaw] [Explore the system]                       │
│                                                              │
│       actual dashboard capture fills the visual field         │
│                 Home  Chat  Loops  Knowledge  Apps            │
└──────────────────────────────────────────────────────────────┘
```

### Narrative Wireframe

```text
copy anchor  ┃  one large product capture
             ┃  focused annotations tied to real capability
─────────────┻────────────────────────────────────────────────
full-width system relationship or app directory
```

## Signature

The **System Window** is the memorable element. In the hero, a segmented control swaps between verified Home, Chat, Loops, Knowledge, and Apps captures. The transition uses a brief masked dissolve and a restrained coral activity trace. The default state is already visible, keyboard controls work as tabs, and reduced motion switches instantly.

## Motion

One orchestrated entrance establishes the mark, headline, CTA, and active system window. After that, motion is functional:

- 160ms control feedback.
- 240ms tab state transitions.
- 450-650ms media reveals only when they communicate a narrative shift.
- Intersection Observer for one-time reveals; no raw scroll listeners.
- Transform, opacity, and bounded mask/filter effects only.

Every motion path has a no-motion equivalent.

## Responsive Behavior

- Mobile starts as a single-column composition with a compact menu and full-width media.
- The hero remains below `100dvh` enough to reveal the next section.
- Product captures preserve a stable 8:5 aspect ratio and may crop toward the active work area on narrow screens.
- App categories become horizontally scrollable filter controls and a single-column directory.
- The architecture path reflows from horizontal to vertical while preserving order.
- All labels and CTA text stay on one line; no content depends on hover.

## Imagery

All product imagery comes from the core repository's reproducible capture pipeline. The brand mark uses its source SVG. Images are copied into the marketing repository, imported through Astro assets, and optimized into responsive formats.

No fake product UI, stock photography, hand-drawn decorative SVG, or rasterized marketing copy.

## Content Voice

Use active, concrete language: "Run agents", "Pause a loop", "Install an app", "Keep state on your machine." Avoid "revolutionize", "seamless", "unleash", and other generic AI claims.

The site names current limitations. Pre-1.0 status appears near installation guidance, not as hero decoration.
