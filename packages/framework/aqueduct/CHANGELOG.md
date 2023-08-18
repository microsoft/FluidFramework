# @fluidframework/aqueduct

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   `initializeEntryPoint` will become required [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The optional `initializeEntryPoint` method has been added to a number of constructors. **This method argument will become required in an upcoming release** and a value will need to be provided to the following classes:

    -   `BaseContainerRuntimeFactory`
    -   `ContainerRuntimeFactoryWithDefaultDataStore`
    -   `RuntimeFactory`
    -   `ContainerRuntime` (constructor and `loadRuntime`)
    -   `FluidDataStoreRuntime`

    For an example implementation of `initializeEntryPoint`, see [pureDataObjectFactory.ts](https://github.com/microsoft/FluidFramework/blob/main/packages/framework/aqueduct/src/data-object-factories/pureDataObjectFactory.ts#L84).

    This work will replace the request pattern. See [Removing-IFluidRouter.md](https://github.com/microsoft/FluidFramework/blob/main/packages/common/core-interfaces/Removing-IFluidRouter.md) for more info on this effort.

-   EventForwarder and IDisposable members removed from PureDataObject [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The EventForwarder and IDisposable members of PureDataObject were deprecated in 2.0.0-internal.5.2.0 and have now been removed.

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

### Minor Changes

-   EventForwarder and IDisposable members deprecated from PureDataObject ([#16201](https://github.com/microsoft/FluidFramework/issues/16201)) [0e838fdb3e](https://github.com/microsoft/FluidFramework/commits/0e838fdb3e8187481f41c4116a67458c2a1658d5)

    The EventForwarder and IDisposable members have been deprecated from PureDataObject and will be removed in an upcoming release. The EventForwarder pattern was mostly unused by the current implementation, and is also recommended against generally (instead, register and forward events explicitly). The disposal implementation was incomplete and likely to cause poor behavior as the disposal was not observable by default. Inheritors of the PureDataObject can of course still implement their own disposal logic.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

### Major Changes

-   The following functions and classes were deprecated in previous releases and have been removed: [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)

    -   `PureDataObject.getFluidObjectFromDirectory`
    -   `IProvideContainerRuntime` and its `IContainerRuntime` member.
    -   `ContainerRuntime`'s `IProvideContainerRuntime` has also been removed.

## 2.0.0-internal.4.4.0

### Minor Changes

-   `PureDataObject.getFluidObjectFromDirectory` has been deprecated and will be removed in an upcoming release. Instead prefer to interface directly with the directory and handles. [9238304c77](https://github.com/microsoft/FluidFramework/commits/9238304c772d447225f6f86417033ca8004c0edd)

## 2.0.0-internal.4.1.0

Dependency updates only.
