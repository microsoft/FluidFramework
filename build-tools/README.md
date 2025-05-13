# @fluid-tools/build-tools

This folder contains packages used for building and managing the contents of Fluid Framework repositories and
implementing the Fluid Framework release process.

## @fluid-tools/build-cli (aka flub)

A build and release tool for the Fluid Framework GitHub repositories. flub is intended to replace the existing
fluid build-tools, primarily by reusing existing build-tools functionality and wrapping it in a more consistent,
maintainable CLI using [oclif](https://oclif.io).

## @fluidframework/build-tools

This package contains both CLI tools and supporting code. This is the home of all the "classic" Fluid build tools, like
policy-check, fluid-bump-version, etc.

Note: Don't add new CLI commands to this package. Instead, add a new command to the `build-cli` package and import the
functionality you need from this package.

## @fluid-tools/version-tools

This package contains APIs and a CLI for working with semantic versioning version strings and ranges, especially those
using [Fluid-specific version schemes.](./packages/version-tools/README.md#version-schemes)

## Testing build-tools changes in the client release group

It is very useful to test changes in build-tools against the client release group because the test coverage of
build-tools is limited, and manually testing locally with the client will expose obvious things like broken incremental
builds, etc.

The easiest way to test build-tools in client is to use pnpm overrides. You can use the following command from the root of the repo to update the
root package.json and lockfile to link to the local version of build-tools:

```
npm pkg set pnpm.overrides.@fluidframework/build-tools=link:./build-tools/packages/build-tools pnpm.overrides.@fluid-tools/build-cli=link:./build-tools/packages/build-cli
pnpm i --no-frozen-lockfile
```

Once done, when you run `pnpm build` from the root, it will invoke the local in-repo versions of flub and fluid-build.

> [!TIP]
> Note that if you make changes to build-tools, you'll need to rebuild build-tools for those changes to take effect in
> the client release group.

You cannot merge in this state, but it allows you to test changes locally, including applying the results of new repo
policies, re-generating type tests with updated code, etc.

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
