# @fluidframework/datastore-definitions

Interface `IFluidDataStoreRuntime` specifies the data store developer API.

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

## Capabilities exposed on `IFluidDataStoreRuntime`

_TODO: The full set of functionality is under review_

-   DDS creation and management APIs
-   Container info and states (connection state, documentId, quorum, audience, etc.)
-   Loader
-   Op/Signal submission
-   Snapshotting
-   DeltaManager
-   Blob Management API.

### Signals

Signals provide a transient data channel for data (any serializable payload)
that doesn't need to be persisted in the op stream.
Use signals where possible to avoid storing unnecessary ops, e.g. to transmit presence status during a collaborative session.

Signals are not persisted, ordered, or guaranteed. If a client is behind, the op state can be behind the signal state.
For this reason people usually stick the currentSeq on the signal, so other clients can wait to process if they are behind.

You can send a signal via the container or data store runtime. The container will emit the signal event on all signals,
but a data store will emit the signal event only on signals emitted on that data store runtime.

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
