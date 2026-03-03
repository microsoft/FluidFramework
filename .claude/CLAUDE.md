# FluidFramework Claude Code Notes

## Policy Checking
- Run `pnpm policy-check --path <relative-path>` from the repo root to check a specific package. Do NOT `cd` into the package directory.
- Even when changes are applied to a single package, repository-wide checks (`pnpm policy-check` without `--path`) are still appropriate since changes in one package can cause policy failures in others.
