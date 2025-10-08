---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
MinimumVersionForCollab is now used in place of tree's alpha FluidClientVersion

FluidClientVersion is no longer used as the declaration type for versions in APIs/codecs (for example, `oldestCompatibleClient`).
Additionally, FluidClientVersion is now a const object with members that declare specific MinimumVersionForCollab versions.
These are intended to be used with APIs that require a version (such as `TreeAlpha.exportCompressed`).

`SharedTreeOptions.oldestCompatibleClient` has been removed in favor of `LoadContainerRuntimeParams.minVersionForCollab`.
If an application previously specified the minimum client version when initialization Shared Tree like:

```ts
    const factory = configuredSharedTree({ ..., oldestCompatibleClient: "2.1.3" });
```

The application should now specify the version when initializing the Container Runtime:

```ts
    const runtime = await loadContainerRuntime({ ..., minVersionForCollab: "2.1.3" });
```
