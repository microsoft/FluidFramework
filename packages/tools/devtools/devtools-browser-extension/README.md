# @fluid-internal/devtools-browser-extension

This package contains a browser (Chrome) developer tools extension for use with [@fluid-experimental/devtools][].
It offers visual insights into the workings of the Fluid Framework in your application.

It is currently compatible with [Chromium](https://www.chromium.org/Home/)-based browsers (e.g. [Chrome](https://www.google.com/chrome/) and [Edge](https://www.microsoft.com/en-us/edge/)).

## Artifacts

This package does not generate any library artifacts, so it is marked as `private` in its `package.json`.

We are not yet publishing any artifacts to the Chrome/Edge extension stores, but that is planned for the near future.

## Usage

To use this extension in your browser:

1. Build this package and its dependencies.
   Your extension files should be generated under the build output directory (`dist/bundle`) in this package.
2. Load the unpacked extension in the browser by following [these instructions](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked).
   For [WSL](https://learn.microsoft.com/en-us/windows/wsl/about) users, your Linux files should be at a \\wsl$ path.
   In File Explorer or any other Windows application that can browse files, navigate to the path: \\wsl$.

## Devtools Extensions

This package runs as a [Devtools Extension](https://developer.chrome.com/docs/extensions/mv3/devtools/) in Chromium-based browsers that support them.

For an overview on how Devtools extensions work, see [here](https://developer.chrome.com/docs/extensions/mv3/devtools/#content-script-to-devtools).

![Devtools Extension Communication Model](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/devtools-extensions-images/overall_screenshot_mv3.png)

For a helpful how-to guide for making a Devtools Extension, see [here](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/devtools-extension).

<!-- AUTO-GENERATED-CONTENT:START (README_CONTRIBUTION_GUIDELINES_SECTION:includeHeading=TRUE) -->

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

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Help

Not finding what you're looking for in this README? Check out our [GitHub
Wiki](https://github.com/microsoft/FluidFramework/wiki) or [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an
issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand
Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- Links -->

[@fluid-experimental/devtools]: https://github.com/microsoft/FluidFramework/tree/main/packages/tools/devtools/devtoor
