# @fluidframework/runtime-definitions

Contains handshake interfaces for communication between the container runtime layer and the component runtime layer.

- `IComponentRuntimeChannel` includes the minimal set of data and functionalities that are needed by the ContainerRuntime to bind and control a ComponentRuntime, including attach, snapshot, op/signal processing, request routes, and connection state notifications.
- `IComponentContext` includes data and function provided by the container layer and used by the component layer for information about the container, to send ops and signals, component creation, etc.
- Agent/Task related interfaces, since the agent scheduler is included by default by the container layer, and components can make use of it
- `IComponentFactory` and `IComponentRegistry` definitions
- Common protocol structures that are not related to back-compat between the layer: `IAttachMessage`, `IEnvelop`, `ISignalEnvelop`, `IInboundSignalMessage`.
- `IContainerRuntimeBase` is a temporary interface that includes a reduced set of data and functionalities from `IContainerRuntime` that the IComponentRuntimeChannel or component writer will need from `ContainerRuntime`.Eventually, all of the these should be shim by the `IComponentContext`

These interfaces needs to have strong back-compat guaranetee to support dynamic component loading scenario where the ComponentRuntime might be built with different version.
