# Release runbook — following a core release

The website is the public projection of a **released** PersonalClaw version. When
core publishes a release tag, this repository owes an update: the same version,
the same pinned commits, and refreshed release-sensitive content. This runbook is
the sequence; the checks that enforce it are listed at the end.

The rule in one line: **the website ships as the version it publishes.**
`package.json` version == the core tag in `sources/personalclaw.sources.json` ==
the `project.version` in core's `pyproject.toml`.

## Sequence

Core's `release.yml` runs first and owns the tag. Nothing here should run before
the core release is actually published (the tag must be pushed and its release
created), because every step below verifies against the published tag.

1. **Confirm core published.** The tag exists on the remote and its GitHub
   Release is created:

   ```bash
   git -C ../PersonalClaw ls-remote --tags origin | grep 'refs/tags/vX.Y.Z$'
   ```

2. **Re-pin the source manifest.** Edit `sources/personalclaw.sources.json`:
   set `channel: "released"`, and for both `core` and `apps` set `tag` to the new
   release and `commit` to the **commit** that tag resolves to. Tags in these
   repositories are often *annotated*, so the tag object's own SHA is not the
   commit — dereference it:

   ```bash
   git -C ../PersonalClaw rev-parse 'vX.Y.Z^{commit}'
   git -C ../PersonalClawApps rev-parse 'vX.Y.Z^{commit}'
   ```

   Pinning the tag object SHA instead of the commit is the classic mistake here;
   `validate:release-parity` and `sync:sources` both catch it.

   Then run the sync, and commit what it writes in the same change:

   ```bash
   npm run sync:sources
   ```

   It writes `public/install`, the installer served at `/install`, from the
   pinned commit's `deploy/website/install.sh`, and records the commit it read
   and the file's sha256 as `core.installCommit` and `core.installSha256`. Never
   edit `public/install` or those two fields by hand: a changed byte, or a pin
   moved without a sync, fails `validate:release-parity` offline.

   Then record the release's assets, for `/release`'s checksums and verify steps:

   ```bash
   npm run record:release
   ```

   It writes `core.releaseAssets`: each file attached to the pinned release, with
   its size and the SHA-256 GitHub records for it. A pin moved without a new
   record fails `validate:release-parity` offline, since the record names no
   wheel for the new version. A record that differs from the live release fails
   it online.

   `/release`'s attestation command names core's `.github/workflows/release.yml`
   as the signer and the pinned tag as the source ref, so the sync refuses a pin
   whose release workflow no longer attests build provenance on `v*` tags. After
   the record, download the new wheel and run the page's checksum and attestation
   steps against it.

   Check the registry pin in the same edit. `data.registry.commit` must be the
   registry's current commit (see [Between releases](#between-releases-the-registry)):

   ```bash
   git ls-remote https://github.com/PersonalClaw/registry HEAD
   ```

3. **Bump the website version.** Set `package.json` `version` to the release
   without its `v` prefix (`vX.Y.Z` → `X.Y.Z`), in the *same* change as step 2.
   Skipping this is the drift the parity check exists to prevent.

4. **Refresh release-sensitive content.** Anything that describes the release
   rather than being generated from it:
   - screenshots and marketing copy per `marketing/README.md` (every *shipping*
     shot is re-captured each release — a small UI shift changes the shot);
   - the manifest's `videos`: each shipping entry's `capturedAt` says the release
     its captures show, and `validate:marketing-manifest` fails on a missing file
     or an output over its budget. Rendering them from their compositions waits
     on the Hyperframes install (#94);
   - security content synchronized from core's threat model and limitations;
   - any page section describing capabilities the release added;
   - the builders band's `app.json` on `/apps` (`BUILDERS_SNIPPET` in
     `src/data/apps-snippet.mjs`), only when `sync:sources` says it drifted: it
     is `web-tools/app.json` as the pinned apps commit has it, checked against
     the pinned core's manifest rules, and the sync names the file or the rule
     that moved.

   Content that is *generated* from the pins (`/release` facts, app directory
   names/categories/counts, the `/install` installer in `public/install` and its
   `installSha256`) needs no editing — `sync:sources` regenerates it and fails
   the build on drift.

5. **Run the full local gate.** Never push on the strength of remote CI:

   ```bash
   npm run test:prepush
   ```

   The repository-owned `pre-push` hook runs the same thing; install it once with
   `npm run hooks:install`.

