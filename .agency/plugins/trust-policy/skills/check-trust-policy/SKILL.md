---
name: check-trust-policy
description: Check whether an exact package version has trustworthy provenance and find an attested alternative. Use before adding, upgrading, or installing any npm package version that is not already in the project's lockfile (npm, Yarn, or pnpm), including through update commands or npx, npm exec, or dlx, or when asked whether a package version is safe or to verify its provenance.
---

# Check package trust policy

Use the standalone checker compiled into this plugin's `lib` directory.
Resolve its absolute path from this skill's location: `../../lib/trust-policy.js`.

## When to run

Run this check before installing any new package in a project, whether the project uses npm, Yarn, or pnpm.
An install is new when the project's lockfile does not already contain the requested version of that package.
This includes upgrading or downgrading a package that the lockfile already contains at a different version.
It covers any install, update, exec, or similar command in these package managers, including aliases and abbreviations.
For example:

- Install: `npm install <name>`, `pnpm add <name>`.
- Update: `yarn up`, `pnpm update`.
- Exec: `npx`, `pnpm dlx`.
- Installing after editing a dependency version, override, or resolution in `package.json` or a pnpm catalog: `npm install`, `yarn install`.

Check every package version the command would add to or change in the project, including new transitive dependencies, and every package the command would run.
Get each exact version in one of only two ways:

1. **From the command line**, when the command names an exact version of a package, such as `pnpm add foo@1.2.3` or `npx foo@1.2.3`.
   This covers only the named package.
