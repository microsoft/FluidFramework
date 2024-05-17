---
"@fluidframework/container-runtime": minor
"@fluidframework/core-interfaces": minor
"@fluidframework/datastore-definitions": minor
"fluid-framework": minor
"@fluidframework/fluid-static": minor
"@fluidframework/runtime-definitions": minor
"@fluidframework/shared-object-base": minor
"@fluidframework/tree": minor
---

Type Erase ISharedObjectKind

A new type, `SharedObjectKind` is added as a type erased version of `ISharedObjectKind` and `DataObjectClass`.

This type fills the role of both `ISharedObjectKind` and `DataObjectClass` in the `@public` "declarative API" exposed in the `fluid-framework` package.

This allows several types referenced by `ISharedObjectKind` to be made `@alpha` as they should only need to be used by legacy code and users of the unstable/alpha/legacy "encapsulated API".

Access to these now less public types should not be required for users of the `@public` "declarative API" exposed in the `fluid-framework` package, but can still be accessed for those who need them under the `/legacy` import paths.
The full list of such types is:

-   `SharedTree` as exported from `@fluidframwork/tree`: It is still exported as `@public` from `fluid-framework` as `SharedObjectKind`.
-   `ISharedObjectKind`: See new `SharedObjectKind` type for use in `@public` APIs.
    `ISharedObject`
-   `IChannel`
-   `IChannelAttributes`
-   `IChannelFactory`
-   `IExperimentalIncrementalSummaryContext`
-   `IGarbageCollectionData`
-   `ISummaryStats`
-   `ISummaryTreeWithStats`
-   `ITelemetryContext`
-   `IDeltaManagerErased`
-   `IFluidDataStoreRuntimeEvents`
-   `IFluidHandleContext`
-   `IProvideFluidHandleContext`

Removed APIs:

-   `DataObjectClass`: Usages replaced with `SharedObjectKind`.
-   `LoadableObjectClass`: Replaced with `SharedObjectKind`.
-   `LoadableObjectClassRecord`: Replaced with `Record<string, SharedObjectKind>`.
-
