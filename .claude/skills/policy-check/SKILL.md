---
name: policy-check
description: This skill should be used when the user asks to "run policy check", "check policy", "policy-check", or needs to validate package compliance. Provides guidance on running policy checks for specific packages or the entire repository.
---

Run `pnpm policy-check --path <relative-path>` from the repo root to check a specific package. Do NOT `cd` into the package directory.

Even when changes are applied to a single package, repository-wide checks (`pnpm policy-check` without `--path`) are still appropriate since changes in one package can cause policy failures in others.

After changing a package manifest or build task, rerun the focused policy check for that package before broader validation.

TypeScript compilation tasks must use repository-recognized task names and dependency declarations.
Prefer the established `build:esm` script with a `tsc --project ./tsconfig.json` command.
The generating command must start with `tsc` or `fluid-tsc`; do not prefix it with cleanup or another chained command.
When clean emission is required, put cleanup in a separate script and declare that script as a `fluidBuild.tasks.build:esm` dependency.

If changed files affect a registered pnpm package or a declared input to one of its build tasks, policy success is not sufficient.
Run `pnpm build:fast` from the repository root as well.
This applies to package/task/dependency changes, workspace or lockfile changes, and generated-artifact inputs listed by a declarative task.
Documentation-only changes outside build inputs do not require the repository build.
