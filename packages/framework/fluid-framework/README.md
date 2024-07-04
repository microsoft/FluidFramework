# fluid-framework

The `fluid-framework` package bundles a collection of Fluid Framework client libraries for easy use when paired with a corresponding service client package (e.g. `@fluidframework/azure-client`, `@fluidframework/tinylicious-client`, or `@fluidframework/odsp-client (BETA)`).

This package reexports these APIs from other Fluid client packages reducing the number of direct package dependencies needed.
There are some packages there are not included as part of this `fluid-framework` package which users may want to use with this package:

-   A service client (e.g. `@fluidframework/azure-client`, `@fluidframework/odsp-client (BETA)`, or `@fluidframework/tinylicious-client` for local development) to allow connecting to a Fluid service.
-   Fluid Framework [developer tools](https://github.com/microsoft/FluidFramework/tree/main/packages/tools/devtools/devtools).
-   `@fluidframework/app-insights-logger`: to route Fluid telemetry to Azure App Insights.

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library's public APIs, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

If using any of Fluid Framework's unstable APIs (for example, its `beta` APIs), we recommend using a more constrained version range, such as `~`.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

<!-- AUTO-GENERATED-CONTENT:START (README_IMPORT_INSTRUCTIONS:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Importing from this package

This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.
For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).

To access the `public` ([SemVer](https://semver.org/)) APIs, import via `fluid-framework` like normal.

To access the `legacy` APIs, import via `fluid-framework/legacy`.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Contents

The `fluid-framework` package consists primarily of two portions: the `IFluidContainer` and a selection of distributed data structures (DDSes).

### IFluidContainer

The **[IFluidContainer][]** interface is one of the types returned by calls to `createContainer()` and `getContainer()` on the service clients such as `AzureClient`.
It includes functionality to retrieve the Fluid data contained within, as well as to inspect the state of the collaboration session connection.

### DDS packages

You'll use one or more DDS data structures in your container to model your collaborative data.
The `fluid-framework` package offers the following data structures:

1. **[SharedTree][]**
1. **[SharedMap][]**, a map-like data structure for storing key/value pair data
    - Note: as of version 2.0, `SharedMap` is now marked legacy. Please use `SharedTree` for any new development.

## Tutorial

Check out the [Hello World tutorial](https://fluidframework.com/docs/start/tutorial/) using `fluid-framework`.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_PACKAGE_README:scripts=FALSE&installation=FALSE&importInstructions=FALSE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## API Documentation

API documentation for **fluid-framework** is available at <https://fluidframework.com/docs/apis/fluid-framework>.

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

<!-- Links -->

[ifluidcontainer]: https://fluidframework.com/docs/api/v2/fluid-framework/ifluidcontainer-interface
[sharedmap]: https://fluidframework.com/docs/data-structures/map/
[sharedtree]: https://fluidframework.com/docs/data-structures/tree/
