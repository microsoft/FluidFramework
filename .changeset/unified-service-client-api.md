---
"fluid-framework": minor
"@fluidframework/tree": minor
"@fluidframework/azure-client": minor
"@fluidframework/odsp-client": minor
"@fluidframework/tinylicious-driver": minor
"@fluidframework/presence": minor
"@fluidframework/runtime-utils": minor
"@fluidframework/devtools": minor
"__section": feature
---
Introduce a unified `ServiceClient` API for creating and loading Fluid containers

A new `@alpha` API provides a single, service-agnostic way to create and load Fluid containers, as a cleaner alternative to the existing `fluid-static` (declarative) and `aqueduct` (encapsulated) models.

A `ServiceClient` is obtained from a per-service factory and exposes `createContainer` and `loadContainer`. Container contents are described by a `DataStoreKind` rather than a container schema; `defineTreeDataStore` (from `fluid-framework` / `@fluidframework/tree`) builds one from a `SharedTree` view configuration, and `defineDataStore` builds one from any root shared object.

Factories are provided for each service:

- `createTinyliciousServiceClient` (`@fluidframework/tinylicious-driver`)
- `createAzureServiceClient` (`@fluidframework/azure-client`)
- `createOdspServiceClient` (`@fluidframework/odsp-client`)
- `startEphemeralService` (`@fluidframework/local-driver`, in-memory, for tests)

Supporting integration is also exposed: `getPresenceFromContainer` (`@fluidframework/presence`), `getContainerAudience` (`@fluidframework/runtime-utils`), and `initializeFluidDevtools` (`@fluidframework/devtools`) for use with `ServiceClient`-created containers.

```typescript
import { defineTreeDataStore } from "fluid-framework/alpha";
import { createTinyliciousServiceClient } from "@fluidframework/tinylicious-driver/alpha";

const appKind = defineTreeDataStore({
	type: "my-app",
	config: treeConfiguration,
	initializer: () => new AppRoot({ /* ... */ }),
});

const service = createTinyliciousServiceClient({ minVersionForCollaboration: "2.100.0" });

// Create a new document, or load an existing one by id.
const container = await service.createContainer(appKind);
const attached = await container.attach();
const view = attached.data; // the root TreeView

const loaded = await service.loadContainer(attached.id, appKind);
```

This API is exposed as `@alpha`: it makes no long-term commitments and is expected to be refined through in-repo use in tests and examples before any promotion.
