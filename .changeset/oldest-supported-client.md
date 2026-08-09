---
"@fluidframework/runtime-definitions": minor
"@fluidframework/container-runtime": minor
"@fluidframework/aqueduct": minor
"@fluidframework/azure-client": minor
"@fluidframework/datastore": minor
"@fluidframework/driver-definitions": minor
"@fluidframework/fluid-static": minor
"@fluidframework/local-driver": minor
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
-   `createTreeContainerRuntimeFactory` now accepts `oldestSupportedClient`.
    `minVersionForCollaboration` remains available as a deprecated overload.
-   `driver-definitions` now exports its minor-only version type as
    `OldestSupportedClient`, and `ServiceOptions` accepts `oldestSupportedClient`.
-   Azure, ODSP, and Tinylicious client methods now use `oldestSupportedClient` and
    `OldestSupportedClientVersion` in their signatures.

The previous property and type names are deprecated and will be removed in future releases. Specifying both old and new property names is an error. `MinimumVersionForCollab` and `MinimumVersionForCollaboration` continue to work as aliases of their respective preferred types.

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
