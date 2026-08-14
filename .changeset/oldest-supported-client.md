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

-   The
    [`MinimumVersionForCollab`](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias)
    type is now
    [`OldestSupportedClientVersion`](https://fluidframework.com/docs/api/runtime-definitions/oldestsupportedclientversion-typealias).
-   [`LoadContainerRuntimeParams.minVersionForCollab`](https://fluidframework.com/docs/api/container-runtime/loadcontainerruntimeparams-interface#minversionforcollab-propertysignature)
    is now
    [`LoadContainerRuntimeParams.oldestSupportedClient`](https://fluidframework.com/docs/api/container-runtime/loadcontainerruntimeparams-interface#oldestsupportedclient-propertysignature).
-   [`BaseContainerRuntimeFactoryProps.minVersionForCollab`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactoryprops-interface#minversionforcollab-propertysignature)
    is now
    [`BaseContainerRuntimeFactoryProps.oldestSupportedClient`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactoryprops-interface#oldestsupportedclient-propertysignature).
-   [`createTreeContainerRuntimeFactory`](https://fluidframework.com/docs/api/fluid-static/#createtreecontainerruntimefactory-function)
    now accepts `oldestSupportedClient`.
    `minVersionForCollaboration` remains available as a deprecated overload.
-   `@fluidframework/driver-definitions` now exports its minor-only version type as
    [`OldestSupportedServiceClientVersion`](https://fluidframework.com/docs/api/driver-definitions/oldestsupportedserviceclientversion-typealias),
    and
    [`ServiceOptions.oldestSupportedClient`](https://fluidframework.com/docs/api/driver-definitions/serviceoptions-interface#oldestsupportedclient-propertysignature)
    is available.
-   [`AzureClient`](https://fluidframework.com/docs/api/azure-client/azureclient-class),
    [`OdspClient`](https://fluidframework.com/docs/api/odsp-client/odspclient-class),
    and
    [`TinyliciousClient`](https://fluidframework.com/docs/api/tinylicious-client/tinyliciousclient-class)
    methods now use `oldestSupportedClient` and
    [`OldestSupportedClientVersion`](https://fluidframework.com/docs/api/runtime-definitions/oldestsupportedclientversion-typealias)
    in their signatures.

The previous property and type names in `@fluidframework/runtime-definitions`,
`@fluidframework/container-runtime`, `@fluidframework/aqueduct`, and
`@fluidframework/fluid-static` are deprecated and will be removed in future
releases. Where both old and new property names remain available, specifying both
is an error. The alpha `MinimumVersionForCollaboration` type and
`ServiceOptions.minVersionForCollaboration` property are replaced directly rather
than retained as aliases.

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
