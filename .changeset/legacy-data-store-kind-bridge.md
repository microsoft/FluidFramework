---
"@fluidframework/runtime-utils": minor
"__section": legacy
---
Use legacy data-store factories with alpha ServiceClient APIs

The new `dataStoreKindFromFactory` function in `@fluidframework/runtime-utils/legacy/alpha` lets you use an existing data-store factory as an alpha `DataStoreKind`.
It preserves the original factory, child registry, entry point, and persisted representation without adding persisted objects.
This includes factories that create registered child data stores during initialization.
Repeated calls with the same factory return the same kind.
Supply the factory's entry-point type as the generic type argument when needed.
The function does not validate that type or change the container's root-discovery convention.

For applications with other root-discovery conventions, `fluidContainerFromLegacy` exposes an attached legacy container and an application-selected root value through the alpha container API.
Pass the service-facing reload ID explicitly; a driver's resolved URL ID may instead be an internal identifier such as an ODSP document hash.
Factories used for alpha creation must already be registered in the existing runtime.
Closing the returned view closes the original container.

```typescript
import {
	dataStoreKindFromFactory,
	fluidContainerFromLegacy,
} from "@fluidframework/runtime-utils/legacy/alpha";

// Use your existing factory, attached container, root value, and service reload ID.
const kind = dataStoreKindFromFactory<typeof root>(factory);
const registry = async (type: string) => {
	if (type !== kind.type) {
		throw new Error(`Unknown data-store type: ${type}`);
	}
	return kind;
};
const view = fluidContainerFromLegacy(container, root, registry, reloadId);
const newDataStore = await view.createDataStore(kind);
```
