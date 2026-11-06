---
name: fluid-release
description: Fluid Framework client release group — minor releases, patch releases, and post-release type test updates. Covers release prep, branching, version bumps, changelogs, release notes, and type test baselines. In autonomous mode, auto-detects state from the repo, attempts to execute, and falls back to a GitHub issue on failure. Triggers on "release", "do the release", "release status", version bump, release notes, changelog, release branch, or release engineering.
license: MIT
---

# Fluid Framework Client Release

Release workflow for the client release group. Supports two modes: **interactive** (default) and **autonomous**.

## Environment Detection

Check the `CI` environment variable at the start of every session:

- **`CI=true`**: Running in a GitHub Actions workflow. Use only `origin` (no `upstream`). Use CI-safe commands (see [CI-safe alternatives](#ci-safe-command-alternatives)). Never prompt for input. Log blockers and phase completions to workflow output for human review.
- **`CI` unset or false**: Running locally. Use `upstream`/`origin` detection as described in Key Context.

Select the remote once for repository-state checks:

```bash
release_remote=origin
if [ "$CI" != "true" ] && git remote get-url upstream >/dev/null 2>&1; then
    release_remote=upstream
fi
```

## Mode Selection

At the start of every release session, ask the user:

> Would you like to run in **interactive** or **autonomous** mode?

In CI (`CI=true`), always use autonomous mode — do not prompt.

### Interactive Mode (default)

Run commands autonomously but pause before creating PRs, pushing branches, or triggering builds. Ask for version confirmation at key points. This is the current behavior.

### Autonomous Mode

Run the entire selected phase end-to-end without pausing. Auto-detect the release state from the repo (see below). If the user provides version info upfront, skip the version questions entirely.

Requirements:

- **Version detection:** Infer version numbers from repo state by default (see below).
  If the user provides versions, use them unless they conflict with repo state.
- **No confirmation pauses:** Create PRs, push branches, and run `flub release` without asking. Include clear commit messages and PR descriptions.
- **Phase-scoped execution:** Each phase runs to completion, then reports what the user needs to do next (e.g., "queue the ADO release build", "queue the ADO publish pipeline", or "wait for npm feeds, then re-invoke for type test updates").
- **Fallback to issues:** If any step fails (permission errors, CI-safe command failures, git push rejected, or any other error that prevents progress), **stop and open a GitHub issue** in `microsoft/FluidFramework` describing what was completed, what failed, and what remains. Use the title format `Release <VERSION>: <brief description>` and label it with `release-blocking`. Include the exact commands remaining so a human can finish using the skill in interactive mode.

#### Auto-detecting release state (autonomous mode and CI)

Auto-detect the release state from the repo using the detection steps below. In interactive mode, this detection also runs when the user gives a generic request like "do the release" without specifying a version or phase.

**Step 1: Identify the most recent release.**

```bash
# Get the latest client release tag
git tag -l 'client_v*' --sort=-version:refname | head -1
```

**Step 2: Identify the release version from repo state.**

Inspect release-prep branches/PRs, release branches, and tags for a release already in progress.
Use the version on `main` for a new minor release and increment its minor version by 1 for the next development version.
If the version bump has already merged, use the release-prep PR or pre-bump commit to recover the release version.

```bash
# Inspect the development version and existing release branches
git fetch "$release_remote" main
git show "${release_remote}/main:package.json"
git ls-remote --heads "$release_remote" 'release-prep/*' 'release/client/*'
```

Ask for clarification only when repo state is ambiguous or conflicts with user-provided versions or phase.
In CI, report the ambiguity or conflict and stop instead of prompting.

**Step 3: Check if a release is in progress.**

```bash
# Check for release-prep branches for the next version
git ls-remote --heads "$release_remote" 'release-prep/<NEXT_VERSION>/*'
# Check for the release branch
git ls-remote --heads "$release_remote" 'release/client/<NEXT_MAJOR>.<NEXT_MINOR>'
# Check for a release tag
git tag -l 'client_v<NEXT_VERSION>'
# Check for open PRs
gh pr list --repo microsoft/FluidFramework --search "release-prep/<NEXT_VERSION>" --state all
```

For a release branch with no completed release, also inspect ADO pipeline state:

1. Find the **Build - client packages** (definition 12) run for the release branch tip with `releaseBuildOverride: release`.
2. If that run succeeded, find the **Publish - client packages** (definition 219) run that selected it as the `candidate` and used `publishToPublicNpm: true`.
3. If ADO pipeline state cannot be queried, do not infer which action is next. Report that a human must identify whether the release build or publish pipeline has completed.

**Step 4: Determine the phase and act.**

| State | Action |
|-------|--------|
| No release-prep branches, no release branch | Start **minor release prep** (Steps 1-5) |
| Release-prep branches/PRs exist, some not merged | Resume **minor release prep** from where it left off |
| Release branch exists, no successful release build | Resume **release execution** — queue the ADO release build |
| Successful release build exists, no successful public publish run | Resume **release execution** — queue the ADO publish pipeline using that build as the candidate |
| Successful public publish run exists, exact GitHub/npm release not yet available | Wait for publication to propagate; investigate the publish run if it does not appear |
| Exact GitHub/npm release verified, no patch bump PR | Resume **release execution** — do the patch bump (Step 7) |
| Release tag exists, patch bump done, no type test PRs | Start **type test updates** (Steps 8-9) |
| All phases complete | Report that the release is fully done and show the next release version from `main` |

Present the detected state and chosen action to the user (or in the issue body). Example:

> **Detected state:** `main` is at 2.91.0. No release-prep branches found. The most recent release is 2.90.0.
> **Action:** Minor release prep needed for 2.91.0 (next version on main: 2.92.0).

## Workflow Selection

Use the requested phase, or auto-detect it from repo state as described above.
Ask only if the phase is ambiguous or conflicts with the request; in CI, report the blocker and stop.

| Phase | When to use | CI-automatable? | Reference |
|-------|-------------|-----------------|-----------|
| **Minor release prep** | Starting a new minor release from `main` (Steps 1-5) | Yes (Steps 1-4 create PRs; Step 5 is a human step) | [minor-release-prep.md](references/minor-release-prep.md) |
| **Release execution** | Running and publishing the release build + patch bump (Steps 6-7). Also used for **patch releases** on existing branches. | Partially (Step 6 = human queues ADO build and publish pipelines; Step 7 = CI-automatable) | [release-execution.md](references/release-execution.md) |
| **Type test updates** | After release: update baselines on main and release branch (Steps 8-9) | Yes (must be resilient to failure if npm packages not yet available) | [type-test-updates.md](references/type-test-updates.md) |

For **patch releases**, skip directly to release execution on an existing release branch.

### Human steps (cannot be automated)

These steps require human action and should be clearly reported in CI workflow logs:

1. **Merge release-prep PRs** in the correct order (version bump last) after CI creates them
2. **Create the release branch** (Step 5) — requires elevated permissions on the `release/` branch prefix
3. **Queue the ADO release build** (Step 6) — choose the "release" option in ADO
4. **Queue the ADO publish pipeline** (Step 6) — after the release build succeeds, select it as the candidate and enable public npm publication
5. **Announce the release** in the Fluid Framework "General" Teams channel

## Key Context

- The repo uses `pnpm` as the package manager
- `flub` is the Fluid build CLI (`pnpm flub ...` or `pnpm exec flub ...`)
- **Version scheme**: The version numbering is not a simple incrementing pattern (it is NOT always multiples of 10). When suggesting a next version, default to incrementing the minor version by 1 (e.g., 2.90.0 -> 2.91.0). Trust the version the user provides unless it is more than 7-8 minor versions away from the current version (which likely indicates an error).
- Release branch naming: `release/client/<major>.<minor>` (e.g., `release/client/2.90`)
- The release branch is created from the commit **before** the version bump on `main`
- There is no `lerna.json` in this repo
- **Git remote preference**: When pushing branches, prefer pushing to `upstream` if one is configured for the repo. Check with `git remote -v` if unsure. Only fall back to `origin` if no `upstream` remote exists. **Exception:** In CI (`CI=true`), always use `origin` — there is no `upstream`.
- **Working branch naming**: Do NOT use the `release/` prefix for working branches because `release/` is protected on upstream. Use the standard naming convention below — these branches double as progress markers.

### CI-safe Command Alternatives

Some `flub` commands require interactive TTY input. In CI, use these alternatives:

| Interactive command | CI-safe alternative |
|---|---|
| `flub bump client --bumpType patch` | `pnpm -r --include-workspace-root exec npm pkg set version=<VERSION>` followed by `pnpm install --no-frozen-lockfile` |
| `flub bump client --exact <VERSION> --no-commit` | `pnpm -r --include-workspace-root exec npm pkg set version=<VERSION>` |
| `flub release -g client -t patch` | **Not needed in CI.** The release build is queued manually by a human in ADO. CI only handles prep and post-release phases. |

After using `npm pkg set` to bump versions, also run `pnpm -r run build:genver` to update `packageVersion.ts` files, and `pnpm install --no-frozen-lockfile` to update the lockfile.

Non-interactive `flub` commands that are safe in CI (no TTY required): `flub generate releaseNotes`, `flub generate changelog`, `flub typetests`, `flub release prepare`.

### Working Branch Convention

Working branches follow a numbered naming scheme under `release-prep/<VERSION>/`:

| Step | Branch name |
|------|-------------|
| 1 | `release-prep/<VERSION>/1-tag-asserts` |
| 2 | `release-prep/<VERSION>/2-compat-gen` |
| 3 | `release-prep/<VERSION>/3-release-notes` |
| 4 | `release-prep/<VERSION>/4-bump-<NEXT_VERSION>` |

Example for releasing 2.90.0 with next version 2.91.0:
`release-prep/2.90.0/1-tag-asserts`, `release-prep/2.90.0/4-bump-2.91.0`

### Detecting Prior Progress

Before starting any phase, check for existing progress by looking at branches and PRs:

```bash
# Check for existing release-prep branches on the selected remote
git ls-remote --heads "$release_remote" 'release-prep/<VERSION>/*'
# Check for open release-prep PRs
gh pr list --repo microsoft/FluidFramework --search "release-prep/<VERSION>" --state all
```

If branches or PRs already exist, skip completed steps and resume from where the process left off.

## Before Starting

Run `pnpm flub release prepare client` to check readiness. Then check for release blockers:

```bash
gh issue list --repo microsoft/FluidFramework --label release-blocking --state open
gh pr list --repo microsoft/FluidFramework --label release-blocking --state open
```

If either command returns results, **stop and report the blockers to the user**. In autonomous mode, do not proceed past this check if blockers exist. Also remind the user to check ADO for release-blocking issues (cannot be queried via CLI).

**Blocker handling (autonomous and CI):** If the agent is blocked at any point (release blockers, missing release tag, npm packages not available, permission errors, or any other issue that prevents progress), open a GitHub issue in `microsoft/FluidFramework` describing what was completed, what failed, and what human action is needed. Use the title format `Release <VERSION>: <brief description>` and label it with `release-blocking`. Include the exact commands remaining so a human can finish using the skill in interactive mode. Then exit gracefully.

## Behavior by Mode

### Commands (both modes)

Run these autonomously in both modes: `policy-check:asserts`, `layerGeneration:gen`, `flub generate releaseNotes`, `flub generate changelog`, `build:genver`, `flub typetests`, `flub release prepare`

For version bumps, use `flub bump` locally or CI-safe alternatives in CI (see [CI-safe alternatives](#ci-safe-command-alternatives)).

### PR Conventions

Use the `build:` conventional commit prefix for all release PR titles (e.g., `build: tag untagged asserts for 2.90.0 release`).

### Checkpoints

| Action | Interactive | Autonomous |
|--------|------------|------------|
| Creating PRs | Pause and confirm | Create automatically with descriptive titles/bodies |
| Pushing branches | Pause and confirm | Push automatically |
| Running `flub release` | Pause and confirm | Run automatically |
| Version determination | Infer from repo state; ask only if ambiguous or conflicting | Use version provided upfront or auto-detect |
| Announcing releases | Remind user | Remind user (never auto-announce) |
| ADO release/publish pipeline queuing | Instruct user | Instruct user (cannot be automated) |

### Autonomous Mode: Phase Completion Reports

At the end of each autonomous phase, provide a summary:

1. **What was done** — list all PRs created, branches pushed, commands run
2. **What to do next** — specific manual steps needed (e.g., queue ADO build, merge PRs in order)
3. **When to continue** — timing guidance for the next phase (e.g., "after PRs merge" or "tomorrow, after npm feeds update")

### Autonomous Mode: Fallback to Issues

If any step in autonomous mode fails (permission errors, command failures, git push rejected, etc.), **stop and open a GitHub issue** in `microsoft/FluidFramework` with:

1. **What was completed** — PRs created, branches pushed, commands run successfully
2. **What failed** — the specific error and which step it occurred at
3. **What remains** — the exact commands for remaining steps, ready to copy-paste
4. **How to finish** — remind the human to invoke the `fluid-release` skill in an interactive GitHub Copilot session

Use the title format `Release <VERSION>: <brief description of failure>` and label it with `release-blocking`.

Read the appropriate reference file for the phase the user selects, then guide them through it step by step.
