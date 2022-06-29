# @fluid-internal/build-cli

flub is a build and release tool for the Fluid Framework GitHub repositories. flub is intended to replace the existing
fluid build-tools, primarily by reusing existing build-tools functionality and wrapping it in a more consistent,
maintainable CLI using [oclif](https://oclif.io).

flub is not built in CI. You need to build it locally.

<!-- toc -->
* [@fluid-internal/flub](#fluid-internalflub)
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
@fluid-internal/build-cli/0.1.0 linux-x64 node-v14.19.3
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
* [`flub help [COMMAND]`](#flub-help-command)
* [`flub info`](#flub-info)

## `flub bump`

Bump versions of packages and dependencies.

```
USAGE
  $ flub bump -t major|minor|patch|current [-r <value>] [-g Azure|Client|Server | ] [-p <value> | ]

FLAGS
  -g, --releaseGroup=<option>  release group
                               <options: Azure|Client|Server>
  -p, --package=<value>        package
  -r, --root=<value>           Root directory of the Fluid repo (default: env _FLUID_ROOT_).
  -t, --type=<option>          (required) [default: current] bump type
                               <options: major|minor|patch|current>

DESCRIPTION
  Bump versions of packages and dependencies.

EXAMPLES
  $ flub bump
```

_See code: [dist/commands/bump.ts](https://github.com/microsoft/FluidFramework/blob/v0.1.0/dist/commands/bump.ts)_

## `flub bump deps`

Bump the dependencies version of specified package or release group

```
USAGE
  $ flub bump deps [-r <value>] [-g Azure|Client|Server | ] [-p <value> | ]

FLAGS
  -g, --releaseGroup=<option>  release group
                               <options: Azure|Client|Server>
  -p, --package=<value>        package
  -r, --root=<value>           Root directory of the Fluid repo (default: env _FLUID_ROOT_).

DESCRIPTION
  Bump the dependencies version of specified package or release group

EXAMPLES
  $ flub bump deps
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

Get info about the repo, release groups, and packages

```
USAGE
  $ flub info [-r <value>]

FLAGS
  -r, --root=<value>  Root directory of the Fluid repo (default: env _FLUID_ROOT_).

DESCRIPTION
  Get info about the repo, release groups, and packages
```

_See code: [dist/commands/info.ts](https://github.com/microsoft/FluidFramework/blob/v0.1.0/dist/commands/info.ts)_
<!-- commandsstop -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