2. **From [Resolving versions](#resolving-versions)**, for everything else: a package with no version, a tag, or a range; update commands; installs after a manifest edit; and every new transitive dependency of a package added to the project.

Do not determine versions any other way, for example by assuming `latest` or by reading `npm outdated`.
Do not install or run the package until the check has finished and you have reported the result to the user.

The checker covers one exact version at a time.
It does not audit a project's existing dependencies or lockfile.

## Resolving versions

Do not assume that a command without a version installs `latest`.
Catalogs, overrides, pnpm's `minimumReleaseAge`, and ranges used elsewhere in a workspace can all change the version a package manager picks.
Ask the package manager instead, without changing the user's project, and then install or run exactly the versions that were checked.

### Commands that change the lockfile

This applies to adding a dependency, updating dependencies, and installing after a manifest edit.

1. Copy the project's `package.json`, its lockfile, and its package manager configuration (`.npmrc`, `pnpm-workspace.yaml`, `.yarnrc.yml`) to a new temporary directory.
   For a workspace, copy the workspace root and every member's `package.json`, preserving their relative paths.
   Apply any manifest edit there as well.
2. In the copy, run the intended command with the same arguments and flags, in lockfile-only mode, so that no package code runs:
   - npm: add `--package-lock-only`, which reads only package metadata.
   - pnpm: add `--lockfile-only`, which reads only package metadata.
   - Yarn 2 and later: add `--mode=update-lockfile`, which downloads new packages into Yarn's cache to record their checksums but does not install them.
   - Yarn 1 has no lockfile-only mode: add `--ignore-scripts`, which installs packages into the copy but runs no package scripts.

   An interactive picker such as `yarn upgrade-interactive` cannot be previewed.
   Use `yarn up "<name>@<version>"` for each chosen package instead.
3. Compare the copy's lockfile with the original.
   Check every `name@version` that is new or changed, including transitive dependencies.
4. If every version is accepted, copy each file that the command changed in the copy back into the project, and run a frozen install:
   `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --frozen-lockfile` (Yarn 1), or `yarn install --immutable` (Yarn 2 and later).
   Do not rerun the original command, which could resolve a version published after the check.
5. Delete the temporary directory.

### Commands that run a package

This applies to `npx`, `npm exec`, `yarn dlx`, `pnpm dlx`, and `pnpx`, which do not use the project's lockfile.

1. Identify the package name: the command's first argument, or the `-p` or `--package` value.
   This is not the name of the executable it provides; for example, `npx tsc` fetches the package named `tsc`, not `typescript`.
2. Resolve the version with `npm view "<name>@<spec>" version --json`, using `latest` when no version is given.
   For a range, the package manager picks the `latest` version if it satisfies the range, and otherwise the highest matching version.
3. If the version is accepted, run the command with that exact version, for example `npx "<name>@<version>"` or `pnpm dlx "<name>@<version>"`.
   Pinning also prevents reuse of an older cached copy.

The run package's own dependencies are not checked unless the user asks.
To check them, run `npm install "<name>@<version>" --package-lock-only` in an empty temporary directory, and check each version in the resulting lockfile.

## Prerequisites

- Network access to the npm package registry and to Sigstore.
- A built checker, which the user builds once; step 1 of the procedure detects whether it is missing.

The checker itself reports unsupported Node.js versions.

## Network access

The checker probes the npm package registry and, for the `cryptographic` and `no-downgrade` policies, Sigstore, and reports the results in `endpointAccess`.
Each entry states its `purpose` and whether it was `reachable`.
Probes are diagnostic only and never stop the check: an npm package registry can serve package metadata while rejecting its probe, and Sigstore verification can use cached metadata.
Always tell the user which endpoints were unreachable, if any.
If the verdict is `inconclusive` and an endpoint was unreachable, report that as the likely cause and ask whether the user has an alternative npm package registry or proxy.

If the command stops because `--registry` is an Azure Artifacts feed, explain that Azure Artifacts does not serve provenance attestations, so results through it would be meaningless.
Ask whether to rerun against the public npm package registry (registry.npmjs.org) by omitting `--registry`; never edit the user's `.npmrc`.
If the public npm package registry is also unreachable, report that a trust check is not possible from this network.

## Procedure

1. Determine whether the checker needs to be built.
   It does if either `<absolute-plugin-directory>/node_modules` or `<absolute-plugin-directory>/lib/trust-policy.js` does not exist.
   Check with a file-viewing or file-search tool; do not run the build or install commands yourself.
   If the checker needs to be built, stop and give the user these commands to run in a terminal, with the absolute plugin directory filled in:

   ```sh
   npm ci --engine-strict --prefix "<absolute-plugin-directory>"
   npm run build --prefix "<absolute-plugin-directory>"
   ```

   Explain that this installs the plugin's own dependencies and compiler, not Fluid Framework build-tools, and does not touch the user's project.
   Ask the user to repeat the request once the build succeeds, and do not continue with the remaining steps.

2. Identify each exact `name@version` to check, using only the two sources in [When to run](#when-to-run).
   Do not replace an exact-version check with a tag or semver range.
3. If the user has not selected a policy and the session is interactive, use `ask_user` to offer:
   - `cryptographic` (recommended default): verify the SLSA provenance signature, signing certificate, transparency log, and signed package name, version, and npm package registry integrity digest.
   - `metadata`: check only the npm package registry's provenance claim, without cryptographic verification.
   - `no-downgrade`: check publishing history for decreased trust; a pass may have no provenance. Suggested alternatives must also pass cryptographic verification.
   Do not silently choose a weaker policy.
   In noninteractive mode with no supplied policy, use `cryptographic` and state that default.
4. Confirm permission for npm package registry and Sigstore access.
   Dispatch a separate subagent for each checker invocation: one per exact `name@version`, in parallel when checking several packages.
   When many versions need checking, such as a dependency's transitive dependencies, a subagent may run the checker for several versions in sequence and return each result.
   Complete all user prompts (policy selection and permissions) before dispatching; subagents must not prompt the user.
   Give each subagent the absolute checker path, the exact `name@version`, the selected policy, any `--registry` value, and instructions to run
   `node "<absolute-plugin-directory>/lib/trust-policy.js" --package "<name@version>" --policy "<selected-policy>" --json`
   and return the complete JSON output and exit status without interpreting them.
   The checker does not download package tarballs or install packages.
   Handle each subagent's result yourself according to the steps below and the network access guidance above.
5. Report `requested.verdict`, `requested.provenanceVerified`, the reason, and any `alternative`.
   An `inconclusive` verdict means the check could not complete (for example, a network or Sigstore failure); it is neither acceptance nor rejection.
   If an alternative is suggested, disclose that it may be from a different major version and require code changes.
   An alternative passes the same policy as the requested version, and always has provenance reported by the npm package registry.
   Under `no-downgrade`, an alternative is also cryptographically verified, so its `provenanceVerified` is true.
   Metadata-only results must never be described as cryptographically verified.
6. Report `auditIncomplete`, `searchTruncated`, and `errors`.
   A zero exit status in JSON mode does not establish acceptance.
   Do not describe any result as proving absence of malware or vulnerabilities.
7. If every checked version is accepted, install or run exactly the checked versions, as described in [Resolving versions](#resolving-versions).
8. If the version is rejected or inconclusive, do not install it unless the user explicitly accepts the risk.
   Do not install a suggested alternative instead, or otherwise change dependency versions, unless the user separately requests it.

## Autonomous sessions

In an autonomous session (such as autopilot or noninteractive mode), the user may not be present to answer prompts.

- Do not wait for policy selection or permission prompts; use the `cryptographic` policy unless the user supplied one, and state the policy used.
- If the checker needs to be built, do not build it; stop the install and report the build commands from step 1.
- If every checked version is accepted, report the results and install or run exactly the checked versions.
- If any checked version is rejected or inconclusive, do not run the install or substitute an alternative.
  Report the verdicts and any suggested alternatives, and leave the decision to the user.
  Continue with parts of the task that do not depend on that install, if any.