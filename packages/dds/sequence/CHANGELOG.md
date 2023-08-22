# @fluidframework/sequence

## 2.0.0-internal.6.1.0

Dependency updates only.

## 2.0.0-internal.6.0.0

### Major Changes

-   IntervalConflictResolver removed [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    IntervalConflictResolver has been removed. Any lingering usages in application code can be removed as well. This change also marks APIs deprecated in #14318 as internal.

-   Remove ISegment.parent [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    This change removed the parent property on the ISegment interface. The property will still exist, but should not generally be used by outside consumers.

    There are some circumstances where a consumer may wish to know if a segment is still in the underlying tree and were using the parent property to determine that.

    Please change those checks to use the following `"parent" in segment && segment.parent !== undefined`

-   Upgraded typescript transpilation target to ES2020 [8abce8cdb4](https://github.com/microsoft/FluidFramework/commits/8abce8cdb4e2832fb6405fb44e393bef03d5648a)

    Upgraded typescript transpilation target to ES2020. This is done in order to decrease the bundle sizes of Fluid Framework packages. This has provided size improvements across the board for ex. Loader, Driver, Runtime etc. Reduced bundle sizes helps to load lesser code in apps and hence also helps to improve the perf.If any app wants to target any older versions of browsers with which this target version is not compatible, then they can use packages like babel to transpile to a older target.

## 2.0.0-internal.5.4.0

### Minor Changes

-   Some interval-related APIs are deprecated ([#16573](https://github.com/microsoft/FluidFramework/issues/16573)) [82de148126](https://github.com/microsoft/FluidFramework/commits/82de14812617e4d305bdb621737a0d94a5392d25)

    The following APIs are now deprecated from `IntervalCollection`:

    -   `findOverlappingIntervals` and `gatherIterationResults` - these functions are moved to
        the `OverlappingIntervalsIndex`. Users are advised to independently attach the index to the collection and utilize the
        API accordingly, for instance:

        ```typescript
        const overlappingIntervalsIndex = createOverlappingIntervalsIndex(client, helpers);
        collection.attachIndex(overlappingIntervalsIndex);
        const result1 = overlappingIntervalsIndex.findOverlappingIntervals(start, end);

        const result2 = [];
        overlappingIntervalsIndex.gatherIterationResults(result2, true);
        ```

    -   `CreateBackwardIteratorWithEndPosition`, `CreateBackwardIteratorWithStartPosition`,
        `CreateForwardIteratorWithEndPosition` and `CreateForwardIteratorWithStartPosition` - only the default iterator will be
        supported in the future, and it will no longer preserve sequence order.

        Equivalent functionality to these four methods is provided by `IOverlappingIntervalIndex.gatherIterationResults`.

    -   `previousInterval` and `nextInterval` - These functionalities are moved to the `EndpointIndex`. Users are advised to
        independently attach the index to the collection and utilize the API accordingly, for instance:

        ```typescript
        const endpointIndex = createEndpointIndex(client, helpers);
        collection.attachIndex(endpointIndex);

        const result1 = endpointIndex.previousInterval(pos);
        const result2 = endpointIndex.nextInterval(pos);
        ```

## 2.0.0-internal.5.3.0

Dependency updates only.

## 2.0.0-internal.5.2.0

### Minor Changes

-   Deprecate ISegment.parent ([#16097](https://github.com/microsoft/FluidFramework/issues/16097)) [9486bec0ea](https://github.com/microsoft/FluidFramework/commits/9486bec0ea2f9f1dd3e40fc3b4c42af6b6a44697)

    This change deprecates the parent property on the ISegment interface. The property will still exist, but should not generally be used by outside consumers.

    There are some circumstances where a consumer may wish to know if a segment is still in the underlying tree and were using the parent property to determine that.

    Please change those checks to use the following `"parent" in segment && segment.parent !== undefined`

-   slide parameter in changeInterval event ([#16117](https://github.com/microsoft/FluidFramework/issues/16117)) [46f74fe568](https://github.com/microsoft/FluidFramework/commits/46f74fe5684e44df436ed28ea41c98ca146b03cc)

    The changeInterval event listener has a new parameter "slide" that is true if the event was caused by the interval endpoint sliding from a removed range.

## 2.0.0-internal.5.1.0

### Minor Changes

-   New APIs for interval querying by range ([#15837](https://github.com/microsoft/FluidFramework/issues/15837)) [2a4242e1b5](https://github.com/microsoft/FluidFramework/commits/2a4242e1b5f15442b13ae413124ec76315a4cc52)

    SharedString now supports querying intervals whose start/end-points fall in a specified range.

## 2.0.0-internal.5.0.0

### Major Changes

-   The following types have been removed: `IntervalCollection`, `CompressedSerializedInterval`, [8b242fdc79](https://github.com/microsoft/FluidFramework/commits/8b242fdc796714cf1da9ad3f90d02efb122af0c2)
    `IntervalCollectionIterator`, and `ISerializedIntervalCollectionV2`. These types were deprecated in version
    2.0.0-internal.4.4.0.

## 2.0.0-internal.4.4.0

### Minor Changes

-   `IntervalCollection` has been deprecated in favor of an interface (`IIntervalCollection`) containing its public API. ([#15774](https://github.com/microsoft/FluidFramework/pull/15774)) [8c6e76ab75](https://github.com/microsoft/FluidFramework/commits/8c6e76ab753d4ec0cc43bdd6ed04db905391ef2e)
    Several types transitively referenced by `IntervalCollection` implementation details have also been deprecated:
    `CompressedSerializedInterval`, `IntervalCollectionIterator`, and `ISerializedIntervalCollectionV2`.
-   New feature: Revertibles for SharedString and Interval provide undo-redo functionality. This includes all direct interval edits as well as string edits that indirectly affect intervals, wrapping merge-tree revertibles. ([#15778](https://github.com/microsoft/FluidFramework/pull/15778)) [6433cb2937](https://github.com/microsoft/FluidFramework/commits/6433cb2937d9a6bc39ac93b0eca2c073e6d5be52)
-   Experimental feature: An initial implementation of "interval stickiness". This experimental feature can only be used by ([#15423](https://github.com/microsoft/FluidFramework/pull/15423)) [8ba75c508f](https://github.com/microsoft/FluidFramework/commits/8ba75c508ff2370f3de0c9f63390f90a12d9bca2)
    enabling the feature flag "intervalStickinessEnabled".
-   New feature: `IntervalCollection`s now have an `attachIndex` and `detachIndex` API for interval querying. ([#15683](https://github.com/microsoft/FluidFramework/pull/15683)) [f5db26a122](https://github.com/microsoft/FluidFramework/commits/f5db26a122735cf12dc0477b37d9297f7f3ae602)

## 2.0.0-internal.4.1.0

### Minor Changes

-   IntervalConflictResolver deprecation ([#15089](https://github.com/microsoft/FluidFramework/pull-requests/15089)) [38345841a7](https://github.com/microsoft/FluidFramework/commits/38345841a75d68e94748823c3da5078a2fc57449)

    In `SharedString`, interval conflict resolvers have been unused since [this
    change](https://github.com/microsoft/FluidFramework/pull/6407), which added support for multiple intervals at the same
    position. As such, any existing usages can be removed. Related APIs have been deprecated and will be removed in an
    upcoming release.
