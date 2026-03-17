# Minor Release Prep (Steps 1-5)

Prepare the `main` branch and create the release branch for a new minor release.

## Autonomous Mode Notes

In autonomous mode, the user provides two versions upfront:
- **Release version**: the current version being released (read from root `package.json`)
- **Next version**: the version to bump `main` to after the release

Run all steps sequentially. Create PRs automatically. At the end, report all PRs created and remind the user to merge them in order (version bump PR last).

If any step fails (permission error, git push rejected, etc.), fall back to opening a GitHub issue describing what was completed, what failed, and the remaining steps with exact commands. Label with `release-blocking`.

**Branch naming:** Use the standard `release-prep/<VERSION>/<step>` convention (see SKILL.md). NOT `release/`, which is protected on upstream.
**Push target:** Push working branches to `upstream` if configured, otherwise `origin`.

Before starting, check for existing progress:

```bash
git ls-remote --heads upstream 'release-prep/<VERSION>/*'
gh pr list --repo microsoft/FluidFramework --search "release-prep/<VERSION>" --state all
```

Skip any steps that already have merged PRs or open branches.

## Overview

Open four PRs (can be opened in parallel, but merge order matters):
1. Tag untagged asserts
2. Update compatibility generation
3. Generate release notes and changelogs
4. Bump to next version (**must merge last**)

Then create the release branch from the commit before the version bump.

## Step 1: Tag Untagged Asserts

```bash
pnpm run policy-check:asserts
```

If there are changes, create branch `release-prep/<VERSION>/1-tag-asserts`, commit, push to upstream, and create a PR. This PR must merge before the version bump PR.

Timing note: do this close to release to minimize untagged asserts being merged afterward.

## Step 2: Update Compatibility Generation

```bash
pnpm -r run layerGeneration:gen
```

This often produces no changes. If there are changes, create branch `release-prep/<VERSION>/2-compat-gen`, commit, push to upstream, and create a PR. Must merge before the version bump PR.

This generates changes only if 33+ days have passed since the last update for a given package (tracked in `fluidCompatMetadata` in package.json).

## Step 3: Generate Release Notes and Changelogs

### Determine the version being released

Check the current version in the root `package.json`. This is the version being released (the bump hasn't happened yet at this point).

- **Interactive:** Ask the user to confirm the version.
- **Autonomous:** Use the version provided upfront. If none was provided, read it from `package.json` and proceed.

### Generate release notes

```bash
pnpm flub generate releaseNotes -g client -t minor --outFile RELEASE_NOTES/<VERSION>.md
```

**Commit** the release notes before proceeding (the next command deletes changesets).

### Generate per-package changelogs

```bash
pnpm flub generate changelog -g client
```

Create branch `release-prep/<VERSION>/3-release-notes`, commit both the release notes and changelog changes, push to upstream, and create a PR. Must merge before the version bump PR.

### If changeset edits are needed after generation

If feedback requires changeset wording changes:
1. Make changeset edits in a **separate PR**, merge it
2. Regenerate release notes and changelogs
3. This ensures changeset changes have a commit in main (since changesets are deleted during changelog generation)

## Step 4: Bump Main to Next Version

### Determine the next version

- **Interactive:** Ask the user what the next version should be.
- **Autonomous:** Use the next version provided upfront.

Default suggestion: increment the minor version by 1 (e.g., 2.90.0 -> 2.91.0). Trust the user-provided version if different; only flag it if it's more than 7-8 minor versions away from the current version.

### Bump versions

```bash
# Local (interactive):
pnpm flub bump client --exact <NEXT_VERSION> --no-commit

# CI-safe alternative (non-interactive):
pnpm -r --include-workspace-root exec npm pkg set version=<NEXT_VERSION>
```

### Generate version files

```bash
pnpm -r run build:genver
pnpm install --no-frozen-lockfile
```

Create branch `release-prep/<VERSION>/4-bump-<NEXT_VERSION>`, commit, push to upstream, and create a PR. **This PR must merge LAST.**

## Step 5: Create the Release Branch

**CI note:** This step requires elevated permissions to create `release/` branches. In CI, skip this step and report it as a required human action.

### Pre-checks
- Verify all four PRs are merged
- Check again for release-blocking issues:

```bash
gh issue list --repo microsoft/FluidFramework --label release-blocking --state open
gh pr list --repo microsoft/FluidFramework --label release-blocking --state open
```

If blockers are found, **stop and report them**. Do not create the release branch. Also remind the user to check ADO for release-blocking issues.

**Autonomous mode:** In autonomous mode, the PRs have just been created but not yet merged. Stop here and report:

> **Phase complete.** Created the following PRs (merge in this order, version bump last):
> 1. [list PRs]
>
> After all PRs are merged, re-invoke to create the release branch and continue with release execution.

If the user has indicated that PRs are already merged (e.g., re-invoked after merging), proceed with branch creation.

### Find the correct commit

The release branch is created from the commit **immediately before** the version bump commit. Use:

```bash
git log --oneline -10
```

Identify the version bump commit and use the commit before it.

### Create the branch

Branch name format: `release/client/<major>.<minor>` (e.g., `release/client/2.90`)

```bash
git checkout -b release/client/<MAJOR>.<MINOR> <COMMIT_BEFORE_BUMP>
```

Push to `upstream` if available (check `git remote -v`), otherwise `origin`:

```bash
# Preferred (if upstream remote exists):
git push upstream release/client/<MAJOR>.<MINOR>
# Fallback:
git push --set-upstream origin release/client/<MAJOR>.<MINOR>
```

- **Interactive:** Pause and confirm before pushing. The user may not have permissions to create release branches.
- **Autonomous:** Push automatically, preferring upstream.

After branch creation, proceed to [release execution](release-execution.md).
