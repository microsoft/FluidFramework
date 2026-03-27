---
name: fluid-release
description: Fluid Framework client release group — minor releases, patch releases, and post-release type test updates. Covers release prep, branching, version bumps, changelogs, release notes, and type test baselines. In autonomous mode, auto-detects state from the schedule and repo, attempts to execute, and falls back to a GitHub issue on failure. Triggers on "release", "do the release", "release status", version bump, release notes, changelog, release branch, or release engineering.
---

# Fluid Framework Client Release

Release workflow for the client release group. Supports two modes: **interactive** (default) and **autonomous**.

## Environment Detection

Check the `CI` environment variable at the start of every session:

- **`CI=true`**: Running in a GitHub Actions workflow. Use only `origin` (no `upstream`). Use CI-safe commands (see [CI-safe alternatives](#ci-safe-command-alternatives)). Never prompt for input. Log blockers and phase completions to workflow output for human review.
- **`CI` unset or false**: Running locally. Use `upstream`/`origin` detection as described in Key Context.

## Mode Selection

At the start of every release session, ask the user:

> Would you like to run in **interactive** or **autonomous** mode?

In CI (`CI=true`), always use autonomous mode — do not prompt.

### Interactive Mode (default)

Run commands autonomously but pause before creating PRs, pushing branches, or triggering builds. Ask for version confirmation at key points. This is the current behavior.

### Autonomous Mode

Run the entire selected phase end-to-end without pausing. Auto-detect the release state from the schedule and repo (see below). If the user provides version info upfront, skip the version questions entirely.

Requirements:

- **Version info upfront:** The user must provide all version numbers before starting (current release version and/or next version, depending on phase). Do not prompt for versions mid-flow. If the user doesn't provide versions, detect them from the schedule and repo state (see below).
- **No confirmation pauses:** Create PRs, push branches, and run `flub release` without asking. Include clear commit messages and PR descriptions.
- **Phase-scoped execution:** Each phase runs to completion, then reports what the user needs to do next (e.g., "queue the ADO build" or "wait for npm feeds, then re-invoke for type test updates").
- **Fallback to issues:** If any step fails (permission errors, CI-safe command failures, git push rejected, or any other error that prevents progress), **stop and open a GitHub issue** in `microsoft/FluidFramework` describing what was completed, what failed, and what remains. Use the title format `Release <VERSION>: <brief description>` and label it with `release-blocking`. Include the exact commands remaining so a human can finish using the skill in interactive mode.

#### Auto-detecting release state (autonomous mode and CI)

Auto-detect the release state from the schedule and repo. Read the [release schedule](references/release-schedule.md) and run the detection steps below. In interactive mode, this detection also runs when the user gives a generic request like "do the release" without specifying a version or phase.

**Step 1: Identify the most recent release.**

```bash
# Get the latest client release tag
git tag -l 'client_v2.*' --sort=-version:refname | head -1
```

**Step 2: Identify the next scheduled release.**

Compare today's date against the schedule. The next release is the earliest scheduled entry whose proposed date is >= today and whose version is greater than the most recently released version. Also check if a release is _overdue_ (proposed date < today but no tag exists).

**Step 3: Check if a release is in progress.**

```bash
# Check for release-prep branches for the next version
git ls-remote --heads upstream 'release-prep/<NEXT_VERSION>/*'
# Check for the release branch
git ls-remote --heads upstream 'release/client/<NEXT_MAJOR>.<NEXT_MINOR>'
# Check for a release tag
git tag -l 'client_v<NEXT_VERSION>'
# Check for open PRs
gh pr list --repo microsoft/FluidFramework --search "release-prep/<NEXT_VERSION>" --state all
```

**Step 4: Determine the phase and act.**

| State | Action |
|-------|--------|
| No release-prep branches, no release branch | Start **minor release prep** (Steps 1-5) |
| Release-prep branches/PRs exist, some not merged | Resume **minor release prep** from where it left off |
| Release branch exists, no release tag | Start **release execution** (Steps 6-7). In CI: the human must queue the ADO build. |
| Release tag exists, no patch bump PR | Resume **release execution** — do the patch bump (Step 7) |
| Release tag exists, patch bump done, no type test PRs | Start **type test updates** (Steps 8-9) |
| All phases complete | Report that the release is fully done and show the next scheduled release |

Present the detected state and chosen action to the user (or in the issue body). Example:

> **Detected state:** 2.91.0 is scheduled for 03/16/26. No release-prep branches found. The most recent release is 2.90.0.
> **Action:** Minor release prep needed for 2.91.0 (next version on main: 2.92.0).

## Release Schedule

The release schedule is in [references/release-schedule.md](references/release-schedule.md). It contains proposed dates, release versions, and the corresponding "main" version after each release. Use this to determine version numbers and timing in autonomous mode.

## Workflow Selection

Ask the user which phase they need (or auto-detect in autonomous mode — see above):

| Phase | When to use | CI-automatable? | Reference |
|-------|-------------|-----------------|-----------|
| **Minor release prep** | Starting a new minor release from `main` (Steps 1-5) | Yes (Steps 1-4 create PRs; Step 5 is a human step) | [minor-release-prep.md](references/minor-release-prep.md) |
| **Release execution** | Running the release build + patch bump (Steps 6-7). Also used for **patch releases** on existing branches. | Partially (Step 6 = human queues ADO build; Step 7 = CI-automatable) | [release-execution.md](references/release-execution.md) |
| **Type test updates** | Day after release: update baselines on main and release branch (Steps 8-9) | Yes (must be resilient to failure if npm packages not yet available) | [type-test-updates.md](references/type-test-updates.md) |

For **patch releases**, skip directly to release execution on an existing release branch.

### Human steps (cannot be automated)

These steps require human action and should be clearly reported in CI workflow logs:

1. **Merge release-prep PRs** in the correct order (version bump last) after CI creates them
2. **Create the release branch** (Step 5) — requires elevated permissions on the `release/` branch prefix
3. **Queue the ADO release build** (Step 6) — choose the "release" option in ADO
4. **Announce the release** in the "Fluid Framework All" Teams channel

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
# Check for existing release-prep branches on upstream
git ls-remote --heads upstream 'release-prep/<VERSION>/*'
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

If either command returns results, **stop and report the blockers to the user**. In autonomous mode, do not proceed past this check if blockers exist.

**ADO blocker check (mandatory):** Release-blocking issues may also exist in ADO, which cannot be queried via CLI. You **must** explicitly ask the user to check ADO for release-blocking issues and confirm there are none before proceeding. Do not skip this step or bury it in a reminder — wait for the user's confirmation. In CI/autonomous mode, this is a hard stop: log the requirement and do not continue until a human has confirmed there are no ADO blockers.

**Blocker handling (autonomous and CI):** If the agent is blocked at any point (release blockers, missing release tag, npm packages not available, permission errors, or any other issue that prevents progress), open a GitHub issue in `microsoft/FluidFramework` describing what was completed, what failed, and what human action is needed. Use the title format `Release <VERSION>: <brief description>` and label it with `release-blocking`. Include the exact commands remaining so a human can finish using the skill in interactive mode. Then exit gracefully.

## Behavior by Mode

### Commands (both modes)

Run these autonomously in both modes: `policy-check:asserts`, `layerGeneration:gen`, `flub generate releaseNotes`, `flub generate changelog`, `build:genver`, `flub typetests`, `flub release prepare`

For version bumps, use `flub bump` locally or CI-safe alternatives in CI (see [CI-safe alternatives](#ci-safe-command-alternatives)).

### PR Conventions

Use the `build:` conventional commit prefix for all release PR titles (e.g., `build: tag untagged asserts for 2.90.0 release`).

**All release PRs must be opened as drafts** and assigned to the person running the release. This signals to the team that these are release-infrastructure PRs, not regular feature work. Use `gh pr create --draft --assignee @me`.

### Checkpoints

| Action | Interactive | Autonomous |
|--------|------------|------------|
| Creating PRs | Pause and confirm | Create automatically with descriptive titles/bodies |
| Pushing branches | Pause and confirm | Push automatically |
| Running `flub release` | Pause and confirm | Run automatically |
| Version determination | Ask user to confirm | Use version provided upfront or auto-detect |
| Announcing releases | Remind user | Remind user (never auto-announce) |
| ADO build queuing | Instruct user | Instruct user (cannot be automated) |

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
4. **How to finish** — remind the human to use the fluid-release skill in interactive mode (`claude "do the release"`)

Use the title format `Release <VERSION>: <brief description of failure>` and label it with `release-blocking`.

Read the appropriate reference file for the phase the user selects, then guide them through it step by step.
