# Design skills, pinned

The design skills [`SITE-REDESIGN.md`](../../SITE-REDESIGN.md) names, each pinned to a commit.
Nothing is vendored: this file is the only thing in `.agents/skills/`. Each skill is installed per
machine at its pin, the way core holds its review skills ([core `web/REDESIGN.md`
§2](https://github.com/PersonalClaw/PersonalClaw/blob/v0.2.3/web/REDESIGN.md#2-review-skills-and-on-what)).

## How they are held

- **Per machine, with `-g`.** The installer is `skills` 1.7.2 on npm (`github.com/vercel-labs/skills`,
  tag `v1.7.2`, commit `671e8c320810d36fed80fac5f1a2c1bf7e82d812`, MIT). It takes a full commit
  after `#` and matches `--skill` against the `name` in each `SKILL.md`. With `-g` a skill goes in
  the user's own agent folders and the installer's lock in their home (`~/.agents/.skill-lock.json`).
  Without `-g` it copies the skill into this repository's `.agents/skills/<name>/`, links it into
  agent folders such as `.claude/skills/`, and writes `skills-lock.json` at the root. That is
  vendoring, so none of it is committed.
- **With `DO_NOT_TRACK=1`.** The installer reports each install to `skills.sh`, Impeccable reports
  which design direction won a round, and the Hyperframes CLI and `media-use` send usage events to
  PostHog. `DO_NOT_TRACK=1` turns all four off. The Hyperframes CLI also checks npm for a newer
  release, installs one on its own when installed globally, and checks GitHub for newer skills,
  none of which `DO_NOT_TRACK` stops, so it always runs as
  `DO_NOT_TRACK=1 HYPERFRAMES_NO_TELEMETRY=1 HYPERFRAMES_NO_UPDATE_CHECK=1 HYPERFRAMES_NO_AUTO_INSTALL=1 HYPERFRAMES_SKIP_SKILLS=1`
  (`scripts/render-videos.mjs` sets all five).
- **At the pin, and nowhere else.** No row names a branch or "latest". Raising a pin is a change to
  this file: the new commit, its licence read at that commit, and a new network scan. Impeccable
  runs as `npx impeccable@4.6.0` and the Hyperframes CLI as `npx hyperframes@0.8.186`, the releases
  the pins match.
- **The CLI is the pinned tarball.** `npx hyperframes@0.8.186` is fetched once into npx's cache,
  under the five opt-outs above, as a step the maintainer approves, and `scripts/render-videos.mjs`
  only ever runs it with `--no-install`. Before it runs, the script reads the `package-lock.json`
  npm wrote beside every cached copy of that release and fails unless each one was installed from
  the registry's tarball with the integrity in the pin row below.
- **One limit: the CLI's own dependencies are not pinned.** npx resolved the CLI's 123 dependencies
  from its `package.json` ranges when it was fetched, with no lockfile of ours, so the integrity
  check covers the CLI's own tarball and not them. The check also reads npm's install record (the
  `package-lock.json`), not the files on disk, so a file changed after the fetch is not caught. It
  is a local authoring tool: it never runs in CI, and nothing it installs ships with the site, only
  the videos it renders, each reviewed frame by frame.
- **The local tools the renderer needs.** `ffmpeg` and `ffprobe` (FFmpeg: Homebrew's `ffmpeg` on
  macOS, the distribution's `ffmpeg` package on Linux), `cwebp` (libwebp: Homebrew's `webp` on
  macOS, the `webp` package on Debian and Ubuntu), and a Chrome the CLI finds (the system Google
  Chrome on the machine that made them; `hyperframes browser ensure` downloads one and is not run).
  `cwebp` encodes the posters, because FFmpeg builds often carry no WebP encoder: Homebrew's FFmpeg
  9.0.2 has none. They were FFmpeg 9.0.2 and libwebp 1.6.0 on 2026-10-22. Nothing here installs
  them; `render:videos` names any that is missing and stops.
- **No skill moves its own pin.** The Hyperframes skills offer `npx hyperframes skills update`,
  `npx skills add heygen-com/hyperframes --all` and `npx hyperframes@latest upgrade --project .`,
  and `hyperframes init` always runs an unpinned `npx skills add` of the repository's `main` into
  every agent's global folder. Decline all of them, and never run `init`: a composition is written
  by hand under `marketing/compositions/<id>/`, which the skill's own `format.md` allows (#94). Nor
  run what the skills ask for on their own: `hyperframes usage` (it reads the agent's sign-in to
  ask its provider for plan usage), `feedback` and `--search-miss` reports, `catch-up`, `publish`
  or `cloud render`.
- **Read in full before first use.** A skill is instructions an agent follows. The PR that first
  uses a skill here reads every instruction file and script it ships at its pin, refuses anything
  that tracks without an opt-out, and puts the date in **Read in full**.

## The pins

Every commit and licence below was read through the GitHub API on 2026-10-20. Four rows reuse
core's pins, whose licences core read on 2026-10-18.

| Skill | Used for | Source and commit | Licence at that commit | Read in full |
|---|---|---|---|---|
| Impeccable | System of record: `craft`, `critique`, `audit`, `polish`, `document` | `github.com/pbakaus/impeccable`, release 4.6.0, `8a0e198da34ebc5b936a9d5975fb7a3b1cf353b7` (2026-10-15), core's pin | Apache-2.0 (`LICENSE`) | not yet |
| frontend-design | Direction | `github.com/anthropics/skills`, `skills/frontend-design`, `dbd4588f9e1033efb41dad4bef2f7947c8993d44` (2026-10-09), core's pin | Apache-2.0 (`skills/frontend-design/LICENSE.txt`); no licence file at the repository root | not yet |
| design-taste-frontend | The anti-generic gate: pre-flight, AI tells, dials | `github.com/leonxlnx/taste-skill`, `skills/taste-skill`, `d237dd399d57524945c0c81327da5da19f7a468d` (2026-10-11), the last commit before v2 replaced it | MIT (`LICENSE`) | not yet |
| redesign-existing-projects | The audit (#86) | Same repository and commit, `skills/redesign-skill` | MIT (`LICENSE`) | 2026-10-20 (its one file, `SKILL.md`; no scripts, nothing that tracks) |
| ui-ux-pro-max | UX rulebook, accessibility first | `github.com/nextlevelbuilder/ui-ux-pro-max-skill`, `.claude/skills/ui-ux-pro-max`, `56ea9cf174ed86786187daa9de0e6247cb0747e4` (2026-10-15) | MIT (`LICENSE`) | not yet |
| web-design-guidelines | `file:line` review of changed files | `github.com/vercel-labs/agent-skills`, `skills/web-design-guidelines`, `063bee94c3f4df8453406c830b0a7df0f2860278` (2026-08-28); its rules, `github.com/vercel-labs/web-interface-guidelines`, `434b7f91364665f2f733b310ec54809bf8f37937` (2026-10-05); core's pins | The skill: MIT, stated in its repository's README, which has no licence file at that commit. The rules: MIT (`LICENSE`). | not yet |
| `emil-design-eng`, `review-animations` | Motion review of every animation change | `github.com/emilkowalski/skills`, `2d228630ba1446365f614a108cb8252f1feda202` (2026-10-11), core's pin | MIT (`LICENSE`) | not yet |
| webapp-testing | Driving Playwright against a changed page | `github.com/anthropics/skills`, `skills/webapp-testing`, `dbd4588f9e1033efb41dad4bef2f7947c8993d44`, the frontend-design commit | Apache-2.0 (`skills/webapp-testing/LICENSE.txt`) | not yet |
| `copywriting`, `cro`, `seo-audit`, `ai-seo`, `schema` | Copy and search (#98) | `github.com/coreyhaines31/marketingskills`, release v2.13.0, `e85f3cbc2e4a79bf33b2a12e9bdd9087d414735b` (2026-10-19) | MIT (`LICENSE`) | not yet |
| `hyperframes`, `hyperframes-cli`, `hyperframes-registry`, `media-use` | Video (#94 to #97) | `github.com/heygen-com/hyperframes`, release v0.8.186, `bbf9f8ffd0b2faa5edca9852c5528c5312f6c57e` (2026-10-22). Raised from v0.8.181 (`ae02e5ac`) on 2026-10-22: the installer put v0.8.186's skills on the machine, where `hyperframes-core`, `-animation`, `-keyframes`, `product-launch-video` and `pr-to-video` are folded into the first three. The copy installed on 2026-10-22 is `main` at `821003b112cfed528cabb46b8cb66213e85d28fa`, one line past the tag (a motion-blur note in `skills/hyperframes/references/motion.md`). The CLI: `hyperframes@0.8.186` on npm, tarball `https://registry.npmjs.org/hyperframes/-/hyperframes-0.8.186.tgz`, `dist.integrity` `sha512-JcBRmBdr955LU40+yWarQFL6c3MLeuJqPnYW9tFCS7yLiQGbB5YyoOuhJw5VaDbNHkmM0afn77Dlup5d2q3Anw==`, read from the registry and from npx's cached lock on 2026-10-22 | Apache-2.0 (`LICENSE`, read at `bbf9f8ff` on 2026-10-22) | 2026-10-22, every file of all seven skills the release ships (these four, and `figma`, `remotion-to-hyperframes` and `slideshow`, installed with them and not used), and the CLI's telemetry, update and install code in `packages/cli` |
| brag | The release clip (#97) | `github.com/latent-spaces/brag`, `skills/brag`, `069432cac935ed1895859df201c31436c07fb74e` (2026-10-13), after tag v0.3.0 | MIT (`LICENSE`); its bundled music and sound effects are third-party and not used until their terms are checked | not yet |

**Not pinned:** ui-taste. It is distributed from `uizze.sh`, a website rather than a Git repository,
so there is no commit to pin, and it is left out.

## What each one reaches

From a scan of each skill's files at its pin on 2026-10-20 (URLs, fetch calls, package runs, keys
and telemetry), not a full read. A skill may make public, keyless reads only, and is
never given a key for a hosted model or voice service ([decided on
2026-10-20](../../SITE-REDESIGN.md#decided-on-2026-10-20)).

- **Impeccable:** runs from npm. Its engine binary downloads into `~/.impeccable/bin/` on first run
  unless it ships beside the launcher. It reports which design direction won a round to
  `impeccable.style` unless `DO_NOT_TRACK=1` or `IMPECCABLE_NO_TELEMETRY=1`. `install` also sets up
  its design hook, in the user's settings for some agents and in the project for others. This
  repository's Impeccable files (`.impeccable/config.json` and any project hook) arrive with the PR
  that first sets Impeccable up here.
- **frontend-design, `emil-design-eng`, `review-animations`, `redesign-existing-projects`:**
  instructions only. Nothing found.
- **design-taste-frontend:** instructions only. It points at design-system packages, an icon CDN and
  placeholder photos (`picsum.photos`), none of which the site uses.
- **ui-ux-pro-max:** a local Python search over data bundled with the skill. Nothing found.
- **web-design-guidelines:** fetches `command.md` from the rules repository each time it runs. A
  review reads the rules at their pin instead:
  `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/434b7f91364665f2f733b310ec54809bf8f37937/command.md`.
- **webapp-testing:** Python Playwright against `localhost`, through its `scripts/with_server.py`.
  Nothing else found.
- **The marketingskills five:** instructions only. `seo-audit` and `ai-seo` have the agent fetch the
  page being audited, and `ai-seo` suggests outside scoring tools (`npx is-agentic`) and paid
  AI-visibility services.
- **`hyperframes`, `hyperframes-cli`, `hyperframes-registry`** (read in full at v0.8.186 on
  2026-10-22): run the Hyperframes CLI from npm, which sends usage events, with the machine's CPU,
  memory and OS, to PostHog unless `DO_NOT_TRACK=1` or `HYPERFRAMES_NO_TELEMETRY=1`. With telemetry
  off it still checks npm for a newer release every 24 hours (`HYPERFRAMES_NO_UPDATE_CHECK=1`),
  installs one when installed globally (`HYPERFRAMES_NO_AUTO_INSTALL=1`), and checks GitHub for
  newer skills (`HYPERFRAMES_SKIP_SKILLS=1`). `usage` reads Claude, Codex or Grok sign-ins and asks
  the provider for plan usage. `cloud render` and `publish` upload a project to HeyGen. The
  registry's manifest and blocks are read from `main`, not the pin, so no block is added from it.
  `capture` fetches the page it is pointed at and captions images through OpenRouter or Gemini
  when a key is set. `preview` serves on port 3002. The skills' templates load GSAP and three.js
  from `cdn.jsdelivr.net` and fonts from Google; the site's compositions load nothing from the
  network, since a render may not.
- **`figma`, `remotion-to-hyperframes`, `slideshow`** (installed with the four, not used): Figma's
  API with a personal token; a test corpus that runs `npm install` without a lockfile when started
  by hand; and a presenter server that listens on every interface.
- **`media-use`** (read in full at v0.8.186 on 2026-10-22): HeyGen's catalog, voices and avatars
  when a credential is found, including a `.env` up to five folders up, with every call marked as
  `media-use` server-side; Openverse for every sound effect, with no offline switch; ElevenLabs or
  Gemini (Lyria) as soon as their keys are set; models downloaded on first use; a silent
  `pip install` into the user's Python for generated music; and PostHog events that identify a
  HeyGen sign-in, off with `DO_NOT_TRACK=1`. Its 19 bundled sound effects are under the Pixabay
  Content License (`audio/assets/sfx/CREDITS.md`), with no per-file source. The site's videos
  carry no audio (#94), so `media-use` is not run.
- **brag:** runs the Hyperframes CLI (checks, voice, beat detection); nothing fetched by its own
  files. Its music is a series from ende.app, and its music README asks for the exact licence terms
  to be verified before publishing. Its sound effects credit Kenney.

## Install

On each machine that works on the redesign, run these outside this clone, so nothing lands in it:

```sh
export DO_NOT_TRACK=1
npx impeccable@4.6.0 install --scope=global
npx skills@1.7.2 add anthropics/skills#dbd4588f9e1033efb41dad4bef2f7947c8993d44 --skill frontend-design --skill webapp-testing -g
npx skills@1.7.2 add leonxlnx/taste-skill#d237dd399d57524945c0c81327da5da19f7a468d --skill design-taste-frontend --skill redesign-existing-projects -g
npx skills@1.7.2 add nextlevelbuilder/ui-ux-pro-max-skill#56ea9cf174ed86786187daa9de0e6247cb0747e4 --skill ui-ux-pro-max -g
npx skills@1.7.2 add vercel-labs/agent-skills#063bee94c3f4df8453406c830b0a7df0f2860278 --skill web-design-guidelines -g
npx skills@1.7.2 add emilkowalski/skills#2d228630ba1446365f614a108cb8252f1feda202 --skill emil-design-eng --skill review-animations -g
npx skills@1.7.2 add coreyhaines31/marketingskills#e85f3cbc2e4a79bf33b2a12e9bdd9087d414735b --skill copywriting --skill cro --skill seo-audit --skill ai-seo --skill schema -g
npx skills@1.7.2 add heygen-com/hyperframes#bbf9f8ffd0b2faa5edca9852c5528c5312f6c57e --skill hyperframes --skill hyperframes-cli --skill hyperframes-registry --skill media-use -g
npx skills@1.7.2 add latent-spaces/brag#069432cac935ed1895859df201c31436c07fb74e --skill brag -g
```
