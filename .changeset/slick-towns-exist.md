---
"@fluidframework/runtime-utils": minor
"__section": legacy
---
Identify data store packages in component-load telemetry

The legacy-beta `getDataStorePackagePath` function lets callers add the containing data store's package path to diagnostic telemetry.
For example, the path can identify the package containing a component that takes a long time to load.
The result is informational only: the lookup does not measure load time or change runtime behavior.
It does not resolve the handle, load the data store, or include the package path of a DDS.

```typescript
import { getDataStorePackagePath } from "@fluidframework/runtime-utils/legacy";

const packagePath = await getDataStorePackagePath(containerRuntime, handle);
```
