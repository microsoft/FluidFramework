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

The easiest way to test build-tools in client is to use pnpm overrides. Uncomment the entries under the `overrides:`
key for "build-tools" in the repo root's `pnpm-workspace.yaml`, then refresh the lockfile:

```yaml
overrides:
  # Uncomment all or some below and run `pnpm install --no-frozen-lockfile` to apply
  # these overrides to use locally built build-tools packages.
  "@fluid-tools/build-cli": "link:./build-tools/packages/build-cli"
  "@fluid-tools/build-infrastructure": "link:./build-tools/packages/build-infrastructure"
  "@fluid-tools/version-tools": "link:./build-tools/packages/version-tools"
  "@fluidframework/build-tools": "link:./build-tools/packages/build-tools"
```

```
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

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

-   Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
-   Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [Fluid Framework wiki](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact [opencode@microsoft.com](mailto:opencode@microsoft.com).

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
When you use these trademarks or logos, follow Microsoft's [Trademark and Brand Guidelines](https://www.microsoft.com/trademarks).
Do not use Microsoft trademarks or logos in a modified version of this project if the use causes confusion or implies Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
