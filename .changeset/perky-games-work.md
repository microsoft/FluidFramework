---
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-definitions": minor
"__section": feature
---

Add document runtime version naming for compatibility configuration

`LoadContainerRuntimeParams` now supports `minimumDocumentRuntimeVersion` as the preferred name for configuring the minimum Fluid runtime version required to open or process documents created or loaded by the container runtime.
The existing `minVersionForCollab` property remains supported as a compatibility alias.

```ts
const runtime = await loadContainerRuntime({
	// ...
	minimumDocumentRuntimeVersion: "2.0.0",
});
```

The `MinimumDocumentRuntimeVersion` type is also exported as the preferred name for new API surfaces.
