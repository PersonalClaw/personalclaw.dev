# Marketing update framework — screenshots + content per release

This directory is the **manifest-driven framework** for refreshing the marketing site
each time a PersonalClaw release ships. The problem it solves: every release we want
updated application screenshots and marketing copy, produced in a **predictable,
definitive, reproducible** way — not by remembering what changed.

The manifest is the single source of truth. You **update it first** (add new
features/views, adjust scenarios + copy), then it drives the recapture + content
refresh — executable by the main agent or a subagent with these instructions.

## The pieces

| File | Role |
|---|---|
| `screenshots.manifest.json` | The contract: every shot → the real-world scenario to seed, the app view to capture, the exact image spec, and the site placements + copy it drives. |
| `screenshots.schema.json` | JSON Schema the manifest validates against (`npm run validate:marketing-manifest`). |
| `../scripts/validate-marketing-manifest.mjs` | Enforces manifest↔repo consistency (every shipping shot's asset exists; no orphan `src/assets/*.png`; placement files real; every shipping video's output, poster and captions exist and its output fits its byte budget; no orphan `public/media/` file). Runs inside `test:static` → the pre-push gate. |
| `../src/components/LoopVideo.astro` and `loop-video.mjs` | The one loop player: a `videos` entry by id, its poster first, a visible play and pause, paused offscreen and while the page is hidden, and only the poster under reduced motion or data saver. `tests/browser/loop-video.spec.ts` holds it. |

