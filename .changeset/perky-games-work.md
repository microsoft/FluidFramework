---
"@fluidframework/aqueduct": minor
"@fluidframework/azure-client": minor
"@fluidframework/container-runtime": minor
"@fluidframework/datastore": minor
"@fluidframework/fluid-static": minor
"@fluidframework/odsp-client": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/test-runtime-utils": minor
"@fluidframework/tinylicious-client": minor
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": feature
---

Add document runtime version naming for compatibility configuration

`LoadContainerRuntimeParams` now supports `minDocumentRuntimeVersion` as the preferred name for configuring the minimum Fluid runtime version required to open or process documents created or loaded by the container runtime.
The existing `minVersionForCollab` property remains supported as a deprecated compatibility alias and is planned for removal in 3.0.0 as part of [#27180](https://github.com/microsoft/FluidFramework/issues/27180).

```ts
const runtime = await loadContainerRuntime({
	// ...
	minDocumentRuntimeVersion: "2.0.0",
});
```

The `MinDocumentRuntimeVersion` type is also exported as the preferred name for new API surfaces. Existing APIs that accepted `MinimumVersionForCollab` now reference `MinDocumentRuntimeVersion` instead. `MinimumVersionForCollab` remains supported as a deprecated compatibility alias.

Additional compatibility-related APIs now surface the preferred naming as well:

- `CodecWriteOptionsBeta` now supports `minDocumentRuntimeVersion` and keeps `minVersionForCollab` as a deprecated compatibility alias.
- Runtime/datastore context surfaces now expose `minDocumentRuntimeVersion` while keeping `minVersionForCollab` as a deprecated compatibility alias where needed.
- Service client method parameter names now use `minDocumentRuntimeVersion`.
