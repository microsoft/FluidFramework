# Type Test Updates (Steps 8-9)

Update type test baselines on both `main` and the release branch. Do this **the day after** the release to allow npm feeds to pick up the published packages.

## Autonomous Mode Notes

In autonomous mode, run both steps sequentially and create both PRs automatically. Report both PRs at the end.

The user should provide the release branch name (e.g., `release/client/2.90`) upfront in autonomous mode, or it can be inferred from context if the user mentions the version.

## CI Resilience

The `flub typetests --reset --previous` command fetches the previously released packages from npm. If the packages are not yet available (e.g., npm feeds haven't updated), this step will fail. In CI:

- If `flub typetests` fails, open a GitHub issue titled `Release <VERSION>: type test update failed — npm packages not yet available` with the error output, and exit gracefully.
- The scheduled workflow will retry on the next run and succeed once packages are available.

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
