---
name: check-trust-policy
description: Audit pnpm, Yarn, or npm dependency trust; check whether a specific package version has provenance and find an attested alternative. Use when asked whether a package version is safe, to verify provenance, or to audit trust policy.
---

# Check package trust policy

Use the standalone checker compiled into this plugin's `lib` directory.
Resolve its absolute path from this skill's location: `../../lib/trust-policy.js`.
Do not invoke flub or install or build Fluid Framework build-tools.

## Prerequisites

- Node.js 22.22.2+, 24.15.0+, or 26+ (matching the plugin's engine requirements).
- For dependency audits only: pnpm 10.24.0 or later on PATH.
- For pnpm input, the target workspace's dependencies must already be installed.
  Yarn Classic/Berry and npm package-lock/shrinkwrap v1–v3 are read directly; installed target dependencies are not required.
- Registry access and any required registry credentials.

If plugin dependencies are missing, install them with `npm ci --prefix "<absolute-plugin-directory>"`.
Build the TypeScript source with `npm run build --prefix "<absolute-plugin-directory>"` before running the checker.
This uses the plugin's own compiler, not build-tools.
Confirm before installing dependencies or querying a registry.
Do not install the audited workspace's dependencies automatically.

## Procedure

For a single package, use the single-package procedure below instead of a workspace audit.

Every run first probes `registry.npmjs.org`, `registry.yarnpkg.com`, and `registry.npmmirror.com` and reports them in `registryAccess` (or, if the command stops because a registry is blocked, in the error message).
Always tell the user which registries are blocked, if any.
If the command stops because the registry it needs is blocked, report that and ask whether the user has an alternative registry or proxy; do not retry with `--no-registry-check` unless the user says the registry is reachable through a proxy.

If the command stops because the registry is an Azure Artifacts feed, explain that Azure Artifacts does not serve provenance attestations, so results through it would be meaningless.
Ask whether to rerun against the public registry, for a dependency audit by setting the environment variable `pnpm_config_registry=https://registry.npmjs.org/` (pnpm 11+) or `npm_config_registry=https://registry.npmjs.org/` (pnpm 10) for that command only; never edit the user's `.npmrc`.
If the public registry is also blocked, report that a trust check is not possible from this network.
Relay any warning that packages in a scope resolve from an Azure Artifacts feed and could not be evaluated.

1. Identify the target directory with the user.
   The checker selects the nearest enclosing `pnpm-workspace.yaml`, or the nearest package directory if there is no workspace.
2. Run `node "<absolute-plugin-directory>/lib/trust-policy.js" --path "<target-directory>" --json`.
   For Yarn or npm, pass `--lockfile "<absolute-lockfile-path>"` instead of `--path` to select the exact lockfile.
   Use the operating system's path separators.
   Do not add `--keep` unless the user wants to inspect the generated workspace.
   Add `--include-excluded` only if the user asks to see violations covered by the workspace's `trustPolicyExclude`, or says they prefer to ignore exclusions.
   Otherwise respect the exclusions; do not ask about them proactively.
3. Report `totalUniqueDependencies`, `violations`, and `auditIncomplete`.
   A successful JSON command exit is not a passing audit: JSON mode returns results even when there are violations.
   If `excludedViolationCount` is nonzero and `--include-excluded` was not passed, state how many violations the exclusions suppressed and that they can be listed on request.
   With `--include-excluded`, identify excluded violations by their `excludedBy` selector, separately from unexcluded ones.
4. If `auditIncomplete` is true, state that the checker could not finish and that further violations may exist.
   Ask before rerunning with `--verbose`, which prints registry output.
5. Do not change package versions, trust-policy exclusions, or the target lockfile unless requested.

The checker retains the original pnpm workflow: it creates a scratch workspace, runs lockfile-only installs, and excludes discovered violations only in subsequent scratch-workspace invocations.
It detects decreases in trust evidence, not the absence of provenance on every package, and does not independently verify provenance signatures.

## Single-package procedure

1. Identify the exact `name@version`.
   Do not replace an exact-version check with a tag or semver range.
2. If the user has not selected a policy and the session is interactive, use `ask_user` to offer:
   - `cryptographic` (recommended default): verify SLSA provenance, signing certificate, transparency log, and downloaded artifact digest.
   - `metadata`: check only the registry's provenance claim, without cryptographic verification.
   - `no-downgrade`: check publishing history for decreased trust; a pass may have no provenance.
   Do not silently choose a weaker policy.
   In noninteractive mode with no supplied policy, use `cryptographic` and state that default.
3. Confirm permission for registry/Sigstore access and, for cryptographic mode, downloading tarball bytes for hashing.
   Run `node "<absolute-plugin-directory>/lib/trust-policy.js" --package "<name@version>" --policy "<selected-policy>" --json`.
   This does not install packages or require pnpm.
4. Report `requested.accepted`, `requested.provenanceVerified`, the reason, and any `alternative`.
   If an alternative is suggested, disclose that it may be from a different major version and require code changes.
   Metadata-only results must never be described as cryptographically verified.
5. Report `auditIncomplete`, `searchTruncated`, and `errors`.
   A zero exit status in JSON mode does not establish acceptance.
   Do not describe any result as proving absence of malware or vulnerabilities.
6. Do not download into the target project, install, or change dependency versions unless the user separately requests it.
