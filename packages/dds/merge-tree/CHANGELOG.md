# @fluidframework/merge-tree

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
