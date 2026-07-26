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
| `../scripts/validate-marketing-manifest.mjs` | Enforces manifest↔repo consistency (every shipping shot's asset exists; no orphan `src/assets/*.png`; placement files real). Runs inside `test:static` → the pre-push gate. |

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
empty dev home used for behavior validation. Clone the working dev home rather than
re-configuring providers from scratch:

```sh
# from the CORE repo (PersonalClaw/), against the RELEASED tag checkout:
cp -R .dev-home .screenshot-home
PERSONALCLAW_HOME="$PWD/.screenshot-home" PERSONALCLAW_AUTH_MODE=none \
  .venv/bin/personalclaw gateway --no-open --port 10001
```

Cloning inherits the already-configured providers (ollama chat, faster-whisper stt, model
bindings), so no re-wiring. It also keeps marketing data out of the `:10000` validation
instance. (Voice sidecars may be per-instance; if a voice surface is ever shot and
contends, briefly stop `:10000` for that capture. Chat via ollama is shared-service safe.)

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

There is intentionally **no Playwright capture script**: faithful real-world data seeding
can't be scripted reliably, and the manifest gives the reproducibility. Capture is done by
the agent/operator driving the seeded instance per the manifest.

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

### 7. Re-baseline the site visual regression (BOTH platforms)

Swapping app imagery changes the site's own full-page snapshots — an **intentional**
baseline update. The baselines are platform-qualified (macOS dev + Linux CI); update both
or CI fails. **Never** weaken the gate (no threshold bump, no platform-set deletion).

1. On macOS (Node 22.12.0 + Chromium installed): `npm run test:visual:update` — regenerates
   the 15 `*-darwin.png` baselines. Inspect the diffs; accept only intended changes.
2. Push the branch, dispatch the **"Refresh visual baselines"** workflow
   (`.github/workflows/visual-baselines.yml`) on it → download the `visual-baselines`
   artifact → commit the regenerated 15 `*-linux.png` files.
3. `npm run validate:visual-baselines` must report exactly 30 baselines, no missing/orphaned.

### 8. Full gate + PR

Run the complete local gate under the pinned Node (mirrors CI):
```sh
mise exec node@22.12.0 -- sh -c 'npm ci && npm run test:ci'
```
`test:ci` = `test:static` (validates the marketing manifest + visual baselines, builds,
validates build/preview) + the full Playwright browser suite (visual regression + a11y) +
Lighthouse. All green → open the PR. Do not push/PR unless told.

## Why this shape

- **Manifest-first** makes the update definitive and reviewable: the diff to
  `screenshots.manifest.json` *is* the plan for the release's marketing change.
- **Validated** so it can't drift from the site (`validate:marketing-manifest` in the gate).
- **Reproducible** by any agent following steps 2–8, because the what/where/why is data,
  not tribal knowledge.
- **Honest**: shots depict released state (tag-gated), and the visual gate stays strict.
