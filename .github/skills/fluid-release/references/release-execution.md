# Release Execution (Steps 6-7)

Run and publish the release build, then bump the release branch to the next patch version. This applies to both minor (X.X0.0) and patch releases.

## Autonomous Mode Notes

In autonomous mode, run all commands without pausing.
The user must still queue the ADO release build.
The successful build automatically triggers **Publish - client packages**.
Monitor that publish run.
Before you create the patch bump PR, verify the exact version on GitHub and public npm.

If any step fails, fall back to opening a GitHub issue describing what was completed, what failed, and the remaining steps with exact commands. Label with `release-blocking`.

## CI Note

In CI, this phase has two parts:

- **Step 6:** A human creates the release branch if needed and queues the ADO release build.
  The successful build automatically triggers publication.
  Monitor the publish run and verify the exact GitHub and public npm version.
- **Step 7:** CI creates the patch bump PR only after the publish run succeeds and exact-version verification passes.

Use the auto-detection logic in SKILL.md to identify the current step.

## Step 6: Run and Publish the Release Build

**CI note:** A human queues the ADO release build, not a separate publish run.
Inspect both runs to identify the current checkpoint.
If ADO state cannot be queried, report that a human must inspect it.
Do not infer publication state from tag absence alone.
If the live pipeline differs from these instructions, report the discrepancy and investigate before proceeding.

### Switch to the release branch

```bash
git checkout release/client/<MAJOR>.<MINOR>
git pull
pnpm install
```

### Check for release blockers

```bash
gh issue list --repo microsoft/FluidFramework --label release-blocking --state open
gh pr list --repo microsoft/FluidFramework --label release-blocking --state open
```

If blockers are found, **stop and report them**. Do not proceed with the release. Also remind the user to check ADO for release-blocking issues.

### Run the release

```bash
pnpm flub release -g client -t patch
```

- **Interactive:** Pause and confirm before running this command.
- **Autonomous:** Run automatically (only after blocker check passes).
- **CI:** Do not run this command. Report that the human must queue the ADO build.

The command will:
- Run checks and prompt for confirmation
- Instruct you to queue a release build in ADO (choosing the "release" option)

Follow the tool's interactive prompts.
The user queues the ADO build; `flub release` does not queue it.
For a normal public release, select the release branch, set **Release Build** to `release`, and leave the other build parameters at their defaults: **Change package types** = `none`, **Publish Override** = `default`, and **Range to use for interdependencies** = `~`.

**Autonomous mode:** After running `flub release`, report:

