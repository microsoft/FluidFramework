# @fluidframework/sequence

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