6. **Update visual baselines if the UI moved.** New screenshots change the
   snapshots. There is one `-linux` baseline set, made and compared inside the
   pinned Playwright image (`tests/browser/visual-image.json`). Regenerate it on
   the release branch by dispatching **Refresh visual baselines**
   (`.github/workflows/visual-baselines.yml`), which runs
   `npm run test:visual:update` in the image; download its `visual-baselines`
   artifact, review the diffs, and commit the intended changes together with
   `tests/browser/__screenshots__/visual-environment.json`.
   `validate:visual-baselines` fails on a missing baseline or one for any other
   platform. The pre-push gate does not compare them; CI's browser job does.

7. **Open the PR, land it, verify production.** Vercel's Git integration deploys
   `main`. Afterwards, `/release` should state the new version and link the exact
   commits.

## What enforces this

| Check | Where it runs | What it catches |
|---|---|---|
| `validate:release-parity` | `test:static` → `test:ci` → pre-push, and the **Release version parity** CI job (strict) | website version ≠ published core tag; a `released` channel with no tag or no commit pin; a tag that doesn't resolve to the pinned commit; **core having published a newer release than the site pins**; **the registry having moved past its pin** |
| `validate:release-parity` (installer) | the same places | offline: `public/install` hand-edited (its sha256 ≠ `core.installSha256`), or the pin moved without a sync (`core.installCommit` ≠ `core.commit`); strict: `public/install` ≠ the pinned commit's `deploy/website/install.sh` |
| `sync:sources` | every `build` | manifest schema, pinned-tree verification against GitHub, core tag ≠ `pyproject` version, changelog/app-manifest sanity; the `/apps` builders-band `app.json` ≠ the pinned file, or core's manifest rules moved past the check's; writes `public/install` and records its digest |
| **Release follow** workflow | daily schedule + manual | a core release, or a registry change, published *after* the last website commit — opens/updates a tracking issue so a stale site can't sit unnoticed between pushes |
| **Release follow**: served installer | the same run | the bytes served at `/install` differ from `public/install` on `main`, are not the newest core release's installer (an older release's installer fails even though it matches its own checksum), or disagree with that release's `install.sh.sha256` or `SHA256SUMS`; a signature in the release fails until a release key and verifier are configured here. A run that cannot fetch reports **unproven**; once the last proven run is older than 36 hours it reports **stale** and files the issue |

The served-installer check measures freshness from its own record: each proven
run uploads a `served-installer-proof` artifact (kept 7 days), and the next run
reads when the newest one was made. Core publishes no installer signature yet,
so every run reports the signature leg as unproven — never as a pass — and that
alone files no issue. Once a release attaches `SHA256SUMS`, its `install.sh`
line is a hard check; once it attaches a signature, the leg fails closed until
the release key and its verifier are configured here.
| `audit:lock` (dependency audit) | Website CI's `audit` job on every pull request and main run, and the nightly **Dependency audit** workflow on `main` | a high or critical advisory in `package-lock.json` that no live waiver in `.github/audit-baseline.toml` covers; an audit that did not run; a waiver that is expired, more than 30 days out, missing a field or stale. A red nightly opens or comments on the issue "Dependency audit is red", and a green one closes it. A re-pin that changes the lock is audited by its pull request's run |
| `validate:marketing-manifest` | `test:static` | a screenshot committed without a manifest entry, a manifest entry whose asset is missing, a shipping shot with no placement |
| `validate:build` / `validate:preview` | `test:static` | publication contract of the built output (production and noindex preview) |

Strict mode (`RELEASE_PARITY_REQUIRE_REMOTE=1`, used by CI and the watchdog)
treats an unreachable GitHub API as a **failure**, because staleness is precisely
what those runs exist to detect — they must not pass by being unable to look. The
pre-push path tolerates being offline and says so in its output; it never claims
to have verified staleness when it hasn't.

## Pre-release / development snapshots

Between releases the manifest may sit on `channel: "pre-release"` with exact
commits and no tags. In that state the site presents itself as a pinned
development snapshot, and the tag-dependent parity assertions are reported as
skipped (not silently passed). Return to `released` by following the sequence
above.

## Between releases: the registry

The community registry, `PersonalClaw/registry`, is published continuously rather
than released, so `data.registry` pins it by commit with no tag and no version.
The pin is still a frozen copy of a consent surface: a listing the registry
delists stays on `/registry`, with its permissions and its verdict, until the pin
moves. So `validate:release-parity` fails, on either channel, whenever the
registry's default branch is not at the pin, and the **Release follow** workflow
reports it.

To follow it, set `data.registry.commit` to the registry's current commit and run
`npm run test:prepush`. Nothing else changes: no `package.json` bump, no
`channel` change. What `/registry` shows is still decided by the pinned core
release (see `scripts/sync-registry.mjs`).
