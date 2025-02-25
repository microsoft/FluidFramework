# @fluid-example/table-document

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**NOTE: This package is an example leveraging the [Fluid Framework](https://fluidframework.com).**
**It is intended only as an example, and is not intended for public use.**
**We make no stability guarantees regarding this library and its APIs.**

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Table Slice With Interception

It provides `createTableWithInterception` that accepts an ITable object, the data store context and a callback, and returns an ITable object:

```typescript
function createTableWithInterception<T extends ITable>(
	table: T,
	context: IFluidDataStoreContext,
	propertyInterceptionCallback: (props?: PropertySet) => PropertySet,
): T;
```

When a function is called that set a cell value or annotates a cell, it calls propertyInterceptionCallback with the provided properties. The callback funtion can then provide the new set of properties that it wants to set. The operation in the called function and any operations in the callback are batched, i.e., they are guaranteed to be in order and will be applied together.

For example, to support a feature like simple user attribution, the app can append the user information to the properties in the callback. The user information can than be retrieved by getting the properties of the cell.

## Remarks

Being an example, this package should have `private: true` in `package.json` but alas there's one consumer of Fluid
taking a dependency on it, so we can't do that yet.
Once it can be converted, or once that consumer confirms they don't need both ESNext and CommonJS modules, it should also drop the CommonJS build (this has already been done for the package's tests, but not its public API).

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
