# @fluidframework/sequence

## 2.11.0

Dependency updates only.

## 2.10.0

### Minor Changes

-   Unsupported merge-tree types and related exposed internals have been removed ([#22696](https://github.com/microsoft/FluidFramework/pull/22696)) [7a032533a6](https://github.com/microsoft/FluidFramework/commit/7a032533a6ee6a6f76fe154ef65dfa33f87e5a7b)

    As part of ongoing improvements, several internal types and related APIs have been removed. These types are unnecessary for any supported scenarios and could lead to errors if used. Since directly using these types would likely result in errors, these changes are not likely to impact any Fluid Framework consumers.

    Removed types:

    -   IMergeTreeTextHelper
    -   MergeNode
    -   ObliterateInfo
    -   PropertiesManager
    -   PropertiesRollback
    -   SegmentGroup
    -   SegmentGroupCollection

    In addition to removing the above types, they are no longer exposed through the following interfaces and their implementations: `ISegment`, `ReferencePosition`, and `ISerializableInterval`.

    Removed functions:

    -   addProperties
    -   ack

    Removed properties:

    -   propertyManager
    -   segmentGroups

    The initial deprecations of the now changed or removed types were announced in Fluid Framework v2.2.0:
    [Fluid Framework v2.2.0](https://github.com/microsoft/FluidFramework/blob/main/RELEASE_NOTES/2.2.0.md)

-   SharedString DDS annotateAdjustRange ([#22751](https://github.com/microsoft/FluidFramework/pull/22751)) [d54b9dde14](https://github.com/microsoft/FluidFramework/commit/d54b9dde14e9e0e5eb7999db8ebf6da98fdfb526)

    This update introduces a new feature to the `SharedString` DDS, allowing for the adjustment of properties over a specified range. The `annotateAdjustRange` method enables users to apply adjustments to properties within a given range, providing more flexibility and control over property modifications.

    An adjustment is a modification applied to a property value within a specified range. Adjustments can be used to increment or decrement property values dynamically. They are particularly useful in scenarios where property values need to be updated based on user interactions or other events. For example, in a rich text editor, adjustments can be used for modifying indentation levels or font sizes, where multiple users could apply differing numerical adjustments.

    ### Key Features and Use Cases:

    -   **Adjustments with Constraints**: Adjustments can include optional minimum and maximum constraints to ensure the final value falls within specified bounds. This is particularly useful for maintaining consistent formatting in rich text editors.
    -   **Consistent Property Changes**: The feature ensures that property changes are consistent, managing both local and remote changes effectively. This is essential for collaborative rich text editing where multiple users may be making adjustments simultaneously.
    -   **Rich Text Formatting**: Adjustments can be used to modify text properties such as font size, indentation, or other formatting attributes dynamically based on user actions.

    ### Configuration and Compatibility Requirements:

    This feature is only available when the configuration `Fluid.Sequence.mergeTreeEnableAnnotateAdjust` is set to `true`. Additionally, all collaborating clients must have this feature enabled to use it. If any client does not have this feature enabled, it will lead to the client exiting collaboration. A future major version of Fluid will enable this feature by default.

    ### Usage Example:

    ```typescript
    sharedString.annotateAdjustRange(start, end, {
    	key: { value: 5, min: 0, max: 10 },
    });
    ```

-   MergeTree `Client` Legacy API Removed ([#22697](https://github.com/microsoft/FluidFramework/pull/22697)) [2aa0b5e794](https://github.com/microsoft/FluidFramework/commit/2aa0b5e7941efe52386782595f96ff847c786fc3)

    The `Client` class in the merge-tree package has been removed. Types that directly or indirectly expose the merge-tree `Client` class have also been removed.

    The removed types were not meant to be used directly, and direct usage was not supported:

    -   AttributionPolicy
    -   IClientEvents
    -   IMergeTreeAttributionOptions
    -   SharedSegmentSequence
    -   SharedStringClass

    Some classes that referenced the `Client` class have been transitioned to interfaces. Direct instantiation of these classes was not supported or necessary for any supported scenario, so the change to an interface should not impact usage. This applies to the following types:

    -   SequenceInterval
    -   SequenceEvent
    -   SequenceDeltaEvent
    -   SequenceMaintenanceEvent

    The initial deprecations of the now changed or removed types were announced in Fluid Framework v2.4.0:
    [Several MergeTree Client Legacy APIs are now deprecated](https://github.com/microsoft/FluidFramework/blob/main/RELEASE_NOTES/2.4.0.md#several-mergetree-client-legacy-apis-are-now-deprecated-22629)

## 2.5.0

Dependency updates only.

## 2.4.0

### Minor Changes

-   Several MergeTree `Client` Legacy APIs are now deprecated ([#22629](https://github.com/microsoft/FluidFramework/pull/22629)) [0b59ae89e0](https://github.com/microsoft/FluidFramework/commit/0b59ae89e0aefefad0ccef198adf99929bc4d783)

    To reduce exposure of the `Client` class in the merge-tree package, several types have been deprecated. These types directly or indirectly expose the merge-tree `Client` class.

    Most of these types are not meant to be used directly, and direct use is not supported:

    -   AttributionPolicy
    -   IClientEvents
    -   IMergeTreeAttributionOptions
    -   SharedSegmentSequence
    -   SharedStringClass

    Some of the deprecations are class constructors. In those cases, we plan to replace the class with an interface which has an equivalent API. Direct instantiation of these classes is not currently supported or necessary for any supported scenario, so the change to an interface should not impact usage. This applies to the following types:

    -   SequenceInterval
    -   SequenceEvent
    -   SequenceDeltaEvent
    -   SequenceMaintenanceEvent

## 2.3.0

Dependency updates only.

## 2.2.0

### Minor Changes

-   The PropertyManager class and related functions and properties are deprecated ([#22183](https://github.com/microsoft/FluidFramework/pull/22183)) [cbba69554f](https://github.com/microsoft/FluidFramework/commit/cbba69554fc5026f562f44683a902474fabd6e81)

    The `PropertyManager` class, along with the `propertyManager` properties and `addProperties` functions on segments and intervals, are not intended for external use.
    These elements will be removed in a future release for the following reasons:

    -   There are no scenarios where they need to be used directly.
    -   Using them directly will cause eventual consistency problems.
    -   Upcoming features will require modifications to these mechanisms.

## 2.1.0

Dependency updates only.

## 2.0.0-rc.5.0.0

### Minor Changes

-   Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

    Update package implementations to use TypeScript 5.4.5.

-   sequence: Stop ISharedString extending SharedObject ([#21067](https://github.com/microsoft/FluidFramework/pull/21067)) [47465f4b12](https://github.com/microsoft/FluidFramework/commit/47465f4b12056810112df30a6dad89282afc7a2d)

    ISharedString no longer extends SharedSegmentSequence and instead extends the new ISharedSegmentSequence, which may be missing some APIs.

    Attempt to migrate off the missing APIs, but if that is not practical, request they be added to ISharedSegmentSequence and cast to SharedSegmentSequence as a workaround temporally.

## 2.0.0-rc.4.0.0

### Minor Changes

-   SharedString now uses ISharedObjectKind and does not export the factory [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Most users of `SharedString` should be unaffected as long as they stick to the factory patterns supported by ISharedObjectKind.
    If the actual class type is needed it can be found as `SharedStringClass`.

-   Deprecated members of IFluidHandle are split off into new IFluidHandleInternal interface [96872186d0](https://github.com/microsoft/FluidFramework/commit/96872186d0d0f245c1fece7d19b3743e501679b6)

    Split IFluidHandle into two interfaces, `IFluidHandle` and `IFluidHandleInternal`.
    Code depending on the previously deprecated members of IFluidHandle can access them by using `toFluidHandleInternal` from `@fluidframework/runtime-utils/legacy`.

    External implementation of the `IFluidHandle` interface are not supported: this change makes the typing better convey this using the `ErasedType` pattern.
    Any existing and previously working, and now broken, external implementations of `IFluidHandle` should still work at runtime, but will need some unsafe type casts to compile.
    Such handle implementation may break in the future and thus should be replaced with use of handles produced by the Fluid Framework client packages.

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

### Minor Changes

-   container-definitions: ILoaderOptions no longer accepts arbitrary key/value pairs ([#19306](https://github.com/microsoft/FluidFramework/issues/19306)) [741926e225](https://github.com/microsoft/FluidFramework/commits/741926e2253a161504ecc6a6451d8f15d7ac4ed6)

    ILoaderOptions has been narrowed to the specific set of supported loader options, and may no longer be used to pass arbitrary key/value pairs through to the runtime.

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

-   sequence: Remove the signature of IntervalCollection.add that takes a type parameter ([#18916](https://github.com/microsoft/FluidFramework/issues/18916)) [e5b463cc8b](https://github.com/microsoft/FluidFramework/commits/e5b463cc8b24a411581c3e48f62ce1eea68dd639)

    The previously deprecated signature of `IntervalCollection.add` that takes an `IntervalType` as a parameter is now being
    removed. The new signature is called without the type parameter and takes the `start`, `end`, and `properties`
    parameters as a single object.

-   Updated @fluidframework/protocol-definitions ([#19122](https://github.com/microsoft/FluidFramework/issues/19122)) [25366b4229](https://github.com/microsoft/FluidFramework/commits/25366b422918cb43685c5f328b50450749592902)

    The @fluidframework/protocol-definitions dependency has been upgraded to v3.1.0. [See the full
    changelog.](https://github.com/microsoft/FluidFramework/blob/main/common/lib/protocol-definitions/CHANGELOG.md#310)

-   sequence: Remove the findTile API ([#18908](https://github.com/microsoft/FluidFramework/issues/18908)) [29b093e55c](https://github.com/microsoft/FluidFramework/commits/29b093e55cb2a7e98c9445b735783f463acfb3bb)

    The `findTile` API that was previously deprecated is now being removed. The new `searchForMarker` function provides similar functionality, and can be called with the start position, the client ID, the desired marker label to find, and the search direction, where a value of `true` indicates a forward search.

-   sequence: Unify the change and changeProperties methods ([#18981](https://github.com/microsoft/FluidFramework/issues/18981)) [31ce11010a](https://github.com/microsoft/FluidFramework/commits/31ce11010a9bd2be95e805544d84df9e21b6c9a7)

    Instead of having two separate APIs to modify an interval's endpoints and properties, combine both into the same method, IntervalCollection.change. Change is called with a string id value as the first parameter, and an object containing the start value, the end value, and/or the properties, depending on the desired modifications to the interval. Start and end must both be either defined or undefined.

    The old functionality and signatures were deprecated in the internal.7.4.0 minor release.

-   shared-object-base: SharedObject processGCDataCore now takes IFluidSerializer rather than SummarySerializer ([#18803](https://github.com/microsoft/FluidFramework/issues/18803)) [396b8e9738](https://github.com/microsoft/FluidFramework/commits/396b8e9738156ff88b62424a0076f09fb5028a32)

    This change should be a no-op for consumers, and `SummarySerializer` and `IFluidSerializer` expose the same consumer facing APIs. This change just makes our APIs more consistent by only using interfaces, rather than a mix of interfaces and concrete implementations.

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

-   datastore-definitions: Jsonable and Serializable now require a generic parameter [9a451d4946](https://github.com/microsoft/FluidFramework/commits/9a451d4946b5c51a52e4d1ab5bf51e7b285b0d74)

    The `Jsonable` and `Serializable` types from @fluidframework/datastore-definitions now require a generic parameter and
    if that type is `any` or `unknown`will return a new result `JsonableTypeWith<>` that more accurately represents the
    limitation of serialization.

    Additional modifications:

    -   `Jsonable`'s `TReplacement` parameter default has also been changed from `void` to `never`, which now disallows
        `void`.
    -   Unrecognized primitive types like `symbol` are now filtered to `never` instead of `{}`.
    -   Recursive types with arrays (`[]`) are now supported.

    `Serializable` is commonly used for DDS values and now requires more precision when using them. For example SharedMatrix
    (unqualified) has an `any` default that meant values were `Serializable<any>` (i.e. `any`), but now `Serializable<any>`
    is `JsonableTypeWith<IFluidHandle>` which may be problematic for reading or writing. Preferred correction is to specify
    the value type but casting through `any` may provide a quick fix.

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

## 2.0.0-internal.7.4.0

### Minor Changes

-   sequence: `change` and `changeProperties` are now a single method ([#18676](https://github.com/microsoft/FluidFramework/issues/18676)) [12c83d2696](https://github.com/microsoft/FluidFramework/commits/12c83d26962a1d76db6eb0ccad31fd6a7976a1af)

    Instead of having two separate methods to change the endpoints of an interval and the properties, they have been combined into a
    single method that will change the endpoints, properties, or both, depending on the arguments passed in. The signature
    of this combined method is now updated as well.

    The new way to use the change method is to call it with an interval id as the first parameter and an object containing
    the desired portions of the interval to update as the second parameter. For the object parameter, the `endpoints` field
    should be an object containing the new `start` and `end` values for the interval, and the `properties` field should be
    an object containing the new properties for the interval. Either the `endpoints` field or the `properties` field can be
    omitted, and if neither are present, `change` will return `undefined`.

    The new usage of the change method is as follows:

    Change interval endpoints: `change(id, { endpoints: { start: 1, end: 4 } });`

    Change interval properties: `change(id { props: { a: 1 } });`

    Change interval endpoints and properties: `change(id, { endpoints: { start: 1, end: 4 }, props: { a: 1 } });`

-   sequence: Deprecated findOverlappingIntervals API ([#18036](https://github.com/microsoft/FluidFramework/issues/18036)) [52b864ea42](https://github.com/microsoft/FluidFramework/commits/52b864ea42759403771f2cbcb282b0ba19ce42f6)

    The `findOverlappingIntervals` API from `IntervalCollection` has been deprecated. This functionality is moved to the
    `OverlappingIntervalsIndex`. Users should independently attach the index to the collection and utilize the API
    accordingly, for instance:

    ```typescript
    const overlappingIntervalsIndex = createOverlappingIntervalsIndex(sharedString);
    collection.attachIndex(overlappingIntervalsIndex);
    const result = overlappingIntervalsIndex.findOverlappingIntervals(start, end);
    ```

-   sequence: Deprecated previousInterval and nextInterval APIs ([#18060](https://github.com/microsoft/FluidFramework/issues/18060)) [05fb45d26f](https://github.com/microsoft/FluidFramework/commits/05fb45d26f3065297e219a4bce5763e25bdcffc9)

    The `previousInterval` and `nextInterval` APIs from `IntervalCollection` have been deprecated. These functions are moved
    to the `EndpointIndex`. Users should independently attach the index to the collection and utilize the API accordingly,
    for instance:

    ```typescript
    const endpointIndex = createEndpointIndex(sharedString);
    collection.attachIndex(endpointIndex);

    const result1 = endpointIndex.previousInterval(pos);
    const result2 = endpointIndex.nextInterval(pos);
    ```

-   sequence: Deprecated ICombiningOp, PropertiesRollback.Rewrite, and SharedString.annotateMarkerNotifyConsensus ([#18318](https://github.com/microsoft/FluidFramework/issues/18318)) [e67c2cac5f](https://github.com/microsoft/FluidFramework/commits/e67c2cac5f275fc5c875c0bc044bbb72aaf76648)

    The `ICombiningOp` and its usage in various APIs has been deprecated. APIs affected include
    `SharedSegmentSequence.annotateRange` and `SharedString.annotateMarker`. `SharedString.annotateMarkerNotifyConsensus`
    has also been deprecated, because it is related to combining ops. This functionality had no test coverage and was
    largely unused.

## 2.0.0-internal.7.3.0

Dependency updates only.

## 2.0.0-internal.7.2.0

### Minor Changes

-   sequence: SharedString.findTile is now deprecated ([#17832](https://github.com/microsoft/FluidFramework/issues/17832)) [428234a2fb](https://github.com/microsoft/FluidFramework/commits/428234a2fb8c7a7c0bcdc9370a6632cd007c8a07)

    findTile was previously deprecated on client and mergeTree, but was not on SharedString. Usage is mostly the same, with the exception that the parameter 'startPos' must be a number and cannot be undefined.

## 2.0.0-internal.7.1.0

### Minor Changes

-   sequence: IntervalCollection.add's intervalType is now deprecated ([#17165](https://github.com/microsoft/FluidFramework/issues/17165)) [a8ea26c9d6](https://github.com/microsoft/FluidFramework/commits/a8ea26c9d61e4938f10c87a8757734f8772fbce6)

    The `intervalType` parameter is being removed from `IntervalCollection.add`. The new usage requires calling add with an object containing each of the desired parameters.
    Example: `add({start: 0, end: 1, props: { a: b }})`

    The signature of `IntervalCollection.change` is also being updated to an object containing the desired parameters,
    instead of the existing list of parameters. In addition, `changeProperties` will be removed, so in order to change the
    properties of an interval, the `change` method (with the updated signature) will be used. The id of the interval is not
    included in the object passed to `change`, but is instead passed as the first parameter to `change`.

    Examples:

    -   Change interval endpoints: `change(intervalId, { start: 3, end: 4 })`
    -   Change interval properties: `change(intervalId, { props: { a: c } })`

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

-   sequence: IIntervalCollection.change must specify both endpoints [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    IIntervalCollection.change no longer allows an endpoint to be undefined. undefined can unintentionally result in end < start. To adapt to this change, simply use the current position of the endpoint that is not intended to change.

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

-   sequence: Remove `compareStarts` and `compareEnds` from `IIntervalHelpers` [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    These methods are redudant with the functions `IInterval.compareStart` and `IInterval.compareEnd` respectively.

-   sequence: Remove the mergeTreeUseNewLengthCalculations flag [871b3493dd](https://github.com/microsoft/FluidFramework/commits/871b3493dd0d7ea3a89be64998ceb6cb9021a04e)

    The `mergeTreeUseNewLengthCalculations` flag has been removed, because the feature was enabled by default in 2.0.0-internal.6.0.0.

## 2.0.0-internal.6.4.0

Dependency updates only.

## 2.0.0-internal.6.3.0

### Minor Changes

-   deprecate compareStarts and compareEnds on IIntervalHelpers ([#17127](https://github.com/microsoft/FluidFramework/issues/17127)) [a830eca757](https://github.com/microsoft/FluidFramework/commits/a830eca7571cfb230abe5b9443ba5c5fc44671e0)

    these functions will be removed in a future version. use the methods IInterval.compareStart and IInterval.compareEnd respectively instead

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

-   Deprecate SharedSequence, SubSequence, and IJSONRunSegment ([#16829](https://github.com/microsoft/FluidFramework/issues/16829)) [0cf2b6d909](https://github.com/microsoft/FluidFramework/commits/0cf2b6d9098c7ef4234b66c5d7d169192db40d15)

    The types SharedSequence, SubSequence, and IJSONRunSegment are being deprecated and moved.

    They are now, and will continue to be exposed from the @fluid-experimental/sequence-deprecated package.

    New usages of these types should not be added, but they may be necessary for migration.

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
