# @fluid-internal/readme-command

This package implements a single command: a subclass of the oclif readme command class with some minor tweaks. This
package holds only this command because we don't need to distribute the readme command; we only use it locally to
generate the package readmes within the build-tools release group.

<!-- prettier-ignore-start -->
<!-- toc -->
* [@fluid-internal/readme-command](#fluid-internalreadme-command)
* [Usage](#usage)
<!-- tocstop -->
<!-- prettier-ignore-stop -->

# Usage

<!-- prettier-ignore-start -->
<!-- usage -->
```sh-session
$ npm install -g @fluid-internal/readme-command
$ fluid-readme COMMAND
running command...
$ fluid-readme (--version|-V)
@fluid-internal/readme-command/0.19.0
$ fluid-readme --help [COMMAND]
USAGE
  $ fluid-readme COMMAND
...
```
<!-- usagestop -->
<!-- prettier-ignore-stop -->

<!-- prettier-ignore-start -->
<!-- commands -->
* [`fluid-readme generate readme`](#fluid-readme-generate-readme)

## `fluid-readme generate readme`

Adds commands to README.md in current directory.

```
USAGE
  $ fluid-readme generate readme --dir <value> [--multi] [--aliases]

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
<!-- commandsstop -->
<!-- prettier-ignore-stop -->

## Developer notes

This package outputs its build files to `lib/` instead of `dist/` like most of our other packages. The reason is that
oclif uses the lib folder by convention, and there are oclif bugs that can be avoided by putting stuff in lib. See the
PR here for an example: <https://github.com/microsoft/FluidFramework/pull/12155>

---

Due to https://github.com/oclif/core/issues/630, the `build:manifest` node script uses an experimental flag. This can be
removed once we have upgraded to Node 16 in the repo.

### Testing

The `release` command provides a `testMode` flag, which subclasses are expected to check when handling states. If in
test mode, all handled states should immediately return true. This enables tests to verify that new states are handled
in some way. Other commands could adopt this, but only the `release command` uses it today.

The `release` command also provides a `state` flag that can be used to initialize the state machine to a specific state.
This is intended for testing.

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
