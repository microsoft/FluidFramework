---
"@fluidframework/container-runtime": minor
"@fluidframework/aqueduct": minor
"__section": legacy
---
Require an explicit oldest supported client when creating container runtimes

Your application must choose the oldest Fluid Framework client that can read and process its documents.
To make this choice explicit, the following entry points no longer select a default compatibility version in 3.10.0:

| Entry point | Existing parameter interface |
| --- | --- |
| Beta [`loadContainerRuntime`](https://fluidframework.com/docs/api/container-runtime/#loadcontainerruntime-function) | [`LoadContainerRuntimeParams`](https://fluidframework.com/docs/api/container-runtime/loadcontainerruntimeparams-interface) |
| Aqueduct [`BaseContainerRuntimeFactory`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactory-class) constructor | [`BaseContainerRuntimeFactoryProps`](https://fluidframework.com/docs/api/aqueduct/basecontainerruntimefactoryprops-interface) |
| Aqueduct [`ContainerRuntimeFactoryWithDefaultDataStore`](https://fluidframework.com/docs/api/aqueduct/containerruntimefactorywithdefaultdatastore-class) constructor | [`ContainerRuntimeFactoryWithDefaultDataStoreProps`](https://fluidframework.com/docs/api/aqueduct/containerruntimefactorywithdefaultdatastoreprops-interface) |

To upgrade, set `oldestSupportedClient` to the oldest client version that must retain document access:

```typescript
const runtime = await loadContainerRuntime({
	// Other runtime parameters...
	oldestSupportedClient: "2.0.0",
});
```

Existing beta callers can continue to use the deprecated `minVersionForCollab` property on the same parameter interfaces.
Both properties remain optional in TypeScript to preserve existing declarations and interface extensions.
The runtime, rather than the compiler, requires exactly one compatibility property.
If you supply neither property or both properties, the runtime throws a `UsageError`.
See [microsoft/FluidFramework#27180](https://github.com/microsoft/FluidFramework/issues/27180) for the required compatibility choice.

The alpha [`loadContainerRuntimeAlpha`](https://fluidframework.com/docs/api/container-runtime/#loadcontainerruntimealpha-function) entry point has a stricter contract.
It requires `oldestSupportedClient` in TypeScript and at runtime, and does not accept `minVersionForCollab`.

Internal runtime APIs still accept `minVersionForCollab` to support mixed-version packages.
This change does not remove that internal support.
See [microsoft/FluidFramework#27851](https://github.com/microsoft/FluidFramework/issues/27851) for the remaining removal work.
