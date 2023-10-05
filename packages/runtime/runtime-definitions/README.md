# @fluidframework/runtime-definitions

Contains handshake interfaces for communication between the container runtime layer and the data store runtime layer.

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

Note that when depending on a library version of the form `2.0.0-internal.x.y.z`, called the Fluid internal version scheme,
you must use a `>= <` dependency range (such as `>=2.0.0-internal.x.y.z <2.0.0-internal.w.0.0` where `w` is `x+1`).
Standard `^` and `~` ranges will not work as expected.
See the [@fluid-tools/version-tools](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/README.md)
package for more information including tools to convert between version schemes.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

-   `IFluidDataStoreRuntimeChannel` includes the minimal set of data and functionalities that are needed by the ContainerRuntime to bind and control a FluidDataStoreRuntime, including attach, snapshot, op/signal processing, request routes, and connection state notifications.
-   `IFluidDataStoreContext` includes data and function provided by the container layer and used by the data store layer for information about the container, to send ops and signals, data store creation, etc.
-   Agent/Task related interfaces, since the agent scheduler is included by default by the container layer, and data stores can make use of it
-   `IFluidDataStoreFactory` and `IFluidDataStoreRegistry` definitions
-   Common protocol structures that are not related to back-compat between the layer: `IAttachMessage`, `IEnvelope`, `ISignalEnvelope`, `IInboundSignalMessage`.
-   `IContainerRuntimeBase` is a temporary interface that includes a reduced set of data and functionalities from `IContainerRuntime` that the IFluidDataStoreRuntimeChannel or data store writer will need from `ContainerRuntime`.Eventually, all of the these should be shim by the `IFluidDataStoreContext`

These interfaces needs to have strong back-compat guaranetee to support dynamic data store loading scenario where the FluidDataStoreRuntime might be built with different version.

<!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand
Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
