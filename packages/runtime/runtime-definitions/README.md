# @fluidframework/runtime-definitions

Contains handshake interfaces for communication between the container runtime layer and the data store runtime layer.

-   `IFluidDataStoreRuntimeChannel` includes the minimal set of data and functionalities that are needed by the ContainerRuntime to bind and control a FluidDataStoreRuntime, including attach, snapshot, op/signal processing, request routes, and connection state notifications.
-   `IFluidDataStoreContext` includes data and function provided by the container layer and used by the data store layer for information about the container, to send ops and signals, data store creation, etc.
-   Agent/Task related interfaces, since the agent scheduler is included by default by the container layer, and data stores can make use of it
-   `IFluidDataStoreFactory` and `IFluidDataStoreRegistry` definitions
-   Common protocol structures that are not related to back-compat between the layer: `IAttachMessage`, `IEnvelope`, `ISignalEnvelope`, `IInboundSignalMessage`.
-   `IContainerRuntimeBase` is a temporary interface that includes a reduced set of data and functionalities from `IContainerRuntime` that the IFluidDataStoreRuntimeChannel or data store writer will need from `ContainerRuntime`.Eventually, all of the these should be shim by the `IFluidDataStoreContext`

These interfaces needs to have strong back-compat guaranetee to support dynamic data store loading scenario where the FluidDataStoreRuntime might be built with different version.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.
