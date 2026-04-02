---
name: policy-check
description: This skill should be used when the user asks to "run policy check", "check policy", "policy-check", or needs to validate package compliance. Provides guidance on running policy checks for specific packages or the entire repository.
---

Run `pnpm policy-check --path <relative-path>` from the repo root to check a specific package. Do NOT `cd` into the package directory.

Even when changes are applied to a single package, repository-wide checks (`pnpm policy-check` without `--path`) are still appropriate since changes in one package can cause policy failures in others.
