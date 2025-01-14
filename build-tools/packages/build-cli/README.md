# @fluid-tools/build-cli

flub is a build and release tool for the Fluid Framework GitHub repositories. flub is intended to replace the existing
fluid build-tools, primarily by reusing existing build-tools functionality and wrapping it in a more consistent,
maintainable CLI using [oclif](https://oclif.io).

<!-- prettier-ignore-start -->
<!-- toc -->
* [@fluid-tools/build-cli](#fluid-toolsbuild-cli)
* [Usage](#usage)
* [Command Topics](#command-topics)
<!-- tocstop -->
<!-- prettier-ignore-stop -->

# Usage

<!-- This is hardcoded because `oclif readme` creates different output per
platform, and we generate readmes during build -->
```sh-session
$ npm install -g @fluid-tools/build-cli
$ flub COMMAND
running command...
$ flub (--version|-V)
@fluid-tools/build-cli/0.0.0
$ flub --help [COMMAND]
USAGE
  $ flub COMMAND
...
```

<!-- prettier-ignore-start -->
<!-- commands -->
# Command Topics

* [`flub autocomplete`](docs/autocomplete.md) - Display autocomplete installation instructions.
* [`flub bump`](docs/bump.md) - Bump the version of packages, release groups, and their dependencies.
* [`flub check`](docs/check.md) - Check commands are used to verify repo state, apply policy, etc.
* [`flub commands`](docs/commands.md) - List all flub commands.
* [`flub exec`](docs/exec.md) - Run a shell command in the context of a package or release group.
* [`flub generate`](docs/generate.md) - Generate commands are used to create/update code, docs, readmes, etc.
* [`flub help`](docs/help.md) - Display help for flub.
* [`flub info`](docs/info.md) - Get info about the repo, release groups, and packages.
* [`flub list`](docs/list.md) - List packages in a release group in topological order.
* [`flub merge`](docs/merge.md) - Sync branches depending on the batch size passed
* [`flub modify`](docs/modify.md) - Modify commands are used to modify projects to add or remove dependencies, update Fluid imports, etc.
* [`flub promote`](docs/promote.md) - Promote commands are used to promote packages published to an npm registry.
* [`flub publish`](docs/publish.md) - Publish commands are used to publish packages to an npm registry.
* [`flub release`](docs/release.md) - Release commands are used to manage the Fluid release process.
* [`flub rename-types`](docs/rename-types.md) - Renames type declaration files from .d.ts to .d.mts.
* [`flub report`](docs/report.md) - Report analysis about the codebase, like code coverage and bundle size measurements.
* [`flub transform`](docs/transform.md) - Transform commands are used to transform code, docs, etc. into alternative forms.
* [`flub typetests`](docs/typetests.md) - Updates configuration for type tests in package.json files. If the previous version changes after running preparation, then npm install must be run before building.

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

### Manual Integration Testing and Debugging

There are some VS Code launch targets like `flub generate typetests` that may work in some cases.

To run a locally built version of flub in contexts where the invocation of flub is done via package.json scripts, use a pnpm override.
For client that is:

```
			"@fluid-tools/build-cli": "file:./build-tools/packages/build-cli",
			"@fluidframework/build-tools": "file:./build-tools/packages/build-tools",
			"@fluid-tools/version-tools": "file:./build-tools/packages/version-tools",
			"@fluidframework/bundle-size-tools": "file:./build-tools/packages/bundle-size-tools"
```

This approach can be used with `flub generate typetests` to ensure that the `--level` configuration from the scripts is included, and can be done from a JavaScript Debug console to debug, though breakpoints will need to be set in the `.js` files in `node_modules` (for example in `node_modules/.pnpm/file+build-tools+packages+build-cli_@types+node@18.19.1/node_modules/@fluid-tools/build-cli/lib/commands/generate/typetests.js`).

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
