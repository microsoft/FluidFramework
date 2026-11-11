---
"@fluidframework/shared-object-base": minor
"fluid-framework": minor
"__section": feature
---
Create data store registries with on-demand loading

The alpha `dataStoreRegistryFromIterable` helper creates a `DataStoreRegistry` from existing `DataStoreKind` objects and lazy loaders.
Each lazy loader runs only when its type is requested, and runs at most once, even for concurrent requests or failed loads.
Duplicate registrations, unknown type identifiers, and loaders that return a different type are rejected.
Type identifiers must match exactly.
The helper preserves the kinds' output type for typed container loading.
For kinds with different output types, specify their common type or a union as the helper's type argument.

```typescript
import { dataStoreRegistryFromIterable } from "fluid-framework/alpha";
import { rootKind } from "./root.js";

const registry = dataStoreRegistryFromIterable([
	rootKind,
	{
		type: "com.example.details",
		kind: async () => (await import("./details.js")).detailsKind,
	},
]);

const detailsKind = await registry("com.example.details");
```

In this example, `rootKind` and `detailsKind` are existing data store kinds, and `detailsKind.type` is `"com.example.details"`.
You can also import the helper from `@fluidframework/shared-object-base/internal`.
Continue to use `sharedObjectRegistryFromIterable` for shared object registries; its API and behavior are unchanged.
