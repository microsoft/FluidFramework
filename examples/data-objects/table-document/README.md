# @fluid-example/table-document

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**NOTE: This package contains an example that uses [Fluid Framework](https://fluidframework.com).**
**Use this package only as an example.**
**Do not use it as a public dependency.**
**We do not guarantee the stability of this package or its APIs.**

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
