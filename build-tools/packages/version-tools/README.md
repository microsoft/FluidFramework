# @fluid-internal/version-tools

version-tools provides tools to parse and transform version schemes that are used by the Fluid Framework.

# Version schemes

version-tools currently supports the internal Fluid version scheme.

## internal

The Fluid internal version scheme consists of two semver "triplets" of major/minor/patch. The first triplet is called
the *public version*, and is stored in the typical semver positions in the version string.

The second triplet is called the *internal version*, and is found at the end of the pre-release section of the
version string.

Fluid internal version strings *always* include the string `internal` in the first position of the pre-release
section.

In the following example, the public version is `a.b.c`, while the internal version is `x.y.z`.

`a.b.c-internal.x.y.z`

<!-- toc -->
* [@fluid-internal/version-tools](#fluid-internalversion-tools)
* [Version schemes](#version-schemes)
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->

# Usage

version-tools provides a command-line interface (`fluv`) when installed directly. However, the commands listed here are
also available in the Fluid build and release tool (`flub`). This is accomplished using
[oclif's plugin system](https://oclif.io/docs/plugins).

<!-- usage -->
```sh-session
$ npm install -g @fluid-internal/version-tools
$ fluv COMMAND
running command...
$ fluv (--version)
@fluid-internal/version-tools/0.3.0 linux-x64 node-v14.19.2
$ fluv --help [COMMAND]
USAGE
  $ fluv COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`fluv help [COMMAND]`](#fluv-help-command)
* [`fluv version VERSION`](#fluv-version-version)

## `fluv help [COMMAND]`

Display help for fluv.

```
USAGE
  $ fluv help [COMMAND] [-n]

ARGUMENTS
  COMMAND  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for fluv.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v5.1.12/src/commands/help.ts)_

## `fluv version VERSION`

Convert version strings between regular semver and the Fluid internal version scheme.

```
USAGE
  $ fluv version [VERSION] [--json] [-t major|minor|patch|current] [--publicVersion <value>]

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

    $ fluv version 2.0.0-internal.1.0.0 --type minor

  The version can also be a semver with a bump type.

    $ fluv version 1.0.0 --type minor

  If needed, you can provide a public version to override the default.

    $ fluv version 1.0.0 --type patch --publicVersion 3.1.0

  You can use ^ and ~ as a shorthand.

    $ fluv version ^1.0.0
```

_See code: [dist/commands/version.ts](https://github.com/microsoft/FluidFramework/blob/v0.3.0/dist/commands/version.ts)_
<!-- commandsstop -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
