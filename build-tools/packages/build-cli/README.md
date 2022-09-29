# @fluid-tools/build-cli

flub is a build and release tool for the Fluid Framework GitHub repositories. flub is intended to replace the existing
fluid build-tools, primarily by reusing existing build-tools functionality and wrapping it in a more consistent,
maintainable CLI using [oclif](https://oclif.io).

<!-- toc -->
* [@fluid-tools/build-cli](#fluid-toolsbuild-cli)
* [Commands](#commands)
* [Usage](#usage)
* [Command reference](#command-reference)
<!-- tocstop -->

# Commands

## bump

The `bump` command is used to bump the version of a release groups or individual packages within the repo. Usually
this is done as part of the release process (see the [release command](#release)), but it is sometimes useful to bump
without doing a release.

### Bumping a release group to the next minor version

```shell
flub bump releasegroup1 --bumpType minor
```

### Skipping install and commit

By default, the `bump` command will run `npm install` in any affected packages and commit the results to a new branch.
You can skip these steps using the `--no-commit` and `--no-install` flags.

```shell
flub bump @scope/package --bumpType minor --no-commit
```

## bump deps

The `bump deps` command is used to bump the dependency ranges of release groups or individual packages. It's easiest to
understand with an example.

Consider this section of package.json.

```json
"dependencies": {
    "@releasegroup1/app": "~1.3.0",
    "@releasegroup1/lib": "~1.3.0",
    "@standalone/common-tools": "^1.24.0",
    "@standalone/eslint-config": "~1.28.2"
}
```

All of the dependencies are in the same repo. The first two dependencies listed are in a single release group, while the
other two are standalone packages.

When releasegroup1 publishes a prerelease version 1.4.0-12345, we want to bump the dependency range in the package above
to be `~1.4.0-12345`, which will pick up the new release. Doing that in one package with a release group that has only
two packages is straightforward. However, when a repo has dozens or hundreds of packages with lots of large release
groups, doing it manually becomes untenable.

The `bump deps` command automates this process. In the case above, we could use the following command to bump
releasegroup1 dependencies to `~1.4.0-12345`:

```shell
flub bump deps releasegroup1 --updateType latest --prerelease
```


```json
"dependencies": {
    "@releasegroup1/app": "~1.4.0-12345",
    "@releasegroup1/lib": "~1.4.0-12345",
    "@standalone/common-tools": "^1.24.0",
    "@standalone/eslint-config": "~1.28.2"
}
```

### Bumping based on current dependency range

It is very helpful to bump a dependency based on its current value and a bump type, such as "major" or "minor". The
following command yields the same results as the above command:

```shell
flub bump deps releasegroup1 --updateType minor --prerelease
```

To bump to a release version instead, omit the `--prerelease` argument.

### Bumping standalone dependencies

Some packages are versioned independently from other release groups. In the example above, we could bump to the latest
released version of the eslint-config package across the whole repo using the following command:

```shell
flub bump deps @standalone/eslint-config --updateType latest
```

That command will update the package.json like so:

```json
"dependencies": {
    "@releasegroup1/app": "~1.3.0",
    "@releasegroup1/lib": "~1.3.0",
    "@standalone/common-tools": "^1.24.0",
    "@standalone/eslint-config": "~2.0.0"
}
```

For more detailed usage information see the [bump deps command reference](#flub-bump-deps-package_or_release_group);

## release

The `release` command ensures that a release branch is in good condition, then walks the user through releasing a
package or release group.

### Testing

The command provides a `testMode` flag, which subclasses are expected to check when handling states. If in test mode,
all handled states should immediately return true. This enables tests to verify that new states are handled in some way.

The command also provides a `state` flag that can be used to initialize the state machine to a specific state. This is
intended for testing.

For more detailed usage information see the [release command reference](#flub-release);

# Usage
<!-- usage -->
```sh-session
$ npm install -g @fluid-tools/build-cli
$ flub COMMAND
running command...
$ flub (--version|-V)
@fluid-tools/build-cli/0.4.7000
$ flub --help [COMMAND]
USAGE
  $ flub COMMAND
...
```
<!-- usagestop -->
# Command reference
<!-- commands -->
* [`flub bump PACKAGE_OR_RELEASE_GROUP`](#flub-bump-package_or_release_group)
* [`flub bump deps PACKAGE_OR_RELEASE_GROUP`](#flub-bump-deps-package_or_release_group)
* [`flub check layers`](#flub-check-layers)
* [`flub check policy`](#flub-check-policy)
* [`flub commands`](#flub-commands)
* [`flub generate buildVersion`](#flub-generate-buildversion)
* [`flub generate bundleStats`](#flub-generate-bundlestats)
* [`flub generate packageJson`](#flub-generate-packagejson)
* [`flub generate readme`](#flub-generate-readme)
* [`flub help [COMMAND]`](#flub-help-command)
* [`flub info`](#flub-info)
* [`flub release`](#flub-release)
* [`flub release report`](#flub-release-report)
* [`flub run bundleStats`](#flub-run-bundlestats)

## `flub bump PACKAGE_OR_RELEASE_GROUP`

Bumps the version of a release group or package to the next minor, major, or patch version.

```
USAGE
  $ flub bump [PACKAGE_OR_RELEASE_GROUP] -t major|minor|patch [--scheme semver|internal|virtualPatch] [-x
    | --install | --commit |  |  | ] [-v]

ARGUMENTS
  PACKAGE_OR_RELEASE_GROUP  The name of a package or a release group.

FLAGS
  -t, --bumpType=<option>  (required) Bump the release group or package to the next version according to this bump type.
                           <options: major|minor|patch>
  -v, --verbose            Verbose logging.
  -x, --skipChecks         Skip all checks.
  --[no-]commit            Commit changes to a new branch.
  --[no-]install           Update lockfiles by running 'npm install' automatically.
  --scheme=<option>        Override the version scheme used by the release group or package.
                           <options: semver|internal|virtualPatch>

DESCRIPTION
  Bumps the version of a release group or package to the next minor, major, or patch version.

EXAMPLES
  Bump @fluidframework/build-common to the next minor version.

    $ flub bump @fluidframework/build-common -t minor

  Bump the server release group to the next major version, forcing the semver version scheme.

    $ flub bump server -t major --scheme semver
```

_See code: [src/commands/bump.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/bump.ts)_

## `flub bump deps PACKAGE_OR_RELEASE_GROUP`

Update the dependency version of a specified package or release group. That is, if one or more packages in the repo depend on package A, then this command will update the dependency range on package A. The dependencies and the packages updated can be filtered using various flags.

```
USAGE
  $ flub bump deps [PACKAGE_OR_RELEASE_GROUP] [-p -t latest|newest|greatest|minor|patch|@next|@canary]
    [--onlyBumpPrerelease] [-g client|server|azure|build-tools] [-x | --install | --commit |  |  | ] [-v]

ARGUMENTS
  PACKAGE_OR_RELEASE_GROUP  The name of a package or a release group.

FLAGS
  -g, --releaseGroup=<option>  Only bump dependencies within this release group.
                               <options: client|server|azure|build-tools>
  -p, --prerelease             Treat prerelease versions as valid versions to update to.
  -t, --updateType=<option>    Bump the current version of the dependency according to this bump type.
                               <options: latest|newest|greatest|minor|patch|@next|@canary>
  -v, --verbose                Verbose logging.
  -x, --skipChecks             Skip all checks.
  --[no-]commit                Commit changes to a new branch.
  --[no-]install               Update lockfiles by running 'npm install' automatically.
  --onlyBumpPrerelease         Only bump dependencies that are on pre-release versions.

DESCRIPTION
  Update the dependency version of a specified package or release group. That is, if one or more packages in the repo
  depend on package A, then this command will update the dependency range on package A. The dependencies and the
  packages updated can be filtered using various flags.

EXAMPLES
  Bump dependencies on @fluidframework/build-common to the latest release version across all release groups.

    $ flub bump deps @fluidframework/build-common -t latest

  Bump dependencies on @fluidframework/build-common to the next minor version in the azure release group.

    $ flub bump deps @fluidframework/build-common -t minor -g azure

  Bump dependencies on packages in the server release group to the greatest released version in the client release
  group. Include pre-release versions.

    $ flub bump deps server -g client -t greatest -p

  Bump dependencies on server packages to the current version across the repo, replacing any pre-release ranges with
  release ranges.

    $ flub bump deps server -t latest
```

## `flub check layers`

Checks that the dependencies between Fluid Framework packages are properly layered.

```
USAGE
  $ flub check layers [--md <value>] [--dot <value>] [--info <value>] [--logtime] [-v]

FLAGS
  -v, --verbose   Verbose logging.
  --dot=<value>   Generate *.dot for GraphViz
  --info=<value>  Path to the layer graph json file
  --logtime       Display the current time on every status message for logging
  --md=<value>    [default: .] Generate PACKAGES.md file at this path relative to repo root

DESCRIPTION
  Checks that the dependencies between Fluid Framework packages are properly layered.
```

## `flub check policy`

Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files, assert tagging, etc.

```
USAGE
  $ flub check policy -e <value> [-f] [-d <value>] [-p <value>] [--stdin] [-v]

FLAGS
  -d, --handler=<value>     Filter handler names by <regex>
  -e, --exclusions=<value>  (required) Path to the exclusions.json file
  -f, --fix                 Fix errors if possible
  -p, --path=<value>        Filter file paths by <regex>
  -v, --verbose             Verbose logging.
  --stdin                   Get file from stdin

DESCRIPTION
  Checks and applies policies to the files in the repository, such as ensuring a consistent header comment in files,
  assert tagging, etc.
```

## `flub commands`

list all the commands

```
USAGE
  $ flub commands [--json] [-h] [--hidden] [--tree] [--columns <value> | -x] [--sort <value>] [--filter
    <value>] [--output csv|json|yaml |  | [--csv | --no-truncate]] [--no-header | ]

FLAGS
  -h, --help         Show CLI help.
  -x, --extended     show extra columns
  --columns=<value>  only show provided columns (comma-separated)
  --csv              output is csv format [alias: --output=csv]
  --filter=<value>   filter property by partial string matching, ex: name=foo
  --hidden           show hidden commands
  --no-header        hide table header from output
  --no-truncate      do not truncate output to fit screen
  --output=<option>  output in a more machine friendly format
                     <options: csv|json|yaml>
  --sort=<value>     property to sort by (prepend '-' for descending)
  --tree             show tree of commands

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  list all the commands
```

_See code: [@oclif/plugin-commands](https://github.com/oclif/plugin-commands/blob/v2.2.0/src/commands/commands.ts)_

## `flub generate buildVersion`

This command is used to compute the version number of Fluid packages. The release version number is based on what's in the lerna.json/package.json. The CI pipeline will supply the build number and branch to determine the prerelease suffix if it is not a tagged build

```
USAGE
  $ flub generate buildVersion --build <value> [--testBuild <value>] [--release release|none] [--patch <value>] [--base
    <value>] [--tag <value>] [-i <value>] [-v]

FLAGS
  -i, --includeInternalVersions=<value>  Include Fluid internal versions.
  -v, --verbose                          Verbose logging.
  --base=<value>                         The base version. This will be read from lerna.json/package.json if not
                                         provided.
  --build=<value>                        (required) The CI build number.
  --patch=<value>                        Indicates the build is a patch build.
  --release=<option>                     Indicates the build is a release build.
                                         <options: release|none>
  --tag=<value>                          The tag name to use.
  --testBuild=<value>                    Indicates the build is a test build.

DESCRIPTION
  This command is used to compute the version number of Fluid packages. The release version number is based on what's in
  the lerna.json/package.json. The CI pipeline will supply the build number and branch to determine the prerelease
  suffix if it is not a tagged build

EXAMPLES
  $ flub generate buildVersion
```

## `flub generate bundleStats`

Find all bundle analysis artifacts and copy them into a central location to upload as build artifacts for later consumption

```
USAGE
  $ flub generate bundleStats [--smallestAssetSize <value>] [-v]

FLAGS
  -v, --verbose                Verbose logging.
  --smallestAssetSize=<value>  [default: 100] The smallest asset size in bytes to consider correct. Adjust when testing
                               for assets that are smaller.

DESCRIPTION
  Find all bundle analysis artifacts and copy them into a central location to upload as build artifacts for later
  consumption
```

## `flub generate packageJson`

Generate mono repo package json

```
USAGE
  $ flub generate packageJson -g client|server|azure|build-tools [-v]

FLAGS
  -g, --releaseGroup=<option>  (required) Name of the release group
                               <options: client|server|azure|build-tools>
  -v, --verbose                Verbose logging.

DESCRIPTION
  Generate mono repo package json
```

## `flub generate readme`

Adds commands to README.md in current directory.

```
USAGE
  $ flub generate readme --dir <value> [--multi] [--aliases]

FLAGS
  --[no-]aliases  include aliases in the command list
  --dir=<value>   (required) [default: docs] output directory for multi docs
  --multi         create a different markdown page for each topic

DESCRIPTION
  Adds commands to README.md in current directory.

  The readme must have any of the following tags inside of it for it to be replaced or else it will do nothing:

  # Usage

  <!-- usage -->

  # Commands

  <!-- commands -->

  # Table of contents

  <!-- toc -->

  Customize the code URL prefix by setting oclif.repositoryPrefix in package.json.
```

## `flub help [COMMAND]`

Display help for flub.

```
USAGE
  $ flub help [COMMAND] [-n]

ARGUMENTS
  COMMAND  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for flub.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v5.1.12/src/commands/help.ts)_

## `flub info`

Get info about the repo, release groups, and packages.

```
USAGE
  $ flub info [-g client|server|azure|build-tools] [-p] [-v]

FLAGS
  -g, --releaseGroup=<option>  Name of the release group
                               <options: client|server|azure|build-tools>
  -p, --[no-]private           Include private packages (default true).
  -v, --verbose                Verbose logging.

DESCRIPTION
  Get info about the repo, release groups, and packages.
```

_See code: [src/commands/info.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/src/commands/info.ts)_

## `flub release`

Releases a package or release group.

```
USAGE
  $ flub release [-g client|server|azure|build-tools | -p <value>] [-t major|minor|patch] [-x | --install |
    --commit | --branchCheck | --updateCheck | --policyCheck] [-v]

FLAGS
  -g, --releaseGroup=<option>  Name of the release group
                               <options: client|server|azure|build-tools>
  -p, --package=<value>        Name of package.
  -t, --bumpType=<option>      Version bump type.
                               <options: major|minor|patch>
  -v, --verbose                Verbose logging.
  -x, --skipChecks             Skip all checks.
  --[no-]branchCheck           Check that the current branch is correct.
  --[no-]commit                Commit changes to a new branch.
  --[no-]install               Update lockfiles by running 'npm install' automatically.
  --[no-]policyCheck           Check that the local repo complies with all policy.
  --[no-]updateCheck           Check that the local repo is up to date with the remote.

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

## `flub release report`

Generates a report of Fluid Framework releases.

```
USAGE
  $ flub release report [--json] [--days <value>] [-s | -r] [-g client|server|azure|build-tools [--all | -o
    <value>]] [-p <value> ] [--limit <value> ] [-v]

FLAGS
  -g, --releaseGroup=<option>  Name of the release group
                               <options: client|server|azure|build-tools>
  -o, --output=<value>         Output JSON report files to this location.
  -p, --package=<value>        Name of package.
  -r, --mostRecent             Always pick the most recent version as the latest (ignore semver version sorting).
  -s, --highest                Always pick the greatest semver version as the latest (ignore dates).
  -v, --verbose                Verbose logging.
  --all                        List all releases. Useful when you want to see all the releases done for a release group
                               or package. The number of results can be limited using the --limit argument.
  --days=<value>               [default: 10] The number of days to look back for releases to report.
  --limit=<value>              Limits the number of displayed releases for each release group.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Generates a report of Fluid Framework releases.

  The release report command is used to produce a report of all the packages that were released and their current
  version. After a release, it is useful to generate this report to provide to customers, so they can update their
  dependencies to the most recent version.

  The command will prompt you to select versions for a package or release group in the event that multiple versions have
  recently been released.

  Using the --all flag, you can list all the releases for a given release group or package.

EXAMPLES
  Generate a minimal release report and display it in the terminal.

    $ flub release report

  Generate a minimal release report and output it to stdout as JSON.

    $ flub release report --json

  Output a release report to 'report.json'.

    $ flub release report -o report.json

  Output a full release report to 'report.json'.

    $ flub release report -f -o report.json

  List all the releases of the azure release group.

    $ flub release report --all -g azure

  List the 10 most recent client releases.

    $ flub release report --all -g client --limit 10
```

## `flub run bundleStats`

Generate a report from input bundle stats collected through the collect bundleStats command.

```
USAGE
  $ flub run bundleStats [--dirname <value>] [-v]

FLAGS
  -v, --verbose      Verbose logging.
  --dirname=<value>  [default: /home/tylerbu/code/FluidFramework/build-tools/packages/build-cli/lib/commands/run]
                     Directory

DESCRIPTION
  Generate a report from input bundle stats collected through the collect bundleStats command.
```
<!-- commandsstop -->

## Developer notes

This package outputs its build files to `lib/` instead of `dist/` like most of our other packages. The reason is that
oclif uses the lib folder by convention, and there are oclif bugs that can be avoided by putting stuff in lib. See the
PR here for an example: <https://github.com/microsoft/FluidFramework/pull/12155>

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
