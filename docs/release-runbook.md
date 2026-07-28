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

3. **Bump the website version.** Set `package.json` `version` to the release
   without its `v` prefix (`vX.Y.Z` → `X.Y.Z`), in the *same* change as step 2.
   Skipping this is the drift the parity check exists to prevent.

4. **Refresh release-sensitive content.** Anything that describes the release
   rather than being generated from it:
   - screenshots and marketing copy per `marketing/README.md` (every *shipping*
     shot is re-captured each release — a small UI shift changes the shot);
   - security content synchronized from core's threat model and limitations;
   - any page section describing capabilities the release added.

   Content that is *generated* from the pins (`/release` facts, app directory
   names/categories/counts) needs no editing — `sync:sources` regenerates it and
   fails the build on drift.

5. **Run the full local gate.** Never push on the strength of remote CI:

   ```bash
   npm run test:prepush
   ```

   The repository-owned `pre-push` hook runs the same thing; install it once with
   `npm run hooks:install`.

6. **Update visual baselines if the UI moved.** New screenshots change the
   snapshots. Regenerate and review them deliberately:

   ```bash
   npm run test:visual:update
   ```

   Baselines are platform-qualified (Darwin for local development, Linux for CI);
   `validate:visual-baselines` enforces that both exist.

7. **Open the PR, land it, verify production.** Vercel's Git integration deploys
   `main`. Afterwards, `/release` should state the new version and link the exact
   commits.

## What enforces this

| Check | Where it runs | What it catches |
|---|---|---|
| `validate:release-parity` | `test:static` → `test:ci` → pre-push, and the **Release version parity** CI job (strict) | website version ≠ published core tag; a `released` channel with no tag or no commit pin; a tag that doesn't resolve to the pinned commit; **core having published a newer release than the site pins** |
| `sync:sources` | every `build` | manifest schema, pinned-tree verification against GitHub, core tag ≠ `pyproject` version, changelog/app-manifest sanity |
| **Release follow** workflow | daily schedule + manual | a core release published *after* the last website commit — opens/updates a tracking issue so a stale site can't sit unnoticed between pushes |
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
