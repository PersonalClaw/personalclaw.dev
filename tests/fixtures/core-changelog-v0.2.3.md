# Changelog

All notable changes to PersonalClaw are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The in-app Updates panel reads this file (`GET /api/changelog`) to show "what's new."

## [Unreleased]

## [0.2.3] — 2026-10-19

A patch release on 0.2.2. ⌘Enter approves only the approval that has keyboard focus, and a delete,
a change outside the chat's folder, a send to other people, spending, or a call to a tool that
doesn't say what it does asks once more first, on every surface. Each reply shows a small orb for
what its agent is doing, focus mode (⌘\) and reading mode (⌘⇧.) clear the screen, and a chat or an
agent can take a terse or a conversational reply style. `personalclaw://` links open the desktop app
on a page and never act. The dashboard API is version 2, so a client built for version 1 is refused.
It installs over 0.2.2.

### Added

- **Focus mode (⌘\) hides the sidebar and side pane; reading mode (⌘⇧.) folds the composer.**

## [0.2.2] — 2026-10-18

A patch release on 0.2.1. A long shell command, such as one that writes a file from a here-document,
is checked in a fraction of a second instead of holding up every chat while it is checked; an
agent's command that only mentions "push" is no longer refused as one; a message sent while a turn
runs is no longer stopped after 10 minutes; and an answered approval or a Stop takes effect at once.
The default look no longer animates its backdrop, Home shows only what waits on you, and the
machine's telemetry moves to Settings › System. It installs over 0.2.1; a git clone that uv
installed needs uv 0.13.1 or newer to update, which `uv self update` gets.

### Fixed

- **An agent's shell command is no longer refused as a push when it only reads text that says "push", such as a search of your workflow files, or when the word is in a commit, tag, merge, note or stash message given with `-m` or `--message`. A message given in a here-document, and any other git argument or word containing "push", are still refused, and so is a real push unless you allow pushes in Settings → Security.**

## [0.2.1] — 2026-10-15

A patch release on 0.2.0. On Linux an agent on an agent CLI can save your automations,
callbacks and overview tiles, math is drawn as written again, and a few labels and counts say
what they mean. The release attaches its Linux AppImage, its deb and an SBOM of the wheel, and
its wheel and sdist get GitHub's build-provenance attestation, none of which 0.2.0 had. The
dependencies are up to date, and the updates that close published advisories are listed under
Security. It installs over 0.2.0 with nothing to do first.

### Fixed

- **A release attaches its Linux AppImage and deb: the release's check of the deb no longer fails a good package, which in 0.2.0 stopped the GitHub Release from being created.**

## [0.2.0] — 2026-10-07

The first release since 0.1.3, and its theme is **work that answers to you**. Controls do what
their labels say, and a number nobody measured says so instead of showing `0`. Work nobody watches
(an automation, a loop, an agent CLI, an app) runs only on the approvals, budgets and workflow
versions you gave it, and an app is refused what only you may decide. What someone else brings in,
from a shared thread, a correspondent's mail or a program, can neither use your trust nor become
your memory, and an Incognito or Temporary chat's words are kept nowhere but its transcript. It is
a pre-1.0 clean break with no automatic migration: run `personalclaw snapshot` and read
[Updating](https://github.com/PersonalClaw/PersonalClaw/blob/v0.2.0/docs/guides/getting-started.md#updating) before you upgrade.

### Highlights

- **Updates track releases, not `main` — and the update you get is the one you chose.**
