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
  PostHog. `DO_NOT_TRACK=1` turns all four off.
- **At the pin, and nowhere else.** No row names a branch or "latest". Raising a pin is a change to
  this file: the new commit, its licence read at that commit, and a new network scan. Impeccable
  runs as `npx impeccable@4.6.0` and the Hyperframes CLI as `npx hyperframes@0.8.181`, the releases
  the pins match.
- **No skill moves its own pin.** `product-launch-video` and `pr-to-video` open by offering to run
  `npx hyperframes skills update`, `hyperframes init` updates any global skill that is behind its
  latest on GitHub, and `hyperframes-animation` suggests installing `pixel-point/animate-text`.
  Decline all three. #94 works out how a video project is created without moving the pins.
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
| `hyperframes`, `hyperframes-core`, `hyperframes-animation`, `hyperframes-keyframes`, `media-use`, `product-launch-video`, `pr-to-video` | Video (#94 to #97) | `github.com/heygen-com/hyperframes`, release v0.8.181, `ae02e5aceff4742e5d72c20f0859eb3e6b449035` (2026-10-20) | Apache-2.0 (`LICENSE`) | not yet |
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
- **`hyperframes`, `hyperframes-core`, `hyperframes-keyframes`, `hyperframes-animation`:** run the
  Hyperframes CLI from npm, which sends usage events to PostHog unless `DO_NOT_TRACK=1` or
  `HYPERFRAMES_NO_TELEMETRY=1`. Its registry commands search and add blocks over the network. The
  compositions in the skills' examples load libraries from `cdn.jsdelivr.net`,
  `cdnjs.cloudflare.com` and `unpkg.com`.
- **`media-use`:** HeyGen's catalog, voices and avatars when signed in, with usage linked to the
  account; Openverse and Pixabay; ElevenLabs, Gemini (Lyria), OpenAI or Groq when their keys are
  set; voice, music and transcription models downloaded on first use; and its own PostHog usage
  events, off with `DO_NOT_TRACK=1`. Its bundled sound effects are under the Pixabay Content
  License (`audio/assets/sfx/CREDITS.md`).
- **`product-launch-video`, `pr-to-video`:** the Hyperframes CLI (page capture, voice, registry
  blocks) and `media-use`. `product-launch-video` sends captured images to Gemini or OpenRouter for
  captions when a key is set. `pr-to-video` reads the PR and its contributors' avatars from GitHub.
  Both route to Hyperframes skills not pinned here, such as `hyperframes-cli` and
  `hyperframes-registry`; adding one is a new row.
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
npx skills@1.7.2 add heygen-com/hyperframes#ae02e5aceff4742e5d72c20f0859eb3e6b449035 --skill hyperframes --skill hyperframes-core --skill hyperframes-animation --skill hyperframes-keyframes --skill media-use --skill product-launch-video --skill pr-to-video -g
npx skills@1.7.2 add latent-spaces/brag#069432cac935ed1895859df201c31436c07fb74e --skill brag -g
```
