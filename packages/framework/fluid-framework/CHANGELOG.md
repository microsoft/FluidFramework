# fluid-framework

## 2.0.0-rc.4.0.0

### Minor Changes

-   SharedString now uses ISharedObjectKind and does not export the factory [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Most users of `SharedString` should be unaffected as long as they stick to the factory patterns supported by ISharedObjectKind.
    If the actual class type is needed it can be found as `SharedStringClass`.

-   Deprecated members of IFluidHandle are split off into new IFluidHandleInternal interface [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Split IFluidHandle into two interfaces, `IFluidHandle` and `IFluidHandleInternal`.
    Code depending on the previously deprecated members of IFluidHandle can access them by using `toFluidHandleInternal` from `@fluidframework/runtime-utils/legacy`.

    External implementation of the `IFluidHandle` interface are not supported: this change makes the typing better convey this using the `ErasedType` pattern.
    Any existing and previously working, and now broken, external implementations of `IFluidHandle` should still work at runtime, but will need some unsafe type casts to compile.
    Such handle implementation may break in the future and thus should be replaced with use of handles produced by the Fluid Framework client packages.

-   Minor API fixes for "@fluidframework/tree" package. [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Changes constructor for `FieldSchema` from public to private. Users should call `makeFieldSchema` to create instance of `FieldSchema`.

-   Make several driver types no longer public [b7ad7d0b55](https://github.com/microsoft/FluidFramework/commit/b7ad7d0b55884dd8954abf7c398e518838b9bda0)

    Move the following types from `@public` to `@alpha`:

    -   ITokenClaims
    -   IDocumentMessage
    -   IClientConfiguration
    -   IAnyDriverError
    -   IDriverErrorBase
    -   DriverErrorTypes

    `DriverErrorTypes` is no longer exported from the `fluid-framework` package.

-   Rename `AzureMember.userName` to `AzureMember.name` and `IMember.userId` to `IMember.id` [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    1. Renamed `AzureMember.userName` to `AzureMember.name` to establish uniform naming across odsp-client and azure-client.
    2. Renamed `IMember.userId` to `IMember.id` to align with the properties received from AFR.

## 2.0.0-rc.3.0.0

### Major Changes

-   fluid-framework: DDS classes are no longer publicly exported [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    SharedDirectory now only exports its factory and the interface type.
    The actual concrete classes which leak implementation details are no longer exported.
    Users of the `SharedDirectory` type should use `ISharedDirectory`.

    Most of other internal crufts are also hided within the API surface, such as the encoded format,
    ILocalValue, ICreateInfo, local op metadata types, etc.

-   Packages now use package.json "exports" and require modern module resolution [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Fluid Framework packages have been updated to use the [package.json "exports"
    field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) to define explicit entry points for both
    TypeScript types and implementation code.

    This means that using Fluid Framework packages require the following TypeScript settings in tsconfig.json:

    -   `"moduleResolution": "Node16"` with `"module": "Node16"`
    -   `"moduleResolution": "Bundler"` with `"module": "ESNext"`

    We recommend using Node16/Node16 unless absolutely necessary. That will produce transpiled JavaScript that is suitable
    for use with modern versions of Node.js _and_ Bundlers.
    [See the TypeScript documentation](https://www.typescriptlang.org/tsconfig#moduleResolution) for more information
    regarding the module and moduleResolution options.

    **Node10 moduleResolution is not supported; it does not support Fluid Framework's API structuring pattern that is used
    to distinguish stable APIs from those that are in development.**

### Minor Changes

-   tree: Allow root editing and make TreeView parameterized over schema. [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    TreeView now is parameterized over the field schema instead of the root field type. This was needed to infer the correct input type when reassigning the root.
    Code providing an explicit type to TreeView, like `TreeView<Foo>` can usually be updated by replacing that with `TreeView<typeof Foo>`.

-   fluid-framework: Replace SharedObjectClass with new ISharedObjectKind type. [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    The static objects used as SharedObjectClass now explicitly implement the new ISharedObjectKind type.
    SharedObjectClass has been removed as ISharedObjectKind now fills that role.
    LoadableObjectCtor has been inlined as it only had one use: an external user of it can replace it with `(new (...args: any[]) => T)`.

-   fluid-framework: Moved SharedMap to 'fluid-framework/legacy' [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Please use SharedTree for new containers. SharedMap is supported for loading preexisting Fluid Framework 1.x containers only.

    Fluid Framework 1.x users migrating to Fluid Framework 2.x will need to import SharedMap from the './legacy' import path.

    ```ts
    import { SharedMap } from "fluid-framework/legacy";
    ```

-   fluid-framework: Make some interface members readonly [97d68aa06b](https://github.com/microsoft/FluidFramework/commit/97d68aa06bd5c022ecb026655814aea222a062ae)

    Remove unneeded mutability from some interface members.

## 2.0.0-rc.2.0.0

### Minor Changes

-   fluid-framework: EventEmitterWithErrorHandling is no longer publicly exported ([#19717](https://github.com/microsoft/FluidFramework/issues/19717)) [ae1d0be26d](https://github.com/microsoft/FluidFramework/commits/ae1d0be26d61453cff316b3f622a9f3647149167)

    EventEmitterWithErrorHandling is intended for authoring DDSes, and thus is only intended for use within the Fluid Framework client packages.
    It is no longer publicly exported: any users should fine their own solution or be upstreamed.
    EventEmitterWithErrorHandling is available for now as `@alpha` to make this migration less disrupting for any existing users.

-   fluid-framework: SharedObject classes are no longer exported as public ([#19717](https://github.com/microsoft/FluidFramework/issues/19717)) [ae1d0be26d](https://github.com/microsoft/FluidFramework/commits/ae1d0be26d61453cff316b3f622a9f3647149167)

    `SharedObject` and `SharedObjectCore` are intended for authoring DDSes, and thus are only intended for use within the Fluid Framework client packages.
    They is no longer publicly exported: any users should fine their own solution or be upstreamed.
    `SharedObject` and `SharedObjectCore` are available for now as `@alpha` to make this migration less disrupting for any existing users.

-   API tightening ([#20012](https://github.com/microsoft/FluidFramework/issues/20012)) [049de899dd](https://github.com/microsoft/FluidFramework/commits/049de899ddfd5c0155251cb0ea00ecbe3a7f7665)

    The Fluid Framework API has been clarified with tags applied to package exports. As we are working toward a clear, safe,
    and stable API surface, some build settings and imports may need to be adjusted.

    **Now:** Most packages are specifying "exports" - import specifierss like` @fluidframework/foo/lib/internals` will
    become build errors. The fix is to use only public APIs from @fluidframework/foo.

    **Coming soon:** Build resolutions (`moduleResolution` in tsconfig compilerOptions) will need to be resolved with
    Node16, NodeNext, or a bundler that supports resolution of named import/export paths. Internally, some FF packages will
    use `@fluidframework/foo/internal` import paths that allow packages to talk to each other using non-public APIs.

    **Final stage:** APIs that are not tagged @public will be removed from @fluidframework/foo imports.

-   Deprecated error-related enums have been removed ([#19067](https://github.com/microsoft/FluidFramework/issues/19067)) [59793302e5](https://github.com/microsoft/FluidFramework/commits/59793302e56784cfb6ace0e6469345f3565b3312)

    Error-related enums `ContainerErrorType`, `DriverErrorType`, `OdspErrorType` and `RouterliciousErrorType` were previously
    deprecated and are now removed. There are replacement object-based enumerations of `ContainerErrorTypes`,
    `DriverErrorTypes`, `OdspErrorTypes` and `RouterliciousErrorTypes`. Refer to the release notes of [Fluid Framework version
    2.0.0-internal.7.0.0](https://github.com/microsoft/FluidFramework/releases/tag/client_v2.0.0-internal.7.0.0) for details
    on the replacements.

-   map, tree: DDS classes are no longer publicly exported ([#19717](https://github.com/microsoft/FluidFramework/issues/19717)) [ae1d0be26d](https://github.com/microsoft/FluidFramework/commits/ae1d0be26d61453cff316b3f622a9f3647149167)

    SharedMap and SharedTree now only export their factories and the interface types.
    The actual concrete classes which leak implementation details are no longer exported.
    Users of the `SharedMap` type should use `ISharedMap`.
    Users of the `SharedTree` type should use `ISharedTree`.

-   tree: Minor API fixes for "@fluidframework/tree" package. ([#19057](https://github.com/microsoft/FluidFramework/issues/19057)) [3e0f218832](https://github.com/microsoft/FluidFramework/commits/3e0f21883255317f8bb1f7c420543650502a5b66)

    Rename `IterableTreeListContent` to `IterableTreeArrayContent`, inline `TreeMapNodeBase` into `TreeMapNode`, rename `TreeArrayNode.spread` to `TreeArrayNode.spread` and remove `create` which was not supposed to be public (use `TreeArrayNode.spread` instead).

-   fluid-framework: ContainerSchema is now readonly ([#19717](https://github.com/microsoft/FluidFramework/issues/19717)) [ae1d0be26d](https://github.com/microsoft/FluidFramework/commits/ae1d0be26d61453cff316b3f622a9f3647149167)

    The `ContainerSchema` type is intended for defining input to these packages. This should make the APIs more tolerant and
    thus be non-breaking, however its possible for some users of `ContainerSchema` to use it in ways where this could be a
    breaking change: any such users should remove their mutations and/or use a different type.

## 2.0.0-rc.1.0.0

Dependency updates only.

## 2.0.0-internal.8.0.0

### Major Changes

-   azure-client: Removed deprecated FluidStatic classes [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    Several FluidStatic classes were unnecessarily exposed and were deprecated in an earlier release. They have been replaced with creation functions. This helps us
    keep implementations decoupled from usage which is easier to maintain and extend. It has very minimal impact on the
    public surface area of downstream packages. The removed classes are as follows:

    -   `AzureAudience` (use `IAzureAudience` instead)
    -   `TinyliciousAudience` (use `ITinyliciousAudience` instead)
    -   `DOProviderContainerRuntimeFactory`
    -   `FluidContainer`
    -   `ServiceAudience`

## 2.0.0-internal.7.4.0

### Minor Changes

-   azure-client: Deprecated FluidStatic Classes ([#18402](https://github.com/microsoft/FluidFramework/issues/18402)) [589ec39de5](https://github.com/microsoft/FluidFramework/commits/589ec39de52116c7f782319e6f6aa61bc5aa9964)

    Several FluidStatic classes were unnecessarily exposed. They have been replaced with creation functions. This helps us
    keep implementations decoupled from usage which is easier to maintain and extend. It has very minimal impact on the
    public surface area of downstream packages. The deprecated classes are as follows:

    -   `AzureAudience` (use `IAzureAudience` instead)
    -   `TinyliciousAudience` (use `ITinyliciousAudience` instead)
    -   `DOProviderContainerRuntimeFactory`
    -   `FluidContainer`
    -   `ServiceAudience`

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

### Major Changes

-   Minimum TypeScript version now 5.1.6 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The minimum supported TypeScript version for Fluid 2.0 clients is now 5.1.6.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

Dependency updates only.

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   IntervalConflictResolver removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    IntervalConflictResolver has been removed. Any lingering usages in application code can be removed as well. This change also marks APIs deprecated in #14318 as internal.

-   RootDataObject and RootDataObjectProps no longer exported from fluid-static or fluid-framework packages [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    RootDataObject and RootDataObjectProps are internal implementations and not intended for direct use. Instead use IRootDataObject to refer to the root data object.

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

Dependency updates only.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
