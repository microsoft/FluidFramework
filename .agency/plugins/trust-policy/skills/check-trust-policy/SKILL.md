---
name: check-trust-policy
description: Audit pnpm, Yarn, or npm dependency trust; check whether a specific package version has provenance and find an attested alternative. Use when asked whether a package version is safe, to verify provenance, or to audit trust policy.
---

# Check package trust policy

Use the standalone checker compiled into this plugin's `lib` directory.
Resolve its absolute path from this skill's location: `../../lib/trust-policy.js`.
Do not invoke flub or install or build Fluid Framework build-tools.

## Prerequisites

- For pnpm input, the target workspace's dependencies must already be installed. This is needed because we are not parsing the lockfiles directly and running pnpm in a temporary folder.
  Yarn Classic/Berry and npm package-lock/shrinkwrap v1–v3 are read directly; installed target dependencies are not required.
- Registry access and any required registry credentials.

If plugin dependencies are missing, install them with `npm ci --engine-strict --prefix "<absolute-plugin-directory>"`.
Build the TypeScript source with `npm run build --prefix "<absolute-plugin-directory>"` before running the checker.
This uses the plugin's own compiler, not build-tools.
Confirm before installing dependencies or querying a registry.
Do not install the audited workspace's dependencies automatically.
The checker itself reports unsupported Node.js and pnpm versions.

## Network access

The checker probes the package registries and Sigstore endpoints relevant to the command and reports them in `endpointAccess` (or, if the command stops because a required endpoint is blocked, in the error message).
Each entry states its `purpose` and whether it is `required`; only the endpoints the selected mode needs are required, and other public registries are reported for information only.
Always tell the user which endpoints are blocked, if any.
If the command stops because a required endpoint is blocked, report that and ask whether the user has an alternative registry or proxy; do not retry with `--no-registry-check` unless the user says the endpoint is reachable through a proxy.

If the command stops because the registry is an Azure Artifacts feed, explain that Azure Artifacts does not serve provenance attestations, so results through it would be meaningless.
Ask whether to rerun against the public registry; never edit the user's `.npmrc`.
If the public registry is also blocked, report that a trust check is not possible from this network.
Relay any warning that packages in a scope resolve from an Azure Artifacts feed and could not be evaluated.

## Dependency audit procedure

For a single package, use the single-package procedure below instead of a dependency audit.

1. Identify the target directory or lockfile with the user.
   The checker selects the nearest supported lockfile or workspace enclosing the target directory.
2. Run `node "<absolute-plugin-directory>/lib/trust-policy.js" --path "<target-directory>" --json`.
   To select an exact Yarn or npm lockfile, pass `--lockfile "<absolute-lockfile-path>"` instead of `--path`.
3. Report `totalUniqueDependencies`, `violations`, and `auditIncomplete`.
   A successful JSON command exit is not a passing audit: JSON mode returns results even when there are violations.
4. If `auditIncomplete` is true, state that the checker could not finish and that further violations may exist.
   Ask before rerunning with `--verbose`, which prints registry output.
5. Do not change package versions, trust-policy exclusions, or the target lockfile unless requested.

Audits detect decreases in trust evidence, not the absence of provenance on every package, and do not independently verify provenance signatures.

## pnpm workflow

Every dependency audit, including Yarn and npm lockfile audits, evaluates trust with pnpm in a scratch workspace.
The checker creates the scratch workspace, runs lockfile-only installs, and excludes discovered violations only in subsequent scratch-workspace invocations.
Whether those installs download packages depends on pnpm's cache state.

- For pnpm input, the checker selects the nearest enclosing `pnpm-workspace.yaml`, or the nearest package directory if there is no workspace.
- Do not add `--keep` unless the user wants to inspect the generated scratch workspace.
- Add `--include-excluded` only if the user asks to see violations covered by the workspace's `trustPolicyExclude`, or says they prefer to ignore exclusions.
  Otherwise respect the exclusions; do not ask about them proactively.
- If `excludedViolationCount` is nonzero and `--include-excluded` was not passed, state how many violations the exclusions suppressed and that they can be listed on request.
  With `--include-excluded`, identify excluded violations by their `excludedBy` selector, separately from unexcluded ones.
- To rerun against the public registry after an Azure Artifacts error, set `pnpm_config_registry=https://registry.npmjs.org/` (pnpm 11+) or `npm_config_registry=https://registry.npmjs.org/` (pnpm 10) for that command only.

## Single-package procedure

1. Identify the exact `name@version`.
   Do not replace an exact-version check with a tag or semver range.
2. If the user has not selected a policy and the session is interactive, use `ask_user` to offer:
   - `cryptographic` (recommended default): verify the SLSA provenance signature, signing certificate, transparency log, and signed package name, version, and registry integrity digest.
   - `metadata`: check only the registry's provenance claim, without cryptographic verification.
   - `no-downgrade`: check publishing history for decreased trust; a pass may have no provenance.
   Do not silently choose a weaker policy.
   In noninteractive mode with no supplied policy, use `cryptographic` and state that default.
3. Confirm permission for registry and Sigstore access.
   Run `node "<absolute-plugin-directory>/lib/trust-policy.js" --package "<name@version>" --policy "<selected-policy>" --json`.
   This does not download package tarballs, install packages, or require pnpm.
4. Report `requested.verdict`, `requested.provenanceVerified`, the reason, and any `alternative`.
   An `inconclusive` verdict means the check could not complete (for example, a network or Sigstore failure); it is neither acceptance nor rejection.
   If an alternative is suggested, disclose that it may be from a different major version and require code changes.
   Metadata-only results must never be described as cryptographically verified.
5. Report `auditIncomplete`, `searchTruncated`, and `errors`.
   A zero exit status in JSON mode does not establish acceptance.
   Do not describe any result as proving absence of malware or vulnerabilities.
6. Do not download into the target project, install, or change dependency versions unless the user separately requests it.