---
"@fluidframework/runtime-definitions": minor
"@fluidframework/container-runtime": minor
"@fluidframework/aqueduct": minor
"@fluidframework/azure-client": minor
"@fluidframework/datastore": minor
"@fluidframework/fluid-static": minor
"@fluidframework/odsp-client": minor
"@fluidframework/test-runtime-utils": minor
"@fluidframework/tree": minor
"@fluidframework/tinylicious-client": minor
"fluid-framework": minor
"__section": deprecation
---
Rename minVersionForCollab to oldestSupportedClient

The cross-client compatibility parameter has new names:

-   The `MinimumVersionForCollab` type is now `OldestSupportedClientVersion`.
-   `LoadContainerRuntimeParams.minVersionForCollab` is now `oldestSupportedClient`.
-   `BaseContainerRuntimeFactoryProps.minVersionForCollab` is now `oldestSupportedClient`.
-   Azure, ODSP, and Tinylicious client methods now use `oldestSupportedClient` and
    `OldestSupportedClientVersion` in their signatures.

The previous property names and `MinimumVersionForCollab` are deprecated and will be removed in future releases. Specifying both `oldestSupportedClient` and `minVersionForCollab` is an error. `MinimumVersionForCollab` continues to work as an alias of `OldestSupportedClientVersion`.

```typescript
// Before
const runtime = await loadContainerRuntime({
	context,
	registryEntries,
	provideEntryPoint,
	minVersionForCollab: "2.40.0",
});

// After
const runtime = await loadContainerRuntime({
	context,
	registryEntries,
	provideEntryPoint,
	oldestSupportedClient: "2.40.0",
});
```

Telemetry property names are unchanged.
