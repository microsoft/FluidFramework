---
"@fluidframework/runtime-utils": minor
"__section": legacy
---
Look up the containing data store's package path from a handle

The legacy-beta `getDataStorePackagePath` function reads the package path of the data store containing an object referenced by an `IFluidHandle`.
It does not resolve the handle, load the data store, or include the package path of a DDS.

```typescript
import { getDataStorePackagePath } from "@fluidframework/runtime-utils/legacy";

const packagePath = await getDataStorePackagePath(containerRuntime, handle);
```
