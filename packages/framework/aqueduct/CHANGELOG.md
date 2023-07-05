# @fluidframework/aqueduct

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
