# @fluid-private/changelog-generator-wrapper

This tool is used to transform changesets into CHANGELOG.md entries. It uses the extensibility that the default
changesets tools provide, which is documented here:
<https://github.com/changesets/changesets/blob/main/docs/modifying-changelog-format.md>

Unfortunately the APIs are not well documented, so this tool builds on top of another formatter,
[changesets-format-with-issue-links](https://github.com/spautz/changesets-changelog-format). The only changes we've made
to that formatter is to ignore changelog entries that are only due to dependency updates. The changelog files are then
fixed up using a custom tool.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**NOTE: This package is private to the `@microsoft/fluid-framework` repository.**
**This package is not published.**
**Use it only in packages in the same pnpm workspace.**
**Specify [`workspace:*`](https://pnpm.io/workspaces#workspace-protocol-workspace) as the version.**
**Use this package only as a development dependency or as a dependency of an unpublished package.**

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Generating changelogs for release

To generate changelogs for a release, use the steps below. These instructions assume @fluid-internal/changelog-generator
has been built, which should happen automatically when running `pnpm i` in the root.

1. Run `pnpm i` from the repo root.
1. Run `pnpm flub changelog generate --releaseGroup client`
1. Commit and open a PR!

For more information see the build-cli documentation.

## Developer notes

This package is written in JS instead of TypeScript primarily so it doesn't need to be compiled before use. The code is
a wrapper around other implementations, so the code is simple and doesn't benefit much from typing.

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
