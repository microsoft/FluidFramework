---
"@fluidframework/runtime-utils": minor
"__section": legacy
---
Identify a data store's package path, for use in telemtry

The legacy-beta `getDataStorePackagePath` function lets callers add the containing data store's package path to diagnostic telemetry.
For example, the path can identify the package containing a component that takes a long time to load.
The package path is diagnostic information, not an input that configures the runtime.
If the data store's snapshot details are not yet available, the lookup may fetch an omitted snapshot and read its attributes blob.
This work can add latency and affect the timing of other operations, so avoid awaiting the lookup on a latency-sensitive load path.
It does not resolve the handle, load the data store, or include the package path of a DDS.

```typescript
import { getDataStorePackagePath } from "@fluidframework/runtime-utils/legacy";

const packagePath = await getDataStorePackagePath(containerRuntime, handle);
```
