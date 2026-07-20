---
"fluid-framework": minor
"@fluidframework/driver-definitions": minor
"@fluidframework/shared-object-base": minor
"@fluidframework/tree": minor
"@fluidframework/runtime-utils": minor
"@fluidframework/local-driver": minor
"__section": feature
---
Add new @alpha ServiceClient API for creating and loading Fluid containers

This introduces an experimental (`@alpha`), service-agnostic API for working with Fluid containers whose root is an arbitrary data store, along with an in-memory implementation for testing.

The new surface is made up of:

- `ServiceClient` (`@fluidframework/driver-definitions`): the entry point for creating and loading containers. Along with it come the supporting container types (`FluidContainer`, `FluidContainerWithService`, `FluidContainerAttached`), the data store model (`DataStoreKind`, `DataStoreKey`, `DataStoreRegistry`, `DataStoreCreator`), and the generic registry primitives (`Registry`, `RegistryKey`, `registryLookup`, `basicKey`).
- `dataStoreKind` and `sharedObjectRegistryFromIterable` (`@fluidframework/shared-object-base`): build a `DataStoreKind` from a root shared object and a registry of shared object kinds.
- `treeDataStoreKind` and `instantiateTreeFirstTime` (`@fluidframework/tree`): a SharedTree-specific convenience wrapper that produces a `DataStoreKind` backed by a `TreeView`.
- `startEphemeralService` (`@fluidframework/local-driver`): starts an in-memory `EphemeralService` for tests. The service owns the lifetime of the in-memory documents and resources, and produces `ServiceClient`s connected to it (via `EphemeralService.newClient` or `EphemeralService.defaultClient`). The helpers `cleanupEphemeralService` and `getDefaultEphemeralService` manage an optional default service instance.

Apart from the `@fluidframework/local-driver` helpers (which come from `@fluidframework/local-driver/alpha`), these APIs are also re-exported from `fluid-framework`. None reference any `@legacy` types.

Example:

```typescript
import { startEphemeralService } from "@fluidframework/local-driver/alpha";
import { ServiceClient, treeDataStoreKind, TreeViewConfiguration, SchemaFactory } from "fluid-framework/alpha";
import { strict as assert } from "node:assert";

// Start an ephemeral in-memory service and get a ServiceClient connected to it.
const service = startEphemeralService();
const client: ServiceClient = service.defaultClient;
// Define a DataStoreKind which uses a SharedTree.
// In this case the schema is for a single number with an initializer that starts the it at 1.
// This schema is captures in the type allowing for strongly typed access to the data in the tree,
// where the type matches the schema based runtime enforcement of the schema.
const numberStore = treeDataStoreKind({
	type: "my-app-root",
	config: new TreeViewConfiguration({ schema: SchemaFactory.number }),
	initializer: () => 1,
});

// Create a container in the service with the above DataStoreKind.
// Ideally this creation would use a service independent API, and only the attach call would be service dependent,
// but that is not supported yet.
const detachedContainer1 = await client.createContainer(numberStore);
const container1 = await detachedContainer1.attach();

// We now have easy and type safe access to the data in the tree, which will be synced over the service.
assert.equal(container1.data.root, 1);

// A second client can load the same container from the service, and will see the same data.
const container2 = await client.loadContainer(container1.id, numberStore);
assert.equal(container2.data.root, 1);

// Both clients can modify the data, and the changes will be synced over the service.
container2.data.root = 2;
// Since we are using an ephemeral service, we can await the synchronization using service.synchronize.
await service.synchronize();

// And now the changes are visible for all clients.
assert.equal(container1.data.root, 2);
assert.equal(container2.data.root, 2);
```

Note that this example does a couple of things which are difficult to do with the other API surfaces:
1. It creates a container, then loads a second copy of it, allowing for collaboration. There is currently no non-legacy API surface which allows this without spawning a server process. This is also cleaner than the exacting legacy API options, and can replace the test specific APIs for this as well.
2. It creates a container which has a SharedTree at the root, and nothing else. This avoids depending on legacy DDS implementations, which is great for long-term document support and bundle size. This is currently impossible using `fluid-static`, which forces a special root data store. It is also impossible if using `aqueduct`, which forces a root directory in every data store. It can be done using the low level legacy APIs directly, but this new API for it is much simpler.
3. There is a common interface all services implement (`ServiceClient`), making the container creation part of the code work for any service implementation.
