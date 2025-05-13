# @fluid-private/test-dds-utils

Utilities for writing unit tests for DDS in Fluid Framework.

<!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

**NOTE: This package is private to the `@microsoft/fluid-framework` repository.**
**It is not published, and therefore may only be used in packages within the same pnpm workspace in this repo using the [workspace:*](https://pnpm.io/workspaces#workspace-protocol-workspace) schema.**
**Since this package is not published, it may also only be used as a dev dependency, or as a dependency in packages that are not published.**

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

## Garbage Collection (GC) unit tests

[gcTestRunner](./src/gcTestRunner.ts) provides a set of tests for validating that the DDSes return correct GC nodes.

To write GC tests for a DDS, call `runGCTests` with a class that implements the following interface:

```typescript
export interface IGCTestProvider {
	/** The DDS whose GC data is to be verified */
	readonly sharedObject: ISharedObject;
	/** The expected list of outbound routes from this DDS */
	readonly expectedOutboundRoutes: string[];
	/** Function that adds routes to Fluid objects to the DDS' data */
	addOutboundRoutes(): Promise<void>;
	/** Function that deletes routes to Fluid objects to the DDS' data */
	deleteOutboundRoutes(): Promise<void>;
	/** Function that adds nested handles to the DDS' data */
	addNestedHandles(): Promise<void>;
}
```

The caller is responsible for the following:

1. Adding and deleting routes to Fluid objects to the DDS which is being tested.
2. Adding nested handles to the DDS' data.
3. Maintaining the list of expected outbound routes. The tests query this and validates that the GC data returned by the DDS matches these routes.

### Examples

[SharedCell](../cell/src/test/cell.spec.ts) and [SharedDirectory](../map/test/directory.spec.ts) have tests that use the gcTestRunner for validating GC data.

## Eventual Consistency Fuzz Tests

This package also provides a [generic harness](./src/ddsFuzzHarness.ts) for writing eventual consistency fuzz tests for a DDS.
This model is written using [@fluid-private/stochastic-test-utils](../../test/stochastic-test-utils/README.md).
See documentation on `createDDSFuzzSuite` and `DDSFuzzModel` for more details.

The harness currently supports testing eventual consistency of op application using Fluid's set of [mocks](../../runtime/test-runtime-utils/README.md)
including the reconnect flow.

### Future Improvements

The generic aspects of this model could be improved to fuzz test correctness a few other general concerns DDS authors have:

-   Summarization correctness
-   Offline (`applyStashedOp` implementation)

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
