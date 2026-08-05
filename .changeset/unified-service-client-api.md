---
"@fluidframework/odsp-client": minor
"@fluidframework/tinylicious-driver": minor
"@fluidframework/presence": minor
"@fluidframework/devtools": minor
"__section": feature
---
Add integrations for the unified ServiceClient API

New `@alpha` factories provide `ServiceClient` implementations for Tinylicious and ODSP:

- `createTinyliciousServiceClient` from `@fluidframework/tinylicious-driver`
- `createOdspServiceClient` from `@fluidframework/odsp-client`

Each factory accepts service-specific connection options and a minimum collaboration version.
ODSP also accepts a telemetry logger and config provider.
The ID returned by `attach` can be passed directly to `loadContainer`;
for ODSP this is the service-assigned item ID.
Tinylicious accepts a complete endpoint URL, with an optional explicit port override.

Two additional `@alpha` integrations support containers created through `ServiceClient`:

- `getPresenceFromContainer` from `@fluidframework/presence` provides access to Presence.
- `initializeFluidDevtools` from `@fluidframework/devtools` initializes Devtools and accepts the new `FluidDevtoolsProps` and `FluidContainerDevtoolsProps` types.

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
const container = await service.createAttachedContainer(appKind);
const view = container.data; // the root TreeView

const loaded = await service.loadContainer(container.id, appKind);
```
