# Type Test Updates (Steps 8-9)

Update type test baselines on both `main` and the release branch after publication is verified.
Do not wait until the next day: prepare the changes and obtain approvals while downstream feeds propagate.

## Autonomous Mode Notes

In autonomous mode, run both steps sequentially and create both PRs automatically. Report both PRs at the end.

The user should provide the release branch name (e.g., `release/client/2.90`) upfront in autonomous mode, or it can be inferred from context if the user mentions the version.

## CI Resilience

The `flub typetests --reset --previous` command updates the baseline dependencies and type-test configuration in `package.json`.
The subsequent `pnpm install --no-frozen-lockfile` command fetches the packages from the configured registry.
Even after the exact version is verified on public npm, pipeline feeds can take up to six hours to accept it.

- Inspect the error before attributing a failure to feed propagation.
  Confirm that the exact version exists on public npm and that the failing job cannot resolve it from its configured feed.
- For a confirmed propagation delay, preserve any prepared changes or PRs, report the affected jobs, and rerun them after the feed updates (about six hours after publication if necessary).
  In CI, report the retry checkpoint and let the next scheduled run resume; do not report the release process as complete while checks are failing.
- If packages remain unavailable beyond that window, or the failure has another cause, investigate it.
  In autonomous mode or CI, use the skill's release-blocking issue fallback if the failure prevents progress, including the actual error and remaining commands rather than assuming an npm availability problem.

## Step 8: Update Type Test Baselines on Main

```bash
git checkout main
git pull
```

### Reset and regenerate

```bash
pnpm exec flub typetests -g client --reset --normalize --previous
pnpm install --no-frozen-lockfile
```

Then either do a full build or generate type tests only:

```bash
# Option A: Full build
pnpm run build

# Option B: Type tests only (faster, preferred in autonomous mode)
pnpm run typetests:gen
```

### Refresh compat workspace versions

Re-run `update-compat-versions` now that the newly released version is published to npm. This typically shifts N-1 to the just-released version and slides the back-compat window accordingly:

```bash
pnpm exec fluid-build --task build:esm /test-version-utils$
pnpm run --filter=@fluid-private/test-version-utils update-compat-versions
```

Include any changes (in `compat-workspaces/` and `CompatibilityCheckpoints.md`) in the same PR as the type test baseline updates.

Commit and create a PR targeting `main`.

- **Interactive:** Pause and confirm before creating the PR.
- **Autonomous:** Create the PR automatically.

## Step 9: Update Type Test Baselines on Release Branch

Switch to the release branch and repeat the same process:

```bash
git checkout release/client/<MAJOR>.<MINOR>
git pull
```

```bash
pnpm exec flub typetests -g client --reset --normalize --previous
pnpm install --no-frozen-lockfile
pnpm run typetests:gen
```

Commit and create a PR targeting the release branch.

- **Interactive:** Pause and confirm before creating the PR.
- **Autonomous:** Create the PR automatically.

For the first release of a new minor (X.X0.0), this PR can be combined with the patch version bump PR from Step 7 to avoid running the release branch patch process twice.

**Autonomous mode phase completion:**

> **Phase complete.**
> - Type test baseline PR (main): [link]
> - Type test baseline PR (release branch): [link]
> - **Release process is done.** Merge both PRs when CI passes.
