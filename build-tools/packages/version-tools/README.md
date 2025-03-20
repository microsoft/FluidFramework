# @fluid-tools/version-tools

The version-tools package provides APIs and a CLI to parse and transform version numbers and ranges that are used by the
Fluid Framework.

<!-- prettier-ignore-start -->
<!-- toc -->
* [@fluid-tools/version-tools](#fluid-toolsversion-tools)
* [Version schemes](#version-schemes)
* [General API](#general-api)
* [CLI Usage](#cli-usage)
* [Commands](#commands)
<!-- tocstop -->
<!-- prettier-ignore-stop -->

# Version schemes

Fluid Framework packages sometimes use version schemes that diverge from standard semantic versioning. By default, a new
package should use standard semantic versioning. However, there are also two other versioning schemes: _internal_ and
_virtualPatch_.

## internal version scheme

The Fluid internal version scheme consists of two semver "triplets" of major/minor/patch. The first triplet is called
the _public version_, and is stored in the typical semver positions in the version string.

The second triplet is called the _internal version_, and is found at the end of the pre-release section of the
version string.

Fluid internal version strings _always_ include the string `internal` in the first position of the pre-release
section.

In the following example, the public version is `a.b.c`, while the internal version is `x.y.z`.

`a.b.c-internal.x.y.z`

### API

-   `isInternalVersionScheme` -- Returns true if a string represents an internal version number.
-   `isInternalVersionRange` -- Returns true if a string represents an internal version range.
-   `toInternalScheme` -- Converts a standard semver version string to the internal version scheme.
-   `fromInternalScheme` -- Converts an internal version scheme string into two standard semvers -- one for the public
    version and one for the internal version.
-   `bumpInternalVersion` -- Given an internal version and a bump type, returns the bumped version.
-   `getVersionRange` -- Given an internal version and a constraint type, returns a dependency version range that enforces
    the constraint.

## virtualPatch version scheme

The Fluid virtualPatch version scheme is only used for pre-1.0 packages. Versions are of the form:

`0.major.minorpatch`

The minor version and patch version are combined by multiplying the minor version by 1000 and then adding the patch
version. For example, for the standard semver `1.2.3`, the virtualPatch version scheme would yield `0.1.2003`.

Minor versions always start at 1 instead of 0. That is, the first release of a major version 3 would be `0.3.1000`.

### API

-   `isVirtualPatch` -- Returns true if a string represents an internal version number.

# General API

-   `detectVersionScheme` -- Given a version or a range string, determines what version scheme the string is using.
-   `incRange` -- Increments a _range_ by the bump type (major, minor, or patch), maintaining the existing constraint.

# CLI Usage

version-tools provides a command-line interface (`fluv`) when installed directly. However, the commands listed here are
also available in the Fluid build and release tool (`flub`). This is accomplished using
[oclif's plugin system](https://oclif.io/docs/plugins).

<!-- This is hardcoded because `oclif readme` creates different output per
platform, and we generate readmes during build -->
```sh-session
$ npm install -g @fluid-tools/version-tools
$ fluv COMMAND
running command...
$ fluv (--version|-V)
@fluid-tools/version-tools/0.0.0
$ fluv --help [COMMAND]
USAGE
  $ fluv COMMAND
...
```

# Commands

<!-- prettier-ignore-start -->
<!-- commands -->
* [`fluv autocomplete [SHELL]`](#fluv-autocomplete-shell)
* [`fluv help [COMMAND]`](#fluv-help-command)
* [`fluv version VERSION`](#fluv-version-version)
* [`fluv version latest`](#fluv-version-latest)

## `fluv autocomplete [SHELL]`

Display autocomplete installation instructions.

```
USAGE
  $ fluv autocomplete [SHELL] [-r]

ARGUMENTS
  SHELL  (zsh|bash|powershell) Shell type

FLAGS
  -r, --refresh-cache  Refresh cache (ignores displaying instructions)

DESCRIPTION
  Display autocomplete installation instructions.

EXAMPLES
  $ fluv autocomplete

  $ fluv autocomplete bash

  $ fluv autocomplete zsh

  $ fluv autocomplete powershell

  $ fluv autocomplete --refresh-cache
```

_See code: [@oclif/plugin-autocomplete](https://github.com/oclif/plugin-autocomplete/blob/v3.2.7/src/commands/autocomplete/index.ts)_

## `fluv help [COMMAND]`

Display help for fluv.

```
USAGE
  $ fluv help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for fluv.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.16/src/commands/help.ts)_

## `fluv version VERSION`

Convert version strings between regular semver and the Fluid internal version scheme.

```
USAGE
  $ fluv version VERSION [--json] [-t major|minor|patch|current] [--publicVersion <value>]

ARGUMENTS
  VERSION  The version to convert.

FLAGS
  -t, --type=<option>          bump type
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

  You can use the 'current' bump type to calculate ranges without bumping the version.

    $ fluv version 2.0.0-internal.1.0.0 --type current
```

_See code: [src/commands/version.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/src/commands/version.ts)_

## `fluv version latest`

Find the latest version from a list of version strings, accounting for the Fluid internal version scheme.

```
USAGE
  $ fluv version latest -r <value>... [--json] [--prerelease]

FLAGS
  -r, --versions=<value>...  (required) The versions to evaluate. The argument can be passed multiple times to provide
                             multiple versions, or a space-delimited list of versions can be provided using a single
                             argument.
      --prerelease           Include prerelease versions. By default, prerelease versions are excluded.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Find the latest version from a list of version strings, accounting for the Fluid internal version scheme.

EXAMPLES
  You can use the --versions (-r) flag multiple times.

    $ fluv version latest -r 2.0.0 -r 2.0.0-internal.1.0.0 -r 1.0.0 -r 0.56.1000

  You can omit the repeated --versions (-r) flag and pass a space-delimited list instead.

    $ fluv version latest -r 2.0.0 2.0.0-internal.1.0.0 1.0.0 0.56.1000
```

_See code: [src/commands/version/latest.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/src/commands/version/latest.ts)_
<!-- commandsstop -->
<!-- prettier-ignore-stop -->

## Developer notes

This package outputs its build files to `lib/` instead of `dist/` like most of our other packages. The reason is that
oclif uses the lib folder by convention, and there are oclif bugs that can be avoided by putting stuff in lib. See the
PR here for an example: <https://github.com/microsoft/FluidFramework/pull/12155>

---

Due to https://github.com/oclif/core/issues/630, the `build:manifest` node script uses an experimental flag. This can be
removed once we have upgraded to Node 16 in the repo.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
