---
"fluid-framework": minor
"__section": feature
---
Add dataStoreRegistryFromIterable

The alpha `dataStoreRegistryFromIterable` utility makes it easier to create a `DataStoreRegistry` from an iterable of existing `DataStoreKind` objects and lazy loaders.

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
The helper calls the details loader only when its type is requested and caches the result, including failures.
