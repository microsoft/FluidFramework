---
"@fluidframework/runtime-utils": minor
"__section": feature
---
Legacy data store factories can now be used with ServiceClient

The new `adaptLegacyDataStoreFactory` alpha API converts a `ServiceClientLegacyDataStoreFactory` into a `DataStoreKind` for use with `ServiceClient` APIs.
`ServiceClientLegacyDataStoreFactory` extends `IFluidDataStoreFactory` with an optional, documented nested data store registry, which the adapter preserves.

```typescript
import { adaptLegacyDataStoreFactory } from "@fluidframework/runtime-utils/legacy/alpha";

const dataStoreKind = adaptLegacyDataStoreFactory<MyDataObject>(
	MyDataObject.getFactory(),
);
const container = await client.createAttachedContainer(dataStoreKind);
```
