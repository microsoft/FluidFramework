# @fluid-experimental/tree-react-api

Utilities for using SharedTree with React.

This package aims to assist SharedTree based React applications handle some common cases by providing code such applications can share.
This should improve the quality of such applications by allowing them to share and improve a single implementation of this logic
(for example ensuring they all handle out of schema documents properly), while reducing the need for boilerplate.

## Known Issues and Limitations

These are a mix of issues that were encountered when authoring this package, as well as limitations of this package.

Some of this logic would be useful for non-react applications: to avoid creating even more septate packages, that logic is not split into its own package.
If there is clear demand for this to be done, it might be done in the future.

There is no service implementation agnostic client abstraction that can be referred to here (ex: shared by TinyliciousClient, AzureClient and OdspClient).
This makes documenting compatibility with that implicit common API difficult.
It also makes writing service agnostic code at that abstraction level harder.

There does not appear to be a local service implementation of the above mentioned abstraction, which makes testing the code in the package harder.

The commonly used boilerplate for setting up a ContainerSchema based application configures the dev-tools,
but currently can't be included in this package due to dependency layering issues.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_PACKAGE_README) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**IMPORTANT: This package is experimental.**
**Its APIs may change without notice.**

**Do not use in production scenarios.**

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

## Installation

To get started, install the package by running the following command:

```bash
npm i @fluid-experimental/tree-react-api
```

## API Documentation

API documentation for **@fluid-experimental/tree-react-api** is available at <https://fluidframework.com/docs/apis/tree-react-api>.

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