> **Action required:** Queue [Build - client packages](https://dev.azure.com/fluidframework/internal/_build?definitionId=12) for the release branch.
> Choose "release" for the "Release Build" parameter.
> Leave the other parameters at their defaults.
> After the build succeeds, monitor the automatically triggered publish run as described below.

### Monitor automatic publication of the candidate

A successful **Build - client packages** run in the `internal` project automatically triggers [Publish - client packages](https://dev.azure.com/fluidframework/internal/_build?definitionId=219).
The trigger includes `main`, `lts`, `release/client/*`, and `test/*` branches.
For this release, use the successful build from `release/client/<MAJOR>.<MINOR>`.
Do not queue a separate publish run as the normal release step.

The build produces packed packages and `pack/publish-metadata.json` for the separate publisher.
The publish definition is `devOps/pipelines/publish-client.yml` in the ADO repository `ff_publishing`.
Its `candidate` pipeline resource provides the automatic trigger.

Public npm eligibility comes from the candidate metadata and source branch, not a manual publish parameter:

- The candidate must use an allowed branch.
  For this release, verify the expected release branch and commit.
- `publishOverride: skip` disables publication.
  The normal release uses `publishOverride: default`.
- `publishAsPartOfBuild` must be `false` so that the separate publisher owns publication.
- Public npm publication requires `release: release` or `release: prerelease`.
  This release requires `release: release` and the exact expected version.
  Ordinary builds can publish to internal feeds without public publication.
  Test branches publish only to the test feed, even with release metadata.

The `prepare_publish` stage validates these inputs and emits `publishToPublic: true` for an eligible public candidate.
The `publish_npm_public` stage uses that output to decide whether to run.
Its display name is **Publish to public npmjs.org through ESRP Release API**.
Automatic runs do not require the manual queue approval gate.
Automatic triggering alone does not prove that public publication ran or succeeded.

1. Record the successful build ID, release branch, source commit, and expected version.
2. Open the publish pipeline's runs and identify the automatic run for that build.
   Inspect its `candidate` resource and match the upstream build ID, source branch, and source commit.
   Do not match only the run title or the publish run's own branch and commit.
   Those source fields describe `ff_publishing`, not the release candidate.
3. Inspect `prepare_publish` and its `ReadMetadata` output.
   Verify the exact version, `release: release`, and `publishToPublic: true`.
4. Monitor the run until it completes.
   Require both the publish run and `publish_npm_public` stage to succeed.
   A skipped public stage is not public publication, even if the overall run succeeds.
5. If no matching run appears, report the build ID and missing automatic trigger, then stop for investigation.
   If the run fails, is canceled, or skips public publication, report its URL and checkpoint, then stop.
   Do not assume publication succeeded or queue a replacement without separate confirmation.

**Autonomous mode:** After the release build succeeds, report:

> **Build complete:** Release build `<BUILD_ID>` succeeded.
> **Publication checkpoint:** Monitor its automatically triggered [Publish - client packages](https://dev.azure.com/fluidframework/internal/_build?definitionId=219) run.
> Match the `candidate` to that exact build and require the public stage to succeed.
> If no matching run appears, stop and report the missing run.
> After publication succeeds, verify the exact GitHub and public npm version before the patch bump.

Report the matching run's actual state.
Do not report publication as in progress unless you verify that state.

For a failed public npm stage, retry that stage when appropriate instead of starting a duplicate publish run.
Manual queuing is only a recovery action when a retry of the existing run is not possible.
It requires human confirmation of the candidate and destinations at the **Approve publication** gate.
Never bypass that gate.

### Verify the release

After the publish run and its public stage succeed, verify the exact version:

```bash
gh release view client_v<VERSION> --repo microsoft/FluidFramework
pnpm view @fluidframework/container-loader@<VERSION> version --registry=https://registry.npmjs.org/
```

Confirm the GitHub release is published, not a draft, and its tag matches `client_v<VERSION>`.
Confirm the npm result matches the exact version from the candidate metadata.
Checking a generic releases page or npm search is insufficient because an older release can make those checks appear successful.
If either exact version is unavailable, wait for propagation and investigate if it remains unavailable.
Do not start the patch bump until both checks pass.

Once confirmed, remind the user to announce the release in the Fluid Framework "General" Teams channel with a link to the GitHub release. (Never auto-announce in either mode.)
Also remind the release on-call engineer (OCE) to bump the Fluid Framework version in the partner repository.
This is a human action.
Do not identify the partner repository or include an internal documentation link in the reminder.

## Step 7: Bump Release Branch to Next Patch

Do not start Step 7 until all of the following are true:

- The **Publish - client packages** run succeeded with the exact expected candidate, version, and `publishToPublic: true`.
- The `publish_npm_public` stage succeeded, not skipped.
- The exact `client_v<VERSION>` GitHub release is published, not a draft.
- The exact `<VERSION>` package is available from the public npm registry.

Then either:

### Option A: Use flub release again (local only)

```bash
pnpm flub release -g client -t patch
```

This should detect the release and bump the version automatically.

### Option B: Manual bump (local or CI)

```bash
# Local (interactive):
pnpm exec flub bump client --bumpType patch

# CI-safe alternative (non-interactive):
# Determine the next patch version (e.g., 2.90.0 -> 2.90.1)
pnpm -r --include-workspace-root exec npm pkg set version=<NEXT_PATCH_VERSION>
pnpm -r run build:genver
pnpm install --no-frozen-lockfile
```

Create a PR targeting the release branch with these changes.

- **Interactive:** Pause and confirm before creating the PR.
- **Autonomous:** Create the PR automatically.

For the first release of a new minor (X.X0.0), this PR can optionally be combined with the type test baseline update from [type-test-updates.md](type-test-updates.md) Step 9.

**Autonomous mode phase completion:**

> **Phase complete.**
> - Patch bump PR created: [link]
> - Release `<VERSION>` was verified on GitHub and public npm before the patch bump.
> - **Human action:** The release OCE must bump the Fluid Framework version in the partner repository.
> - **Next step:** Announce it in Teams and prepare type test updates without waiting until the next day.

After publication is verified, proceed to [type test updates](type-test-updates.md).
Prepare the changes and obtain approvals while downstream feeds propagate; rerun affected CI jobs if they fail because the new packages have not reached those feeds.
