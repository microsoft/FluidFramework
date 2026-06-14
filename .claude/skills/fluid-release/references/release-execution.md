# Release Execution (Steps 6-7)

Run the release build and bump the release branch to the next patch version. This applies to both minor (X.X0.0) and patch releases.

## Autonomous Mode Notes

In autonomous mode, run all commands without pausing. The user must still manually queue the ADO build — report this clearly at the end. Create the patch bump PR automatically.

If any step fails, fall back to opening a GitHub issue describing what was completed, what failed, and the remaining steps with exact commands. Label with `release-blocking`.

## CI Note

In CI, this phase is split into two parts separated by a human action:
- **Step 6 (human):** A human queues the ADO release build and creates the release branch if needed.
- **Step 7 (automatable):** CI creates the patch bump PR after the release tag exists.

CI should auto-detect which step is needed (see SKILL.md auto-detection logic).

## Step 6: Run the Release Build

**CI note:** This step requires a human to queue the ADO build. In CI, check for the release tag. If it doesn't exist, report that the human needs to queue the ADO build and stop.

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

If blockers are found, **stop and report them**. Do not proceed with the release. Also explicitly ask the user to check ADO for release-blocking issues and confirm there are none before proceeding.

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

> **Action required:** Queue the release build in ADO (choose the "release" option). After the build completes, verify the release appears in GitHub releases and npm, then re-invoke for the patch bump.

### Verify the release

After the build completes, confirm:
- Listed in [GitHub releases](https://github.com/microsoft/FluidFramework/releases)
- Published on [npm](https://www.npmjs.com/search?q=%40fluidframework)

Once confirmed, remind the user to announce the release in the "Fluid Framework All" Teams channel with a link to the GitHub release. (Never auto-announce in either mode.)

## Step 7: Bump Release Branch to Next Patch

Wait for the release tag to be added to the repo, then either:

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
> - **Next step:** After the release is verified on GitHub/npm, announce it in Teams. Then wait until tomorrow for npm feeds to update, and re-invoke for type test updates.

After the release, proceed to [type test updates](type-test-updates.md) **the next day**.
