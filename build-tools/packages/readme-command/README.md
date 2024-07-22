# @fluid-private/readme-command

This package implements a single command: a subclass of the oclif readme command class with some minor tweaks. This
package holds only this command because we don't need to distribute the readme command; we only use it locally to
generate the package readmes within the build-tools release group.

<!-- prettier-ignore-start -->
<!-- toc -->
* [@fluid-private/readme-command](#fluid-privatereadme-command)
* [Usage](#usage)
<!-- tocstop -->
<!-- prettier-ignore-stop -->

# Usage

<!-- prettier-ignore-start -->
<!-- usage -->
```sh-session
$ npm install -g @fluid-private/readme-command
$ fluid-readme COMMAND
running command...
$ fluid-readme (--version|-V)
@fluid-private/readme-command/1.0.0
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
  $ fluid-readme generate readme --output-dir <value> --readme-path <value> [--aliases] [--nested-topics-depth
    <value> --multi] [--plugin-directory <value>] [--repository-prefix <value>] [--version <value>]

FLAGS
  --[no-]aliases                 Include aliases in the command list.
  --multi                        Create a different markdown page for each topic.
  --nested-topics-depth=<value>  Max nested topics depth for multi markdown page generation. Use with --multi enabled.
  --output-dir=<value>           (required) [default: docs] Output directory for multi docs.
  --plugin-directory=<value>     Plugin directory to generate README for. Defaults to the current directory.
  --readme-path=<value>          (required) [default: README.md] Path to the README file.
  --repository-prefix=<value>    A template string used to build links to the source code.
  --version=<value>              Version to use in readme links. Defaults to the version in package.json.

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

_See code: [src/commands/generate/readme.ts](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/readme-command/src/commands/generate/readme.ts)_
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

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_PACKAGE_README_FOOTER) -->

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
