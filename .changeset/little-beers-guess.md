---
"@fluidframework/container-runtime": minor
"@fluidframework/aqueduct": minor
"__section": legacy
---
Require an explicit oldest supported client when creating container runtimes

The beta
[`loadContainerRuntime`](https://fluidframework.com/docs/api/container-runtime/#loadcontainerruntime-function)
entry point and the Aqueduct
[`BaseContainerRuntimeFactory`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactory-class)
and
[`ContainerRuntimeFactoryWithDefaultDataStore`](https://fluidframework.com/docs/api/aqueduct/containerruntimefactorywithdefaultdatastore-class)
no longer choose a compatibility version when one is omitted.
The `oldestSupportedClient` property is now required on
[`LoadContainerRuntimeParams`](https://fluidframework.com/docs/api/container-runtime/loadcontainerruntimeparams-interface),
[`BaseContainerRuntimeFactoryProps`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactoryprops-interface),
and
[`ContainerRuntimeFactoryWithDefaultDataStoreProps`](https://fluidframework.com/docs/api/aqueduct/containerruntimefactorywithdefaultdatastoreprops-interface).
Typed callers that temporarily retain the deprecated `minVersionForCollab` property must use
[`DeprecatedLoadContainerRuntimeParams`](https://fluidframework.com/docs/api/container-runtime/deprecatedloadcontainerruntimeparams-typealias),
[`DeprecatedBaseContainerRuntimeFactoryProps`](https://fluidframework.com/docs/api/aqueduct/deprecatedbasecontainerruntimefactoryprops-typealias),
or
[`DeprecatedContainerRuntimeFactoryWithDefaultDataStoreProps`](https://fluidframework.com/docs/api/aqueduct/deprecatedcontainerruntimefactorywithdefaultdatastoreprops-typealias),
as applicable. The alpha
[`loadContainerRuntimeAlpha`](https://fluidframework.com/docs/api/container-runtime/#loadcontainerruntimealpha-function)
entry point requires `oldestSupportedClient`.

Migrate callers to the canonical property:

```typescript
const runtime = await loadContainerRuntime({
	// Other runtime parameters...
	oldestSupportedClient: "2.0.0",
});
```

See [microsoft/FluidFramework#27180](https://github.com/microsoft/FluidFramework/issues/27180) for more information.
