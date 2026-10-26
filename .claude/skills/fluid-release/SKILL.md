---
name: fluid-release
description: Fluid Framework client release group — minor releases, patch releases, and post-release type test updates. Covers release prep, branching, version bumps, changelogs, release notes, and type test baselines. Uses explicit release inputs and public repository state to select or resume a phase, and falls back to a GitHub issue on execution failure. Triggers on "release", "do the release", "release status", version bump, release notes, changelog, release branch, or release engineering.
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

Run the entire selected phase end-to-end without pausing.
Use the release inputs provided upfront and inspect public repository state to find prior progress.

Requirements:

- **Release inputs upfront:**
  The user must provide the target release version and the phase or release type before starting,
  plus the next version on `main` for minor release prep.
  If required inputs are missing or conflict with repository state, stop and report what is needed before making changes.
  Do not select a release version or date on the user's behalf.
- **No confirmation pauses:** Create PRs, push branches, and run `flub release` without asking. Include clear commit messages and PR descriptions.
- **Phase-scoped execution:** Each phase runs to completion, then reports what the user needs to do next (e.g., "queue the ADO release build", "queue the ADO publish pipeline", or "wait for npm feeds, then re-invoke for type test updates").
- **Fallback to issues:** If any step fails (permission errors, CI-safe command failures, git push rejected, or any other error that prevents progress), **stop and open a GitHub issue** in `microsoft/FluidFramework` describing what was completed, what failed, and what remains. Use the title format `Release <VERSION>: <brief description>` and label it with `release-blocking`. Include the exact commands remaining so a human can finish using the skill in interactive mode.

#### Checking progress for an explicit release

Use these checks only after the target release version is known.
For a generic request such as "do the release", collect the required release inputs first.
In autonomous mode and CI, report missing inputs and stop without creating a release-blocking issue.

**Step 1: Verify the supplied release inputs.**

```bash
# Inspect the development version and published tags on the selected remote
git show <REMOTE>/main:package.json
git ls-remote --tags <REMOTE> 'refs/tags/client_v*'
```

Fetch the selected remote before inspecting its branch state.
Use the remote selected in Key Context for `<REMOTE>`.
Check the supplied version against the relevant branch and tags.
Do not treat the version on `main` or the latest tag as an instruction to start a release.
When resuming prep after the version bump has merged, inspect the pre-bump commit to verify the release version.

**Step 2: Check public progress for the supplied `<VERSION>`.**

```bash
# Check for release-prep branches for the supplied release version
git ls-remote --heads <REMOTE> 'release-prep/<VERSION>/*'
# Check for the release branch
git ls-remote --heads <REMOTE> 'release/client/<MAJOR>.<MINOR>'
# Check the exact GitHub release and public npm version
gh release view client_v<VERSION> --repo microsoft/FluidFramework
pnpm view @fluidframework/container-loader@<VERSION> version --registry=https://registry.npmjs.org/
# Check release-prep, patch bump, and type test PRs and their merge status
gh pr list --repo microsoft/FluidFramework --search "release-prep/<VERSION>" --state all
gh pr list --repo microsoft/FluidFramework --base 'release/client/<MAJOR>.<MINOR>' --state all
gh pr list --repo microsoft/FluidFramework --base main --search '"<VERSION>"' --state all
```

Distinguish a missing release or package from a command failure, such as an authentication or network error.
Inspect PR diffs and branch history before treating a step as complete; a search result alone is not proof.
Public repository state does not establish whether the ADO release build or publish pipeline has completed.
If publication is not verified, report that a human must identify the current pipeline checkpoint
before continuing [release execution](references/release-execution.md).

**Step 3: Select or resume the requested phase.**

