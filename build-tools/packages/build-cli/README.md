# @fluid-internal/build-cli

flub is a build and release tool for the Fluid Framework GitHub repositories. flub is intended to replace the existing
fluid build-tools, primarily by reusing existing build-tools functionality and wrapping it in a more consistent,
maintainable CLI using [oclif](https://oclif.io).

flub is not built in CI. You need to build it locally.

<!-- toc -->
* [@fluid-internal/build-cli](#fluid-internalbuild-cli)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage
<!-- usage -->
```sh-session
$ npm install -g @fluid-internal/build-cli
$ flub COMMAND
running command...
$ flub (--version)
@fluid-internal/build-cli/0.3.0 linux-x64 node-v14.19.2
$ flub --help [COMMAND]
USAGE
  $ flub COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`flub bump`](#flub-bump)
* [`flub bump deps`](#flub-bump-deps)
* [`flub commands`](#flub-commands)
* [`flub help [COMMAND]`](#flub-help-command)
* [`flub info`](#flub-info)
* [`flub version VERSION`](#flub-version-version)

## `flub bump`

Bump versions of packages and dependencies.

```
USAGE
  $ flub bump [-r <value>] [-v] [-g client|server|azure|build-tools | ] [-p <value> | ] [-t
    major|minor|patch|current]

FLAGS
  -g, --releaseGroup=<option>  release group
                               <options: client|server|azure|build-tools>
  -p, --package=<value>        package
  -r, --root=<value>           Root directory of the Fluid repo (default: env _FLUID_ROOT_).
  -t, --type=<option>          Version bump type.
                               <options: major|minor|patch|current>
  -v, --verbose                Verbose logging.

DESCRIPTION
  Bump versions of packages and dependencies.

EXAMPLES
  $ flub bump
```

_See code: [dist/commands/bump.ts](https://github.com/microsoft/FluidFramework/blob/v0.3.0/dist/commands/bump.ts)_

## `flub bump deps`

Bump the dependencies version of specified package or release group

```
USAGE
  $ flub bump deps [-r <value>] [-v] [-g client|server|azure|build-tools | ] [-p <value> | ]

FLAGS
  -g, --releaseGroup=<option>  release group
                               <options: client|server|azure|build-tools>
  -p, --package=<value>        package
  -r, --root=<value>           Root directory of the Fluid repo (default: env _FLUID_ROOT_).
  -v, --verbose                Verbose logging.

DESCRIPTION
  Bump the dependencies version of specified package or release group

EXAMPLES
  $ flub bump deps
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
  $ flub info [-r <value>] [-v] [-g client|server|azure|build-tools | ] [-p]

FLAGS
  -g, --releaseGroup=<option>  release group
                               <options: client|server|azure|build-tools>
  -p, --[no-]private           Include private packages (default true).
  -r, --root=<value>           Root directory of the Fluid repo (default: env _FLUID_ROOT_).
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

_See code: [@fluid-internal/version-tools](https://github.com/microsoft/FluidFramework/blob/v0.3.0/dist/commands/version.ts)_
<!-- commandsstop -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
