# @fluid-tools/build-cli

flub is a build and release tool for the Fluid Framework GitHub repositories. flub is intended to replace the existing
fluid build-tools, primarily by reusing existing build-tools functionality and wrapping it in a more consistent,
maintainable CLI using [oclif](https://oclif.io).

flub is not built in CI. You need to build it locally.

<!-- toc -->
* [@fluid-tools/build-cli](#fluid-toolsbuild-cli)
* [Commands](#commands)
* [Usage](#usage)
* [Command reference](#command-reference)
<!-- tocstop -->

# Commands

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

When releasegroup1 publishes a prerelease version 1.4.0-xxxxxx, we want to bump the dependency range in the
package above to be `~1.4.0-0`, which will pick up the new release. Doing that in one package with a release group that
has only two packages is straightforward. However, when a repo has dozens or hundreds of packages with lots of large
release groups, doing it manually becomes untenable.

The `bump deps` command automates this process. In the case above, we could use the following command to bump
releasegroup1 dependencies to `~1.4.0-0`:


```json
"dependencies": {
    "@releasegroup1/app": "~1.4.0-0",
    "@releasegroup1/lib": "~1.4.0-0",
    "@standalone/common-tools": "^1.24.0",
    "@standalone/eslint-config": "~1.28.2"
}
```

## Bumping based on current dependency range

It is very helpful to bump a dependency based on its current value and a bump type, such as "major" or "minor". The
following command yields the same results as the above command:

```shell
flub bump deps releasegroup1 --bumpType minor --prerelease
```

To bump to a release version instead, omit the `--prerelease` argument.

## Bumping standalone dependencies

Some packages are versioned independently from other release groups. In the example above, we could bump to the next
major version of the eslint-config package across the whole repo using the following command:

```shell
flub bump deps @standalone/eslint-config --bumpType major
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

For more detailed usage information see the [command reference](#flub-bump-deps-package_or_release_group);

# Usage
<!-- usage -->
```sh-session
$ npm install -g @fluid-tools/build-cli
$ flub COMMAND
running command...
$ flub (--version)
@fluid-tools/build-cli/0.3.0 win32-x64 node-v14.19.1
$ flub --help [COMMAND]
USAGE
  $ flub COMMAND
...
```
<!-- usagestop -->
# Command reference
<!-- commands -->
* [`flub bump deps PACKAGE_OR_RELEASE_GROUP`](#flub-bump-deps-package_or_release_group)
* [`flub commands`](#flub-commands)
* [`flub help [COMMAND]`](#flub-help-command)
* [`flub info`](#flub-info)
* [`flub version VERSION`](#flub-version-version)

## `flub bump deps PACKAGE_OR_RELEASE_GROUP`

Update the dependency version of a specified package or release group. That is, if one or more packages in the repo depend on package A, then this command will update the dependency range on package A. The dependencies and the packages updated can be filtered using various flags.

```
USAGE
  $ flub bump deps [PACKAGE_OR_RELEASE_GROUP] [-n <value> | -t major|minor|patch|current] [-p ]
    [--onlyBumpPrerelease] [-g client|server|azure|build-tools] [-x | --install | --commit] [-v]

ARGUMENTS
  PACKAGE_OR_RELEASE_GROUP  The name of a package or a release group. Dependencies on these packages will be bumped.

FLAGS
  -g, --releaseGroup=<option>  Only bump dependencies within this release group.
                               <options: client|server|azure|build-tools>
  -n, --version=<value>        A semver version range string.
  -p, --prerelease             Bump to pre-release versions.
  -t, --bumpType=<option>      Bump the current version of the dependency according to this bump type.
                               <options: major|minor|patch|current>
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
  Bump dependencies on @fluidframework/build-common to range ~1.2.0 across all release groups.

    $ flub bump deps @fluidframework/build-common -n '~1.2.0'

  Bump dependencies on @fluidframework/build-common to range ^1.0.0-0 in the azure release group.

    $ flub bump deps @fluidframework/build-common -n '^1.0.0-0' -g azure

  Bump dependencies on packages in the server release group to the next major prerelease in the client release group.

    $ flub bump deps server -g client -t major

  Bump dependencies on server packages to the current version, replacing any pre-release ranges with release ranges.

    $ flub bump deps server -g client -t current
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
  -g, --releaseGroup=<option>  release group
                               <options: client|server|azure|build-tools>
  -p, --[no-]private           Include private packages (default true).
  -v, --verbose                Verbose logging.

DESCRIPTION
  Get info about the repo, release groups, and packages.
```

_See code: [dist/commands/info.ts](https://github.com/microsoft/FluidFramework/blob/v0.3.0/dist/commands/info.ts)_

## `flub version VERSION`

Convert version strings between regular semver and the Fluid internal version scheme.

```
USAGE
  $ flub version [VERSION] [--json] [-t major|minor|patch|current] [--publicVersion <value>]

ARGUMENTS
  VERSION  The version to convert.

FLAGS
  -t, --type=<option>      bump type
                           <options: major|minor|patch|current>
  --publicVersion=<value>  [default: 2.0.0] The public version to use in the Fluid internal version.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Convert version strings between regular semver and the Fluid internal version scheme.

EXAMPLES
  The version can be a Fluid internal version.

    $ flub version 2.0.0-internal.1.0.0 --type minor

  The version can also be a semver with a bump type.

    $ flub version 1.0.0 --type minor

  If needed, you can provide a public version to override the default.

    $ flub version 1.0.0 --type patch --publicVersion 3.1.0

  You can use ^ and ~ as a shorthand.

    $ flub version ^1.0.0
```

_See code: [@fluid-tools/version-tools](https://github.com/microsoft/FluidFramework/blob/v0.3.0/dist/commands/version.ts)_
<!-- commandsstop -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
