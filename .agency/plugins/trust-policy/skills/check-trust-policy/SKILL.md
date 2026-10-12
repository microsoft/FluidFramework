---
name: check-trust-policy
description: Audit installed pnpm dependencies for provenance or trusted-publisher downgrades. Use when asked to check package provenance, audit trust policy, or find trust downgrades in a pnpm workspace.
---

# Check package trust policy

Use the standalone checker compiled into this plugin's `lib` directory.
Resolve its absolute path from this skill's location: `../../lib/run.js`.
Do not invoke flub or install or build Fluid Framework build-tools.

## Prerequisites

- Node.js 22.22.2 or later.
- pnpm 10.24.0 or later on PATH.
- The target workspace's dependencies must already be installed.
- Registry access and any required registry credentials.

If plugin dependencies are missing, install them with `npm ci --prefix "<absolute-plugin-directory>"`.
Build the TypeScript source with `npm run build --prefix "<absolute-plugin-directory>"` before running the checker.
This uses the plugin's own compiler, not build-tools.
Confirm before installing dependencies or querying a registry.
Do not install the audited workspace's dependencies automatically.

## Procedure

1. Identify the target directory with the user.
   The checker selects the nearest enclosing `pnpm-workspace.yaml`, or the nearest package directory if there is no workspace.
2. Run `node "<absolute-plugin-directory>/lib/run.js" --path "<target-directory>" --json`.
   Use the operating system's path separators.
   Do not add `--keep` unless the user wants to inspect the generated workspace.
3. Report `totalUniqueDependencies`, `violations`, and `auditIncomplete`.
   A successful JSON command exit is not a passing audit: JSON mode returns results even when there are violations.
4. If `auditIncomplete` is true, state that the checker could not finish and that further violations may exist.
   Ask before rerunning with `--verbose`, which prints registry output.
5. Do not change package versions, trust-policy exclusions, or the target lockfile unless requested.

The checker retains the original pnpm workflow: it creates a scratch workspace, runs lockfile-only installs, and excludes discovered violations only in subsequent scratch-workspace invocations.
It detects decreases in trust evidence, not the absence of provenance on every package, and does not independently verify provenance signatures.
