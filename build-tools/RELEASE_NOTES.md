# Fluid Framework build-tools v0.6

The 0.6 build-tools release includes several improvements to fluid-build and type test generation. These release notes
cover the major changes in this release.

This is a **major release** that includes some breaking changes in addition to useful new features and bug fixes:

* [Type compatibility tests are configurable per-branch](#type-compatibility-tests-are-configurable-per-branch)
* [Release groups can use yarn or pnpm](#release-groups-can-use-yarn-or-pnpm)

## 💥 Breaking changes

This release contains some breaking changes to the `generate typetests` and `release report` commands:

* **generate:typetests:** `fluid-type-validator` is deprecated. Use `flub generate typetests` instead.
* **release:report:** The `--all` and `--limit` flags have been removed from `flub release report`. Use [`flub release
history`](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/release.md#flub-release-history)
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

fluid-build now parses build commands with subcommands properly. Prior to this release, build commands like `flub
generate typetests` were not parsed correctly into fluid-build's build graph.

## List of packages released

- @fluid-tools/build-cli
- @fluidframework/build-tools
- @fluidframework/bundle-size-tools
- @fluid-tools/version-tools

# Fluid Framework build-tools v0.5

The 0.5 build-tools release includes several new commands and flags to improve the developer experience when using the
tools. These release notes cover the major changes in this release.

This is a **major release** that includes some breaking changes in addition to useful new features and bug fixes:

- [Autocomplete support for bash and zsh](#autocomplete-support-for-bash-and-zsh)
- [`flub merge info` shows main/next branch integration status](#flub-merge-info-shows-mainnext-branch-integration-status)
- [`release report` command has a new `--all` flag](#release-report-command-has-a-new---all-flag)
- [`generate typetests` is a more configurable type test generator](#generate-typetests-is-a-more-configurable-type-test-generator)
- [`bump` command has a new `--exact` flag](#bump-command-has-a-new---exact-flag)
- [`check policy` can list and exclude handlers by name](#check-policy-can-list-and-exclude-handlers-by-name)
- [`check policy` checks for extraneous lockfiles and tilde dependencies](#check-policy-checks-for-extraneous-lockfiles-and-tilde-dependencies)
- [Conventional commits enabled in build-tools release group](#conventional-commits-enabled-in-build-tools-release-group)

For a full list of changes in this release, see the [changelog](./CHANGELOG.md#050-2022-11-04).

## 💥 Breaking changes

This release contains some breaking changes to the `bump deps` and `check layers` commands:

* **bump:deps:** The `-p` flag has been changed to specify a package
name, which is consistent with
other commands. Use `--prerelease` to replace former uses of `-p`.
* **check:layers:** The `--info` flag is now required.

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

- baseMajor: `2.0.0-internal.2.0.0`
- baseMinor: `2.0.0-internal.2.3.0`
- previousMajor: `2.0.0-internal.1.0.0`
- previousMinor: `2.0.0-internal.2.2.0`

Given the version `2.0.0-internal.2.0.0`:

- baseMajor: `2.0.0-internal.2.0.0`
- baseMinor: `2.0.0-internal.2.0.0`
- previousMajor: `2.0.0-internal.1.0.0`
- previousMinor: `2.0.0-internal.2.0.0` (the previous minor doesn't "roll back" to the previous version series)

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

There is now a script to the root build-tools project that invokes commitizen. **Now you can OPTIONALLY use `npm run
commit` to commit a build-tools change with a compliant commit message.**

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

- @fluid-tools/build-cli
- @fluidframework/build-tools
- @fluidframework/bundle-size-tools
- @fluid-tools/version-tools
