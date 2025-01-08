`flub release`
==============

Release commands are used to manage the Fluid release process.

* [`flub release`](#flub-release)
* [`flub release fromTag TAG`](#flub-release-fromtag-tag)
* [`flub release history`](#flub-release-history)
* [`flub release prepare PACKAGE_OR_RELEASE_GROUP`](#flub-release-prepare-package_or_release_group)
* [`flub release report`](#flub-release-report)
* [`flub release report-unreleased`](#flub-release-report-unreleased)
* [`flub release setPackageTypesField`](#flub-release-setpackagetypesfield)

## `flub release`

Releases a package or release group.

```
USAGE
  $ flub release [-v | --quiet] [-g client|server|azure|build-tools|gitrest|historian | -p <value>] [-t
    major|minor|patch] [-x | --install | --commit | --branchCheck | --updateCheck | --policyCheck]

FLAGS
  -g, --releaseGroup=<option>  Name of a release group.
                               <options: client|server|azure|build-tools|gitrest|historian>
  -p, --package=<value>        Name of package. You can use scoped or unscoped package names. For example, both
                               @fluid-tools/benchmark and benchmark are valid.
  -t, --bumpType=<option>      Version bump type.
                               <options: major|minor|patch>
  -x, --skipChecks             Skip all checks.
      --[no-]branchCheck       Check that the current branch is correct.
      --[no-]commit            Commit changes to a new branch.
      --[no-]install           Update lockfiles by running 'npm install' automatically.
      --[no-]policyCheck       Check that the local repo complies with all policy.
      --[no-]updateCheck       Check that the local repo is up to date with the remote.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Releases a package or release group.

  The release command ensures that a release branch is in good condition, then walks the user through releasing a
  package or release group.

  The command runs a number of checks automatically to make sure the branch is in a good state for a release. If any of
  the dependencies are also in the repo, then they're checked for the latest release version. If the dependencies have
  not yet been released, then the command prompts to perform the release of the dependency, then run the release command
  again.

  This process is continued until all the dependencies have been released, after which the release group itself is
  released.
```

_See code: [src/commands/release.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/release.ts)_

## `flub release fromTag TAG`

Determines release information based on a git tag argument.

```
USAGE
  $ flub release fromTag TAG [--json] [-v | --quiet]

ARGUMENTS
  TAG  A git tag that represents a release. May begin with 'refs/tags/'.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Determines release information based on a git tag argument.

  This command is used in CI to determine release information when a new release tag is pushed.

EXAMPLES
  Get release information based on a git tag.

    $ flub release fromTag build-tools_v0.13.0

  You can include the refs/tags/ part of a tag ref.

    $ flub release fromTag refs/tags/2.0.0-internal.2.0.2
```

_See code: [src/commands/release/fromTag.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/release/fromTag.ts)_

## `flub release history`

Prints a list of released versions of a package or release group. Releases are gathered from the git tags in repo containing the working directory.

```
USAGE
  $ flub release history [--json] [-v | --quiet] [-g client|server|azure|build-tools|gitrest|historian | -p <value>]
    [-l <value>]

FLAGS
  -g, --releaseGroup=<option>  Name of a release group.
                               <options: client|server|azure|build-tools|gitrest|historian>
  -l, --limit=<value>          Limits the number of displayed releases for each release group. Results are sorted by
                               semver, so '--limit 10' will return the 10 highest semver releases for the release group.
  -p, --package=<value>        Name of package. You can use scoped or unscoped package names. For example, both
                               @fluid-tools/benchmark and benchmark are valid.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Prints a list of released versions of a package or release group. Releases are gathered from the git tags in repo
  containing the working directory.

  Use 'npm view' to list published packages based on the public npm registry.

  The number of results can be limited using the --limit argument.

EXAMPLES
  List all the releases of the azure release group.

    $ flub release history -g azure

  List the 10 most recent client releases.

    $ flub release history -g client --limit 10
```

_See code: [src/commands/release/history.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/release/history.ts)_

## `flub release prepare PACKAGE_OR_RELEASE_GROUP`

Runs checks on a local branch to verify it is ready to serve as the base for a release branch.

```
USAGE
  $ flub release prepare PACKAGE_OR_RELEASE_GROUP [-v | --quiet]

ARGUMENTS
  PACKAGE_OR_RELEASE_GROUP  [default: client] The name of a package or a release group. Defaults to the client release
                            group if not specified.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Runs checks on a local branch to verify it is ready to serve as the base for a release branch.

  Runs the following checks:

  - Branch has no local changes
  - The local branch is up to date with the microsoft/FluidFramework remote
  - Dependencies are installed locally
  - Has no pre-release Fluid dependencies
  - No repo policy violations
  - No untagged asserts

ALIASES
  $ flub release prep
```

_See code: [src/commands/release/prepare.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/release/prepare.ts)_

## `flub release report`

Generates a report of Fluid Framework releases.

```
USAGE
  $ flub release report [--json] [-v | --quiet] [-i | -r | -s] [-g
    client|server|azure|build-tools|gitrest|historian] [-o <value>] [--baseFileName <value>]

FLAGS
  -g, --releaseGroup=<option>
      Report only on this release group. If also pass --interactive, --highest, or --mostRecent, then the report will only
      include this release group at the selected version.

      If you pass this flag by itself, the command will use the version of the release group at the current commit in the
      repo, but will also include its direct Fluid dependencies.

      If you want to report on a particular release, check out the git tag for the release version you want to report on
      before running this command.
      <options: client|server|azure|build-tools|gitrest|historian>

  -i, --interactive
      Choose the version of each release group and package to contain in the release report.

  -o, --output=<value>
      Output JSON report files to this directory.

  -r, --mostRecent
      Always pick the most recent version as the latest (ignore semver version sorting).

  -s, --highest
      Always pick the greatest semver version as the latest (ignore dates).

  --baseFileName=<value>
      If provided, the output files will be named using this base name followed by the report kind (caret, simple, full,
      tilde, legacy-compat) and the .json extension. For example, if baseFileName is 'foo', the output files will be named
      'foo.caret.json', 'foo.simple.json', etc.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Generates a report of Fluid Framework releases.

  The release report command is used to produce a report of all the packages that were released and their version. After
  a release, it is useful to generate this report to provide to customers, so they can update their dependencies to the
  most recent version.

  The command operates in two modes: "whole repo" or "release group." The default mode is "whole repo." In this mode,
  the command will look at the git tags in the repo to determine the versions, and will include all release groups and
  packages in the repo. You can control which version of each package and release group is included in the report using
  the --interactive, --mostRecent, and --highest flags.

  The "release group" mode can be activated by passing a --releaseGroup flag. In this mode, the specified release
  group's version will be loaded from the repo, and its immediate Fluid dependencies will be included in the report.
  This is useful when we want to include only the dependency versions that the release group depends on in the report.

EXAMPLES
  Generate a release report of the highest semver release for each package and release group and display it in the
  terminal only.

    $ flub release report

  Output all release report files to the current directory.

    $ flub release report -o .

  Generate a release report for each package and release group in the repo interactively.

    $ flub release report -i
```

_See code: [src/commands/release/report.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/release/report.ts)_

## `flub release report-unreleased`

Creates a release report for an unreleased build (one that is not published to npm), using an existing report in the "full" format as input.

```
USAGE
  $ flub release report-unreleased --version <value> --outDir <value> --fullReportFilePath <value> --branchName <value> [-v |
    --quiet]

FLAGS
  --branchName=<value>          (required) Branch name. For release branches, the manifest file is uplaoded by build
                                number and not by current date.
  --fullReportFilePath=<value>  (required) Path to a report file in the 'full' format.
  --outDir=<value>              (required) Release report output directory
  --version=<value>             (required) Version to generate a report for. Typically, this version is the version of a
                                dev build.

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

DESCRIPTION
  Creates a release report for an unreleased build (one that is not published to npm), using an existing report in the
  "full" format as input.

  This command is primarily used to upload reports for non-PR main branch builds so that downstream pipelines can easily
  consume them.
```

_See code: [src/commands/release/report-unreleased.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/release/report-unreleased.ts)_

## `flub release setPackageTypesField`

Updates which .d.ts file is referenced by the `types` field in package.json. This command is used during package publishing (by CI) to select the d.ts file which corresponds to the selected API-Extractor release tag.

```
USAGE
  $ flub release setPackageTypesField --types <value> [--json] [-v | --quiet] [--checkFileExists] [--concurrency <value>]
    [--branch <value> [--changed | [--all | --dir <value>... | --packages | -g
    client|server|azure|build-tools|gitrest|historian|all... | --releaseGroupRoot
    client|server|azure|build-tools|gitrest|historian|all...]]] [--private] [--scope <value>... | --skipScope
    <value>...]

FLAGS
  --[no-]checkFileExists  Check if the file path exists
  --concurrency=<value>   [default: 25] The number of tasks to execute concurrently.
  --types=<value>         (required) Which .d.ts types to include in the published package.

PACKAGE SELECTION FLAGS
  -g, --releaseGroup=<option>...      Run on all child packages within the specified release groups. This does not
                                      include release group root packages. To include those, use the --releaseGroupRoot
                                      argument. Cannot be used with --all.
                                      <options: client|server|azure|build-tools|gitrest|historian|all>
      --all                           Run on all packages and release groups. Cannot be used with --dir, --packages,
                                      --releaseGroup, or --releaseGroupRoot.
      --branch=<value>                [default: main] Select only packages that have been changed when compared to this
                                      base branch. Can only be used with --changed.
      --changed                       Select packages that have changed when compared to a base branch. Use the --branch
                                      option to specify a different base branch. Cannot be used --all.
      --dir=<value>...                Run on the package in this directory. Cannot be used with --all.
      --packages                      Run on all independent packages in the repo. Cannot be used with --all.
      --releaseGroupRoot=<option>...  Run on the root package of the specified release groups. This does not include any
                                      child packages within the release group. To include those, use the --releaseGroup
                                      argument. Cannot be used with --all.
                                      <options: client|server|azure|build-tools|gitrest|historian|all>

LOGGING FLAGS
  -v, --verbose  Enable verbose logging.
      --quiet    Disable all logging.

GLOBAL FLAGS
  --json  Format output as json.

PACKAGE FILTER FLAGS
  --[no-]private          Only include private packages. Use --no-private to exclude private packages instead.
  --scope=<value>...      Package scopes to filter to. If provided, only packages whose scope matches the flag will be
                          included. Cannot be used with --skipScope.
  --skipScope=<value>...  Package scopes to filter out. If provided, packages whose scope matches the flag will be
                          excluded. Cannot be used with --scope.

DESCRIPTION
  Updates which .d.ts file is referenced by the `types` field in package.json. This command is used during package
  publishing (by CI) to select the d.ts file which corresponds to the selected API-Extractor release tag.
```

_See code: [src/commands/release/setPackageTypesField.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/release/setPackageTypesField.ts)_
