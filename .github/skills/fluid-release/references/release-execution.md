# Release Execution (Steps 6-7)

Run and publish the release build, then bump the release branch to the next patch version. This applies to both minor (X.X0.0) and patch releases.

## Autonomous Mode Notes

In autonomous mode, run all commands without pausing.
The user must still queue the ADO release build; the publish pipeline starts automatically after that build succeeds.
Monitor both runs and create the patch bump PR automatically only after publication is verified.

If any step fails, fall back to opening a GitHub issue describing what was completed, what failed, and the remaining steps with exact commands. Label with `release-blocking`.

## CI Note

In CI, this phase is split into two parts separated by human actions:
- **Step 6 (human):** A human creates the release branch if needed and queues the ADO release build. Monitor the automatically triggered publish run after the build succeeds.
- **Step 7 (automatable):** CI creates the patch bump PR after the publish run succeeds and the exact GitHub/npm release is verified.

CI should auto-detect which step is needed (see SKILL.md auto-detection logic).

## Step 6: Run and Publish the Release Build

**CI note:** This step requires a human to queue only the ADO build.
Inspect ADO run state to determine whether to request a build or monitor its downstream publish run.
If ADO state cannot be queried, report that a human must identify the current checkpoint; do not infer it from tag absence alone.
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

> **Action required:** Queue [Build - client packages](https://dev.azure.com/fluidframework/internal/_build?definitionId=12) for the release branch and choose the "release" option for the "Release Build" parameter. Leave the other parameters at their defaults. After it succeeds, monitor the automatically triggered publish pipeline as described below.

### Publish the successful candidate build

After the release build succeeds, [Publish - client packages](https://dev.azure.com/fluidframework/internal/_build?definitionId=219) starts automatically.
Do not queue a second publish run.

1. Find the downstream publish run and verify that its `candidate` pipeline resource is the successful release build from the previous step.
2. Verify that the candidate used the expected `release/client/<MAJOR>.<MINOR>` branch and release commit.
3. Confirm that the **Publish to public npmjs.org through ESRP Release API** stage runs and succeeds, rather than being skipped.
4. Wait for the publish run to succeed before verifying the release or starting the patch bump.

The publish pipeline reads its destinations from the candidate's recorded metadata.

If the publish run is missing or fails, investigate the trigger or failed stage before taking further action.
For a failed public npm stage, retry that stage when appropriate rather than starting a duplicate publish run.
Manual queueing is only a recovery action when retrying the existing run is not possible.
It requires human confirmation of the candidate and destinations at the **Approve publication** gate; never bypass that gate.

**Autonomous mode:** After the release build succeeds, report:

> **Publication in progress:** Monitor [Publish - client packages](https://dev.azure.com/fluidframework/internal/_build?definitionId=219) run `<PUBLISH_RUN_ID>`, which selected release build `<BUILD_ID>` as its candidate. After the public npm stage and publish run succeed, verify GitHub and npm publication before the patch bump.

Use this message only after confirming the matching run exists and is in progress.
Otherwise, report its actual state and any required investigation.

### Verify the release

After the publish pipeline succeeds, verify the exact version:

```bash
gh release view client_v<VERSION> --repo microsoft/FluidFramework
pnpm view @fluidframework/container-loader@<VERSION> version --registry=https://registry.npmjs.org/
```

Confirm the GitHub tag and npm result both match the version published by the selected candidate build. Checking a generic releases page or npm search is insufficient because an older release can make those checks appear successful.

Once confirmed, remind the user to announce the release in the Fluid Framework "General" Teams channel with a link to the GitHub release. (Never auto-announce in either mode.)

## Step 7: Bump Release Branch to Next Patch

Do not start Step 7 until all of the following are true:

- The **Publish - client packages** run and its public npm stage succeeded with the expected candidate.
- The exact `client_v<VERSION>` GitHub release exists.
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
> - **Next step:** Announce it in Teams and prepare type test updates without waiting until the next day.

After publication is verified, proceed to [type test updates](type-test-updates.md).
Prepare the changes and obtain approvals while downstream feeds propagate; rerun affected CI jobs if they fail because the new packages have not reached those feeds.
