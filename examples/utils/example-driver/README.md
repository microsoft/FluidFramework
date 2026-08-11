# @fluid-example/example-driver

This package contains simplified driver implementations used by Fluid examples in the FluidFramework repo. These may only be used in the examples, and are not intended for use in production scenarios.

To use this package in an example, you must first integrate the `@fluid-example/example-webpack-integration` package as described in its README. Then follow these steps:

1. When constructing your driver, first call `getSpecifiedServiceFromWebpack()` to determine the requested service (one of `"t9s"`, `"odsp"`, or `"local"`).
2. Then call `createExampleDriver(service)` using the value obtained from 1. This will return an `ExampleDriver`.
3. Use the `ExampleDriver`'s `urlResolver` and `documentServiceFactory` directly in your calls to `createDetachedContainer()` and `loadExistingContainer()`.
4. Use the `ExampleDriver`'s `createCreateNewRequest(id)` to generate an `IRequest` for your `container.attach(request)` call. Provide it with a unique id.
    * If you are using the odsp service, the passed id will be used when loading the container in the future. Otherwise, inspect the `container.resolvedUrl.id` after attach has completed to discover the container id to use for loading.
5. Use the `ExampleDriver`'s `createLoadExistingRequest(id)` to generate an `IRequest` for your `loadExistingContainer()` call. Note that `createLoadExistingRequest` returns a `Promise<IRequest>` and must be `await`ed.


See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.

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
