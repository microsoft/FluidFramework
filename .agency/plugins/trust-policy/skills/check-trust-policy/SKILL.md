---
name: check-trust-policy
description: Check whether an exact package version has trustworthy provenance and find an attested alternative. Use before adding or installing any new npm package in a project (npm, Yarn, or pnpm), or when asked whether a package version is safe or to verify its provenance.
---

# Check package trust policy

Use the standalone checker compiled into this plugin's `lib` directory.
Resolve its absolute path from this skill's location: `../../lib/trust-policy.js`.
Do not invoke flub or install or build Fluid Framework build-tools.

## When to run

Run this check before installing any net-new package in a project, whether the project uses npm, Yarn, or pnpm.
This includes adding a dependency (`npm install <name>`, `yarn add <name>`, `pnpm add <name>`) and running a package with `npx`, `yarn dlx`, or `pnpm dlx`.
Check every new package you plan to add directly, at the exact version you intend to install.
Do not install the package until the check has finished and you have reported the result to the user.

The checker covers one exact version at a time.
It does not audit a project's existing dependencies or lockfile.

## Prerequisites

- Network access to the registry and to Sigstore.
- If plugin dependencies are missing, install them with `npm ci --engine-strict --prefix "<absolute-plugin-directory>"`.
  Build the TypeScript source with `npm run build --prefix "<absolute-plugin-directory>"` before running the checker.
  This uses the plugin's own compiler, not build-tools.
- Confirm before installing the plugin's dependencies or querying a registry.

The checker itself reports unsupported Node.js versions.

## Network access

The checker probes the registry and Sigstore endpoints the selected policy needs, and the public registries for information, and reports them in `endpointAccess` (or, if the command stops because a required endpoint is blocked, in the error message).
Each entry states its `purpose` and whether it is `required`.
Always tell the user which endpoints are blocked, if any.
If the command stops because a required endpoint is blocked, report that and ask whether the user has an alternative registry or proxy; do not retry with `--no-registry-check` unless the user says the endpoint is reachable through a proxy.

If the command stops because `--registry` is an Azure Artifacts feed, explain that Azure Artifacts does not serve provenance attestations, so results through it would be meaningless.
Ask whether to rerun against the public registry by omitting `--registry`; never edit the user's `.npmrc`.
If the public registry is also blocked, report that a trust check is not possible from this network.

## Procedure

1. Identify the exact `name@version` to check.
   If the user asked for a tag or range (for example `latest` or `^1.2.0`), resolve it to the exact version the package manager would install, and check that version.
   Do not replace an exact-version check with a tag or semver range.
2. If the user has not selected a policy and the session is interactive, use `ask_user` to offer:
   - `cryptographic` (recommended default): verify the SLSA provenance signature, signing certificate, transparency log, and signed package name, version, and registry integrity digest.
   - `metadata`: check only the registry's provenance claim, without cryptographic verification.
   - `no-downgrade`: check publishing history for decreased trust; a pass may have no provenance.
   Do not silently choose a weaker policy.
   In noninteractive mode with no supplied policy, use `cryptographic` and state that default.
3. Confirm permission for registry and Sigstore access.
   Run `node "<absolute-plugin-directory>/lib/trust-policy.js" --package "<name@version>" --policy "<selected-policy>" --json`.
   This does not download package tarballs or install packages.
4. Report `requested.verdict`, `requested.provenanceVerified`, the reason, and any `alternative`.
   An `inconclusive` verdict means the check could not complete (for example, a network or Sigstore failure); it is neither acceptance nor rejection.
   If an alternative is suggested, disclose that it may be from a different major version and require code changes.
   Metadata-only results must never be described as cryptographically verified.
5. Report `auditIncomplete`, `searchTruncated`, and `errors`.
   A zero exit status in JSON mode does not establish acceptance.
   Do not describe any result as proving absence of malware or vulnerabilities.
6. If the version is rejected or inconclusive, do not install it unless the user explicitly accepts the risk.
   Do not download into the target project, install, or change dependency versions unless the user separately requests it.