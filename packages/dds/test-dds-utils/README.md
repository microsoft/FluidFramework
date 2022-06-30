# @fluid-internal/test-dds-utils

Utilities for writing unit tests for DDS in Fluid Framework.

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
