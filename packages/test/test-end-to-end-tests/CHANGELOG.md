# @fluid-private/test-end-to-end-tests

## 2.0.0-internal.8.0.0

Dependency updates only.

## 2.0.0-internal.7.4.0

Dependency updates only.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

Dependency updates only.

## 2.0.0-internal.7.0.0

Dependency updates only.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

Dependency updates only.

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

Dependency updates only.

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

### Minor Changes

-   GC interfaces removed from runtime-definitions ([#14750](https://github.com/microsoft/FluidFramework/pull-requests/14750)) [60274eacab](https://github.com/microsoft/FluidFramework/commits/60274eacabf14d42f52f6ad1c2f64356e64ba1a2)

    The following interfaces available in `@fluidframework/runtime-definitions` are internal implementation details and have been deprecated for public use. They will be removed in an upcoming release.

    -   `IGarbageCollectionNodeData`
    -   `IGarbageCollectionState`
    -   `IGarbageCollectionSnapshotData`
    -   `IGarbageCollectionSummaryDetailsLegacy`

-   end-to-end-tests package moved to internal scope ([#14788](https://github.com/microsoft/FluidFramework/pull-requests/14788)) [f3b68b0629](https://github.com/microsoft/FluidFramework/commits/f3b68b06293a7f8769edd83775fb265d0073a75a)

    The `@fluidframework/test-end-to-end-tests` packages has been renamed to @fluid-private/test-end-to-end-tests.

-   Ability to enable grouped batching ([#14512](https://github.com/microsoft/FluidFramework/pull-requests/14512)) [8e4dc47a38](https://github.com/microsoft/FluidFramework/commits/8e4dc47a3871bcaf1f7c1339c362d9c9d08551fc)

    The `IContainerRuntimeOptions.enableGroupedBatching` option has been added to the container runtime layer and is off by default. This option will group all batch messages
    under a new "grouped" message to be sent to the service. Upon receiving this new "grouped" message, the batch messages will be extracted and given
    the sequence number of the parent "grouped" message.

    Upon enabling this option, if any issues arise, use the `Fluid.ContainerRuntime.DisableGroupedBatching` feature flag to disable at runtime. This option should **ONLY** be enabled after observing that 99.9% of your application sessions contains these changes (version "2.0.0-internal.4.1.0" or later). This option is experimental and should not be enabled yet in production. Containers created with this option may not open in future versions of the framework.

    This option will change a couple of expectations around message structure and runtime layer expectations. Only enable this option after testing
    and verifying that the following expectation changes won't have any effects:

    -   batch messages observed at the runtime layer will not match messages seen at the loader layer
    -   messages within the same batch will have the same sequence number
    -   client sequence numbers on batch messages can only be used to order messages with the same sequenceNumber
    -   requires all ops to be processed by runtime layer (version "2.0.0-internal.1.2.0" or later
        https://github.com/microsoft/FluidFramework/pull/11832)

-   Op compression is enabled by default ([#14856](https://github.com/microsoft/FluidFramework/pull-requests/14856)) [439c21f31f](https://github.com/microsoft/FluidFramework/commits/439c21f31f4a3ea6515f01d2b2be7f35c04910ce)

    If the size of a batch is larger than 614kb, the ops will be compressed. After upgrading to this version, if batches exceed the size threshold, the runtime will produce a new type of op with the compression properties. To open a document which contains this type of op, the client's runtime version needs to be at least `client_v2.0.0-internal.2.3.0`. Older clients will close with assert `0x3ce` ("Runtime message of unknown type") and will not be able to open the documents until they upgrade. To minimize the risk, it is recommended to audit existing session and ensure that at least 99.9% of them are using a runtime version equal or greater than `client_v2.0.0-internal.2.3.0`, before upgrading to `2.0.0-internal.4.1.0`.

    More information about op compression can be found
    [here](./packages/runtime/container-runtime/src/opLifecycle/README.md).

-   @fluidframework/garbage-collector deprecated ([#14750](https://github.com/microsoft/FluidFramework/pull-requests/14750)) [60274eacab](https://github.com/microsoft/FluidFramework/commits/60274eacabf14d42f52f6ad1c2f64356e64ba1a2)

    The `@fluidframework/garbage-collector` package is deprecated with the following functions, interfaces, and types in it.
    These are internal implementation details and have been deprecated for public use. They will be removed in an upcoming
    release.

    -   `cloneGCData`
    -   `concatGarbageCollectionData`
    -   `concatGarbageCollectionStates`
    -   `GCDataBuilder`
    -   `getGCDataFromSnapshot`
    -   `IGCResult`
    -   `removeRouteFromAllNodes`
    -   `runGarbageCollection`
    -   `trimLeadingAndTrailingSlashes`
    -   `trimLeadingSlashes`
    -   `trimTrailingSlashes`
    -   `unpackChildNodesGCDetails`
    -   `unpackChildNodesUsedRoutes`
