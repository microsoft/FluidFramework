# @fluid-tools/build-cli

flub is a build and release tool for the Fluid Framework GitHub repositories. flub is intended to replace the existing
fluid build-tools, primarily by reusing existing build-tools functionality and wrapping it in a more consistent,
maintainable CLI using [oclif](https://oclif.io).

<!-- toc -->
* [@fluid-tools/build-cli](#fluid-toolsbuild-cli)
* [Usage](#usage)
* [Command Topics](#command-topics)
<!-- tocstop -->

# Usage
<!-- usage -->
```sh-session
$ npm install -g @fluid-tools/build-cli
$ flub COMMAND
running command...
$ flub (--version|-V)
@fluid-tools/build-cli/0.4.8000
$ flub --help [COMMAND]
USAGE
  $ flub COMMAND
...
```
<!-- usagestop -->

<!-- commands -->
# Command Topics

* [`flub bump`](docs/bump.md) - Bump the version of packages, release groups, and their dependencies.
* [`flub check`](docs/check.md) - Check commands are used to verify repo state, apply policy, etc.
* [`flub commands`](docs/commands.md) - list all the commands
* [`flub generate`](docs/generate.md) - Generate commands are used to create/update code, docs, readmes, etc.
* [`flub help`](docs/help.md) - Display help for flub.
* [`flub info`](docs/info.md) - Get info about the repo, release groups, and packages.
* [`flub merge`](docs/merge.md) - Sync branches depending on the batch size passed
* [`flub release`](docs/release.md) - Release commands are used to manage the Fluid release process.
* [`flub run`](docs/run.md) - Generate a report from input bundle stats collected through the collect bundleStats command.

<!-- commandsstop -->

## Developer notes

This package outputs its build files to `lib/` instead of `dist/` like most of our other packages. The reason is that
oclif uses the lib folder by convention, and there are oclif bugs that can be avoided by putting stuff in lib. See the
PR here for an example: <https://github.com/microsoft/FluidFramework/pull/12155>

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
