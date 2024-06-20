# @fluidframework/merge-tree

## 2.0.0-rc.5.0.0

### Minor Changes

-   Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

    Update package implementations to use TypeScript 5.4.5.

## 2.0.0-rc.4.0.0

Dependency updates only.

## 2.0.0-rc.3.0.0

### Major Changes

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

## 2.0.0-rc.2.0.0

Dependency updates only.

## 2.0.0-rc.1.0.0

### Minor Changes

-   Updated server dependencies ([#19122](https://github.com/microsoft/FluidFramework/issues/19122)) [25366b4229](https://github.com/microsoft/FluidFramework/commits/25366b422918cb43685c5f328b50450749592902)

    The following Fluid server dependencies have been updated to the latest version, 3.0.0. [See the full changelog.](https://github.com/microsoft/FluidFramework/releases/tag/server_v3.0.0)

    -   @fluidframework/gitresources
    -   @fluidframework/server-kafka-orderer
    -   @fluidframework/server-lambdas
    -   @fluidframework/server-lambdas-driver
    -   @fluidframework/server-local-server
    -   @fluidframework/server-memory-orderer
    -   @fluidframework/protocol-base
    -   @fluidframework/server-routerlicious
    -   @fluidframework/server-routerlicious-base
    -   @fluidframework/server-services
    -   @fluidframework/server-services-client
    -   @fluidframework/server-services-core
    -   @fluidframework/server-services-ordering-kafkanode
    -   @fluidframework/server-services-ordering-rdkafka
    -   @fluidframework/server-services-ordering-zookeeper
    -   @fluidframework/server-services-shared
    -   @fluidframework/server-services-telemetry
    -   @fluidframework/server-services-utils
    -   @fluidframework/server-test-utils
    -   tinylicious

-   Updated @fluidframework/protocol-definitions ([#19122](https://github.com/microsoft/FluidFramework/issues/19122)) [25366b4229](https://github.com/microsoft/FluidFramework/commits/25366b422918cb43685c5f328b50450749592902)

    The @fluidframework/protocol-definitions dependency has been upgraded to v3.1.0. [See the full
    changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/protocol-definitions/CHANGELOG.md#310)

-   sequence: Remove the findTile API ([#18908](https://github.com/microsoft/FluidFramework/issues/18908)) [29b093e55c](https://github.com/microsoft/FluidFramework/commits/29b093e55cb2a7e98c9445b735783f463acfb3bb)

    The `findTile` API that was previously deprecated is now being removed. The new `searchForMarker` function provides similar functionality, and can be called with the start position, the client ID, the desired marker label to find, and the search direction, where a value of `true` indicates a forward search.

## 2.0.0-internal.8.0.0

### Major Changes

-   sequence: Some function return types are now void instead of any [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The return types of some functions have changed from `any` to `void` because the projects are now being compiled with
    the `noImplicitAny` TypeScript compilation option. This does not represent a logic change and only serves to make the
    typing of these functions more accurate.

-   sequence: Add experimental support for the obliterate operation [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    This change adds experimental support for _obliterate_, a form of _remove_ that deletes concurrently inserted segments.
    To use, enable the `mergeTreeEnableObliterate` feature flag and call the new `obliterateRange` functions.

    Note: this change may cause compilation errors for those attaching event listeners. As long as obliterate isn't used in
    current handlers, their current implementation is sound.

-   sequence: Removed Marker.hasSimpleType and made sequence operations return void [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    `Marker.hasSimpleType` was unused. Sequence operations now no longer return IMergeTree\*Msg types.
    These types are redundant with the input.

-   sequence: Removed several public exports from merge-tree and sequence [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The following APIs have been removed or marked internal in merge-tree and sequence. This functionality was never
    intended for public export.

    -   `BaseSegment.ack`
    -   `Client`
    -   `CollaborationWindow`
    -   `compareNumbers`
    -   `compareStrings`
    -   `createAnnotateMarkerOp`
    -   `createAnnotateRangeOp`
    -   `createGroupOp`
    -   `createInsertOp`
    -   `createInsertSegmentOp`
    -   `createRemoveRangeOp`
    -   `IConsensusInfo`
    -   `IConsensusValue`
    -   `IMarkerModifiedAction`
    -   `IMergeTreeTextHelper`
    -   `LocalClientId`
    -   `MergeTreeDeltaCallback`
    -   `MergeTreeMaintenanceCallback`
    -   `NonCollabClient`
    -   `SegmentAccumulator`
    -   `SegmentGroup`
    -   `SegmentGroupCollection.enqueue`
    -   `SegmentGroupCollection.dequeue`
    -   `SegmentGroupCollection.pop`
    -   `SortedSegmentSet`
    -   `SortedSegmentSetItem`
    -   `SortedSet`
    -   `toRemovalInfo`
    -   `TreeMaintenanceSequenceNumber`
    -   `UniversalSequenceNumber`
    -   `SharedSegmentSequence.submitSequenceMessage`

-   merge-tree: Remove `IIntegerRange` [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    This interface is deprecated and was not intended for public export.

-   sequence: Remove support for combining ops [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    In sequence, removed the following APIs:

    -   the `combiningOp` argument from `SharedSegmentSequence.annotateRange` and `SharedString.annotateMarker`
    -   the function `SharedString.annotateMarkerNotifyConsensus`

    In merge-tree, removed the following APIs:

    -   `ICombiningOp`
    -   the `combiningOp` field from `IMergeTreeAnnotateMsg`
    -   the `op` argument from `BaseSegment.addProperties`, `PropertiesManager.addProperties`, and `ReferencePosition.addProperties`
    -   the enum variant `PropertiesRollback.Rewrite`.

    This functionality was largely unused and had no test coverage.

-   sequence: Removed several APIs [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The following APIs have been removed:

    -   `Client.getStackContext`
    -   `SharedSegmentSequence.getStackContext`
    -   `IntervalType.Nest`
    -   `ReferenceType.NestBegin`
    -   `ReferenceType.NestEnd`
    -   `internedSpaces`
    -   `RangeStackMap`
    -   `refGetRangeLabels`
    -   `refHasRangeLabel`
    -   `refHasRangeLabels`

    This functionality is deprecated, has low test coverage, and is largely unused.

-   merge-tree: Remove several APIs [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    Removed the following APIs:

    -   `Stack`
    -   `clone`
    -   `combine`
    -   `createMap`
    -   `extend`
    -   `extendIfUndefined`
    -   `matchProperties`

    This functionality is deprecated and was not intended for public export.

## 2.0.0-internal.7.4.0

### Minor Changes

-   sequence: Deprecated ICombiningOp, PropertiesRollback.Rewrite, and SharedString.annotateMarkerNotifyConsensus ([#18318](https://github.com/microsoft/FluidFramework/issues/18318)) [e67c2cac5f](https://github.com/microsoft/FluidFramework/commits/e67c2cac5f275fc5c875c0bc044bbb72aaf76648)

    The `ICombiningOp` and its usage in various APIs has been deprecated. APIs affected include
    `SharedSegmentSequence.annotateRange` and `SharedString.annotateMarker`. `SharedString.annotateMarkerNotifyConsensus`
    has also been deprecated, because it is related to combining ops. This functionality had no test coverage and was
    largely unused.

## 2.0.0-internal.7.3.0

### Minor Changes

-   Deprecate BaseSegment.ack, Client, CollaborationWindow, compareNumbers, compareStrings, createAnnotateMarkerOp, createAnnotateRangeOp, createInsertOp, createInsertSegmentOp, createRemoveRangeOp, IConsensusInfo, IConsensusValue, IMarkerModifiedAction, IMergeTreeTextHelper, ISegment.ack, LocalClientId, MergeTreeDeltaCallback, MergeTreeMaintenanceCallback, NonCollabClient, SegmentAccumulator, SegmentGroup, SegmentGroupCollection.dequeue, SegmentGroupCollection.enqueue, SegmentGroupCollection.pop, SortedSegmentSet, SortedSegmentSetItem, SortedSet, toRemovalInfo, TreeMaintenanceSequenceNumber, UnassignedSequenceNumber, UniversalSequenceNumber ([#17952](https://github.com/microsoft/FluidFramework/issues/17952)) [b762798c48](https://github.com/microsoft/FluidFramework/commits/b762798c48ec581202fb5335e907637b8482edcc)

    This functionality was not intended for export and will be removed in a future release.

## 2.0.0-internal.7.2.0

Dependency updates only.

## 2.0.0-internal.7.1.0

### Minor Changes

-   merge-tree: Deprecate Stack, clone, combine, createMap, extend, extendIfUndefined, and matchProperties ([#17650](https://github.com/microsoft/FluidFramework/issues/17650)) [2b12bc7e59](https://github.com/microsoft/FluidFramework/commits/2b12bc7e59f7825a222ad33b7faff17477d0fa66)

    The following classes and functions have been deprecated. They were not intended for public export and will be removed
    in a future release.

    -   Stack
    -   clone
    -   combine
    -   createMap
    -   extend
    -   extendIfUndefined
    -   matchProperties

-   merge-tree: Deprecate IntervalType.Nest, internedSpaces, RangeStackMap, refGetRangeLabels, refHasRangeLabel, and refHasRangeLabels ([#17555](https://github.com/microsoft/FluidFramework/issues/17555)) [e4c11874ef](https://github.com/microsoft/FluidFramework/commits/e4c11874ef7c62b7cde7c282bc7997519d35fbbc)

    The following classes and functions have been deprecated. The functionality has poor test coverage and is largely
    unused. They will be removed in a future release.

    -   IntervalType.Nest
    -   internedSpaces
    -   RangeStackMap
    -   refGetRangeLabels
    -   refHasRangeLabel
    -   refHasRangeLabels

## 2.0.0-internal.7.0.0

### Major Changes

-   sequence: New API for specifying spatial positioning of intervals [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    Previously intervals were specified with only an index. Now the model is a bit more nuanced in that you can specify positions that lie before or after a given index. This makes it more clear how interval endpoints should interact with changes to the sequence. See the docs for SequencePlace for additional context.

-   Dependencies on @fluidframework/protocol-definitions package updated to 3.0.0 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    This included the following changes from the protocol-definitions release:

    -   Updating signal interfaces for some planned improvements. The intention is split the interface between signals
        submitted by clients to the server and the resulting signals sent from the server to clients.
        -   A new optional type member is available on the ISignalMessage interface and a new ISentSignalMessage interface has
            been added, which will be the typing for signals sent from the client to the server. Both extend a new
            ISignalMessageBase interface that contains common members.
    -   The @fluidframework/common-definitions package dependency has been updated to version 1.0.0.

-   Server upgrade: dependencies on Fluid server packages updated to 2.0.1 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    Dependencies on the following Fluid server package have been updated to version 2.0.1:

    -   @fluidframework/gitresources: 2.0.1
    -   @fluidframework/server-kafka-orderer: 2.0.1
    -   @fluidframework/server-lambdas: 2.0.1
    -   @fluidframework/server-lambdas-driver: 2.0.1
    -   @fluidframework/server-local-server: 2.0.1
    -   @fluidframework/server-memory-orderer: 2.0.1
    -   @fluidframework/protocol-base: 2.0.1
    -   @fluidframework/server-routerlicious: 2.0.1
    -   @fluidframework/server-routerlicious-base: 2.0.1
    -   @fluidframework/server-services: 2.0.1
    -   @fluidframework/server-services-client: 2.0.1
    -   @fluidframework/server-services-core: 2.0.1
    -   @fluidframework/server-services-ordering-kafkanode: 2.0.1
    -   @fluidframework/server-services-ordering-rdkafka: 2.0.1
    -   @fluidframework/server-services-ordering-zookeeper: 2.0.1
    -   @fluidframework/server-services-shared: 2.0.1
    -   @fluidframework/server-services-telemetry: 2.0.1
    -   @fluidframework/server-services-utils: 2.0.1
    -   @fluidframework/server-test-utils: 2.0.1
    -   tinylicious: 2.0.1

-   Minimum TypeScript version now 5.1.6 [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The minimum supported TypeScript version for Fluid 2.0 clients is now 5.1.6.

-   sequence: Remove the mergeTreeUseNewLengthCalculations flag [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The `mergeTreeUseNewLengthCalculations` flag has been removed, because the feature was enabled by default in 2.0.0-internal.6.0.0.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0

Dependency updates only.

## 2.0.0-internal.6.2.0

### Minor Changes

-   Deprecate getStackContext and associated NestBegin/End ([#16877](https://github.com/microsoft/FluidFramework/issues/16877)) [8e743fe1dd](https://github.com/microsoft/FluidFramework/commits/8e743fe1dde9adb3a1240971987d3abd51ab2fbe)

    Deprecate SharedSegmentSequence.getStackContext and Client.getStackContext (and the enums ReferenceType.NestBegin and NestEnd they use).
    This functionality is unused, poorly tested, and incurs performance overhead.

-   Remove use of @fluidframework/common-definitions ([#16638](https://github.com/microsoft/FluidFramework/issues/16638)) [a8c81509c9](https://github.com/microsoft/FluidFramework/commits/a8c81509c9bf09cfb2092ebcf7265205f9eb6dbf)

    The **@fluidframework/common-definitions** package is being deprecated, so the following interfaces and types are now
    imported from the **@fluidframework/core-interfaces** package:

    -   interface IDisposable
    -   interface IErrorEvent
    -   interface IErrorEvent
    -   interface IEvent
    -   interface IEventProvider
    -   interface ILoggingError
    -   interface ITaggedTelemetryPropertyType
    -   interface ITelemetryBaseEvent
    -   interface ITelemetryBaseLogger
    -   interface ITelemetryErrorEvent
    -   interface ITelemetryGenericEvent
    -   interface ITelemetryLogger
    -   interface ITelemetryPerformanceEvent
    -   interface ITelemetryProperties
    -   type ExtendEventProvider
    -   type IEventThisPlaceHolder
    -   type IEventTransformer
    -   type ReplaceIEventThisPlaceHolder
    -   type ReplaceIEventThisPlaceHolder
    -   type TelemetryEventCategory
    -   type TelemetryEventPropertyType

-   Deprecation of findTile in favor of searchForMarker, which uses depthFirstNodeWalk to locate the nearest marker. ([#16517](https://github.com/microsoft/FluidFramework/issues/16517)) [e928b1f185](https://github.com/microsoft/FluidFramework/commits/e928b1f185ca32123eff9d4bfc5bce28ba1b95c1)

    findTile has a decent amount of buggy behavior, which leads partners who want to use it to implement workarounds for the odd behavior. searchForMarker is being introduced as a replacement. It performs the same basic functionality of searching for the nearest marker to a given start position in the indicated direction. However, it includes the start position as one of the nodes to search, so markers at the start position will be returned as the nearest marker to that position. Notably, positions 0 and length-1 will be included in the search as well, so searching forwards from position 0 or backwards from position length-1 would allow the entire string to be searched.

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   Client.getSlideToSegment removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Client.getSlideToSegment was deprecated in 2.0.0-internal.5.3.0 and has been removed. Use getSlideToSegoff function instead.

-   Remove ISegment.parent [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    This change removed the parent property on the ISegment interface. The property will still exist, but should not generally be used by outside consumers.

    There are some circumstances where a consumer may wish to know if a segment is still in the underlying tree and were using the parent property to determine that.

    Please change those checks to use the following `"parent" in segment && segment.parent !== undefined`

-   merge-tree now has new length calculations by default [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    The merge-tree now enables new length calculations by default and resolves some related performance bugs by making cached segment length
    nullable.

    Hierarchy cached segment length is `undefined` if the length of all child nodes is `undefined`.

-   Segments Property Removed from TrackingGroup [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Tracking groups can contain more than just segments, so the deprecated segments property has been removed. Use the tracked property instead to see all tracked objects.

-   Remove unnecessary exports [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    This change removes a number of interfaces in the merge tree package that are not used in the exported apis surface and therefore should not be used.

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

## 2.0.0-internal.5.4.0

Dependency updates only.

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

### Minor Changes

-   Deprecate unnecessary exports ([#16097](https://github.com/microsoft/FluidFramework/issues/16097)) [9486bec0ea](https://github.com/microsoft/FluidFramework/commits/9486bec0ea2f9f1dd3e40fc3b4c42af6b6a44697)

    This change deprecates a number of interfaces in the merge tree package that are not used in the exported apis surface and therefore should not be used.

-   Deprecate ISegment.parent ([#16097](https://github.com/microsoft/FluidFramework/issues/16097)) [9486bec0ea](https://github.com/microsoft/FluidFramework/commits/9486bec0ea2f9f1dd3e40fc3b4c42af6b6a44697)

    This change deprecates the parent property on the ISegment interface. The property will still exist, but should not generally be used by outside consumers.

    There are some circumstances where a consumer may wish to know if a segment is still in the underlying tree and were using the parent property to determine that.

    Please change those checks to use the following `"parent" in segment && segment.parent !== undefined`

## 2.0.0-internal.5.1.0

### Minor Changes

-   New APIs for interval querying by range ([#15837](https://github.com/microsoft/FluidFramework/issues/15837)) [2a4242e1b5](https://github.com/microsoft/FluidFramework/commits/2a4242e1b5f15442b13ae413124ec76315a4cc52)

    SharedString now supports querying intervals whose start/end-points fall in a specified range.

## 2.0.0-internal.5.0.0

Dependency updates only.

## 2.0.0-internal.4.4.0

### Minor Changes

-   New feature: Revertibles for SharedString and Interval provide undo-redo functionality. This includes all direct interval edits as well as string edits that indirectly affect intervals, wrapping merge-tree revertibles. ([#15778](https://github.com/microsoft/FluidFramework/pull/15778)) [6433cb2937](https://github.com/microsoft/FluidFramework/commits/6433cb2937d9a6bc39ac93b0eca2c073e6d5be52)

## 2.0.0-internal.4.1.0

Dependency updates only.
