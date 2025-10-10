---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
MinimumVersionForCollab is now used in place of tree's alpha FluidClientVersion

`FluidClientVersion`: No longer used as the type for Fluid Client versions in APIs/codecs (for example, `oldestCompatibleClient`).
Additionally, `FluidClientVersion` is now a const object with members that declare specific [`MinimumVersionForCollab`](https://fluidframework.com/docs/api/runtime-definitions/minimumversionforcollab-typealias) versions.
These are intended to be used with APIs that require a version (such as `TreeAlpha.exportCompressed`).

`CodecWriteOptions` and `SharedTreeOptions`: `oldestCompatibleClient` has been replaced by `minVersionForCollab`.
See migration guide below.

`TreeAlpha.exportCompressed`: The `options` parameter previously had `oldestCompatibleClient` and now has `minVersionForCollab`.
Migrating requires a rename. Existing `FluidClientVersion.*` values are now `MinimumClientVersion`s.

#### Migrating

If an application is calling `loadContainerRuntime` directly and previously specified the minimum client version when
initializing Shared Tree like:

```ts
    const factory = configuredSharedTree({ ..., oldestCompatibleClient: FluidClientVersion.v2_52 });
```

Then the new implementation depends on how the application initializes Fluid.

##### Applications using `AzureClient`/`OdspClient`

If an application is using the declarative model (for example, `AzureClient`/`OdspClient`), it should continue to call `configuredSharedTree`
but specify `minVersionForCollab` instead:

```ts
    const factory = configuredSharedTree({ ..., minVersionForCollab: "2.52.0" });
```

##### Applications calling `loadContainerRuntime`

If an application is initializing the `ContainerRuntime` directly, it should now specify the `minVersionForCollab` there:

```ts
    const runtime = await loadContainerRuntime({ ..., minVersionForCollab: "2.52.0" });
```