**Videos** (#94) are the manifest's `videos` list. Each entry names what it is made from
(`composition`, `sources`), the core release its captures show (`capturedAt`), its box (`width`,
`height`), its files under `public/media/` (`output`, `poster`, `captions`), its byte budget, its
autoplay policy and its no-media fallback, and where it plays. The policy is `none` (no byte
before its play control) or `idle-hint` (it may start once the page is idle, and only while
reduced motion and data saver are both off). No route loads a video byte while it loads
(Lighthouse's `media` budget is zero). Rendering compositions with Hyperframes (`render:videos`)
is not built yet: it waits on the Hyperframes install the brief leaves to the maintainer
(`.agents/skills/README.md`).

**Key rule:** every **shipping** shot is **re-captured every release** — there is no
"still current, skip it" state. Even a small UI shift changes a shot, so the whole
shipping set is re-shot against each `targetRelease`. A `new-needs-placement` shot is a
candidate awaiting a placement decision (its asset is captured once placed).

## Release-update procedure

Run this whenever a new PersonalClaw version is released and the site needs updating.
**Prerequisite: the target version must be an actual RELEASED tag** on both
`PersonalClaw/PersonalClaw` and `PersonalClaw/PersonalClawApps` — screenshots depict
released state, never an unmerged branch. (The site's `sources/` manifest fails closed
if the pinned tag doesn't resolve.)

### 1. Update the manifest (do this FIRST)

Edit `screenshots.manifest.json`:
- Set `targetRelease` to the new version (e.g. `0.1.3`).
- For **new features/views** shipped this release: add a shot (`status: "new-needs-placement"`),
  describe its `scenario` (what real-world data must be visible) and `value`. Decide with
  the owner where it goes on the site, add `placements`, then flip it to `shipping`.
- Adjust any `scenario`/`caption`/`alt`/`value` copy that the release changed.
- Retire shots no longer shown (`status: "retired"`, then remove the asset + placements).
- `npm run validate:marketing-manifest` must pass.

### 2. Stand up the seeded screenshot instance

Screenshots must show PersonalClaw **at its best with natural real-world data** — not the
empty dev home used for behavior validation, and never the install's own home. Seed core's
demo home into a scratch home and run a gateway for it on a free loopback port, as core's
[`docs/screenshots/CAPTURE.md`](https://github.com/PersonalClaw/PersonalClaw/blob/main/docs/screenshots/CAPTURE.md)
describes:

```sh
# against the RELEASED tag's install:
PERSONALCLAW_HOME=/tmp/pc-showcase personalclaw gateway --seed demo-home --seed-replace \
  --port 10021 --no-open --json-ready
```

The seed carries projects, tasks, knowledge documents and markdown memory, and binds no
model. Install a model app, bind chat, and bind embedding and speech-to-text too, so no
surface on screen is waiting on a model choice.

### 3. Seed the per-shot scenarios

For each `shipping` shot, seed the `scenario` data through the **real UI/API** so the
capture shows believable, in-use state (a real chat with tool use, a loop mid-run,
a populated knowledge graph, live automations, green Doctor health, etc.). This is the
step that can't be a dumb script — it's real interaction, done per the manifest's
`scenario` field. Seed a coherent power-user narrative across shots so the site reads as
one real workspace.

### 4. Capture

For each `shipping` shot, capture the `appView` at the manifest's dimensions:
- **Dark theme** (the site renders app imagery on a dark surface).
- **Exact 8:5 aspect ratio**, at least `minWidth`×`minHeight` (so no responsive variant
  upscales — the largest widths each placement requests are baked into `minWidth`).
- Save as **PNG** to the shot's `asset` path (`src/assets/<id>.png`), overwriting.

Seeding can't be scripted reliably, so the manifest gives the reproducibility. Photographing
can: `scripts/capture-app-shots.mjs` visits each `appView`, waits for it to settle and for
the gateway connection, and writes `marketing/.captures/<id>.png` for review. Promote a shot
into `src/assets/` only once it is reviewed:

```sh
PERSONALCLAW_TOKEN=… node scripts/capture-app-shots.mjs --base http://127.0.0.1:10021
```

### 5. Drop assets + update copy

- Overwrite the PNGs in `src/assets/` (same filenames — Astro regenerates all responsive
  WebP variants at build; no code change needed if the 8:5 ratio holds).
- Apply any copy changes: hero captions in `src/data/site.ts` (`productViews`), product/index
  alts inline at each placement's `file`.
- If a new shot got a placement, wire its `<Image>`/SystemWindow entry per the existing
  patterns in `src/pages/*.astro` / `src/components/SystemWindow.astro`.

### 6. Bump the source manifest to the released tag

Edit `../sources/personalclaw.sources.json`: set `core` and `apps` to the new
`{ commit, tag }` (the released `vX.Y.Z` and its commit sha). `npm run sync:sources`
re-derives the version label / app counts / release state from the tagged source and
**fails closed** if a tag doesn't resolve to its pinned commit.
Then `npm run record:release` records the release's assets (name, size and GitHub's SHA-256)
in the same manifest, for `/release`'s checksums and verify steps.

### 7. Re-baseline the site visual regression (in the pinned image)

Swapping app imagery changes the site's own full-page snapshots — an **intentional**
baseline update. There is one baseline set, `-linux`, made and compared inside the pinned
Playwright image (`tests/browser/visual-image.json`); no machine outside it makes or
compares one. **Never** weaken the gate (no threshold bump).

1. Push the branch, dispatch the **"Refresh visual baselines"** workflow
   (`.github/workflows/visual-baselines.yml`) on it → download the `visual-baselines`
   artifact → inspect the diffs, and commit the intended `*-linux.png` changes together
   with `visual-environment.json`.
2. `npm run validate:visual-baselines` must report exactly 15 linux baselines, no
   missing/orphaned.

### 8. Full gate + PR

Run the complete local gate under the pinned Node (mirrors CI):
```sh
npm run test:prepush
```
`test:ci` = `test:static` (validates the marketing manifest + visual baselines, builds,
validates build/preview) + the Playwright browser suite (a11y, behavior; not the pixel
comparison, which CI's browser job runs in the pinned image) + Lighthouse. All green →
open the PR. Do not push/PR unless told.

## Why this shape

- **Manifest-first** makes the update definitive and reviewable: the diff to
  `screenshots.manifest.json` *is* the plan for the release's marketing change.
- **Validated** so it can't drift from the site (`validate:marketing-manifest` in the gate).
- **Reproducible** by any agent following steps 2–8, because the what/where/why is data,
  not tribal knowledge.
- **Honest**: shots depict released state (tag-gated), and the visual gate stays strict.
