# Fluid Framework build-tools v0.13

The 0.13 build-tools release includes a new command, `flub exec`, and various bug fixes. These release notes
cover the major changes in this release.

## ✨ Features

### `flub exec` runs shell commands in the context of repo projects

[PR #14635](https://github.com/microsoft/FluidFramework/issues/14635)

The `flub exec` command can be used to execute shell commands in the context of packages or release groups in the repo.

The following example runs `pnpm -r remove @rushstack/eslint-config` on all independent packages and all release group root packages:

```shell
flub exec --all --releaseGroupRoots "pnpm -r remove @rushstack/eslint-config"
```

### `check policy` has a setting to ignore single-package pnpm workspaces

[PR #14656](https://github.com/microsoft/FluidFramework/issues/14656)

pnpm does not support nesting packages under a workspace that is not managed by the workspace. That is, if there's a pnpm-workspace.yaml file anywhere in the parent hierarchy, pnpm doesn't install the package individually like one might expect.

Because we have the client release group at the root of the repo, there's a pnpm-workspace.yaml file in the hierarchy for our independent packages as well. We put a workspace file in each independent package so pnpm treats the project as a one-package workspace.

However, for `check policy`, we need to be able to treat these single-package workspaces differently. In particular we
don't want to enforce the preinstall script that we use in release group roots. There is now a setting that contains a list of packages that are single-package workspaces.

## 🐛 Bug fixes

This list only includes notable bug fixes. See [the changelog](./CHANGELOG.md#0130-2022-03-22) for a full list of fixes
in this release.

### `check policy` now uses the correct indentation when editing package.json files

[PR #14481](https://github.com/microsoft/FluidFramework/issues/14481)

Previously the indentation was changed to spaces when check policy was run. This has been corrected.

---

# Fluid Framework build-tools v0.12

The 0.12 build-tools release includes improvements to `flub release` and `generate:typetests`. These release notes
cover the major changes in this release.

## ✨ Features

### `flub release` tags asserts separately from policy-check

[PR #14316](https://github.com/microsoft/FluidFramework/issues/14316)

`flub release` now handles policy errors and assert handling separately, which makes releases easier to understand.

### `generate typetests` is simpler and faster

[PR #14334](https://github.com/microsoft/FluidFramework/issues/14334)

The `generate typetests` command has been rewritten to be faster and simpler.

## 🐛 Bug fixes

See [the changelog](./CHANGELOG.md#0120-2023-03-08) for a full list of fixes in this release.

### `flub release` installs dependencies if needed

[PR #14348](https://github.com/microsoft/FluidFramework/issues/14348)

`flub release` now correctly installs dependencies if needed during a release.

---

# Fluid Framework build-tools v0.11.0

This version was not released due to internal build system problems.

# Fluid Framework build-tools v0.10.0

The 0.10 build-tools release includes improvements to `flub release`. These release notes
cover the major changes in this release.

## ✨ Features

### `flub bump` supports interdependency bump types

[PR #14161](https://github.com/microsoft/FluidFramework/issues/14161)

When using `flub` to bump versions of packages in a release group, we sometimes want to control the type of dependency range that we use for dependencies on other packages in the release group.

`flub bump` now supports an `--exactDepType` flag that can be set to `"^"`, `"~"`, or `""` (defaults to `"^"`). If set to `""`, inter-release-group dependencies will be pinned to the exact version.

### `flub release` supports SSH remotes

[PR #14145](https://github.com/microsoft/FluidFramework/issues/14145)

`flub release` and other release-related commands now support SSH remotes. Previously only HTTPS remotes were supported.

### Build tools configuration can be outside package.json

[#14215](https://github.com/microsoft/FluidFramework/issues/14215)

The configuration for build tools can now be stored in its own config file outside package.json.

## 🐛 Bug fixes

See [the changelog](./CHANGELOG.md#0100-2023-02-22) for a full list of fixes in this release.

---

## [0.9.0](https://github.com/microsoft/FluidFramework/compare/build-tools_v0.9.0...build-tools_v0.9.0) (2023-02-08)

## ✨ Features

### `flub release` includes links to ADO pipelines

[PR #13764](https://github.com/microsoft/FluidFramework/issues/13764)

`flub release` now includes links to ADO pipelines, making it much easier to run release builds when needed.

## 🐛 Bug fixes

See [the changelog](./CHANGELOG.md#090-2023-02-08) for a full list of fixes in this release.

---

# Fluid Framework build-tools v0.9.0

The 0.9 build-tools release includes improvements to `flub release`. These release notes
cover the major changes in this release.

## ✨ Features

### `flub release` includes links to ADO pipelines

[PR #13764](https://github.com/microsoft/FluidFramework/issues/13764)

`flub release` now includes links to ADO pipelines, making it much easier to run release builds when needed.

## 🐛 Bug fixes

See [the changelog](./CHANGELOG.md#080-2023-01-24) for a full list of fixes in this release.

---

# Fluid Framework build-tools v0.8.0

The 0.8 build-tools release is a maintenance release focused on bug fixes.

## 🐛 Bug fixes

See [the changelog](./CHANGELOG.md#080-2023-01-24) for a full list of fixes in this release.

# Fluid Framework build-tools v0.7

The 0.7 build-tools release includes improvements to `run:bundleStats` and bug fixes.

## 💥 Breaking changes

-   **run:bundleStats:** The `--dirname` argument has been removed. There is now
    a `--dangerfile` argument that defaults to the built-in dangerfile but
    can be customized if needed.

## 🐛 Bug fixes

See [the changelog](./CHANGELOG.md#070-2022-12-08) for a full list of fixes in this release.

---

# Fluid Framework build-tools v0.6

The 0.6 build-tools release includes several improvements to fluid-build and type test generation. These release notes
cover the major changes in this release.

This is a **major release** that includes some breaking changes in addition to useful new features and bug fixes:

-   [Type compatibility tests are configurable per-branch](#type-compatibility-tests-are-configurable-per-branch)
-   [Release groups can use yarn or pnpm](#release-groups-can-use-yarn-or-pnpm)

## 💥 Breaking changes

This release contains some breaking changes to the `generate typetests` and `release report` commands:

-   **generate:typetests:** `fluid-type-validator` is deprecated. Use `flub generate typetests` instead.
-   **release:report:** The `--all` and `--limit` flags have been removed from `flub release report`. Use [`flub release history`](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/release.md#flub-release-history)
    instead.

## ✨ Features

### Type compatibility tests are configurable per-branch

Type tests can now be configured to use different baseline versions on a given branch depending on the type of release
that the branch is designated for. For example, for the client release group, the _next_ branch is the _major version
series branch_ and _main_ is the _minor version series branch_. This can be declared in the release group root
package.json, in the `fluidBuild.branchReleaseTypes` section. For example, the following configuration designates the
_main_ and _lts_ branches as minor version series branches, while the _next_ branch is designated for major releases.

```json
"fluidBuild": {
  "branchReleaseTypes": {
    "main": "minor",
    "lts": "minor",
    "release/**": "patch",
    "next": "major"
  }
}
```

The type test generator takes this information into account when calculating the baseline version to use when it's run
from a particular branch.

### Release groups can use yarn or pnpm

`fluid-build` can now use pnpm or yarn to install a release group's dependencies instead of npm. pnpm will only be used
if there is a pnpm-workspace.yaml file in the root of the release group. yarn will only be used if there is a yarn.lock
file in the root of the release group/package. Otherwise npm will be used.

See [PR #12236](https://github.com/microsoft/FluidFramework/pull/12236) for an example of switching a release group to
use pnpm.

## 🐛 Bug fixes

This list only includes notable bug fixes. See [the changelog](./CHANGELOG.md#060-2022-11-28) for a full list of fixes
in this release.

### `fluid-build` parses tasks from build-cli incorrectly

[PR #12988](https://github.com/microsoft/FluidFramework/issues/12988)

fluid-build now parses build commands with subcommands properly. Prior to this release, build commands like `flub generate typetests` were not parsed correctly into fluid-build's build graph.

## List of packages released

-   @fluid-tools/build-cli
-   @fluidframework/build-tools
-   @fluidframework/bundle-size-tools
-   @fluid-tools/version-tools

# Fluid Framework build-tools v0.5

The 0.5 build-tools release includes several new commands and flags to improve the developer experience when using the
tools. These release notes cover the major changes in this release.

This is a **major release** that includes some breaking changes in addition to useful new features and bug fixes:

-   [Autocomplete support for bash and zsh](#autocomplete-support-for-bash-and-zsh)
-   [`flub merge info` shows main/next branch integration status](#flub-merge-info-shows-mainnext-branch-integration-status)
-   [`release report` command has a new `--all` flag](#release-report-command-has-a-new---all-flag)
-   [`generate typetests` is a more configurable type test generator](#generate-typetests-is-a-more-configurable-type-test-generator)
-   [`bump` command has a new `--exact` flag](#bump-command-has-a-new---exact-flag)
-   [`check policy` can list and exclude handlers by name](#check-policy-can-list-and-exclude-handlers-by-name)
-   [`check policy` checks for extraneous lockfiles and tilde dependencies](#check-policy-checks-for-extraneous-lockfiles-and-tilde-dependencies)
-   [Conventional commits enabled in build-tools release group](#conventional-commits-enabled-in-build-tools-release-group)

For a full list of changes in this release, see the [changelog](./CHANGELOG.md#050-2022-11-04).

## 💥 Breaking changes

This release contains some breaking changes to the `bump deps` and `check layers` commands:

-   **bump:deps:** The `-p` flag has been changed to specify a package
    name, which is consistent with
    other commands. Use `--prerelease` to replace former uses of `-p`.
-   **check:layers:** The `--info` flag is now required.

## ✨ Features

### Autocomplete support for bash and zsh

`flub` now supports command auto-completion for bash and zsh. Type `flub autocomplete` to get started. See [the
documentation](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/autocomplete.md)
for more details.

![flub-autocomplete](https://user-images.githubusercontent.com/19589/199857774-57e4f31b-b8f1-498e-a66b-9d4450b9a980.gif)

### `flub merge info` shows main/next branch integration status

This command provides info about the merge status of branches in the repo. The most obvious use-case is to check how far
_next_ is behind _main_, so those are the default arguments.

The output is just the number of commits behind one branch is from the other, but add the `--json` flag to get more
details.

![flub-merge-info](https://user-images.githubusercontent.com/19589/199857775-fc579952-8249-4cd5-b4b1-59762cc55b37.gif)

Full documentation for the command can be found at
<https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/merge.md#flub-merge-info>.

### `release report` command has a new `--all` flag

The new `--all` flag can be used to retrieve a list of all releases for a release group.

![flub-release-report-all](https://user-images.githubusercontent.com/19589/199858774-ff8055d7-0ae9-4dfa-aa84-05a37bb76d8b.gif)

### `generate typetests` is a more configurable type test generator

The `generate typetests` command is a new front-end that replaces the legacy fluid-type-validator command in
build-tools. The old command should continue to work, but the new CLI is a more configurable front-end and supports
release groups like our other CLI commands. The underlying test generation is the same between the two.

The previous version used by type tests can now be configured between the base major or minor pinned version, previous
minor or major pinned version, or caret/tilde-equivalent ranges of the previous major or minor version.

Fluid internal versions are also now supported correctly. Given the version `2.0.0-internal.2.3.5`:

-   baseMajor: `2.0.0-internal.2.0.0`
-   baseMinor: `2.0.0-internal.2.3.0`
-   previousMajor: `2.0.0-internal.1.0.0`
-   previousMinor: `2.0.0-internal.2.2.0`

Given the version `2.0.0-internal.2.0.0`:

-   baseMajor: `2.0.0-internal.2.0.0`
-   baseMinor: `2.0.0-internal.2.0.0`
-   previousMajor: `2.0.0-internal.1.0.0`
-   previousMinor: `2.0.0-internal.2.0.0` (the previous minor doesn't "roll back" to the previous version series)

### `bump` command has a new `--exact` flag

The `--exact` flag allows setting the version of a package or release group to a precise version. This is used in the CI
pipeline where we need to adjust the versions for dev/test/etc. as part of the build.

### `check policy` can list and exclude handlers by name

The new `--excludeHandler` flag to the `check policy` command that can be used to exclude one or more handlers by name.
The main use-case for this is to run policy check with or without the assert-shortcodes handler more easily. Technically
it's possible to exclude a single handler using the regex argument, but this is much simpler.

There is also a new `--listHandlers` flag that will list all the handlers including their names, so one can now query
the system for handlers, then exclude those handlers by name easily.

### `check policy` checks for extraneous lockfiles and tilde dependencies

Extraneous lockfiles can sneak into the repo, especially when independent projects are moved into release groups.

Additionally, some libraries we depend on, like typescript and eslint, recommend using tilde dependencies instead of
caret because those projects do introduce breaking changes in minor versions.

`check policy` now checks for both of these issues.

### Conventional commits enabled in build-tools release group

Conventional commits help us automate changelog generation and generally make the commit log more useful. This PR adds
dependencies and configuration for commitizen and commitlint to the build-tools release group.

[Commitizen](https://commitizen-tools.github.io/commitizen/) provides an interactive prompt to select the type of change
and walks through the process step by step.

[Commitlint](https://commitlint.js.org/), on the other hand, checks the resulting commit message before it's committed.
These configurations are important as groundwork for CI enforcement, too.

There is now a script to the root build-tools project that invokes commitizen. **Now you can OPTIONALLY use `npm run commit` to commit a build-tools change with a compliant commit message.**

IMPORTANT: conventional commits are not yet enforced. This change is only helpful if people choose to use it. A future
PR will add enforcement in CI.

## 🐛 Bug fixes

This list only includes notable bug fixes. See [the changelog](./CHANGELOG.md#050-2022-11-04) for a full list of fixes
in this release.

### `bump deps` excludes independent packages when bumping release groups

[PR #12652](https://github.com/microsoft/FluidFramework/issues/12652)

When bumping deps scoped to a single release group, `bump deps` was including independent packages. This change corrects
that behavior so that only the release group specified will be updated.

## List of packages released

-   @fluid-tools/build-cli
-   @fluidframework/build-tools
-   @fluidframework/bundle-size-tools
-   @fluid-tools/version-tools
