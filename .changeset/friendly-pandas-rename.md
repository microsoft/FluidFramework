---
"@fluid-experimental/attributor": minor
"@fluidframework/container-runtime": minor
"@fluidframework/runtime-definitions": minor
"__section": feature
---

Add document runtime version naming for compatibility configuration

`LoadContainerRuntimeParams` now supports `minDocumentRuntimeVersion` as the preferred name for configuring the minimum Fluid runtime version required to open or process documents created or loaded by the container runtime. The existing `minVersionForCollab` property remains supported as a compatibility alias.

```ts
const runtime = await loadContainerRuntime({
	// ...
	minDocumentRuntimeVersion: "2.0.0",
});
```

Specifying both parameter names throws a `UsageError`. The Attributor runtime wrapper also forwards the preferred parameter to the underlying container runtime.

`MinDocumentRuntimeVersion` is now exported as the preferred public type name. `MinimumVersionForCollab` remains supported as a compatibility alias.
