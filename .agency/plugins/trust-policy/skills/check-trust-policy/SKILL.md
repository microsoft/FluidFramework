---
name: check-trust-policy
description: Check whether an exact package version has trustworthy provenance and find an attested alternative. Use before adding, upgrading, or installing any npm package version that is not already in the project's lockfile (npm, Yarn, or pnpm), or when asked whether a package version is safe or to verify its provenance.
# Interim: this pre-approves every `node` command, not just the checker.
# Copilot permission rules match only the program name for interpreters, and neither Copilot nor Agency expands the plugin root in skill frontmatter, so a rule scoped to this plugin's script is not currently possible.
allowed-tools: Bash(node:*)
---

# Check package trust policy

Use the standalone checker compiled into this plugin's `lib` directory.
Resolve its absolute path from this skill's location: `../../lib/trust-policy.js`.
Do not invoke flub or install or build Fluid Framework build-tools.

## When to run

Run this check before installing any new package in a project, whether the project uses npm, Yarn, or pnpm.
An install is new when the project's lockfile does not already contain the requested version of that package.
This includes upgrading or downgrading a package that the lockfile already contains at a different version.
It also includes adding a dependency (`npm install <name>`, `yarn add <name>`, `pnpm add <name>`) and running a package with `npx`, `yarn dlx`, or `pnpm dlx`.
Check every new package version you plan to add or upgrade directly, at the exact version you intend to install.
Do not install the package until the check has finished and you have reported the result to the user.

The checker covers one exact version at a time.
It does not audit a project's existing dependencies or lockfile.

## Prerequisites

- Network access to the registry and to Sigstore.
- A built checker; step 1 of the procedure builds it if needed.

The checker itself reports unsupported Node.js versions.

## Network access

The checker probes the registry and, for the `cryptographic` and `no-downgrade` policies, Sigstore, and reports the results in `endpointAccess`.
Each entry states its `purpose` and whether it was `reachable`.
Probes are diagnostic only and never stop the check: a registry can serve package metadata while rejecting its probe, and Sigstore verification can use cached metadata.
Always tell the user which endpoints were unreachable, if any.
If the verdict is `inconclusive` and an endpoint was unreachable, report that as the likely cause and ask whether the user has an alternative registry or proxy.

If the command stops because `--registry` is an Azure Artifacts feed, explain that Azure Artifacts does not serve provenance attestations, so results through it would be meaningless.
Ask whether to rerun against the public registry by omitting `--registry`; never edit the user's `.npmrc`.
If the public registry is also unreachable, report that a trust check is not possible from this network.

## Procedure

1. Build the plugin if `<absolute-plugin-directory>/lib/trust-policy.js` does not exist.
   Confirm with the user before installing the plugin's dependencies.
   If `<absolute-plugin-directory>/node_modules` does not exist, install them with `npm ci --engine-strict --prefix "<absolute-plugin-directory>"`.
   Then run `npm run build --prefix "<absolute-plugin-directory>"`.
   This uses the plugin's own compiler, not build-tools.
   If installation or the build fails, report the error and stop.

   > [!NOTE]
   > Building from source is temporary.
   > A future version of this skill will download a prebuilt checker package instead.

2. Identify the exact `name@version` to check.
   If the user asked for a tag or range (for example `latest` or `^1.2.0`), resolve it to the exact version the package manager would install, and check that version.
   Do not replace an exact-version check with a tag or semver range.
3. If the user has not selected a policy and the session is interactive, use `ask_user` to offer:
   - `cryptographic` (recommended default): verify the SLSA provenance signature, signing certificate, transparency log, and signed package name, version, and registry integrity digest.
   - `metadata`: check only the registry's provenance claim, without cryptographic verification.
   - `no-downgrade`: check publishing history for decreased trust; a pass may have no provenance. Suggested alternatives must also pass cryptographic verification.
   Do not silently choose a weaker policy.
   In noninteractive mode with no supplied policy, use `cryptographic` and state that default.
4. Confirm permission for registry and Sigstore access.
   Dispatch a separate subagent for each checker invocation: one per exact `name@version`, in parallel when checking several packages.
   Complete all user prompts (policy selection and permissions) before dispatching; subagents must not prompt the user.
   Give each subagent the absolute checker path, the exact `name@version`, the selected policy, any `--registry` value, and instructions to run
   `node "<absolute-plugin-directory>/lib/trust-policy.js" --package "<name@version>" --policy "<selected-policy>" --json`
   and return the complete JSON output and exit status without interpreting them.
   The checker does not download package tarballs or install packages.
   Handle each subagent's result yourself according to the steps below and the network access guidance above.
5. Report `requested.verdict`, `requested.provenanceVerified`, the reason, and any `alternative`.
   An `inconclusive` verdict means the check could not complete (for example, a network or Sigstore failure); it is neither acceptance nor rejection.
   If an alternative is suggested, disclose that it may be from a different major version and require code changes.
   An alternative passes the same policy as the requested version, and always has registry-reported provenance.
   Under `no-downgrade`, an alternative is also cryptographically verified, so its `provenanceVerified` is true.
   Metadata-only results must never be described as cryptographically verified.
6. Report `auditIncomplete`, `searchTruncated`, and `errors`.
   A zero exit status in JSON mode does not establish acceptance.
   Do not describe any result as proving absence of malware or vulnerabilities.
7. If the version is rejected or inconclusive, do not install it unless the user explicitly accepts the risk.
   Do not download into the target project, install, or change dependency versions unless the user separately requests it.