| State | Action |
|-------|--------|
| Minor release prep requested, no release-prep branches or release branch, exact release not published | Start **minor release prep** (Steps 1-5) using the supplied release and next versions |
| Release-prep branches/PRs exist, some not merged | Resume **minor release prep** from where it left off |
| Release execution requested, release branch missing | Report that the release branch must be created before execution |
| Release branch exists, exact GitHub/npm release not verified | Report the public state and require a human to identify the build/publish checkpoint |
| Exact GitHub/npm release verified, neither an open nor a merged patch bump PR exists | Resume **release execution** — verify the publication prerequisites before the patch bump (Step 7) |
| Exact release verified, patch bump done, no type test PRs | Start **type test updates** (Steps 8-9) once the published packages are available to the workspace |
| All phases complete | Report completion for the supplied version; do not choose another release |

Only act when the supplied inputs and observed state identify an unambiguous next step.
Otherwise, ask for clarification in interactive mode, or report the ambiguity and stop in autonomous mode and CI.

Present the detected state and chosen action to the user (or in the issue body). Example:

> **Inputs:** Minor release prep for 2.91.0, with 2.92.0 as the next version on `main`.
> **Observed state:** `main` is at 2.91.0. No release-prep branches, release branch, or published release found for 2.91.0.
> **Action:** Start minor release prep for the supplied versions.

## Required Release Inputs

- **Minor release prep:** Release version and next development version on `main`.
- **Release execution:**
  Release version and the existing `release/client/<major>.<minor>` branch.
- **Type test updates:** Published release version and its release branch.

Derive the release branch name from the supplied version when needed.
In interactive mode, confirm these inputs with the user.
In autonomous mode and CI, require them upfront.
Use public branches, tags, package versions, and PRs to verify progress,
not to infer release dates or authorization to release.

## Workflow Selection

Use the requested phase or release type and the progress checks above.
If the phase is unclear, ask the user in interactive mode.
In autonomous mode and CI, report the missing input and stop.

| Phase | When to use | CI-automatable? | Reference |
|-------|-------------|-----------------|-----------|
| **Minor release prep** | Starting a new minor release from `main` (Steps 1-5) | Yes (Steps 1-4 create PRs; Step 5 is a human step) | [minor-release-prep.md](references/minor-release-prep.md) |
| **Release execution** | Running and publishing the release build + patch bump (Steps 6-7). Also used for **patch releases** on existing branches. | Partially (Step 6 = human queues ADO build and publish pipelines; Step 7 = CI-automatable) | [release-execution.md](references/release-execution.md) |
| **Type test updates** | After published packages are available: update baselines on main and release branch (Steps 8-9) | Yes (must be resilient to failure if npm packages not yet available) | [type-test-updates.md](references/type-test-updates.md) |

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
| Version determination | Ask user to confirm | Require the release inputs upfront; verify against public repository state |
| Announcing releases | Remind user | Remind user (never auto-announce) |
| ADO release/publish pipeline queuing | Instruct user | Instruct user (cannot be automated) |

### Autonomous Mode: Phase Completion Reports

At the end of each autonomous phase, provide a summary:

1. **What was done** — list all PRs created, branches pushed, commands run
2. **What to do next** — specific manual steps needed (e.g., queue ADO build, merge PRs in order)
3. **When to continue** — report observable prerequisites for the next phase.
   Examples: "after PRs merge" or "after the exact published packages are available to the workspace".

### Autonomous Mode: Fallback to Issues

If any step in autonomous mode fails (permission errors, command failures, git push rejected, etc.), **stop and open a GitHub issue** in `microsoft/FluidFramework` with:

1. **What was completed** — PRs created, branches pushed, commands run successfully
2. **What failed** — the specific error and which step it occurred at
3. **What remains** — the exact commands for remaining steps, ready to copy-paste
4. **How to finish** — remind the human to use the fluid-release skill in interactive mode (`claude "do the release"`)

Use the title format `Release <VERSION>: <brief description of failure>` and label it with `release-blocking`.

Read the appropriate reference file for the phase the user selects, then guide them through it step by step.
