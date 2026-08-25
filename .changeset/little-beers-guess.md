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
no longer choose a compatibility version when one is omitted. Callers must specify exactly one of
[`oldestSupportedClient`](https://fluidframework.com/docs/api/container-runtime/loadcontainerruntimeparams-interface#oldestsupportedclient-propertysignature)
or the deprecated
[`minVersionForCollab`](https://fluidframework.com/docs/api/container-runtime/loadcontainerruntimeparams-interface#minversionforcollab-propertysignature)
property. The alpha
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
