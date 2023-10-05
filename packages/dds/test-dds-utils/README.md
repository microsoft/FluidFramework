# @fluid-internal/test-dds-utils

Utilities for writing unit tests for DDS in Fluid Framework.

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

Note that when depending on a library version of the form `2.0.0-internal.x.y.z`, called the Fluid internal version scheme,
you must use a `>= <` dependency range (such as `>=2.0.0-internal.x.y.z <2.0.0-internal.w.0.0` where `w` is `x+1`).
Standard `^` and `~` ranges will not work as expected.
See the [@fluid-tools/version-tools](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/README.md)
package for more information including tools to convert between version schemes.

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
This model is written using [@fluid-internal/stochastic-test-utils](../../test/stochastic-test-utils/README.md).
See documentation on `createDDSFuzzSuite` and `DDSFuzzModel` for more details.

The harness currently supports testing eventual consistency of op application using Fluid's set of [mocks](../../runtime/test-runtime-utils/README.md)
including the reconnect flow.

### Future Improvements

The generic aspects of this model could be improved to fuzz test correctness a few other general concerns DDS authors have:

-   Summarization correctness
-   Offline (`applyStashedOp` implementation)
