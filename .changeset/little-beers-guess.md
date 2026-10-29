---
"@fluidframework/container-runtime": minor
"@fluidframework/aqueduct": minor
"__section": legacy
---
Require an explicit oldest supported client when creating container runtimes

Your application must choose the oldest Fluid Framework client that can read and process its documents.
To make this choice explicit, the following entry points no longer select a default compatibility version in 3.10.0:

- The beta [`loadContainerRuntime`](https://fluidframework.com/docs/api/container-runtime/#loadcontainerruntime-function) entry point.
- The Aqueduct [`BaseContainerRuntimeFactory`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactory-class) constructor.
- The Aqueduct [`ContainerRuntimeFactoryWithDefaultDataStore`](https://fluidframework.com/docs/api/aqueduct/containerruntimefactorywithdefaultdatastore-class) constructor.

To upgrade, set `oldestSupportedClient` to the oldest client version that must retain document access:

```typescript
const runtime = await loadContainerRuntime({
	// Other runtime parameters...
	oldestSupportedClient: "2.0.0",
});
```

The canonical parameter types now require this property.
If a caller still uses `minVersionForCollab`, use the corresponding deprecated migration type until you can update that caller:

| Canonical parameter type | Temporary migration type |
| --- | --- |
| [`LoadContainerRuntimeParams`](https://fluidframework.com/docs/api/container-runtime/loadcontainerruntimeparams-interface) | [`DeprecatedLoadContainerRuntimeParams`](https://fluidframework.com/docs/api/container-runtime/deprecatedloadcontainerruntimeparams-typealias) |
| [`BaseContainerRuntimeFactoryProps`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactoryprops-interface) | [`DeprecatedBaseContainerRuntimeFactoryProps`](https://fluidframework.com/docs/api/aqueduct/deprecatedbasecontainerruntimefactoryprops-typealias) |
| [`ContainerRuntimeFactoryWithDefaultDataStoreProps`](https://fluidframework.com/docs/api/aqueduct/containerruntimefactorywithdefaultdatastoreprops-interface) | [`DeprecatedContainerRuntimeFactoryWithDefaultDataStoreProps`](https://fluidframework.com/docs/api/aqueduct/deprecatedcontainerruntimefactorywithdefaultdatastoreprops-typealias) |

This migration path applies to the beta entry points only.
The alpha [`loadContainerRuntimeAlpha`](https://fluidframework.com/docs/api/container-runtime/#loadcontainerruntimealpha-function) entry point requires `oldestSupportedClient`.
For either path, supply exactly one compatibility property.
If you supply neither property or both properties, the runtime throws a `UsageError`.
See [microsoft/FluidFramework#27180](https://github.com/microsoft/FluidFramework/issues/27180) for the required compatibility choice.

Internal runtime APIs still accept `minVersionForCollab` to support mixed-version packages.
This change does not remove that internal support or the deprecated migration types.
See [microsoft/FluidFramework#27851](https://github.com/microsoft/FluidFramework/issues/27851) for the remaining removal work.
