# @fluid-tools/version-tools

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
* [@fluid-tools/version-tools](#fluid-toolsversion-tools)
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
$ npm install -g @fluid-tools/version-tools
$ fluv COMMAND
running command...
$ fluv (--version)
@fluid-tools/version-tools/0.3.0 win32-x64 node-v14.19.1
$ fluv --help [COMMAND]
USAGE
  $ fluv COMMAND
...
```
<!-- usagestop -->

# Commands

<!-- commands -->
* [`fluv help [COMMAND]`](#fluv-help-command)

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
<!-- commandsstop -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
