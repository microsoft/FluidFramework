# Release Execution (Steps 6-7)

Run and publish the release build, then bump the release branch to the next patch version. This applies to both minor (X.X0.0) and patch releases.

## Autonomous Mode Notes

In autonomous mode, run all commands without pausing. The user must still manually queue the ADO release build and, after it succeeds, the ADO publish pipeline — report both actions clearly. Create the patch bump PR automatically after publication is verified.

If any step fails, fall back to opening a GitHub issue describing what was completed, what failed, and the remaining steps with exact commands. Label with `release-blocking`.

## CI Note

In CI, this phase is split into two parts separated by human actions:
- **Step 6 (human):** A human creates the release branch if needed, queues the ADO release build, then queues the ADO publish pipeline after the build succeeds.
- **Step 7 (automatable):** CI creates the patch bump PR after the release tag exists.

CI should auto-detect which step is needed (see SKILL.md auto-detection logic).

## Step 6: Run and Publish the Release Build

**CI note:** This step requires a human to queue both ADO pipelines. Inspect ADO run state to determine whether the release build or publish pipeline is next. If ADO state cannot be queried, report that a human must identify the current checkpoint; do not infer it from tag absence alone.

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

Follow the tool's interactive prompts. The user will need to queue the ADO build manually — this cannot be automated.

**Autonomous mode:** After running `flub release`, report:

> **Action required:** Queue [Build - client packages](https://dev.azure.com/fluidframework/internal/_build?definitionId=12) for the release branch and choose the "release" option for the "Release Build" parameter. After it succeeds, queue the publish pipeline as described below.

### Publish the successful candidate build

After the release build succeeds, manually queue [Publish - client packages](https://dev.azure.com/fluidframework/internal/_build?definitionId=219):

1. Select the successful **Build - client packages** release build from the previous step as the `candidate` pipeline resource.
2. Enable **Publish to public npmjs.org** (`publishToPublicNpm: true`).
3. Queue the publish run and wait for it to succeed.

Before queueing, verify the candidate build used the expected `release/client/<MAJOR>.<MINOR>` branch and release commit. If the publish pipeline fails, stop and triage that run; do not proceed to verification or queue another candidate blindly.

Do not assume that a successful release build automatically publishes packages. Do not proceed to release verification or the patch bump until the publish pipeline succeeds.

**Autonomous mode:** After the release build succeeds, report:

> **Action required:** Queue [Publish - client packages](https://dev.azure.com/fluidframework/internal/_build?definitionId=219), select release build `<BUILD_ID>` as the candidate, and enable **Publish to public npmjs.org**. After the publish run succeeds, verify GitHub and npm publication, then re-invoke for the patch bump.

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

- The **Publish - client packages** run succeeded with the expected candidate and `publishToPublicNpm: true`.
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
> - **Next step:** Announce it in Teams. Then wait until tomorrow for npm feeds to update, and re-invoke for type test updates.

After the release, proceed to [type test updates](type-test-updates.md) **the next day**.
