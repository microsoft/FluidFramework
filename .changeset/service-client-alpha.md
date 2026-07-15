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
- `createEphemeralServiceClient` (`@fluidframework/local-driver`): an in-memory `ServiceClient` implementation for tests, plus the helpers `closeEphemeralContainers` and `synchronizeLocalService`.

Apart from the `@fluidframework/local-driver` helpers (which come from `@fluidframework/local-driver/alpha`), these APIs are also re-exported from `fluid-framework`. None reference any `@legacy` types.

Example:

```typescript
import { createEphemeralServiceClient } from "@fluidframework/local-driver/alpha";
import { treeDataStoreKind } from "fluid-framework/alpha";

const client = createEphemeralServiceClient();
const root = treeDataStoreKind({ type: "my-app-root", config, initializer });

const container = await client.createContainer(root);
const attached = await container.attach();
const loaded = await client.loadContainer(attached.id, root);
```

Note that this example does a couple of things which are difficult to do with the other API surfaces:
1. It creates a container, then loads a second copy of it, allowing for collaboration. There is currently no non-legacy API surface which allows this without spawning a server process. This is also cleaner than the exacting legacy API options, and can replace the test specific APIs for this as well.
2. It creates a container which has a SharedTree at the root, and nothing else. This avoids depending on legacy DDS implementations, which is great for long-term document support and bundle size. This is currently impossible using `fluid-static`, which forces a special root data store. It is also impossible if using `aqueduct`, which forces a root directory in every data store. It can be done using the low level legacy APIs directly, but this new API for it is much simpler.
