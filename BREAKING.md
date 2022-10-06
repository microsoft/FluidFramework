# Adding breaking and upcoming change notes

Notes on breaking, upcoming, and otherwise interesting changes go here. They will be reviewed and published along with each release.  Published changelogs may be found on the docs site at fluidframework.com.

For instructions on how to communicate breaking changes please see our docs [here](https://github.com/microsoft/FluidFramework/wiki/Communicating-breaking-changes).

## Writing a change note

It's important to communicate breaking changes to our stakeholders. To write a good change note, use the below guidelines. For more information, check our [wiki](https://github.com/microsoft/FluidFramework/wiki/Communicating-breaking-changes).

- Provide a concise title. It should be clear what the topic of the change is.
- Ensure the affected packages are named or clearly identifiable within the body.
- Provide guidance on how the change should be consumed if applicable, such as by specifying replacement APIs.
- Consider providing code examples as part of guidance for non-trivial changes.
- Avoid using code formatting in the title (it's fine to use in the body).
- To explain the benefit of your change, use the [What's New](https://fluidframework.com/docs/updates/v1.0.0/) section on FluidFramework.com.

# 2.0.0-internal.2.0.0

## 2.0.0-internal.2.0.0 Upcoming changes
- [Signature from ISummarizerInternalsProvider.refreshLatestSummaryAck interface has changed](#Change-ISummarizerInternalsProvider.refreshLatestSummaryAck-interface)
- [Move TelemetryNullLogger and BaseTelemetryNullLogger to telemetry-utils package](#Move-`TelemetryNullLogger`-and-`BaseTelemetryNullLogger`-to-telemetry-utils-package)
- [Minor event naming correction on IFluidContainerEvents](#IFluidContainerEvents-event-naming-correction)
- [IDocumentStorageServicePolicies.maximumCacheDurationMs policy must be exactly 5 days if defined](#idocumentstorageservicepoliciesmaximumcachedurationms-policy-must-be-exactly-5-days-if-defined)

### Signature from ISummarizerInternalsProvider.refreshLatestSummaryAck interface has changed
`ISummarizerInternalsProvider.refreshLatestSummaryAck` interface has been updated to now accept `IRefreshSummaryAckOptions` property instead.
```diff
    async refreshLatestSummaryAck(
-       proposalHandle: string | undefined,
-       ackHandle: string,
-       summaryRefSeq: number,
-       summaryLogger: ITelemetryLogger,
+       options: IRefreshSummaryAckOptions,
    ):
```

### Move TelemetryNullLogger and BaseTelemetryNullLogger to telemetry-utils package
The utility classes `TelemetryNullLogger` and `BaseTelemetryNullLogger` are deprecated in the `@fluidframework/common-utils` package and have been moved to the `@fluidframework/telemetry-utils` package.  Please update your imports to take these from the new location.

### IFluidContainerEvents event naming correction
Renamed **dispose** to **disposed** to better communicate the state and align with currently emitted event.
It's not a breaking change, but worth noting: we are now also exposing optional error (ICriticalContainerError) field with **disposed** event.

### IDocumentStorageServicePolicies.maximumCacheDurationMs policy must be exactly 5 days if defined
Due to the dependency the Garbage Collection feature in the Runtime layer has on this policy, it must remain constant over time.
So this has been codified in the type, switching from `number | undefined` to `FiveDaysMs | undefined` (with `type FiveDaysMs = 432000000`)

## 2.0.0-internal.2.0.0 Breaking changes
- [Update to React 17](#Update-to-React-17)
- [IntervalCollection event semantics changed](#IntervalCollection-event-semantics-changed)
- [Remove IFluidDataStoreChannel.bindToContext and related types](#remove-ifluiddatastorechannelbindtocontext-and-related-types)
- [MergeTree class no longer exported](#MergeTree-class-no-longer-exported)
- [Marker.toString simplified](#markertostring-simplified)
- [Remove IContainerRuntimeBase.setFlushMode](#remove-icontainerruntimebasesetflushmode)
- [getTextAndMarkers changed to be a free function](#gettextandmarkers-changed-to-be-a-free-function)
- [waitIntervalCollection removed](#waitintervalcollection-removed)
- [OldestClientObserver moved to @fluid-experimental/oldest-client-observer](#oldestclientobserver-moved-to-@fluid-experimental/oldest-client-observer)
- [Remove deprecated data structures from @fluidframework/sequence](#remove-deprecated-data-structures-from-fluidframeworksequence)
- [Renamed lockTask to volunteerForTask from @fluid-experimental/task-manager](renamed-lockTask-to-volunteerForTask-from-@fluid-experimental/task-manager)
- [Renamed haveTaskLock to assigned from @fluid-experimental/task-manager](renamed-haveTaskLock-to-assigned-from-@fluid-experimental/task-manager)/
- [Remove ISummaryConfigurationHeuristics.idleTime](#Remove-ISummaryConfigurationHeuristicsidleTime)
- [Remove IContainerRuntime.flush](#remove-icontainerruntimeflush)
- [Remove ScheduleManager` and `DeltaScheduler](#remove-schedulemanager-and-deltascheduler)

### Update to React 17
The following packages use React and thus were impacted:
- @fluidframework/view-adapters
- @fluid-tools/webpack-fluid-loader
- @fluid-experimental/react-inputs
- @fluid-experimental/property-inspector-table

Users of these packages may need to update to React 17, and/or take other action to ensure compatibility.

### IntervalCollection event semantics changed

The semantics of events emitted by IntervalCollection were changed to be more consistent:

- propertyChanged events receive the same "isLocal" and op information that other events received
- changeInterval events will no longer take place for changes that impact an interval's properties only. Clients that need to perform work on such changes should listen to "propertyChanged" events instead.
- For local changes, changeInterval events will only be emitted on initial application of the change (as opposed to the
  previous behavior, which fired an event on the local application of a change as well as on server ack of that change))
- changeInterval events now receive information about the interval's previous position.
- addInterval and deleteInterval event handler now properly reflects that the `op` argument can be undefined. This was true
  before, but not reflected in the type system.

More details can be found on `IIntervalCollectionEvent`'s doc comment.

### Remove IFluidDataStoreChannel.bindToContext and related types
`bindToContext` has been removed from `IFluidDataStoreChannel`, along with enum `BindState` and the interface `IDataStoreWithBindToContext_Deprecated`.
See previous ["Upcoming" change notice](#bindToContext-to-be-removed-from-IFluidDataStoreChannel) for info on how this removal was staged.

### MergeTree class no longer exported
The MergeTree class was deprecated and is no longer be exported. This should not affect usage as MergeTree is an internal class, and the public API exists on the Client class, which will continue to be exported and supported.

### Marker.toString simplified

In merge-tree, Marker's string representation returned by `toString` was simplified.
This new representation is used in the return value of `SharedString.getTextRangeWithMarkers`.
The previous logic was moved to the public export `debugMarkerToString`.

### Remove IContainerRuntimeBase.setFlushMode
The `setFlushMode` has been removed from `IContainerRuntimeBase`. FlushMode is now an immutable property for the container runtime, optionally provided at creation time via the `IContainerRuntimeOptions` interface. Instead, batching when in `FlushMode.Immediate` should be done through usage of the `IContainerRuntimeBase.orderSequentially`. See [#9480](https://github.com/microsoft/FluidFramework/issues/9480#issuecomment-1084790977).

### getTextAndMarkers changed to be a free function

`SharedString.getTextAndMarkers` involves a sizeable amount of model-specific logic.
To improve bundle size, it will be converted to a free function so that this logic is tree-shakeable.
The corresponding method on `IMergeTreeTexHelper` will also be removed.

### waitIntervalCollection removed

`SharedSegmentSequence.waitIntervalCollection` has been removed.
Use `getIntervalCollection` instead, which has the same semantics but is synchronous.

### OldestClientObserver moved to @fluid-experimental/oldest-client-observer
The `OldestClientObserver` class and its associated interfaces have been removed from @fluid-experimental/task-manager and moved to the new package @fluid-experimental/oldest-client-observer. Please migrate all imports to @fluid-experimental/oldest-client-observer.

### Remove deprecated data structures from @fluidframework/sequence
`SharedNumberSequence`, `SharedObjectSequence`, and `SharedMatrix` have been removed from `@fluidframework/sequence`. They are currently still available in `@fluid-experimental/sequence-deprecated.

### Renamed lockTask to volunteerForTask from @fluid-experimental/task-manager
`TaskManager.lockTask()` has been renamed `volunteerForTask()` and now returns a `Promise<boolean>` instead of a `Promise<void>`. Please update all usages accordingly.

### Renamed haveTaskLock to assigned from @fluid-experimental/task-manager
`TaskManager.haveTaskLock()` has been renamed `assigned()`. Please update all usages accordingly.

### Remove ISummaryConfigurationHeuristics.idleTime
`ISummaryConfigurationHeuristics.idleTime` has been removed. See [#10008](https://github.com/microsoft/FluidFramework/issues/10008)
Please move all usage to the new `minIdleTime` and `maxIdleTime` properties in `ISummaryConfigurationHeuristics`.

### Remove IContainerRuntime.flush
`IContainerRuntime.flush` has been removed. If a more manual/ensured flushing process is needed, move all usage to `IContainerRuntimeBase.orderSequentially` if possible.

### Remove ScheduleManager and DeltaScheduler
`ScheduleManager` and `DeltaScheduler` have been removed from the `@fluidframework/container-runtime` package as they are Fluid internal classes which should not be used.

# 2.0.0-internal.1.3.0

## 2.0.0-internal.1.3.0 Upcoming changes
- [Add fluidInvalidSchema errorType to DriverErrorType enum](#Add-fluidInvalidSchema-errorType-to-DriverErrorType-enum)
- [iframe-driver removed](#iframe-driver-removed)

### Add fluidInvalidSchema errorType to DriverErrorType enum
Added fluidInvalidSchema errorType in DriverErrorType enum. This error happens when non-fluid file
was mistook as a Fluid file, and is unable to be opened. The innerMostErrorCode will also be "fluidInvalidSchema".
This is not breaking change yet. But if clients do not add handling for this error, their existing version of applications may start receiving this error in the future, and may not handle it correctly.

### iframe-driver removed
The iframe-driver is now deprecated and should not be used, it will be removed in an upcoming release.

# 2.0.0-internal.1.1.0

## 2.0.0-internal.1.1.0 Upcoming changes
- [Add assertion that prevents sending op while processing another op](#add-assertion-that-prevents-sending-op-while-processing-another-op)
- [Remove type field from ShareLinkInfoType](#Remove-type-field-from-ShareLinkInfoType)
- [Remove ShareLinkTypes interface](#Remove-ShareLinkTypes-interface)
- [Remove enableShareLinkWithCreate from HostStoragePolicy](#Remove-enableShareLinkWithCreate-from-HostStoragePolicy)
- [Various return types in @fluidframework/sequence have been widened to include undefined](#various-return-types-in-fluidframeworksequence-have-been-widened-to-include-undefined)


### Add assertion that prevents sending op while processing another op
`preventConcurrentOpSend` has been added and enabled by default. This will run an assertion that closes the container if attempting to send an op while processing another op. This is meant to prevent non-deterministic outcomes due to concurrent op processing.

### Remove type field from ShareLinkInfoType
This field has been deprecated and will be removed in a future breaking change. You should be able to get the kind of sharing link from `shareLinkInfo.createLink.link` property bag.

### Remove ShareLinkTypes interface
`ShareLinkTypes` interface has been deprecated and will be removed in a future breaking change. Singnature of `createOdspCreateContainerRequest` has been updated to now accept `ISharingLinkKind` property instead.
```diff
    function createOdspCreateContainerRequest(
        siteUrl: string,
        driveId: string,
        filePath: string,
        fileName: string,
-       createShareLinkType?: ShareLinkTypes,
+       createShareLinkType?: ShareLinkTypes | ISharingLinkKind,
    ):
```
### Remove enableShareLinkWithCreate from HostStoragePolicy
`enableShareLinkWithCreate` feature gate has been deprecated and will be removed in a future breaking change. If you wish to enable creation of a sharing link along with the creation of Fluid file, you will need to provide `createShareLinkType:ISharingLinkKind` input to the `createOdspCreateContainerRequest` function and enable the feature using `enableSingleRequestForShareLinkWithCreate` in `HostStoragePolicy`

# 2.0.0-internal.1.0.0

## 2.0.0-internal.1.0.0 Upcoming changes
- [Deprecate ISummaryConfigurationHeuristics.idleTime](#Deprecate-ISummaryConfigurationHeuristicsidleTime)
- [Deprecate ISummaryRuntimeOptions.disableIsolatedChannels](#Deprecate-ISummaryRuntimeOptionsdisableIsolatedChannels)
- [IContainerRuntime.flush is deprecated](#icontainerruntimeflush-is-deprecated)
- [MergeTree class is deprecated](#MergeTree-class-is-deprecated)
- [Remove documentId field from `MockFluidDataStoreContext`](#Remove-documentId-field-from-MockFluidDataStoreContext)
- [Remove ConnectionState.Connecting](#Remove-ConnectionState.Connecting)
- [getTextAndMarkers changed to be a free function](#gettextandmarkers-changed-to-be-a-free-function)

### Deprecate ISummaryConfigurationHeuristics.idleTime
`ISummaryConfigurationHeuristics.idleTime` has been deprecated and will be removed in a future release. See [#10008](https://github.com/microsoft/FluidFramework/issues/10008)
Please migrate all usage to the new `minIdleTime` and `maxIdleTime` properties in `ISummaryConfigurationHeuristics`.

### Deprecate-ISummaryRuntimeOptionsdisableIsolatedChannels
`ISummaryRuntimeOptions.disableIsolatedChannels` has been deprecated and will be removed in a future release.
There will be no replacement for this property.

### IContainerRuntime.flush is deprecated
`IContainerRuntime.flush` is deprecated and will be removed in a future release. If a more manual flushing process is needed, move all usage to `IContainerRuntimeBase.orderSequentially` if possible.

### MergeTree class is deprecated
The MergeTree class is deprecated and will no longer be exported in the next release. This should not affect usage as MergeTree is an internal class, and the public API exists on the Client class, which will continue to be exported and supported.

### Remove documentId field from MockFluidDataStoreContext
This field has been deprecated and will be removed in a future breaking change.

### Remove ConnectionState.Connecting
`ConnectionState.Connecting` will be removed. Migrate all usage to `ConnectionState.CatchingUp`.

### getTextAndMarkers changed to be a free function

`SharedString.getTextAndMarkers` involves a sizeable amount of model-specific logic.
To improve bundle size, it will be converted to a free function so that this logic is tree-shakeable.
The corresponding method on `IMergeTreeTexHelper` will also be removed.

### Various return types in @fluidframework/sequence have been widened to include undefined

Strict null checks have been enabled in `@fluidframework/sequence`. As part of this, the return types of several functions have been modified to include `| undefined`. This does not represent a behavioral change.

The functions affected are:
 - `Interval.getAdditionalPropertySets`
 - `Interval.modify`
 - `IntervalCollection.getIntervalById`
 - `IntervalCollection.nextInterval`
 - `IntervalCollection.previousInterval`
 - `IntervalCollection.removeIntervalById`
 - `ISharedString.insertMarker`
 - `PaddingSegment.fromJSONObject`
 - `RunSegment.createSplitSegmentAt`
 - `RunSegment.fromJSONObject`
 - `SequenceEvent.clientId`
 - `SharedSegmentSequence.getPropertiesAtPosition`
 - `SharedSegmentSequence.removeLocalReferencePosition`
 - `SharedSegmentSequence.resolveRemoteClientPosition`
 - `SharedString.findTile`
 - `SharedString.getMarkerFromId`
 - `SharedString.insertMarker`
 - `SparseMatrix.getItem`
 - `SparseMatrix.getPositionProperties`
 - `SubSequence.createSplitSegmentAt`
 - `SubSequence.fromJSONObject`


## 2.0.0-internal.1.0.0 Breaking changes
- [LocalReference class and method deprecations removed](#LocalReference-class-and-method-deprecations-removed)
- [Remove TelemetryDataTag.PackageData](#Remove-TelemetryDataTagPackageData)
- [Remove ICodeLoader from @fluidframework/container-definitions](#Remove-ICodeLoader-from-@fluidframework/container-definitions)
- [Narrow type of clientId field on MockFluidDataStoreRuntime](#Narrow-type-of-clientId-field-on-MockFluidDataStoreRuntime)
- [Remove ISummaryAuthor and ISummaryCommitter](#Remove-ISummaryAuthor-and-ISummaryCommitter)
- [REVERTED: ~~Remove IFluidDataStoreChannel.bindToContext and related types~~](#remove-ifluiddatastorechannelbindtocontext-and-related-types)
- [Remove aliasing return value from AliasResult](#remove-aliasing-return-value-from-aliasresult)
- [Creating root datastores using IContainerRuntime.CreateRootDataStore and IContainerRuntimeBase._createDataStoreWithProps is no longer supported](#Creating-root-datastores-using-IContainerRuntimeCreateRootDataStore-and-IContainerRuntimeBase_createDataStoreWithProps-is-no-longer-supported)


### LocalReference class and method deprecations removed
In 0.59.0 the [LocalReference class and it's related methods were deprecated](#LocalReference-class-and-method-deprecations)

The deprecated and now removed LocalReference class is replaced with LocalReferencePosition.
The following deprecated methods are  now removed from sequence and merge-tree. Their replacements should be used instead.
 - createPositionReference to createLocalReferencePosition
 - addLocalReference to createLocalReferencePosition
 - localRefToPos to localReferencePositionToPosition
 - removeLocalReference to removeLocalReferencePosition

### Remove TelemetryDataTag.PackageData
`TelemetryDataTag.PackageData` has been removed. Migrate all usage to `TelemetryDataTag.CodeArtifact` instead.

### Remove ConnectionState.Connecting
`ConnectionState.Connecting` has been removed. Migrate all usage to `ConnectionState.CatchingUp` instead.

### Remove ICodeLoader from @fluidframework/container-definitions
`ICodeLoader` in `@fluidframework/container-definitions` was deprecated since 0.40.0 and is now removed. Use `ICodeDetailsLoader` from `@fluidframework/container-loader` instead.

### Remove ISummaryAuthor and ISummaryCommitter
`ISummaryAuthor` and`ISummaryCommitter` have been removed in this release. See [#10456](https://github.com/microsoft/FluidFramework/issues/10456) for details.

### Narrow type of clientId field on MockFluidDataStoreRuntime
`clientId` can only ever be of type `string`, so it is superfluous for the type
to be `string | undefined`.

### Remove IFluidDataStoreChannel.bindToContext and related types
**THIS BREAKING CHANGE IS REVERTED AS OF 2.0.0-internal.1.1.3**

~~`bindToContext` has been removed from `IFluidDataStoreChannel`, along with enum `BindState` and the interface `IDataStoreWithBindToContext_Deprecated`.
See previous ["Upcoming" change notice](#bindToContext-to-be-removed-from-IFluidDataStoreChannel) for info on how this removal was staged.~~

### Remove aliasing return value from AliasResult
The `aliasing` return value from `AliasResult` has been removed from `@fluidframework/runtime-definitions`, as it's no longer returned by the API. Instead of `aliasing`, the API will return the promise of the ongoing aliasing operation.

### Creating root datastores using IContainerRuntime.CreateRootDataStore and IContainerRuntimeBase._createDataStoreWithProps is no longer supported
The `IContainerRuntime.CreateRootDataStore` method has been removed. Please use aliasing instead. See [IContainerRuntime.createRootDataStore is deprecated](#icontainerruntimecreaterootdatastore-is-deprecated). The `isRoot` parameter from `IContainerRuntimeBase._createDataStoreWithProps` has also been removed. Additionally, the feature gate which would switch to using aliasing behind the aforementioned deleted APIs, `Fluid.ContainerRuntime.UseDataStoreAliasing` will no longer be observed by the runtime. As aliasing is the default behavior for creating such datastores, the `useDataStoreAliasing` property from `IContainerRuntimeOptions` has been removed.

# 1.2.0

## 1.2.0 Upcoming changes
- [ Added locationRedirection errorType in DriverErrorType enum](#Added-locationRedirection-errorType-in-DriverErrorType-enum)
- [ Added ILocationRedirectionError error in DriverError type](#Added-ILocationRedirectionError-error-in-DriverError-type)

 ### Added locationRedirection errorType in DriverErrorType enum
 Added locationRedirection errorType in DriverErrorType enum. This error tells that the location of file on server has changed.
 This error will not be thrown in 1.x.x version but we are just adding it in the type for now. This will be thrown from 2.x.x onward. For consumers of errors(in any version due to dynamic driver loading), this needs to be handled as a separate type where an error message banner could be shown etc. Consumers can also choose to not do any action as far as they recognize this error at runtime and not faulter when they receive this error. Ex. if you have a switch statement which does not have this errorType as a case and throw error in default case, then you need to add a case so that it does not throw any error. However this error is not yet emitted from `Fluid Framework`, so in a way it is non breaking.

 ### Added ILocationRedirectionError error in DriverError type
 Added ILocationRedirectionError error in DriverError. This error tells that the location of file on server has changed. In case of Odsp, the domain of file changes on server.

# 1.1.0

## 1.1.0 Upcoming changes
- [IContainerRuntime.createRootDataStore is deprecated](#icontainerruntimecreaterootdatastore-is-deprecated)
- [ ISummaryAuthor and ISummaryCommitter are deprecated](#isummaryauthor-and-isummarycommitter-are-deprecated)

 ### IContainerRuntime.createRootDataStore is deprecated
 See [#9660](https://github.com/microsoft/FluidFramework/issues/9660). The API is vulnerable to name conflicts, which lead to invalid documents. As a replacement, create a regular datastore using the `IContainerRuntimeBase.createDataStore` function, then alias the datastore by using the `IDataStore.trySetAlias` function and specify a string value to serve as the alias to which the datastore needs to be bound. If successful, "Success" will be returned, and a call to `getRootDataStore` with the alias as parameter will return the same datastore.

 ### ISummaryAuthor and ISummaryCommitter are deprecated
  See [#10456](https://github.com/microsoft/FluidFramework/issues/10456). `ISummaryAuthor` and `ISummaryCommitter`
  are deprecated and will be removed in a future release.

# 1.0.0

## 1.0.0 Upcoming changes
- [Summarize heuristic changes based on telemetry](#Summarize-heuristic-changes-based-on-telemetry)
- [bindToContext to be removed from IFluidDataStoreChannel](#bindToContext-to-be-removed-from-IFluidDataStoreChannel)
- [Garbage Collection (GC) mark phase turned on by default](#Garbage-Collection-(GC)-mark-phase-turned-on-by-default)
- [SequenceEvent.isEmpty removed](#SequenceEvent\.isEmpty-removed)

### Summarize heuristic changes based on telemetry
Changes will be made in the way heuristic summaries are run based on observed telemetry (see `ISummaryConfigurationHeuristics`). Please evaluate if such policies make sense for you, and if not, clone the previous defaults and pass it to the `ContainerRuntime` object to shield yourself from these changes:
- Change `minOpsForLastSummaryAttempt` from `50` -> `10`
- Change `maxOps` from `1000` -> `100`

### bindToContext to be removed from IFluidDataStoreChannel
`bindToContext` will be removed from `IFluidDataStoreChannel` in the next major release.
It was deprecated in 0.50 but due to [this bug](https://github.com/microsoft/FluidFramework/issues/9127) it still had to be called after creating a non-root data store. The bug was fixed in 0.59.
To prepare for the removal in the following release, calls to `bindToContext` can and should be removed as soon as this version is consumed. Since the compatibility window between container runtime and data store runtime is N / N-1, all runtime code will have the required bug fix (released in the previous version 0.59) and it can be safely removed.

### Garbage Collection (GC) mark phase turned on by default
GC mark phase is turned on by default with this version. In mark phase, unreferenced Fluid objects (data stores, DDSes and attachment blobs uploaded via BlobManager) are stamped as such along with the unreferenced timestamp in the summary. Features built on summaries (Fluid file at rest) can filter out these unreferenced content. For example, search and e-discovery will mostly want to filter out these content since they are unused.

For more details on GC and options for controlling its behavior, please see [this document](./packages/runtime/container-runtime/garbageCollection.md).

> Note: GC sweep phase has not been enabled yet so unreferenced content won't be deleted. The work to enable it is in progress and will be ready soon.

### SequenceEvent.isEmpty removed

In `@fluidframework/sequence`, a change was previously made to no longer fire `SequenceEvent`s with empty deltas.
This made the `isEmpty` property of `SequenceEvent` (also available on `SequenceDeltaEvent` and `SequenceMaintenanceEvent`) redundant.
It has been removed in this release--consumers should assume any raised delta events are not empty.

## 1.0.0 Breaking changes
- [Changed AzureConnectionConfig API](#Changed-AzureConnectionConfig-API)
- [Remove IFluidSerializer from core-interfaces](#Remove-IFluidSerializer-from-core-interfaces)
- [Remove IFluidSerializer from IFluidObject](#Remove-IFluidSerializer-from-IFluidObject)
- [Deprecate TelemetryDataTag.PackageData](#Deprecate-TelemetryDataTagPackageData)
- [Remove write method from IDocumentStorageService](#Remove-Write-Method-from-IDocumentStorageService)
- [Remove IDeltaManager.close()](#remove-ideltamanagerclose)
- [Deprecated Fields from ISummaryRuntimeOptions](#Deprecated-fields-from-ISummaryRuntimeOptions)
- [`ISummarizerOptions` is deprecated](#isummarizerOptions-is-deprecated)
- [connect() and disconnect() made mandatory on IContainer and IFluidContainer](#connect-and-disconnect-made-mandatory-on-icontainer-and-ifluidcontainer)
- [Remove Const Enums from Merge Tree, Sequence, and Shared String](#Remove-Const-Enums-from-Merge-Tree-Sequence-and-Shared-String)
- [Remove Container.setAutoReconnect() and Container.resume()](#remove-containersetautoreconnect-and-containerresume)
- [Remove IContainer.connected and IFluidContainer.connected](#remove-icontainerconnected-and-ifluidcontainerconnected)
- [All IFluidObject Augmentations Removed](#All-IFluidObject-Augmentations-Removed)
- [Remove `noopTimeFrequency` and `noopCountFrequency` from ILoaderOptions](#remove-nooptimefrequency-and-noopcountfrequency-from-iloaderoptions)
- [proxyLoaderFactories members removed from ILoaderProps and ILoaderServices](#proxyloaderfactories-members-to-be-removed-from-iloaderprops-and-iloaderservices)
- [IContainer.connectionState yields finer-grained ConnectionState values](#icontainerconnectionstate-yields-finer-grained-connectionstate-values)

### Changed AzureConnectionConfig API
- Added a `type` field that's used to differentiate between remote and local connections.
- Defined 2 subtypes of `AzureConnectionConfig`: `AzureLocalConnectionConfig` and `AzureRemoteConnectionConfig` with their `type` set to `"local"` and `"remote"` respectively
- Previously we supplied `orderer` and `storage` fields, now replaced with `endpoint` url.
- Previously `LOCAL_MODE_TENANT_ID` was supplied for the `tenantId` field when running app locally, now in "local" mode,
  no tenantId field is `provided` and `LOCAL_MODE_TENANT_ID` is no longer available.

### Remove IFluidSerializer from core-interfaces
`IFluidSerializer` was deprecated from core-interfaces in 0.55 and is now removed. Use `IFluidSerializer` in shared-object-base instead.

### Remove IFluidSerializer from IFluidObject
`IFluidSerializer` in `IFluidObject` was deprecated in 0.52 and is now removed. Use `FluidObject` instead of `IFluidObject`.

### Deprecate TelemetryDataTag.PackageData
`TelemetryDataTag.PackageData` is deprecated and will be removed in a future release. Use `TelemetryDataTag.CodeArtifact` instead.

### Remove Write Method from IDocumentStorageService
The `IDocumentStorageService.write(...)` method within the `@fluidframework/driver-definitions` package has been removed. Please remove all usage/implementation of this method if present.

### Remove IDeltaManager.close()
The method `IDeltaManager.close()` was deprecated in 0.54 and is now removed.
Use IContainer.close() or IContainerContext.closeFn() instead, and pass an error object if applicable.

### Require enableOfflineLoad to use IContainer.closeAndGetPendingLocalState()
Offline load functionality has been placed behind a feature flag as part of [ongoing offline work](https://github.com/microsoft/FluidFramework/pull/9557).
In order to use `IContainer.closeAndGetPendingLocalState`, pass a set of options to the container runtime including `{ enableOfflineLoad: true }`.

### Deprecated Fields from ISummaryRuntimeOptions
The following fields have been deprecated from `ISummaryRuntimeOptions` and became properties from `ISummaryConfiguration` interface in order to have the Summarizer Heuristics Settings under the same object. See [#9990](https://github.com/microsoft/FluidFramework/issues/9990):

`ISummaryRuntimeOptions.initialSummarizerDelayMs`
`ISummaryRuntimeOptions.disableSummaries`
`ISummaryRuntimeOptions.maxOpsSinceLastSummary`
`ISummaryRuntimeOptions.summarizerClientElection`
`ISummaryRuntimeOptions.summarizerOptions`

They will be removed in a future release. See [#9990](https://github.com/microsoft/FluidFramework/issues/9990)

- ### `ISummarizerOptions` is deprecated
`ISummarizerOptions` interface is deprecated and will be removed in a future release. See [#9990](https://github.com/microsoft/FluidFramework/issues/9990)
Options that control the behavior of a running summarizer will be moved to the `ISummaryConfiguration` interface instead.

### connect() and disconnect() made mandatory on IContainer and IFluidContainer
The functions `IContainer.connect()`, `IContainer.disconnect()`, `IFluidContainer.connect()`, and `IFluidContainer.disconnect()` have all been changed from optional to mandatory functions.

### Remove Const Enums from Merge Tree, Sequence, and Shared String

The types RBColor, MergeTreeMaintenanceType, and MergeTreeDeltaType are no longer const enums they are now const objects with a union type. In general there should be no change necessary for consumer, unless you are using a specific value as a type. When using a specific value as a type, it is now necessary to prefix with typeof. This scenario is uncommon in consuming code. Example:
``` diff
export interface IMergeTreeInsertMsg extends IMergeTreeDelta {
-    type: MergeTreeDeltaType.INSERT;
+    type: typeof MergeTreeDeltaType.INSERT;
```

### Remove Container.setAutoReconnect() and Container.resume()
The functions `Container.setAutoReconnect()` and `Container.resume()` were deprecated in 0.58 and are now removed. To replace their functionality use `Container.connect()` instead of `Container.setAutoReconnect(true)` and `Container.resume()`, and use `Container.disconnect()` instead of `Container.setAutoReconnect(false)`.

### Remove IContainer.connected and IFluidContainer.connected
The properties `IContainer.connected` and `IFluidContainer.connected` were deprecated in 0.58 and are now removed. To replace their functionality use `IContainer.connectionState` and `IFluidContainer.connectionState` respectively. Example:

``` diff
- if (container.connected) {
+ if (container.connectionState === ConnectionState.Connected) {
    console.log("Container is connected");
}
```

### All IFluidObject Augmentations Removed
 All augmentations to IFluidObject are now removed. IFluidObject is deprecated and being replaced with [FluidObject](#Deprecate-IFluidObject-and-introduce-FluidObject). The interface IFluidObject still exists as an empty interface, to support any pre-existing augmentations. However these should be moved to the [FluidObject](#Deprecate-IFluidObject-and-introduce-FluidObject) pattern, as IFluidObject will
 be completely removed in an upcoming release.

 The following interfaces still exist independently and can be used via FLuidObject, but no longer exist on IFluidObject.
 - IRuntimeFactory
 - ILoader
 - IFluidLoadable
 - IFluidRunnable
 - IFluidRouter
 - IFluidHandleContext
 - IFluidHandle
 - IFluidHTMLView

### Remove `noopTimeFrequency` and `noopCountFrequency` from ILoaderOptions
`noopTimeFrequency` and `noopCountFrequency` are removed from `ILoaderOptions`. Please use `noopTimeFrequency` and `noopCountFrequency` from `IClientConfiguration` in `@fluidframework/protocol-definitions`.

### proxyLoaderFactories members to be removed from ILoaderProps and ILoaderServices
The `proxyLoaderFactories` member on `ILoaderProps` and `ILoaderServices` was deprecated in 0.59 and has now been removed.

### IContainer.connectionState yields finer-grained ConnectionState values
In both `@fluidframework/container-definitions` and `@fluidframework/container-loader` packages,
the `ConnectionState` types have been updated to include a new state which previously was
encompassed by the `Disconnected` state. The new state is `EstablishingConnection` and indicates that the container is
attempting to connect to the ordering service, but is not yet connected.

Any logic based on the `Disconnected` state (e.g. checking the value of `connectionState` on either `IContainer` and `Container`)
should be updated depending on how you want to treat this new `EstablishingConnection` state.

Additionally, please note that the `Connecting` state is being renamed to `CatchingUp`.
`ConnectionState.Connecting` is marked as deprecated, please use `ConnectionState.CatchingUp` instead.
`ConnectionState.Connecting` will be removed in the following major release.


# 0.59

## 0.59 Upcoming changes
- [Remove ICodeLoader interface](#Remove-ICodeLoader-interface)
- [IFluidContainer.connect() and IFluidContainer.disconnect() will be made mandatory in future major release](#ifluidcontainer-connect-and-ifluidcontainer-disconnect-will-be-made-mandatory-in-future-major-release)
- [proxyLoaderFactories members to be removed from ILoaderProps and ILoaderServices](#proxyLoaderFactories-members-to-be-removed-from-ILoaderProps-and-ILoaderServices)
- [routerlicious-host package and ContainerUrlResolver to be removed](#routerlicious-host-package-and-ContainerUrlResolver-to-be-removed)
- [LocalReference class and method deprecations](#LocalReference-class-and-method-deprecations)
- [Deprecated properties from ILoaderOptions](#Deprecated-properties-from-ILoaderOptions)
- [Deprecated forceAccessTokenViaAuthorizationHeader from ICollabSessionOptions](#Deprecated-forceAccessTokenViaAuthorizationHeader-from-ICollabSessionOptions)
- [Deprecated enableRedeemFallback from HostStoragePolicy in Odsp driver](#Deprecated-enableRedeemFallback-from-HostStoragePolicy-in-Odsp-driver)]

### Remove ICodeLoader interface
`ICodeLoader` in `@fluidframework/container-definitions` was deprecated since 0.40.0 and is now removed. Use `ICodeDetailsLoader` from `@fluidframework/container-loader` instead.

### IFluidContainer.connect() and IFluidContainer.disconnect() will be made mandatory in future major release
In major release 1.0, the optional functions `IFluidContainer.connect()` and `IFluidContainer.disconnect()` will be made mandatory functions.

### proxyLoaderFactories members to be removed from ILoaderProps and ILoaderServices
The `proxyLoaderFactories` member on `ILoaderProps` and `ILoaderServices` has been deprecated in 0.59 and will be removed in an upcoming release.

### routerlicious-host package and ContainerUrlResolver to be removed
The `@fluidframework/routerlicious-host` package and its `ContainerUrlResolver` have been deprecated in 0.59 and will be removed in an upcoming release.

### LocalReference class and method deprecations
The class LocalReference in the @fluidframework/merge-tree packing is being deprecated. Please transition usage to the ReferencePosition interface from the same package.
To support this change the following methods are deprecated with replacements that operate on ReferencePosition rather than LocalReference
 - createPositionReference to createLocalReferencePosition
 - addLocalReference to createLocalReferencePosition
 - localRefToPos to localReferencePositionToPosition
 - removeLocalReference to removeLocalReferencePosition

 The above methods are changes in both the @fluidframework/merge-tree and @fluidframework/sequence packages.

 ### Deprecated properties from ILoaderOptions
`noopTimeFrequency` and `noopCountFrequency` from `ILoaderOptions` will be deprecated and moved to `IClientConfiguration` in `@fluidframework/protocol-definitions`.

### Deprecated forceAccessTokenViaAuthorizationHeader from ICollabSessionOptions
Deprecated forceAccessTokenViaAuthorizationHeader from ICollabSessionOptions as auth token will be supplied as Header by default due to security reasons.

### Deprecated enableRedeemFallback from HostStoragePolicy in Odsp driver
Deprecated enableRedeemFallback from HostStoragePolicy in Odsp driver as it will be always enabled by default.

## 0.59 Breaking changes
- [Removing Commit from TreeEntry and commits from SnapShotTree](#Removing-Commit-from-TreeEntry-and-commits-from-SnapShotTree)
- [raiseContainerWarning removed from IContainerContext](#raiseContainerWarning-removed-from-IContainerContext)
- [Remove `@fluidframework/core-interface#fluidPackage.ts`](#Remove-fluidframeworkcore-interfacefluidPackagets)
- [getAbsoluteUrl() argument type changed](#getAbsoluteUrl-argument-type-changed)
- [Replace ICodeLoader with ICodeDetailsLoader interface](#Replace-ICodeLoader-with-ICodeDetailsLoader-interface)
- [IFluidModule.fluidExport is no longer an IFluidObject](#IFluidModule.fluidExport-is-no-longer-an-IFluidObject)
- [Scope is no longer an IFluidObject](#scope-is-no-longer-an-IFluidObject)
- [IFluidHandle and requestFluidObject generic's default no longer includes IFluidObject](#IFluidHandle-and-requestFluidObject-generics-default-no-longer-includes-IFluidObject)
- [LazyLoadedDataObjectFactory.create no longer returns an IFluidObject](#LazyLoadedDataObjectFactory.create-no-longer-returns-an-IFluidObject)
- [Remove routerlicious-host package](#remove-routerlicious-host-package)

### Removing Commit from TreeEntry and commits from SnapShotTree
Cleaning up properties that are not being used in the codebase: `TreeEntry.Commit` and `ISnapshotTree.commits`.
These should not be used and there is no replacement provided.

### raiseContainerWarning removed from IContainerContext
`raiseContainerWarning` property will be removed from `IContainerContext` interface and `ContainerContext` class. Please refer to [raiseContainerWarning property](#Remove-raisecontainerwarning-property) for more details.

### Remove `@fluidframework/core-interface#fluidPackage.ts`
All the interfaces and const from `fluidPackage.ts` were moved to `@fluidframework/container-definitions` in previous release. Please refer to: [Moved `@fluidframework/core-interface#fluidPackage.ts` to `@fluidframework/container-definition#fluidPackage.ts`](#Moved-fluidframeworkcore-interfacefluidPackagets-to-fluidframeworkcontainer-definitionfluidPackagets). It is now removed from `@fluidframework/core-interface#fluidPackage.ts`. Import the following interfaces and const from `@fluidframework/container-definitions`:
- `IFluidPackageEnvironment`
- `IFluidPackage`
- `isFluidPackage`
- `IFluidCodeDetailsConfig`
- `IFluidCodeDetailsConfig`
- `IFluidCodeDetails`
- `IFluidCodeDetailsComparer`
- `IProvideFluidCodeDetailsComparer`
- `IFluidCodeDetailsComparer`

### `getAbsoluteUrl()` argument type changed
The `packageInfoSource` argument in `getAbsoluteUrl()` on `@fluidframework/odsp-driver`, `@fluidframework/iframe-driver`, and `@fluidframework/driver-definitions` is typed to `IContainerPackageInfo` interface only.

```diff
- getAbsoluteUrl(
-    resolvedUrl: IResolvedUrl,
-    relativeUrl: string,
-    packageInfoSource?: IFluidCodeDetails | IContainerPackageInfo,
- ): Promise<string>;

+ interface IContainerPackageInfo {
+    /**
+     * Container package name.
+     */
+    name: string;
+ }

+ getAbsoluteUrl(
+    resolvedUrl: IResolvedUrl,
+    relativeUrl: string,
+    packageInfoSource?: IContainerPackageInfo,
+ ): Promise<string>;
```

### Replace ICodeLoader with ICodeDetailsLoader interface
`ICodeLoader` in `@fluidframework/container-definitions` was deprecated since 0.40.0 and is now removed. Use `ICodeDetailsLoader` from `@fluidframework/container-loader` instead.

In particular, note the `ILoaderService` and `ILoaderProps` interfaces used with the `Loader` class now only support `ICodeDetailsLoader`. If you were using an `ICodeLoader` with these previously, you'll need to update to an `ICodeDetailsLoader`.

```ts
export interface ICodeDetailsLoader
 extends Partial<IProvideFluidCodeDetailsComparer> {
 /**
  * Load the code module (package) that is capable to interact with the document.
  *
  * @param source - Code proposal that articulates the current schema the document is written in.
  * @returns - Code module entry point along with the code details associated with it.
  */
 load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails>;
}
```
All codeloaders are now expected to return the object including both the runtime factory and code details of the package that was actually loaded. These code details may be used later then to check whether the currently loaded package `.satisfies()` a constraint.

You can start by returning default code details that were passed into the code loader which used to be our implementation on your behalf if code details were not passed in. Later on, this gives an opportunity to implement more sophisticated code loading where the code loader now can inform about the actual loaded module via the returned details.

### IFluidModule.fluidExport is no longer an IFluidObject
IFluidObject is no longer part of the type of IFluidModule.fluidExport. IFluidModule.fluidExport is still an [FluidObject](#Deprecate-IFluidObject-and-introduce-FluidObject) which should be used instead.

### Scope is no longer an IFluidObject
IFluidObject is no longer part of the type of IContainerContext.scope or IContainerRuntime.scope.
Scope is still an [FluidObject](#Deprecate-IFluidObject-and-introduce-FluidObject) which should be used instead.

### IFluidHandle and requestFluidObject generic's default no longer includes IFluidObject
IFluidObject is no longer part of the type of IFluidHandle and requestFluidObject generic's default.

``` diff
- IFluidHandle<T = IFluidObject & FluidObject & IFluidLoadable>
+ IFluidHandle<T = FluidObject & IFluidLoadable>

- export function requestFluidObject<T = IFluidObject & FluidObject>(router: IFluidRouter, url: string | IRequest): Promise<T>;
+ export function requestFluidObject<T = FluidObject>(router: IFluidRouter, url: string | IRequest): Promise<T>;
```

This will affect the result of all `get()` calls on IFluidHandle's, and the default return will no longer be and IFluidObject by default.

Similarly `requestFluidObject` default generic which is also its return type no longer contains IFluidObject.

In both cases the generic's default is still an [FluidObject](#Deprecate-IFluidObject-and-introduce-FluidObject) which should be used instead.

As a short term fix in both these cases IFluidObject can be passed at the generic type. However, IFluidObject is deprecated and will be removed in an upcoming release so this can only be a temporary workaround before moving to [FluidObject](#Deprecate-IFluidObject-and-introduce-FluidObject).

### LazyLoadedDataObjectFactory.create no longer returns an IFluidObject
LazyLoadedDataObjectFactory.create no longer returns an IFluidObject, it now only returns a [FluidObject](#Deprecate-IFluidObject-and-introduce-FluidObject).

As a short term fix the return type of this method can be safely casted to an IFluidObject. However, IFluidObject is deprecated and will be removed in an upcoming release so this can only be a temporary workaround before moving to [FluidObject](#Deprecate-IFluidObject-and-introduce-FluidObject).

### Remove Routerlicious-host package
Remove `@fluidframework/routerlicious-host` package and its `ContainerUrlResolver` as they have been deprecated in 0.59 and unused.

# 0.58

## 0.58 Upcoming changes
- [Doing operations not allowed on deleted sub directory](#Doing-operations-not-allowed-on-deleted-sub-directory)
- [IDirectory extends IDisposable](#IDirectory-extends-IDisposable)
- [raiseContainerWarning removed from IContainerContext](#raiseContainerWarning-removed-from-IContainerContext)
- [`IContainerRuntimeBase.setFlushMode` is deprecated](#icontainerruntimebasesetflushmode-is-deprecated)
- [connected deprecated from IContainer, IFluidContainer, and FluidContainer](#connected-deprecated-from-IContainer-IFluidContainer-and-FluidContainer)
- [setAutoReconnect and resume deprecated from IContainer and Container](#setAutoReconnect-and-resume-deprecated-from-IContainer-and-Container)
- [IContainer.connect() and IContainer.disconnect() will be made mandatory in future major release](#icontainer-connect-and-icontainer-disconnect-will-be-made-mandatory-in-future-major-release)

### Doing operations not allowed on deleted sub directory
Users will not be allowed to do operations on a deleted directory. Users can subscribe to `disposed` event to know if a sub directory is deleted. Accessing deleted sub directory will throw `UsageError` exception now.

### IDirectory extends IDisposable
IDirectory has started extending IDisposable. This means that users implementing the IDirectory interface needs to implement IDisposable too now.

### raiseContainerWarning removed from IContainerContext
`raiseContainerWarning` property will be removed from `IContainerContext` interface and `ContainerContext` class. Please refer to [raiseContainerWarning property](#Remove-raisecontainerwarning-property) for more details.

### `IContainerRuntimeBase.setFlushMode` is deprecated
`IContainerRuntimeBase.setFlushMode` is deprecated and will be removed in a future release. FlushMode will become an immutable property for the container runtime, optionally provided at creation time via the `IContainerRuntimeOptions` interface. See [#9480](https://github.com/microsoft/FluidFramework/issues/9480#issuecomment-1084790977)

### connected deprecated from IContainer, IFluidContainer, and FluidContainer
`connected` has been deprecated from `IContainer`, `IFluidContainer`, and `FluidContainer`. It will be removed in a future major release. Use `connectionState` property on the respective interfaces/classes instead. Please switch to the new APIs as soon as possible, and provide any feedback to the FluidFramework team if necessary.
``` diff
- if (fluidContainer.connected)
+ if (fluidContainer.connectionState === ConnectionState.Connected)
```

### setAutoReconnect and resume deprecated from IContainer and Container
`setAutoReconnect()` and `resume()` have been deprecated from `IContainer` and `Container`. They will be removed in a future major release. Use `connect()` instead of `setAutoReconnect(true)` and `resume()`, and use `disconnect()` instead of `setAutoReconnect(false)`. Note, when using these new functions you will need to ensure that the container is both attached and not closed to prevent an error being thrown. Please switch to the new APIs as soon as possible, and provide any feedback to the FluidFramework team if necessary.

### IContainer.connect() and IContainer.disconnect() will be made mandatory in future major release
In major release 1.0, the optional functions `IContainer.connect()` `IContainer.disconnect()` will be made mandatory functions.

## 0.58 Breaking changes
- [Move IntervalType from merge-tree to sequence package](#Move-IntervalType-from-merge-tree-to-sequence-package)
- [Remove logger property from IContainerContext](#Remove-logger-property-from-IContainerContext)
- [Set raiseContainerWarning property as optional parameter on IContainerContext](#Set-raiseContainerWarning-property-as-optional-parameter-on-IContainerContext)
- [Consolidate fluidErrorCode and message on FF Errors](#Consolidate-fluidErrorCode-and-message-on-FF-Errors)

### Move IntervalType from merge-tree to sequence package
Move the type from the merge-tree package where it isn't used to the sequence package where it is used
``` diff
- import { IntervalType } from "@fluidframework/merge-tree";
+ import { IntervalType } from "@fluidframework/sequence";
```

## Remove logger property from IContainerContext
The logger property in IContainerContext became an optional parameter in [release 0.56](#Set-logger-property-as-optional-parameter-in-IContainerContext). This property has now been removed. The `taggedLogger` property is now set as a required parameter in `IContainerContext` interface.

## Set raiseContainerWarning property as optional parameter on IContainerContext
`raiseContainerWarning` is set as an optional parameter on `IContainerContext` interface and would be removed from `IContainerContext` interface and `ContainerContext` class in the next release. Please see [raiseContainerWarning property](#Remove-raisecontainerwarning-property) for more details.

### Consolidate fluidErrorCode and message on FF Errors
Errors raised by the Fluid Framework will no longer contain the property `fluidErrorCode`.
This was present in many error constructors, and exposed in the type `IFluidErrorBase`, but has now been removed.
Previously, the fluidErrorCode value (a pascaleCased term) was often used as the error message itself.
Now all error messages can be expected to be easily-read sentences,
sometimes followed by a colon and an inner error message when applicable.

# 0.57

## 0.57 Upcoming changes

## 0.57 Breaking changes
- [IFluidConfiguration removed](#IFluidConfiguration-removed)
- [Driver error constructors' signatures have changed](#driver-error-constructors-signatures-have-changed)
- [IFluidObject removed from IFluidDataStoreContext scope](#IFluidObject-removed-from-IFluidDataStoreContext-scope)
- [The behavior of containers' isDirty flag has changed](#containers-isdirty-flag-behavior-has-changed)
- [Removed PureDataObject.requestFluidObject_UNSAFE](#Removed-PureDataObject.requestFluidObject_UNSAFE)
- [Modified PureDataObject.getFluidObjectFromDirectory](#Modified-PureDataObject.getFluidObjectFromDirectory)
- [Remove IFluidObject from Aqueduct](#Remove-IFluidObject-from-Aqueduct)
- [Removing snapshot API from IRuntime](#Removing-snapshot-api-from-IRuntime)
- [Remove Unused IFluidObject Augmentations](#Remove-Unused-IFluidObject-Augmentations)
- [Duplicate extractLogSafeErrorProperties removed](#duplicate-extractlogsafeerrorproperties-removed)
- [Code proposal rejection removed](#Code-proposal-rejection-removed)
- [ContainerRuntime.createDataStore return type changed](#Containerruntimecreatedatastore-return-type-changed)
- [Root datastore creation may throw an exception in case of name conflicts](#Root-datastore-creation-may-throw-an-exception-in-case-of-name-conflicts)

### IFluidConfiguration removed

The `IFluidConfiguration` interface and related properties were deprecated in 0.55, and have now been removed.  This includes the `configuration` member of `IContainerContext` and `ContainerContext`.

### Driver error constructors' signatures have changed

All error classes defined in @fluidframework/driver-utils now require the `props` parameter in their constructors,
and `props` must include the property `driverVersion: string | undefined` (via type `DriverErrorTelemetryProps`).
Same for helper functions that return new error objects.

Additionally, `createGenericNetworkError`'s signature was refactored to combine `canRetry` and `retryAfterMs` into a single
required parameter `retryInfo`.

### IFluidObject removed from IFluidDataStoreContext scope
IFluidObject is deprecated and being replaced with [FluidObject](#Deprecate-IFluidObject-and-introduce-FluidObject). IFluidObject is now removed from IFluidDataStoreContext's scope:

``` diff
- readonly scope: IFluidObject & FluidObject;
+ readonly scope: FluidObject;
```

Additionally, the following deprecated fields have been removed from IFluidObject:
- IFluidDataStoreFactory
- IFluidDataStoreRegistry

Use [FluidObject](#Deprecate-IFluidObject-and-introduce-FluidObject) instead.

### Containers isDirty flag behavior has changed
Container is now considered dirty if it's not attached or it is attached but has pending ops. Check https://fluidframework.com/docs/build/containers/#isdirty for further details.

### Removed PureDataObject.requestFluidObject_UNSAFE
The `requestFluidObject_UNSAFE` is removed from the PureDataObject. If you still need to fallback on URIs, use `handleFromLegacyUri`. We are making this change to encourage retreiving shared objects via handles only.

### Modified PureDataObject.getFluidObjectFromDirectory
Going forward, `getFluidObjectFromDirectory` will not return FluidObject if you have have used to store uri string for a given key. If you still need to fallback on URIs, use `handleFromLegacyUri`. Also, getFluidObjectFromDirectory now expects callback that is only returning `IFluidHandle` or `undefined`. Returnig uri/id (string) is not supported as we want to encourage retreiving shared objects via handles only.

### Remove IFluidObject from Aqueduct

[IFluidObject is deprecated](#Deprecate-IFluidObject-and-introduce-FluidObject). In this release we have removed all IFluidObject from the aqueduct package.
This impacts the following public apis:
 - getDefaultObjectFromContainer
 - getObjectWithIdFromContainer
 - getObjectFromContainer
 - PureDataObject.getFluidObjectFromDirectory
 - ContainerServiceRegistryEntries
 - SingletonContainerServiceFactory.getService

 In general the impact of these changes should be transparent. If you see compile errors related to Fluid object provider types with the above apis, you should transition those usages to [FluidObject](https://github.com/microsoft/FluidFramework/blob/main/common/lib/core-interfaces/src/provider.ts#L61) which is the replacement for the deprecated IFluidObject.

### Removing snapshot API from IRuntime
Snapshot API has been removed from IRuntime. Replay tools and snapshot tests are now using summarize API.

### Remove Unused IFluidObject Augmentations
The following deprecated provider properties are no longer exposed off of IFluidObject
 - IFluidMountableView
 - IAgentScheduler
 - IContainerRuntime
 - ISummarizer

The interfaces that correspond to the above properties continue to exist, and can use directly, or with the IFluidObject replacement [FluidObject](https://github.com/microsoft/FluidFramework/blob/main/common/lib/core-interfaces/src/provider.ts#L61)

### Duplicate extractLogSafeErrorProperties removed

The helper function `extractLogSafeErrorProperties` existed in both telemetry-utils and common-utils packages.
The copy in common-utils was out of date and unused in this repo, and has now been removed.

### Code proposal rejection removed
Rejection functionality has been removed from Quorum.  As a result, the `"codeDetailsProposed"` event on `IContainer` now provides an `ISequencedProposal` rather than an `IPendingProposal`.

### ContainerRuntime.createDataStore return type changed
`ContainerRuntime.createDataStore` will now return an an `IDataStore` instead of an `IFluidRouter`. This change does not break the interface contract, as the former inherits the latter, however the concrete object will be a `DataStore` instance, which does not inherit `IFluidDataStoreChannel` as before.

### Root datastore creation may throw an exception in case of name conflicts
When creating root datastores using `ContainerRuntime.createRootDataStore` or `ContainerRuntime._createDataStoreWithProps`, in case of a name conflict (when attempting to create a root datastore with a name which already exists in the document), an exception of type `GenericError` may be thrown from the function.

## 0.56 Breaking changes
- [`MessageType.Save` and code that handled it was removed](#messageType-save-and-code-that-handled-it-was-removed)
- [Removed `IOdspResolvedUrl.sharingLinkToRedeem`](#Removed-IOdspResolvedUrl.sharingLinkToRedeem)
- [Removed url from ICreateBlobResponse](#removed-url-from-ICreateBlobResponse)
- [`readonly` removed from `IDeltaManager`, `DeltaManager`, and `DeltaManagerProxy`](#readonly-removed-from-IDeltaManager-and-DeltaManager-DeltaManagerProxy)(Synthesize-Decoupled-from-IFluidObject-and-Deprecations-Removed)
- [codeDetails removed from Container](#codeDetails-removed-from-Container)
- [wait() methods removed from map and directory](#wait-methods-removed-from-map-and-directory)
- [Removed containerPath from DriverPreCheckInfo](#removed-containerPath-from-DriverPreCheckInfo)
- [Removed SharedObject.is](#Removed-SharedObject.is)
- [Removed IContainerContext.id](#Removed-IContainerContext.id-and-ContainerContext.id)
- [Remove raiseContainerWarning property](#Remove-raiseContainerWarning-property)
- [Set logger property as optional parameter in IContainerContext](#Set-logger-property-as-optional-parameter-in-IContainerContext)

### `MessageType.Save` and code that handled it was removed
The `Save` operation type was deprecated and has now been removed. This removes `MessageType.Save` from `protocol-definitions`, `save;${string}: ${string}` from `SummarizeReason` in the `container-runtime` package, and `MessageFactory.createSave()` from and `server-test-utils`.

### Removed `IOdspResolvedUrl.sharingLinkToRedeem`
The `sharingLinkToRedeem` property is removed from the `IOdspResolvedUrl` interface. The property can be accesed from `IOdspResolvedUrl.shareLinkInfo` instead.

### Removed `url` from ICreateBlobResponse
The unused `url` property of `ICreateBlobResponse` in `@fluidframework/protocol-definitions` has been removed

### readonly removed from IDeltaManager, DeltaManager, and DeltaManagerProxy
The `readonly` property was deprecated and has now been removed from `IDeltaManager` from `container-definitions`. Additionally, `readonly` has been removed from the implementations in `DeltaManager` and `DeltaManagerProxy` from `container-loader`. To replace its functionality, use `readOnlyInfo.readonly` instead.

### Synthesize Decoupled from IFluidObject and Deprecations Removed
DependencyContainer now takes a generic argument, as it is no longer directly couple to IFluidObject. The ideal pattern here would be directly pass the provider or FluidObject interfaces you will register. As a short term solution you could also pass IFluidObject, but IFluidObject is deprecated, so will need to be removed if used here.
Examples:
``` typescript
// the old way
const dc = new DependencyContainer();
dc.register(IFluidHTMLView, MockLoadable());

// FluidObject option
const dc = new DependencyContainer<FluidObject<IFluidHTMLView>>();
dc.register(IFluidHTMLView, MockLoadable());

// Provider option
const dc = new DependencyContainer<IProvideFluidHTMLView>();
dc.register(IFluidHTMLView, MockLoadable());

// Short term IFluidObject option
const dc = new DependencyContainer<IFluidObject>();
dc.register(IFluidHTMLView, MockLoadable());
```

The following members have been removed from IFluidDependencySynthesizer:
 - registeredTypes - unused and no longer supported. `has` can replace most possible usages
 - register - create new DependencyContainer and add existing as parent
 - unregister - create new DependencyContainer and add existing as parent
 - getProvider - use `has` and `synthesize` to check or get provider respectively

 The following types have been removed or changed. These changes should only affect direct usages which should be rare. Existing synthesizer api usage is backwards compatible:
 - FluidObjectKey - removed as IFluidObject is deprecated
 - NonNullableFluidObject - removed as IFluidObject is deprecated. use typescripts NonNullable instead
 - AsyncRequiredFluidObjectProvider - Takes FluidObject types rather than keys
 - AsyncOptionalFluidObjectProvider - Takes FluidObject types rather than keys
 - AsyncFluidObjectProvider - Takes FluidObject types rather than keys
 - FluidObjectProvider - Takes FluidObject types rather than keys
 - ProviderEntry - no longer used
 - DependencyContainerRegistry - no longer used

### codeDetails removed from Container

In release 0.53, the `codeDetails` member was removed from `IContainer`.  It is now also removed from `Container`.  To inspect the code details of a container, instead use the `getSpecifiedCodeDetails()` and `getLoadedCodeDetails()` methods.

### `wait()` methods removed from map and directory

The `wait()` methods on `ISharedMap` and `IDirectory` were deprecated in 0.55 and have now been removed.  See the [deprecation notice](#wait-methods-deprecated-on-map-and-directory) for migration advice if you currently use these APIs.

### Removed containerPath from DriverPreCheckInfo
The `containerPath` property of `DriverPreCheckInfo` was deprecated and has now been removed. To replace its functionality, use `Loader.request()`.

### Removed `SharedObject.is`
The `is` method is removed from SharedObject. This was being used to detect SharedObjects stored inside other SharedObjects (and then binding them), which should not be happening anymore. Instead, use handles to SharedObjects.

### Removed IContainerContext.id and ContainerContext.id
The `id` property of IContainerContext was deprecated and now removed. The `id` property of ContainerContext was deprecated and now removed. id should not be exposed at
runtime level anymore. Instead, get from container's resolvedURL if necessary.

### Remove raiseContainerWarning property

The `raiseContainerWarning` property is removed from the following interfaces in release 0.56:

- `IContainerRuntime`
- `IFluidDataStoreContext`
- `IFluidDataStoreRuntime`

This property was also deprecated in `IContainerContext` and will be removed in a future release. Application developers should generate their own telemetry/logging events.

### Set logger property as optional parameter in IContainerContext

The `logger` property from `IContainerContext` is now optional. It will be removed completely in a future release. Use `taggedLogger` instead. Loggers passed to `ContainerContext` will need to support tagged events.

## 0.55 Breaking changes
- [`SharedObject` summary and GC API changes](#SharedObject-summary-and-GC-API-changes)
- [`IChannel.summarize` split into sync and async](#IChannel.summarize-split-into-sync-and-async)
- [`IFluidSerializer` moved to shared-object-base](#IFluidSerializer-moved-to-shared-object-base)
- [Removed `IFluidSerializer` from `IFluidDataStoreRuntime`](#Removed-IFluidSerializer-from-IFluidDataStoreRuntime)
- [`IFluidConfiguration` deprecated and `IFluidConfiguration` member removed from `ContainerRuntime`](#IFluidConfiguration-deprecated-and-IFluidConfiguration-member-removed-from-ContainerRuntime)
- [`wait()` methods deprecated on map and directory](#wait-methods-deprecated-on-map-and-directory)
- [Remove Legacy Data Object and Factories](#Remove-Legacy-Data-Object-and-Factories)
- [Removed `innerRequestHandler`](#Removed-innerRequestHandler)
- [Aqueduct and IFluidDependencySynthesizer changes](#Aqueduct-and-IFluidDependencySynthesizer-changes)

### `container-loader` interfaces return `IQuorumClients` rather than `IQuorum`

The `getQuorum()` method on `IContainer` and the `quorum` member of `IContainerContext` return an `IQuorumClients` rather than an `IQuorum`.  See the [prior breaking change notice announcing this change](#getQuorum-returns-IQuorumClients-from-within-the-container) for recommendations on migration.

### `SharedObject` summary and GC API changes

`SharedObject.snapshotCore` is renamed to `summarizeCore` and returns `ISummaryTreeWithStats`. Use
`SummaryTreeBuilder` to create a summary instead of `ITree`.

`SharedObject.getGCDataCore` is renamed to `processGCDataCore` and a `SummarySerializer` is passed as a parameter. The method should run the serializer over the handles as before and does not need to return anything. The caller will extract the GC data from the serializer.

### `IChannel.summarize` split into sync and async
`IChannel` now has two summarization methods instead of a single synchronous `summarize`. `getAttachSummary` is synchronous to prevent channel modifications during summarization, `summarize` is asynchronous.

### `IFluidSerializer` moved to shared-object-base
`IFluidSerializer` has moved packages from core-interfaces to shared-object-base. `replaceHandles` method is renamed to `encode`. `decode` method is now required. `IFluidSerializer` in core-interfaces is now deprecated and will be removed in a future release.

### Removed `IFluidSerializer` from `IFluidDataStoreRuntime`
`IFluidSerializer` in `IFluidDataStoreRuntime` was deprecated in version 0.53 and is now removed.

### `IFluidConfiguration` deprecated and `IFluidConfiguration` member removed from `ContainerRuntime`

The `IFluidConfiguration` interface from `@fluidframework/core-interfaces` has been deprecated and will be removed in an upcoming release.  This will include removal of the `configuration` member of the `IContainerContext` from `@fluidframework/container-definitions` and `ContainerContext` from `@fluidframework/container-loader` at that time.  To inspect whether the document is in readonly state, you should instead query `container.readOnlyInfo.readonly`.

The `IFluidConfiguration` member of `ContainerRuntime` from `@fluidframework/container-runtime` has also been removed.

### `wait()` methods deprecated on map and directory

The `wait()` methods on `ISharedMap` and `IDirectory` have been deprecated and will be removed in an upcoming release.  To wait for a change to a key, you can replicate this functionality with a helper function that listens to the change events.

```ts
const directoryWait = async <T = any>(directory: IDirectory, key: string): Promise<T> => {
    const maybeValue = directory.get<T>(key);
    if (maybeValue !== undefined) {
        return maybeValue;
    }

    return new Promise((resolve) => {
        const handler = (changed: IValueChanged) => {
            if (changed.key === key) {
                directory.off("containedValueChanged", handler);
                const value = directory.get<T>(changed.key);
                if (value === undefined) {
                    throw new Error("Unexpected containedValueChanged result");
                }
                resolve(value);
            }
        };
        directory.on("containedValueChanged", handler);
    });
};

const foo = await directoryWait<Foo>(this.root, fooKey);

const mapWait = async <T = any>(map: ISharedMap, key: string): Promise<T> => {
    const maybeValue = map.get<T>(key);
    if (maybeValue !== undefined) {
        return maybeValue;
    }

    return new Promise((resolve) => {
        const handler = (changed: IValueChanged) => {
            if (changed.key === key) {
                map.off("valueChanged", handler);
                const value = map.get<T>(changed.key);
                if (value === undefined) {
                    throw new Error("Unexpected valueChanged result");
                }
                resolve(value);
            }
        };
        map.on("valueChanged", handler);
    });
};

const bar = await mapWait<Bar>(someSharedMap, barKey);
```

As-written above, these promises will silently remain pending forever if the key is never set (similar to current `wait()` functionality).  For production use, consider adding timeouts, telemetry, or other failure flow support to detect and handle failure cases appropriately.

### Remove Legacy Data Object and Factories

In order to ease migration to the new Aqueduct Data Object and Data Object Factory generic arguments we added legacy versions of those classes in version 0.53.

In this release we remove those legacy classes: LegacyDataObject, LegacyPureDataObject, LegacyDataObjectFactory, and LegacyPureDataObjectFactory

It is recommend you migrate to the new generic arguments before consuming this release.
Details are here: [0.53: Generic Argument Changes to DataObjects and Factories](#Generic-Argument-Changes-to-DataObjects-and-Factories)

### Removed `innerRequestHandler`
`innerRequestHandler` is removed from `@fluidframework/request-handlers` package, and its usage is removed from `BaseContainerRuntimeFactory` and `ContainerRuntimeFactoryWithDefaultDataStore`.  If you are using these container runtime factories, attempting to access internal data stores via `request()` will result in 404 responses.

If you rely on `request()` access to internal root data stores, you can add `rootDataStoreRequestHandler` to your list of request handlers on the runtime factory.

It is not recommended to provide `request()` access to non-root data stores, but if you currently rely on this functionality you can add a custom request handler that calls `runtime.IFluidHandleContext.resolveHandle(request)` just like `innerRequestHandler` used to do.

### Aqueduct and IFluidDependencySynthesizer changes
The type `DependencyContainerRegistry` is now deprecated and no longer used. In it's place the `DependencyContainer` class should be used instead.

The following classes in Aqueduct have been changed to no longer take DependencyContainerRegistry and to use DependencyContainer instead: `BaseContainerRuntimeFactory`, and `ContainerRuntimeFactoryWithDefaultDataStore`

In both cases, the third parameter to the constructor has been changed from `providerEntries: DependencyContainerRegistry = []` to `dependencyContainer?: IFluidDependencySynthesizer`. If you were previously passing an emptry array, `[]` you should now pass `undefined`. If you were passing in something besides an empty array, you will instead create new DependencyContainer and register your types, and then pass that, rather than the type directly:

``` diff
+const dependencyContainer = new DependencyContainer();
+dependencyContainer.register(IFluidUserInformation,async (dc) => userInfoFactory(dc));

 export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
     Pond.getFactory(),
     new Map([
         Pond.getFactory().registryEntry,
     ]),
-    [
-        {
-            type: IFluidUserInformation,
-            provider: async (dc) => userInfoFactory(dc),
-        },
-    ]);
+    dependencyContainer);
```

## 0.54 Breaking changes
- [Removed `readAndParseFromBlobs` from `driver-utils`](#Removed-readAndParseFromBlobs-from-driver-utils)
- [Loader now returns `IContainer` instead of `Container`](#Loader-now-returns-IContainer-instead-of-Container)
- [`getQuorum()` returns `IQuorumClients` from within the container](#getQuorum-returns-IQuorumClients-from-within-the-container)
- [`SharedNumberSequence` and `SharedObjectSequence` deprecated](#SharedNumberSequence-and-SharedObjectSequence-deprecated)
- [`IContainer` interface updated to complete 0.53 changes](#IContainer-interface-updated-to-complete-0.53-changes)

### Removed `readAndParseFromBlobs` from `driver-utils`
The `readAndParseFromBlobs` function from `driver-utils` was deprecated in 0.44, and has now been removed from the `driver-utils` package.

### Loader now returns `IContainer` instead of `Container`

The following public API functions on `Loader`, from `"@fluidframework/container-loader"` package, now return `IContainer`:
- `createDetachedContainer`
- `rehydrateDetachedContainerFromSnapshot`
- `resolve`

All of the required functionality from a `Container` instance should be available on `IContainer`. If the function or property you require is not available, please file an issue on GitHub describing which function and what you are planning on using it for. They can still be used by casting the returned object to `Container`, i.e. `const container = await loader.resolve(request) as Container;`, however, this should be avoided whenever possible and the `IContainer` API should be used instead.

### `getQuorum()` returns `IQuorumClients` from within the container

The `getQuorum()` method on `IContainerRuntimeBase`, `IFluidDataStoreContext`, and `IFluidDataStoreRuntime` now returns an `IQuorumClients` rather than an `IQuorum`.  `IQuorumClients` retains the ability to inspect the clients connected to the collaboration session, but removes the ability to access the quorum proposals.  It is not recommended to access the quorum proposals directly.

A future change will similarly convert calls to `getQuorum()` on `IContainer` and `IContainerContext` to return an `IQuorumClients`.  If you need to access the code details on the `IContainer`, you should use the `getSpecifiedCodeDetails()` API instead.  If you are currently accessing the code details on the `IContainerContext`, a temporary `getSpecifiedCodeDetails()` method is exposed there as well to aid in migration.  However, accessing the code details from the container context is not recommended and this migratory API will be removed in an upcoming release.  It is instead recommended to only inspect code details in the code loader while loading code, or on `IContainer` as part of code upgrade scenarios (i.e. when calling `IContainer`'s `proposeCodeDetails()`).  Other uses are not supported.

### `SharedNumberSequence` and `SharedObjectSequence` deprecated

The `SharedNumberSequence` and `SharedObjectSequence` have been deprecated and are not recommended for use.  To discuss future plans to support scenarios involving sequences of objects, please see [Github issue 8526](https://github.com/microsoft/FluidFramework/issues/8526).

Additionally, `useSyncedArray()` from `@fluid-experimental/react` has been removed, as it depended on the `SharedObjectArray`.

### `IContainer` interface updated to complete 0.53 changes
The breaking changes introduced in [`IContainer` interface updated to expose actively used `Container` public APIs](#IContainer-interface-updated-to-expose-actively-used-Container-public-APIs) have now been completed in 0.54. The following additions to the `IContainer` interface are no longer optional but rather mandatory:
- `connectionState`
- `connected`
- `audience`
- `readOnlyInfo`

The following "alpha" APIs are still optional:
- `setAutoReconnect()` (**alpha**)
- `resume()` (**alpha**)
- `clientId` (**alpha**)
- `forceReadonly()` (**alpha**)

The deprecated `codeDetails` API, which was marked as optional on the last release, has now been removed.

## 0.53 Breaking changes
- [`IContainer` interface updated to expose actively used `Container` public APIs](#IContainer-interface-updated-to-expose-actively-used-Container-public-APIs)
- [Remove `getLegacyInterval()` and `delete()` from sequence dds](#Remove-getLegacyInterval-and-delete-from-sequence-dds)
- [readOnly and readOnlyPermissions removed from Container](#readOnly-and-readOnlyPermissions-removed-from-container)
- [Generic Argument Changes to DataObjects and Factories](#Generic-Argument-Changes-to-DataObjects-and-Factories)
- [Remove `loader` property from `MockFluidDataStoreContext` class](#Remove-loader-property-from-MockFluidDataStoreContext-class)
- [maxMessageSize removed from IConnectionDetails and IDocumentDeltaConnection](#maxMessageSize-removed-from-IConnectionDetails-and-IDocumentDeltaConnection)
- [Remove `IntervalCollection.getView()` from sequence dds](#Remove-IntervalCollectiongetView-from-sequence-dds)
- [Moved `ICodeDetailsLoader` and `IFluidModuleWithDetails` interface to `@fluidframework/container-definitions`](#Moved-ICodeDetailsLoader-and-IFluidModuleWithDetails-interface-to-fluidframeworkcontainer-definitions)
- [Removed `errorMessage` property from `ISummaryNack` interface](#Removed-errorMessage-property-from-ISummaryNack-interface)
- [ISequencedDocumentMessage arg removed from SharedMap and SharedDirectory events](#ISequencedDocumentMessage-arg-removed-from-SharedMap-and-SharedDirectory-events)
- [Moved `@fluidframework/core-interface#fluidPackage.ts` to `@fluidframework/container-definition#fluidPackage.ts`](#Moved-fluidframeworkcore-interfacefluidPackagets-to-fluidframeworkcontainer-definitionfluidPackagets)
- [Deprecated `IFluidSerializer` in `IFluidDataStoreRuntime`](#Deprecated-IFluidSerializer-in-IFluidDataStoreRuntime)
- [Errors thrown to DDS event handlers](#Errors-thrown-to-DDS-event-handlers)

### `IContainer` interface updated to expose actively used `Container` public APIs
In order to have the `IContainer` interface be the active developer surface that is used when interacting with a `Container` instance, it has been updated to expose the APIs that are necessary for currently used behavior. The motivation here is to move away from using the `Container` class when only its type is required, and to use the `IContainer` interface instead.

The following values have been added (NOTE: some of these are marked with an @alpha tag and may be replaced in the future with a breaking change as the `IContainer` interface is finalized):
- `connectionState`
- `connected`
- `setAutoReconnect()` (**alpha**)
- `resume()` (**alpha**)
- `audience`
- `clientId` (**alpha**)
- `readOnlyInfo`
- `forceReadonly()` (**alpha**)

Additionally, `codeDetails` which was already deprecated before is now marked as optional and ready for removal after the next release.

### Remove `getLegacyInterval()` and `delete()` from sequence dds
`getLegacyInterval()` was only being used by the deprecated `IntervalCollection.delete()`. The alternative to `IntervalCollection.delete()` is `IntervalCollection.removeIntervalById()`.

### `readOnly` and `readOnlyPermissions` removed from `Container`
The `readOnly` and `readOnlyPermissions` properties from `Container` in `container-loader` was deprecated in 0.35, and has now been removed. To replace its functionality, use `readOnlyInfo` by accessing `readOnlyInfo.readonly` and `readOnlyInfo.permissions` respectively.

### Generic Argument Changes to DataObjects and Factories

DataObject and PureDataObject used to take 3 generic type parameters. This has been collasped to a single generic argument. This new format takes the same types, but allows for easier exclusion or inclusion of specific types, while also being more readable.

In general the existing data object generic parameters map to the new generic parameter as follow:
`DataObject<O,S,E>` maps to `DataObject<{OptionalProviders: O, InitialState: S, Events: E}>`

We would frequently see default values for generic paramaters, in order to set a following parameter. This is no longer necessary. If you see a generic parameter with a type of `{}`, `undefined`, `object`, `unknown`, `any`, `IEvent`, or `IFluidObject` is not needed, and can now be excluded.

Here are some examples:
 - `DataObject<{}, any, IEvent>` becomes `DataObject`
 - `DataObject<IFluidUserInformation>` becomes `DataObject<{OptionalProviders: IFluidUserInformation}>`
 - `DataObject<{}, RootDataObjectProps>` becomes `DataObject<{InitialState: RootDataObjectProps}>`
 - `DataObject<object, undefined, IClickerEvents>` becomes `DataObject<{Events: IClickerEvents}>`

Very similar changes have been made to DataObjectFactory and PureDataObjectFactory. Rather than 4 generic arguments it is reduced to 2. The first is still the same, and is the DataObject, the second is the same type the DataObject itself takes. However, this detail should not be important, as will this change has come improved type inference, so it should no longer be necessary to set any generic arguments on the factory.

here are some examples:
 - `new DataObjectFactory<SpacesStorage, undefined, undefined, IEvent>` becomes `new DataObjectFactory`
 - `DataObjectFactory<MockComponentFooProvider, object, undefined>` becomes `DataObjectFactory<MockComponentFooProvider>`

Above I've used DataObject, and DataObjectFactory however the same changes apply to PureDataObject and PureDataObjectFactory.

To ease transition we've also added LegacyDataObject, LegacyPureDataObject, LegacyDataObjectFactory, and LegacyPureDataObjectFactory. These types have the same generic parameters as the types before this change, and can be used as a drop in replacement, but please move away from these types asap, as they will be removed in a following release.

### Remove `loader` property from `MockFluidDataStoreContext` class
The `loader` property from `MockFluidDataStoreContext` class was deprecated in release 0.37 and is now removed. Refer the following deprecation warning: [Loader in data stores deprecated](#Loader-in-data-stores-deprecated)

### `maxMessageSize` removed from `IConnectionDetails` and `IDocumentDeltaConnection`
The `maxMessageSize` property from `IConnectionDetails` and `IDocumentDeltaConnection` was deprecated in 0.51, and has now been removed from the `container-definitions` and `driver-definitions` packages respectively. To replace its functionality, use `serviceConfiguration.maxMessageSize`.

### Remove `IntervalCollection.getView()` from sequence dds
The `IntervalCollection.getView()` was removed.  If you were calling this API, you should instead refer to the `IntervalCollection` itself directly in places where you were using the view.

### Moved `ICodeDetailsLoader` and `IFluidModuleWithDetails` interface to `@fluidframework/container-definitions`
The `ICodeDetailsLoader` and `IFluidModuleWithDetails` interface are deprecated in `@fluidframework/container-loader` and moved to `@fluidframework/container-definitions`. The `ICodeDetailsLoader` interface should be imported from `@fluidframework/container-definition` package. The `ICodeDetailsLoader` and `IFluidModuleWithDetails` from `@fluidframework/container-loader` will be removed from `@fluidframework/container-loader` in further releases.

### Removed `errorMessage` property from `ISummaryNack` interface
The `errorMessage` property from the `ISummaryNack` interface was deprecated in 0.43, and has now been removed from the `protocol-definitions` package. To replace its functionality, use the `message` property.

### `ISequencedDocumentMessage` arg removed from `SharedMap` and `SharedDirectory` events
The `ISequencedDocumentMessage` argument in events emitted from `SharedMap` and `SharedDirectory` (the `"valueChanged"` and `"clear"` events) has been removed.  It is not recommended to access the protocol layer directly.  Note that if you were leveraging the `this` argument of these events, you will need to update your event listeners due to the arity change.

### Moved `@fluidframework/core-interface#fluidPackage.ts` to `@fluidframework/container-definition#fluidPackage.ts`
Moved the following interfaces and const from `@fluidframework/core-interface` to `@fluidframework/container-definitions`:
- `IFluidPackageEnvironment`
- `IFluidPackage`
- `isFluidPackage`
- `IFluidCodeDetailsConfig`
- `IFluidCodeDetailsConfig`
- `IFluidCodeDetails`
- `IFluidCodeDetailsComparer`
- `IProvideFluidCodeDetailsComparer`
- `IFluidCodeDetailsComparer`

They are deprecated from `@fluidframework/core-interface` and would be removed in future release. Please import them from `@fluidframework/container-definitions`.

### Deprecated `IFluidSerializer` in `IFluidDataStoreRuntime`
`IFluidSerializer` should only be used by DDSes to serialize data and they should use the one created by `SharedObject`.

### Errors thrown to DDS event handlers
Before this release, exceptions thrown from DDS event handlers resulted in Fluid Framework reporting non-error telemetry event and moving forward as if nothing happened. Starting with this release, such exceptions will result in critical error, i.e. container will be closed with such error and hosting app will be notified via Container's "closed" event. This will either happen immediately (if exception was thrown while processing remote op), or on later usage (if exception was thrown on local change). DDS will go into "broken" state and will keep throwing error on amy attempt to make local changes.
This process is supposed to be a catch-call case for cases where listeners did not do due diligence or have no better way to handle their errors.
If possible, it's recommended for DDS event listeners to not throw exceptions, but rather handle them appropriately without involving DDS itself.
The purpose of this change to ensure that data model stays always synchronized with data projection that event listeners are building. If event listener is not able to fully / correctly process change event, that likely means data synchronization is broken and it's not safe to continue (and potentially, corrupt document).

## 0.52 Breaking changes
- [chaincodePackage removed from Container](#chaincodePackage-removed-from-Container)
- [`OdspDocumentInfo` type replaced with `OdspFluidDataStoreLocator` interface](#OdspDocumentInfo-type-replaced-with-OdspFluidDataStoreLocator-interface)
- [close() removed from IDocumentDeltaConnection](#close-removed-from-IDocumentDeltaConnection)
- [Replace `createCreateNewRequest` function with `createOdspCreateContainerRequest` function](#Replace-createCreateNewRequest-function-with-createOdspCreateContainerRequest-function)
- [Deprecate IFluidObject and introduce FluidObject](#Deprecate-IFluidObject-and-introduce-FluidObject)

### `chaincodePackage` removed from `Container`
The `chaincodePackage` property on `Container` was deprecated in 0.28, and has now been removed.  Two new APIs have been added to replace its functionality, `getSpecifiedCodeDetails()` and `getLoadedCodeDetails()`.  Use `getSpecifiedCodeDetails()` to get the code details currently specified for the `Container`, or `getLoadedCodeDetails()` to get the code details that were used to load the `Container`.

### `OdspDocumentInfo` type replaced with `OdspFluidDataStoreLocator` interface
The `OdspDocumentInfo` type is removed from `odsp-driver` package. It is removed from `packages\drivers\odsp-driver\src\contractsPublic.ts` and replaced with `OdspFluidDataStoreLocator` interface as parameter in `OdspDriverUrlResolverForShareLink.createDocumentUrl()`. If there are any instances of `OdspDocumentInfo` type used, it can be simply replaced with `OdspFluidDataStoreLocator` interface.

### Replace `createCreateNewRequest` function with `createOdspCreateContainerRequest` function
The `createCreateNewRequest()` is removed and replaced with `createOdspCreateContainerRequest()` in the `odsp-driver` package. If any instances of `createCreateNewRequest()` are used, replace them with `createOdspCreateContainerRequest()` by importing it from `@fluidframework/odsp-driver` package.

### Deprecate IFluidObject and introduce FluidObject
This release deprecates the interface `IFluidObject` and introduces the utility type [`FluidObject`](https://github.com/microsoft/FluidFramework/blob/main/common/lib/core-interfaces/src/provider.ts). The primary reason for this change is that the module augmentation used by `IFluidObject` creates excessive type coupling where a small breaking change in any type exposed off `IFluidObject` can lead to type error in all usages of `IFluidObject`.
On investigation we also found that the uber type `IFluidObject` wasn't generally necessary, as consumers generally only used a small number of specific types that they knew in advance.

Given these points, we've introduced [`FluidObject`](https://github.com/microsoft/FluidFramework/blob/main/common/lib/core-interfaces/src/provider.ts). `FluidObject` is a utility type that is used in both its generic and non-generic forms.

The non-generic `FluidObject` is returned or taken in cases where the specific functionally isn't known, or is different based on scenario. You'll see this usage for things like `scope` and the request pattern.

The non-generic `FluidObject` is a hint that the generic form of `FluidObject` should be used to inspect it. For example
``` typescript
    const provider: FluidObject<IFluidHTMLView> = requestFluidObject(container, "/");
    if(provider.IFluidHTMLView !== undefined){
        provider.IFluidHTMLView.render(div)
    }
```

If you want to inspect for multiple interfaces via `FluidObject`, you can use an intersection:
``` typescript
    const provider: FluidObject<IFluidHTMLView & IFluidMountableView> = requestFluidObject(container, "/");
```

Please begin reducing the usage of `IFluidObject` and moving to `FluidObject`.  If you find any cases that `FluidObject` doesn't support please file an issue.

## 0.51 Breaking changes
- [`maxMessageSize` property has been deprecated from IConnectionDetails and IDocumentDeltaConnection](#maxmessagesize-property-has-been-deprecated-from-iconnectiondetails-and-idocumentdeltaconnection)
- [_createDataStoreWithProps and IFluidDataStoreChannel](#createdatastorewithprops-and-ifluiddatastorechannel)
- [Deprecated `Loader._create` is removed](#deprecated-loadercreate-is-removed)
- [Stop exporting internal class `CollabWindowTracker` ](#stop-exporting-internal-class-collabwindowtracker)
- [base-host package removed](#base-host-package-removed)
- [Registers removed from sequence and merge-tree](#Registers-removed-from-sequence-and-merge-tree)
- [Token fetch errors have proper errorType](#token-fetch-errors-have-proper-errorType)

### `maxMessageSize` property has been deprecated from IConnectionDetails and IDocumentDeltaConnection
`maxMessageSize` is redundant and will be removed soon. Please use the `serviceConfiguration.maxMessageSize` property instead.

### _createDataStoreWithProps and IFluidDataStoreChannel
ContainerRuntime._createDataStoreWithProps() is made consistent with the rest of API (same API on IContainerRuntimeBase interface, all other create methods to create data store) and returns now only IFluidRouter. IFluidDataStoreChannel is internal communication mechanism between ContainerRuntime and data stores and should be used only for this purpose, by data store authors. It is not a public interface that should be exposed by data stores.
While casting IFluidRouter objects returned by various data store creation APIs to IFluidDataStoreChannel would continue to work in this release, this is not supported and will be taken away in next releases due to upcoming work in GC & named component creation space.

### Deprecated `Loader._create` is removed
Removing API `Loader._create` from `@fluidframework/container-loader`, which was an interim replacement of the Loader constructor API change in version 0.28.
Use the Loader constructor with the `ILoaderProps` instead.

### Stop exporting internal class `CollabWindowTracker`
`CollabWindowTracker` is an internal implementation for `@fluidframework/container-loader` and should never been exported.

### base-host package removed
The `@fluidframework/base-host` package has been removed.  See the [quick-start guide](https://fluidframework.com/docs/start/quick-start/) for recommended hosting practices.

If you were using the `UpgradeManager` utility from this package, external access to Quorum proposals is planned to be deprecated and so this is no longer recommended.  To upgrade code, instead use the `Container` API `proposeCodeDetails`.

### Registers removed from sequence and merge-tree
The `@fluidframework/sequence` and `@fluidframework/merge-tree` packages provided cut/copy/paste functionalities that built on a register concept.  These functionalities were never fully implemented and have been removed.

### Token fetch errors have proper errorType
If the tokenFetcher provided by the host thrown an error, this error will be propagated through the code with errorType "fetchTokenError".
Previously, the errorType was either empty, or recently and incorrectly, "dataProcessingError".

## 0.50 Breaking changes
- [OpProcessingController removed](#opprocessingcontroller-removed)
- [Expose isDirty flag in the FluidContainer](#expose-isdirty-flag-in-the-fluidcontainer)
- [get-container API changed](#get-container-api-changed)
- [SharedCell serialization](#sharedcell-serialization)
- [Expose saved and dirty events in FluidContainer](#expose-saved-and-dirty-events-in-fluidcontainer)
- [Deprecated bindToContext in IFluidDataStoreChannel](#Deprecated-bindToContext-in-IFluidDataStoreChannel)

### OpProcessingController removed
OpProcessingController has been deprecated for very long time. It's being removed in this release.
Please use LoaderContainerTracker instead (see https://github.com/microsoft/FluidFramework/pull/7784 as an example of changes required)
If you can't make this transition, you can always copy implementation of LoaderContainerTracker to your repo and maintain it. That said, it has bugs and tests using it are easily broken but subtle changes in reconnection logic, as evident from PRs #7753, #7393)

### Expose isDirty flag in the FluidContainer
The `isDirty` flag is exposed onto the FluidContainer. The property is already exposed on the Container and it is just piped up to the FluidContainer.

### get-container API changed
The signature of methods `getTinyliciousContainer` and `getFRSContainer` exported from the `get-container` package has been changed to accomodate the new container create flow. Both methods now return a tuple of the container instance and container ID associated with it. The `documentId` parameter is ignored when a new container is requested. Client applications need to use the ID returned by the API.
The `get-container` API is widely used in multiple sample applications across the repository. All samples were refactored to reflect the change in the API. External samples consuming these methods should be updated accordingly.

### SharedCell serialization
`SharedCell` serialization format has changed. Values stored from previous versions will be broken.

### Expose saved and dirty events in FluidContainer
The `saved` and `dirty` container events are exposed onto the FluidContainer. The events are emitted on the Container already.

### Deprecated bindToContext in IFluidDataStoreChannel
bindToContext in IFluidDataStoreChannel has been deprecated. This should not be used to explicitly bind data stores. Root data stores will automatically be bound to container. Non-root data stores will be bound when their handles are stored in an already bound DDS.

## 0.49 Breaking changes
- [Deprecated dirty document events and property removed from ContainerRuntime](#deprecated-dirty-document-events-and-property-removed-from-containerruntime)
- [Removed deltaManager.ts from @fluidframework/container-loader export](#deltamanager-removed-from-fluid-framework-export)
- [Container class protected function resumeInternal made private](#resumeinternal-made-private)
- [url removed from ICreateBlobResponsee](#url-removed-from-ICreateBlobResponse)
- [encoding type change](#encoding-type-change)
- [IContainer.connectionState yields finer-grained ConnectionState values](#icontainerconnectionstate-yields-finer-grained-connectionstate-values)

### Deprecated dirty document events and property removed from ContainerRuntime
The `isDocumentDirty()` method, `"dirtyDocument"` and `"savedDocument"` events that were deprecated in 0.35 have now been removed.  For more information on replacements, see [DirtyDocument events and property](#DirtyDocument-events-and-property).

### DeltaManager removed from fluid-framework export
The `DeltaManager` class, the `IConnectionArgs` interface, the `IDeltaManagerInternalEvents` interface, and the `ReconnectedMode` enum have been removed from `@fluidframework/container-loader` package exports. Instead of `DeltaManager`, `IDeltaManager` should be used where appropriate.

### resumeInternal made private
The `protected` function `resumeInternal` under the class `Container` has been made `private`.

### `url` removed from ICreateBlobResponse
The unused `url` property of `ICreateBlobResponse` in `@fluidframework/protocol-definitions` has been removed

### `encoding` type change
The `encoding` property of `IBlob` in `@fluidframework/protocol-definitions` has changed type from `string` to `"utf-8" | "base64"` to match the only supported values.

## 0.48 Breaking changes
- [client-api package removed](#client-api-package-removed)
- [SignalManager removed from fluid-framework export](#signalmanager-removed-from-fluid-framework-export)
- [MockLogger removed from @fluidframework/test-runtime-utils](#mocklogger-removed-from-fluidframeworktest-runtime-utils)
- [IProxyLoader interface to be removed](#IProxyLoader-interface-to-be-removed)

### client-api package removed
The `@fluid-internal/client-api` package was deprecated in 0.20 and has now been removed.  Usage of this package should be replaced with direct usage of the `Loader`, `FluidDataStoreRuntime`, `ContainerRuntime`, and other supported functionality.

### SignalManager removed from fluid-framework export
The `SignalManager` and `Signaler` classes have been removed from the `@fluid-framework/fluid-static` and `fluid-framework` package exports and moved to the `@fluid-experimental/data-objects` package.  This is because of its experimental state and the intentional omission of experimental features from `fluid-framework`.  Users should instead import the classes from the `@fluid-experimental/data-objects` package.

### MockLogger removed from @fluidframework/test-runtime-utils
MockLogger is only used internally, so it's removed from @fluidframework/test-runtime-utils.

### IContainer.connectionState yields finer-grained ConnectionState values
The `ConnectionState` types have been updated to include a new state which previously was
encompassed by the `Disconnected` state. The new state is `EstablishingConnection` and indicates that the container is
attempting to connect to the ordering service, but is not yet connected.

Any logic based on the `Disconnected` state (e.g. checking the value of `IContainer.connectionState`)
should be updated depending on how you want to treat this new `EstablishingConnection` state.

Additionally, please note that the `Connecting` state is being renamed to `CatchingUp`.
`ConnectionState.Connecting` is marked as deprecated, please use `ConnectionState.CatchingUp` instead.
`ConnectionState.Connecting` will be removed in the following major release.

### IProxyLoader interface to be removed
The `IProxyLoader` interface has been deprecated in 0.48 and will be removed in an upcoming release.

## 0.47 Breaking changes
- [Property removed from IFluidDataStoreContext](#Property-removed-from-IFluidDataStoreContext)
- [Changes to IFluidDataStoreFactory](#Changes-to-IFluidDataStoreFactory)
- [FlushMode enum values renamed](#FlushMode-enum-values-renamed)
- [name removed from ContainerSchema](#name-removed-from-ContainerSchema)
- [Anonymous return types for container calls in client packages](#Anonymous-return-types-for-container-calls-in-client-packages)
- [createContainer and getContainer response objects properties renamed](#createContainer-and-getContainer-response-objects-properties-renamed)
- [tinylicious and azure clients createContainer now detached](#tinylicious-and-azure-clients-createContainer-now-detached)
- [container id is returned from new attach() and not exposed on the container](#container-id-is-returned-from-new-attach-and-not-exposed-on-the-container)
- [AzureClient initialization as a singular config](#AzureClient-initialization-as-a-singular-config)

### Property removed from IFluidDataStoreContext
- the `existing` property from `IFluidDataStoreContext` (and `FluidDataStoreContext`) has been removed.

### Changes to IFluidDataStoreFactory
- The `existing` parameter from the `instantiateDataStore` function is now mandatory to differentiate creating vs loading.

### `FlushMode` enum values renamed
`FlushMode` enum values from `@fluidframework/runtime-definitions` have ben renamed as following:
- `FlushMode.Manual` to `FlushMode.TurnBased`
- `FlushMode.Automatic` to `FlushMode.Immediate`

### `name` removed from ContainerSchema
The `name` property on the ContainerSchema was used for multi-container scenarios but has not materialized to be a useful schema property. The feedback has been negative to neutral so it is being removed before it becomes formalized. Support for multi-container scenarios, if any is required, will be addressed as a future change.

### Anonymous return types for container calls in client packages
`createContainer` and `getContainer` in `@fluidframework/azure-client` and `@fluidframework/tinylicious-client` will no longer return typed objects but instead will return an anonymous type. This provide the flexibility that comes with tuple deconstruction with the strong typing of property names.

```javascript
// `@fluidframework/azure-client`
createContainer(containerSchema: ContainerSchema): Promise<{
    container: FluidContainer;
    services: AzureContainerServices;
}>;
getContainer(id: string, containerSchema: ContainerSchema): Promise<{
    container: FluidContainer;
    services: AzureContainerServices;
}>;

// `@fluidframework/tinylicious-client`
createContainer(containerSchema: ContainerSchema): Promise<{
    container: FluidContainer;
    services: TinyliciousContainerServices;
}>;
getContainer(id: string, containerSchema: ContainerSchema): Promise<{
    container: FluidContainer;
    services: TinyliciousContainerServices;
}>;
```

### createContainer and getContainer response objects properties renamed
For all `*-client` packages `createContainer` and `getContainer` would return an object with `fluidContainer` and `containerServices`. These have been renamed to the following for brevity.

- fluidContainer => container
- containerServices => services

```javascript
// old
const { fluidContainer, containerServices } = client.getContainer(...);

// new
const { container, services } = client.getContainer(...);
```

### tinylicious and azure clients createContainer now detached
Creating a new container now requires and explicit attach step. All changes made in between container creation, and attaching, will be persisted as part of creation and guaranteed to always be available to users. This allows developers to initialize `initialObjects` with state before the container is connected to the service. It also enables draft creation modes.

```javascript
// old
const { fluidContainer } = client.createContainer(...);

// new
const { container } = client.createContainer(...);
const id = container.attach();
```

### container id is returned from new attach() and not exposed on the container
Because we now have an explicit attach flow, the container id is part of that flow as well. The id is returned from the `attach()` call.

```javascript
// old
const { fluidContainer } = client.createContainer(...);
const containerId = fluidContainer.id;

// new
const { container } = client.createContainer(...);
const containerId = container.attach();
```

### AzureClient initialization as a singular config
AzureClient now takes a singular config instead of multiple parameters. This enables easier scaling of config properties as we introduce new functionality.

```js
// old
const connectionConfig = {...};
const logger = new MyLogger();
const client = new AzureClient(connectionConfig, logger);

// new
const config = {
    connection: {...},
    logger: new MyLogger(...)
}
const client = new AzureClient(config);
```

## 0.46 Breaking changes
- [@fluid-experimental/fluid-framework package name changed](#fluid-experimentalfluid-framework-package-name-changed)
- [FrsClient has been renamed to AzureClient and moved out of experimental state](#FrsClient-has-been-renamed-to-AzureClient-and-moved-out-of-experimental-state)
- [documentId removed from IFluidDataStoreRuntime and IFluidDataStoreContext](#documentId-removed-from-IFluidDataStoreRuntime-and-IFluidDataStoreContext)
- [@fluid-experimental/tinylicious-client package name changed](#fluid-experimentaltinylicious-client-package-name-changed)
- [@fluid-experimental/fluid-static package name changed](#fluid-experimentalfluid-static-package-name-changed)
- [TinyliciousClient and AzureClient container API changed](#tinyliciousclient-and-azureclient-container-api-changed)

### `@fluid-experimental/fluid-framework` package name changed
The `@fluid-experimental/fluid-framework` package has been renamed to now be `fluid-framework`. The scope has been removed.


### FrsClient has been renamed to AzureClient and moved out of experimental state
The `@fluid-experimental/frs-client` package for connecting with the Azure Fluid Relay service has been renamed to now be `@fluidframework/azure-client`. This also comes with the following name changes for the exported classes and interfaces from the package:
- `FrsClient` -> `AzureClient`
- `FrsAudience` -> `AzureAudience`
- `IFrsAudience` -> `IAzureAudience`
- `FrsMember` -> `AzureMember`
- `FrsConnectionConfig` -> `AzureConnectionConfig`
- `FrsContainerConfig` -> `AzureContainerConfig`
- `FrsResources` -> `AzureResources`
- `FrsAzFunctionTokenProvider` -> `AzureFunctionTokenProvider`
- `FrsUrlResolver` -> `AzureUrlResolver`

### documentId removed from IFluidDataStoreRuntime and IFluidDataStoreContext
- `documentId` property is removed from IFluidDataStoreRuntime and IFluidDataStoreContext. It is a document level concept and is no longer exposed from data store level.

### `@fluid-experimental/tinylicious-client` package name changed
The `@fluid-experimental/tinylicious-client` package has been renamed to now be `@fluidframework/tinylicious-client`.

### `@fluid-experimental/fluid-static` package name changed
The `@fluid-experimental/fluid-static` package has been renamed to now be `@fluidframework/fluid-static`.

### TinyliciousClient and AzureClient container API changed

Tinylicious and Azure client API changed to comply with the new container creation flow. From now on,
the new container ID will be generated by the framework. In addition to that, the `AzureContainerConfig`
parameter's got decommissioned and the logger's moved to the client's constructor.

```ts
// Create a client using connection settings and an optional logger
const client = new AzureClient(connectionConfig, logger);
// Create a new container
const { fluidContainer, containerServices } = await client.createContainer(containerSchema);
// Retrieve the new container ID
const containerId = fluidContainer.id;
// Access the existing container
const { fluidContainer, containerServices }= await client.getContainer(containerId, containerSchema);
```

## 0.45 Breaking changes
- [Changes to local testing in insecure environments and associated bundle size increase](#changes-to-local-testing-in-insecure-environments-and-associated-bundle-size-increase)
- [Property removed from IFluidDataStoreRuntime](#Property-removed-from-IFluidDataStoreRuntime)
- [Changes to client-api Document](#changes-to-client-api-Document)
- [Changes to PureDataObject](#changes-to-PureDataObject)
- [Changes to DataObject](#changes-to-DataObject)
- [Changes to PureDataObjectFactory](#changes-to-PureDataObjectFactory)
- [webpack-fluid-loader package name changed](#webpack-fluid-loader-package-name-changed)
- [Loggers without tag support now deprecated in ContainerContext](#loggers-without-tag-support-now-deprecated-in-containercontext)
- [Creating new containers with Container.load is no longer supported](#Creating-new-containers-with-Containerload-is-no-longer-supported)
- [getHashedDocumentId is now async](#gethasheddocumentid-is-now-async)
- [ContainerErrorType.clientSessionExpiredError added](#ContainerErrorType.clientSessionExpiredError-added)

### Changes to local testing in insecure environments and associated bundle size increase
Previously the `@fluidframework/common-utils` package exposed a `setInsecureContextHashFn` function so users could set an override when testing locally in insecure environments because the `crypto.subtle` library is not available.  This is now done automatically as a fallback and the function is removed.  The fallback exists as a dynamic import of our equivalent Node platform implementation, and will show as a chunk named "FluidFramework-HashFallback" and be up to ~25KB parsed in size.  It will not be served when running normally in a modern browser.

### Property removed from IFluidDataStoreRuntime
- the `existing` property from `IFluidDataStoreRuntime` (and `FluidDataStoreRuntime`) has been removed. There is no need for this property in the class, as the flag can be supplied as a parameter to `FluidDataStoreRuntime.load` or to the constructor of `FluidDataStoreRuntime`. The `IFluidDataStoreFactory.instantiateDataStore` function has an `existing` parameter which can be supplied to the `FluidDataStoreRuntime` when the latter is created.

### Changes to client-api Document
- The `existing` property from the `Document` class in `@fluid-internal/client-api` has been removed. It can be assumed that the property would have always been `true`.

### Changes to PureDataObject
- The `initializeInternal` and the `finishInitialization` functions have a mandatory `existing` parameter to differentiate creating vs loading.

### Changes to DataObject
- The `initializeInternal` function has a mandatory `existing` parameter to differentiate creating vs loading.

### Changes to PureDataObjectFactory
- The `createDataObject` in `PureDataObjectFactory` has a mandatory `existing` parameter to differentiate creating vs loading.

### `webpack-fluid-loader` package name changed
The `webpack-fluid-loader` utility was previously available from a package named `@fluidframework/webpack-fluid-loader`.  However, since it is a tool and should not be used in production, it is now available under the tools scope `@fluid-tools/webpack-fluid-loader`.

### Loggers without tag support now deprecated in ContainerContext
The `logger` property of `ContainerContext` has been marked deprecated. Loggers passed to ContainerContext will need to support tagged events.

### Creating new containers with Container.load is no longer supported
- See [Creating new containers with Container.load has been deprecated](#Creating-new-containers-with-Containerload-has-been-deprecated)
- The `createOnLoad` flag to inside `IContainerLoadOptions` has been removed.
- `LegacyCreateOnLoadEnvironmentKey` from `@fluidframework/container-loader` has been removed.

### getHashedDocumentId is now async
`@fluidframework/odsp-driver`'s `getHashedDocumentId` function is now async to take advantage of shared hashing functionality.  It drops its dependency on the `sha.js` package as a result, which contributed ~37KB to the parsed size of the `odsp-driver` bundle.

### ContainerErrorType.clientSessionExpiredError added
We have session expiry for GC purposes. Once the session has expired, we want to throw this new clientSessionExpiredError to clear out any stale in-memory data that may still be on the container.

## 0.44 Breaking changes
- [Property removed from ContainerRuntime class](#Property-removed-from-the-ContainerRuntime-class)
- [attach() should only be called once](#attach-should-only-be-called-once)
- [Loader access in data stores is removed](#loader-access-in-data-stores-is-removed)

### Property removed from the ContainerRuntime class
- the `existing` property from `ContainerRuntime` has been removed. Inspecting this property in order to decide whether or not to perform initialization operations should be replaced with extending the `RuntimeFactoryHelper` abstract class from `@fluidframework/runtime-utils` and overriding `instantiateFirstTime` and `instantiateFromExisting`. Alternatively, any class implementing `IRuntimeFactory` can supply an `existing` parameter to the `instantiateRuntime` method.

### attach() should only be called once
`Container.attach()` will now throw if called more than once. Once called, it is responsible for retrying on retriable errors or closing the container on non-retriable errors.

### Loader access in data stores is removed
Following the deprecation warning [Loader in data stores deprecated](#loader-in-data-stores-deprecated), the associated APIs have now been removed.  In addition to the original deprecation notes, users will automatically have an `ILoader` available on the container scope object as the `ILoader` property if the container was created through a `Loader`.

## 0.43 Breaking changes

- [TinyliciousClient and FrsClient are no longer static](#TinyliciousClient-and-FrsClient-are-no-longer-static)
- [Routerlicious Driver DeltaStorageService constructor changed](#Routerlicious-Driver-DeltaStorageService-constructor-changed)
- [addGlobalAgentSchedulerAndLeaderElection removed](#addGlobalAgentSchedulerAndLeaderElection-removed)
- [Property removed from the Container class](#Property-removed-from-the-Container-class)
- [Creating new containers with Container.load has been deprecated](#Creating-new-containers-with-Containerload-has-been-deprecated)
- [Changes to client-api](#changes-to-client-api)

### TinyliciousClient and FrsClient are no longer static
`TinyliciousClient` and `FrsClient` global static properties are removed. Instead, object instantiation is now required.

### Property removed from the Container class
- the `existing` property from `Container` has been removed. The caller should differentiate on how the container has been created (`Container.load` vs `Container.createDetached`). See also [Creating new containers with Container.load has been deprecated](#Creating-new-containers-with-Containerload-has-been-deprecated).

### Routerlicious Driver DeltaStorageService constructor changed
`DeltaStorageService` from `@fluidframework/routerlicious-driver` now takes a `RestWrapper` as the second constructor parameter, rather than a TokenProvider.

### addGlobalAgentSchedulerAndLeaderElection removed
In 0.38, the `IContainerRuntimeOptions` option `addGlobalAgentSchedulerAndLeaderElection` was added (on by default), which could be explicitly disabled to remove the built-in `AgentScheduler` and leader election functionality.  This flag was turned off by default in 0.40.  In 0.43 the flag (and the functionality it enabled) has been removed.

See [AgentScheduler-related deprecations](#AgentScheduler-related-deprecations) for more information on this deprecation and back-compat support, as well as recommendations on how to migrate away from the built-in.

### Creating new containers with Container.load has been deprecated
- `Container.load` with inexistent files will fail instead of creating a new container. Going forward, please use `Container.createDetached` for this scenario.
- To enable the legacy scenario, set the `createOnLoad` flag to true inside `IContainerLoadOptions`. `Loader.request` and `Loader.resolve` will enable the legacy scenario if the `IClientDetails.environment` property inside `IRequest.headers` contains the string `enable-legacy-create-on-load` (see `LegacyCreateOnLoadEnvironmentKey` from `@fluidframework/container-loader`).

### Changes to client-api
- The `load` function from `document.ts` will fail the container does not exist. Going forward, please use the `create` function to handle this scenario.

## 0.42 Breaking changes

- [Package renames](#0.42-package-renames)
- [IContainerRuntime property removed](#IContainerRuntime-property-removed)
- [IContainerRuntimeEvents changes](#IContainerRuntimeEvents-changes)
- [Removed IParsedUrl interface, parseUrl, getSnapshotTreeFromSerializedContainer and convertProtocolAndAppSummaryToSnapshotTree api from export](#Removed-IParsedUrl-interface,-parseUrl,-getSnapshotTreeFromSerializedContainer-and-convertProtocolAndAppSummaryToSnapshotTree-api-from-export)

### 0.42 package renames

We have renamed some packages to better reflect their status. See the [npm package
scopes](https://github.com/microsoft/FluidFramework/wiki/npm-package-scopes) page in the wiki for more information about
the npm scopes.

- `@fluidframework/react-inputs` is renamed to `@fluid-experimental/react-inputs`
- `@fluidframework/react` is renamed to `@fluid-experimental/react`

### IContainerRuntimeEvents changes
- `fluidDataStoreInstantiated` has been removed from the interface and will no longer be emitted by the `ContainerRuntime`.

### IContainerRuntime property removed
- the `existing` property from `IContainerRuntime` has been removed.

### Removed IParsedUrl interface, parseUrl, getSnapshotTreeFromSerializedContainer and convertProtocolAndAppSummaryToSnapshotTree api from export
These interface and apis are not supposed to be used outside the package. So stop exposing them.

## 0.41 Breaking changes

- [Package renames](#0.41-package-renames)
- [LoaderHeader.version could not be null](#LoaderHeader.version-could-not-be-null)
- [Leadership API surface removed](#Leadership-API-surface-removed)
- [IContainerContext and Container storage API return type changed](#IContainerContext-and-Container-storage-API-return-type-changed)

### 0.41 package renames

We have renamed some packages to better reflect their status. See the [npm package
scopes](https://github.com/microsoft/FluidFramework/wiki/npm-package-scopes) page in the wiki for more information about
the npm scopes.

- `@fluidframework/last-edited-experimental` is renamed to `@fluid-experimental/last-edited`

### LoaderHeader.version could not be null
`LoaderHeader.version` in ILoader can not be null as we always load from existing snapshot in `container.load()`;

### Leadership API surface removed
In 0.38, the leadership API surface was deprecated, and in 0.40 it was turned off by default.  In 0.41 it has now been removed.  If you still require leadership functionality, you can use a `TaskSubscription` in combination with an `AgentScheduler`.

See [AgentScheduler-related deprecations](#AgentScheduler-related-deprecations) for more information on how to use `TaskSubscription` to migrate away from leadership election.

### IContainerContext and Container storage API return type changed
IContainerContext and Container now will always have storage even in Detached mode, so its return type has changed and undefined is removed.

## 0.40 Breaking changes

- [AgentScheduler removed by default](#AgentScheduler-removed-by-default)
- [ITelemetryProperties may be tagged for privacy purposes](#itelemetryproperties-may-be-tagged-for-privacy-purposes)
- [IContainerRuntimeDirtyable removed](#IContainerRuntimeDirtyable-removed)
- [Most RouterliciousDocumentServiceFactory params removed](#Most-RouterliciousDocumentServiceFactory-params-removed)
- [IErrorBase.sequenceNumber removed](#IErrorBase.sequenceNumber-removed)
- [IContainerContext.logger deprecated](#IContainerContext.logger-deprecated)

### AgentScheduler removed by default
In 0.38, the `IContainerRuntimeOptions` option `addGlobalAgentSchedulerAndLeaderElection` was added (on by default), which could be explicitly disabled to remove the built-in `AgentScheduler` and leader election functionality.  This flag has now been turned off by default.  If you still depend on this functionality, you can re-enable it by setting the flag to `true`, though this option will be removed in a future release.

See [AgentScheduler-related deprecations](#AgentScheduler-related-deprecations) for more information on this deprecation and back-compat support, as well as recommendations on how to migrate away from the built-in.

### ITelemetryProperties may be tagged for privacy purposes
Telemetry properties on logs *can (but are **not** yet required to)* now be tagged. This is **not** a breaking change in 0.40, but users are strongly encouraged to add support for tags (see [UPCOMING.md](./UPCOMING.md) for more details).

_\[edit\]_

This actually was a breaking change in 0.40, in that the type of the `event` parameter of `ITelemetryBaseLogger.send` changed to
a more inclusive type which needs to be accounted for in implementations.  However, in releases 0.40 through 0.44,
_no tagged events are sent to any ITelemetryBaseLogger by the Fluid Framework_.  We are preparing to do so
soon, and will include an entry in BREAKING.md when we do.

### IContainerRuntimeDirtyable removed
The `IContainerRuntimeDirtyable` interface and `isMessageDirtyable()` method were deprecated in release 0.38.  They have now been removed in 0.40.  Please refer to the breaking change notice in 0.38 for instructions on migrating away from use of this interface.

### Most RouterliciousDocumentServiceFactory params removed

The `RouterliciousDocumentServiceFactory` constructor no longer accepts the following params: `useDocumentService2`, `disableCache`, `historianApi`, `gitCache`, and `credentials`. Please open an issue if these flags/params were important to your project so that they can be re-incorporated into the upcoming `IRouterliciousDriverPolicies` param.

### IErrorBase.sequenceNumber removed
This field was used for logging and this was probably not the right abstraction for it to live in.
But practically speaking, the only places it was set have been updated to log not just sequenceNumber
but a large number of useful properties off the offending message, via `CreateProcessingError`.

### IContainerContext.logger deprecated
Use `IContainerContext.taggedLogger` instead if present. If it's missing and you must use `logger`,
be sure to handle tagged data before sending events to it.
`logger` won't be removed for a very long time since old loaders could remain in production for quite some time.

## 0.39 Breaking changes
- [connect event removed from Container](#connect-event-removed-from-Container)
- [LoaderHeader.pause](#LoaderHeader.pause)
- [ODSP driver definitions](#ODSP-driver-definitions)
- [ITelemetryLogger Remove redundant methods](#ITelemetryLogger-Remove-redundant-methods)
- [fileOverwrittenInStorage](#fileOverwrittenInStorage)
- [absolutePath use in IFluidHandle is deprecated](#absolutepath-use-in-ifluidhandle-is-deprecated)

### connect event removed from Container
The `"connect"` event would previously fire on the `Container` after `connect_document_success` was received from the server (which likely happens before the client's own join message is processed).  This event does not represent a safe-to-use state, and has been removed.  To detect when the `Container` is fully connected, the `"connected"` event should be used instead.

### LoaderHeader.pause
LoaderHeader.pause has been removed. instead of
```typescript
[LoaderHeader.pause]: true
```
use
```typescript
[LoaderHeader.loadMode]: { deltaConnection: "none" }
```

### ODSP driver definitions
A lot of definitions have been moved from @fluidframework/odsp-driver to @fluidframework/odsp-driver-definitions. This change is required in preparation for driver to be dynamically loaded by host.
This new package contains all the dependencies of ODSP driver factory (like HostStoragePolicy, IPersistedCache, TokenFetcher) as well as outputs (OdspErrorType).
@fluidframework/odsp-driver will continue to have defintions for non-factory functionality (like URI resolver, helper functionality to deal with sharing links, URI parsing, etc.)

### ITelemetryLogger Remove redundant methods
Remove deprecated `shipAssert` `debugAssert` `logException` `logGenericError` in favor of `sendErrorEvent` as they provide the same behavior and semantics as `sendErrorEvent`and in general are relatively unused. These methods were deprecated in 0.36.

### fileOverwrittenInStorage
Please use `DriverErrorType.fileOverwrittenInStorage` instead of `OdspErrorType.epochVersionMismatch`

### absolutePath use in IFluidHandle is deprecated
Rather than retrieving the absolute path, ostensibly to be stored, one should instead store the handle itself. To load, first retrieve the handle and then call `get` on it to get the actual object. Note that it is assumed that the container is responsible both for mapping an external URI to an internal object and for requesting resolved objects with any remaining tail of the external URI. For example, if a container has some map that maps `/a --> <some handle>`, then a request like `request(/a/b/c)` should flow like `request(/a/b/c) --> <some handle> --> <object> -->  request(/b/c)`.

## 0.38 Breaking changes
- [IPersistedCache changes](#IPersistedCache-changes)
- [ODSP Driver Type Unification](#ODSP-Driver-Type-Unification)
- [ODSP Driver url resolver for share link parameter consolidation](#ODSP-Driver-url-resolver-for-share-link-parameter-consolidation)
- [AgentScheduler-related deprecations](#AgentScheduler-related-deprecations)
- [Removed containerUrl from IContainerLoadOptions and IContainerConfig](#Removed-containerUrl-from-IContainerLoadOptions-and-IContainerConfig)

### IPersistedCache changes
IPersistedCache implementation no longer needs to implement updateUsage() method (removed form interface).
Same goes for sequence number / maxOpCount arguments.
put() changed from fire-and-forget to promise, with intention of returning write errors back to caller. Driver could use this information to stop recording any data about given file if driver needs to follow all-or-nothing strategy in regards to info about a file.
Please note that format of data stored by driver changed. It will ignore cache entries recorded by previous versions of driver.

## ODSP Driver Type Unification
This change reuses existing contracts to reduce redundancy improve consistency.

The breaking portion of this change does rename some parameters to some helper functions, but the change are purely mechanical. In most cases you will likely find you are pulling properties off an object individually to pass them as params, whereas now you can just pass the object itself.

``` typescript
// before:
createOdspUrl(
    siteUrl,
    driveId,
    fileId,
    "/",
    containerPackageName,
);
fetchJoinSession(
    driveId,
    itemId,
    siteUrl,
    ...
)
getFileLink(
    getToken,
    something.driveId,
    something.itemId,
    something.siteUrl,
    ...
)

// After:
createOdspUrl({
    siteUrl,
    driveId,
    itemId: fileId,
    dataStorePath: "/",
    containerPackageName,
});

fetchJoinSession(
    {driveId, itemId, siteUrl},
    ...
);

getFileLink(
    getToken,
    something,
    ...
)
```

## ODSP Driver url resolver for share link parameter consolidation
OdspDriverUrlResolverForShareLink constructor signature has been changed to simplify instance
creation in case resolver is not supposed to generate share link. Instead of separately specifying
constructor parameters that are used to fetch share link there will be single parameter in shape of
object that consolidates all properties that are necessary to get share link.

``` typescript
// before:
new OdspDriverUrlResolverForShareLink(
    tokenFetcher,
    identityType,
    logger,
    appName,
);

// After:
new OdspDriverUrlResolverForShareLink(
    { tokenFetcher, identityType },
    logger,
    appName,
);
```

### AgentScheduler-related deprecations
`AgentScheduler` is currently a built-in part of `ContainerRuntime`, but will be removed in an upcoming release.  Correspondingly, the API surface of `ContainerRuntime` that relates to or relies on the `AgentScheduler` is deprecated.

#### Leadership deprecation
A `.leader` property and `"leader"`/`"notleader"` events are currently exposed on the `ContainerRuntime`, `FluidDataStoreContext`, and `FluidDataStoreRuntime`.  These are deprecated and will be removed in an upcoming release.

A `TaskSubscription` has been added to the `@fluidframework/agent-scheduler` package which can be used in conjunction with an `AgentScheduler` to get equivalent API surface:

```typescript
const leadershipTaskSubscription = new TaskSubscription(agentScheduler, "leader");
if (leadershipTaskSubscription.haveTask()) {
    // client is the leader
}
leadershipTaskSubscription.on("gotTask", () => {
    // client just became leader
});
leadershipTaskSubscription.on("lostTask", () => {
    // client is no longer leader
});
```

The `AgentScheduler` can be one of your choosing, or the built-in `AgentScheduler` can be retrieved for this purpose using `ContainerRuntime.getRootDataStore()` (however, as noted above this will be removed in an upcoming release):

```typescript
const agentScheduler = await requestFluidObject<IAgentScheduler>(
    await containerRuntime.getRootDataStore("_scheduler"),
    "",
);
```

#### IContainerRuntimeDirtyable deprecation
The `IContainerRuntimeDirtyable` interface provides the `isMessageDirtyable()` method, for use with last-edited functionality.  This is only used to differentiate messages for the built-in `AgentScheduler`.  With the deprecation of the `AgentScheduler`, this interface and method are no longer necessary and so are deprecated and will be removed in an upcoming release.  From the `ContainerRuntime`'s perspective all messages are considered dirtyable with this change.

If you continue to use the built-in `AgentScheduler` and want to replicate this filtering in your last-edited behavior, you can use the following in your `shouldDiscardMessage()` check:

```typescript
import { ContainerMessageType } from "@fluidframework/container-runtime";
import { IEnvelope, InboundAttachMessage } from "@fluidframework/runtime-definitions";

// In shouldDiscardMessage()...
if (type === ContainerMessageType.Attach) {
    const attachMessage = contents as InboundAttachMessage;
    if (attachMessage.id === "_scheduler") {
        return true;
    }
} else if (type === ContainerMessageType.FluidDataStoreOp) {
    const envelope = contents as IEnvelope;
    if (envelope.address === "_scheduler") {
        return true;
    }
}
// Otherwise, proceed with other discard logic...
```

#### Deprecation of AgentScheduler in the container registry and instantiation of the _scheduler
Finally, the automatic addition to the registry and creation of the `AgentScheduler` with ID `_scheduler` is deprecated and will also be removed in an upcoming release.  To prepare for this, you can proactively opt-out of the built-in by turning off the `IContainerRuntimeOptions` option `addGlobalAgentSchedulerAndLeaderElection` in your calls to `Container.load` or in the constructor of your `BaseContainerRuntimeFactory` or `ContainerRuntimeFactoryWithDefaultDataStore`.

For backwards compat with documents created prior to this change, you'll need to ensure the `AgentSchedulerFactory.registryEntry` is present in the container registry.  You can add it explicitly in your calls to `Container.load` or in the constructor of your `BaseContainerRuntimeFactory` or `ContainerRuntimeFactoryWithDefaultDataStore`.  The examples below show how to opt-out of the built-in while maintaining backward-compat with documents that were created with a built-in `AgentScheduler`.

```typescript
const runtime = await ContainerRuntime.load(
    context,
    [
        // Any other registry entries...
        AgentSchedulerFactory.registryEntry,
    ],
    requestHandler,
    // Opt-out of adding the AgentScheduler
    { addGlobalAgentSchedulerAndLeaderElection: false },
    scope);
```

```typescript
const SomeContainerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    DefaultFactory,
    new Map([
        // Any other registry entries...
        AgentSchedulerFactory.registryEntry,
    ]),
    providerEntries,
    requestHandlers,
    // Opt-out of adding the AgentScheduler
    { addGlobalAgentSchedulerAndLeaderElection: false },
);
```

If you use `AgentScheduler` functionality, it is recommended to instantiate this as a normal (non-root) data store (probably on your root data object).  But if you are not yet ready to migrate away from the root data store, you can instantiate it yourself on new containers (you should do this while the container is still detached):

```typescript
if (!context.existing) {
    await runtime.createRootDataStore(AgentSchedulerFactory.type, "_scheduler");
}
```

The option will be turned off by default in an upcoming release before being turned off permanently, so it is recommended to make these updates proactively.

### Removed containerUrl from IContainerLoadOptions and IContainerConfig
Removed containerUrl from IContainerLoadOptions and IContainerConfig. This is no longer needed to route request.

## 0.37 Breaking changes

-   [OpProcessingController marked for deprecation](#opprocessingcontroller-marked-for-deprecation)
-   [Loader in data stores deprecated](#Loader-in-data-stores-deprecated)
-   [TelemetryLogger Properties Format](#TelemetryLogger-Properties-Format)
-   [IContainerRuntimeOptions Format Change](#IContainerRuntimeOptions-Format-Change)
-   [AgentScheduler moves and renames](#AgentScheduler-moves-and-renames)

### OpProcessingController marked for deprecation

`OpProcessingController` is marked for deprecation and we be removed in 0.38.
`LoaderContainerTracker` is the replacement with better tracking. The API differs from `OpProcessingController` in the following ways:

-   Loader is added for tracking and any Container created/loaded will be automatically tracked
-   The op control APIs accept Container instead of DeltaManager

### Loader in data stores deprecated

The `loader` property on the `IContainerRuntime`, `IFluidDataStoreRuntime`, and `IFluidDataStoreContext` interfaces is now deprecated and will be removed in an upcoming release. Data store objects will no longer have access to an `ILoader` by default. To replicate the same behavior, existing users can make the `ILoader` used to create a `Container` available on the `scope` property of these interfaces instead by setting the `provideScopeLoader` `ILoaderOptions` flag when creating the loader.

```typescript
const loader = new Loader({
    urlResolver,
    documentServiceFactory,
    codeLoader,
    options: { provideScopeLoader: true },
});
```

```typescript
const loader: ILoader | undefined = this.context.scope.ILoader;
```

### TelemetryLogger Properties Format

The TelemetryLogger's properties format has been updated to support error only properties. This includes: `ChildLogger`, `MultiSinkLogger`,`DebugLogger`.
The previous format was just a property bag:
`ChildLogger.create(logger, undefined, { someProperty: uuid() });`
Whereas now it has nested property bags for error categories including `all` and `error`:
`ChildLogger.create(logger, undefined, {all:{ someProperty: uuid() }});`

### IContainerRuntimeOptions Format Change

The runtime options passed into `ContainerRuntime` have been subdivided into nested objects, because all of them fall under two categories currently:

-   `summaryOptions` - contains all summary/summarizer related options
    -   `generateSummaries`
    -   `initialSummarizerDelayMs`
    -   `summaryConfigOverrides`
    -   `disableIsolatedChannels`
-   `gcOptions` - contains all Garbage Collection related options
    -   `disableGC`
    -   `gcAllowed` (new)
    -   `runFullGC`

For a few versions we will keep supporting the old format, but the typings have already been updated.

### AgentScheduler moves and renames

`IAgentScheduler` and `IProvideAgentScheduler` have been moved to the `@fluidframework/agent-scheduler` package, and `taskSchedulerId` has been renamed to `agentSchedulerId`.

## 0.36 Breaking changes

-   [Some `ILoader` APIs moved to `IHostLoader`](#Some-ILoader-APIs-moved-to-IHostLoader)
-   [TaskManager removed](#TaskManager-removed)
-   [ContainerRuntime registerTasks removed](#ContainerRuntime-registerTasks-removed)
-   [getRootDataStore](#getRootDataStore)
-   [Share link generation no longer exposed externally](#Share-link-generation-no-longer-exposed-externally)
-   [ITelemetryLogger redundant method deprecation](#ITelemetryLogger-redundant-method-deprecation)

### Some `ILoader` APIs moved to `IHostLoader`

The `createDetachedContainer` and `rehydrateDetachedContainerFromSnapshot` APIs are removed from the `ILoader` interface, and have been moved to the new `IHostLoader` interface. The `Loader` class now implements `IHostLoader` instead, and consumers who need these methods should operate on an `IHostLoader` instead of an `ILoader`, such as by creating a `Loader`.

### TaskManager removed

The `TaskManager` has been removed, as well as methods to access it (e.g. the `.taskManager` member on `DataObject`). The `AgentScheduler` should be used instead for the time being and can be accessed via a request on the `ContainerRuntime` (e.g. `await this.context.containerRuntime.request({ url: "/_scheduler" })`), though we expect this will also be deprecated and removed in a future release when an alternative is made available (see #4413).

### ContainerRuntime registerTasks removed

The `registerTasks` method has been removed from `ContainerRuntime`. The `AgentScheduler` should be used instead for task scheduling.

### getRootDataStore

IContainerRuntime.getRootDataStore() used to have a backdoor allowing accessing any store, including non-root stores. This back door is removed - you can only access root data stores using this API.

### Share link generation no longer exposed externally

Share link generation implementation has been refactored to remove options for generating share links of various kinds.
Method for generating share link is no longer exported.
ShareLinkTokenFetchOptions has been removed and OdspDriverUrlResolverForShareLink constructor has been changed to accept tokenFetcher parameter which will pass OdspResourceTokenFetchOptions instead of ShareLin kTokenFetchOptions.

### ITelemetryLogger redundant method deprecation

Deprecate `shipAssert` `debugAssert` `logException` `logGenericError` in favor of `sendErrorEvent` as they provide the same behavior and semantics as `sendErrorEvent`and in general are relatively unused.

## 0.35 Breaking changes

-   [Removed some api implementations from odsp driver](#Removed-some-api-implemenations-from-odsp-driver)
-   [get-tinylicious-container and get-session-storage-container moved](#get-tinylicious-container-and-get-session-storage-container-moved)
-   [Moved parseAuthErrorClaims from @fluidframework/odsp-driver to @fluidframework/odsp-doclib-utils](#Moved-parseAuthErrorClaims-from-@fluidframework/odsp-driver-to-@fluidframework/odsp-doclib-utils)
-   [Refactored token fetcher types in odsp-driver](#refactored-token-fetcher-types-in-odsp-driver)
-   [DeltaManager `readonly` and `readOnlyPermissions` properties deprecated](#DeltaManager-`readonly`-and-`readOnlyPermissions`-properties-deprecated)
-   [DirtyDocument events and property](#DirtyDocument-events-and-property)
-   [Removed `createDocumentService` and `createDocumentService2` from r11s driver](#Removed-`createDocumentService`-and-`createDocumentService2`-from-r11s-driver)

### Removed-some-api-implementations-from-odsp-driver

Removed `authorizedFetchWithRetry`, `AuthorizedRequestTokenPolicy`, `AuthorizedFetchProps`, `asyncWithCache`, `asyncWithRetry`,
`fetchWithRetry` implementation from odspdriver.

### get-tinylicious-container and get-session-storage-container moved

The functionality from the packages `@fluidframework/get-tinylicious-container` and `@fluidframework/get-session-storage-container` has been moved to the package `@fluid-experimental/get-container`.

### Moved parseAuthErrorClaims from @fluidframework/odsp-driver to @fluidframework/odsp-doclib-utils

Moved `parseAuthErrorClaims` from `@fluidframework/odsp-driver` to `@fluidframework/odsp-doclib-utils`

### Refactored token fetcher types in odsp-driver

Streamlined interfaces and types used to facilitate access tokens needed by odsp-driver to call ODSP implementation of Fluid services.
Added support for passing siteUrl when fetching token that is used to establish co-authoring session for Fluid content stored in ODSP file which is hosted in external tenant. This token is used by ODSP ordering service implementation (aka ODSP Push service).

### DeltaManager `readonly` and `readOnlyPermissions` properties deprecated

`DeltaManager.readonly`/`Container.readonly` and `DeltaManager.readOnlyPermissions`/`Container.readOnlyPermissions` have been deprecated. Please use `DeltaManager.readOnlyInfo`/`Container.readOnlyInfo` instead, which exposes the same information.

### DirtyDocument events and property

The following 3 names have been deprecated - please use new names:
"dirtyDocument" event -> "dirty" event
"savedDocument" event -> "saved" event
isDocumentDirty property -> isDirty property

### Removed `createDocumentService` and `createDocumentService2` from r11s driver

Removed the deprecated methods `createDocumentService` and `createDocumentService2`. Please use `DocumentServiceFactory.createDocumentService` instead.

## 0.34 Breaking changes

-   [Aqueduct writeBlob() and BlobHandle implementation removed](#Aqueduct-writeBlob-and-BlobHandle-implementation-removed)
-   [Connected events raised on registration](#Connected-events-raised-on-registration)

### Aqueduct writeBlob() and BlobHandle implementation removed

`writeBlob()` and `BlobHandle` have been removed from aqueduct. Please use `FluidDataStoreRuntime.uploadBlob()` or `ContainerRuntime.uploadBlob()` instead.

### Connected events raised on registration

Connected / disconnected listeners are called on registration.
Please see [Connectivity events](packages/loader/container-loader/README.md#Connectivity-events) section of Loader readme.md for more details

## 0.33 Breaking changes

-   [Normalizing enum ContainerErrorType](#normalizing-enum-containererrortype)
-   [Map and Directory typing changes from enabling strictNullCheck](#map-and-directory-typing-changes-from-enabling-strictNullCheck)
-   [MergeTree's ReferencePosition.getTileLabels and ReferencePosition.getRangeLabels() return undefined if it doesn't exist](#mergetree-referenceposition-gettilelabels-getrangelabels-changes)
-   [Containers from Loader.request() are now cached by default](<#Containers-from-Loader.request()-are-now-cached-by-default>)

### Normalizing enum ContainerErrorType

In an effort to clarify error categorization, a name and value in this enumeration were changed.

### Map and Directory typing changes from enabling strictNullCheck

Typescript compile options `strictNullCheck` is enabled for the `@fluidframework/map` package. Some of the API signature is updated to include possibility of `undefined` and `null`, which can cause new typescript compile error when upgrading. Existing code may need to update to handle the possiblity of `undefined` or `null.

### MergeTree ReferencePosition getTileLabels getRangeLabels changes

This includes LocalReference and Marker. getTileLabels and getRangeLabels methods will return undefined instead of creating an empty if the properties for tile labels and range labels is not set.

### Containers from Loader.request() are now cached by default

Some loader request header options that previously prevented caching (`pause: true` and `reconnect: false`) no longer do. Callers must now explicitly spcify `cache: false` in the request header to prevent caching of the returned container. Containers are evicted from the cache in their `closed` event, and closed containers that are requested are not cached.

## 0.32 Breaking changes

-   [Node version 12.17 required](#Node-version-update)
-   [getAttachSnapshot removed IFluidDataStoreChannel](#getAttachSnapshot-removed-from-IFluidDataStoreChannel)
-   [resolveDataStore replaced](#resolveDataStore-replaced)

### Node version updated to 12.17

Due to changes in server packages and introduction of AsyncLocalStorage module which requires Node version 12.17 or above, you will need to update Node version to 12.17 or above.

### getAttachSnapshot removed from IFluidDataStoreChannel

`getAttachSnapshot()` has been removed from `IFluidDataStoreChannel`. It is replaced by `getAttachSummary()`.

### resolveDataStore replaced

The resolveDataStore method manually exported by the ODSP resolver has been replaced with checkUrl() from the same package.

## 0.30 Breaking Changes

-   [Branching removed](#Branching-removed)
-   [removeAllEntriesForDocId api name and signature change](#removeAllEntriesForDocId-api-name-and-signature-change)
-   [snapshot removed from IChannel and ISharedObject](#snapshot-removed-from-IChannel-and-ISharedObject)

### Branching removed

The branching feature has been removed. This includes all related members, methods, etc. such as `parentBranch`, `branchId`, `branch()`, etc.

### removeAllEntriesForDocId api name and signature change

`removeAllEntriesForDocId` api renamed to `removeEntries`. Now it takes `IFileEntry` as argument instead of just docId.

### snapshot removed from IChannel and ISharedObject

`snapshot` has been removed from `IChannel` and `ISharedObject`. It is replaced by `summarize` which should be used to get a summary of the channel / shared object.

## 0.29 Breaking Changes

-   [OdspDriverUrlResolver2 renamed to OdspDriverUrlResolverForShareLink](#OdspDriverUrlResolver2-renamed-to-OdspDriverUrlResolverForShareLink)
-   [removeAllEntriesForDocId api in host storage changed](#removeAllEntriesForDocId-api-in-host-storage-changed)
-   [IContainerRuntimeBase.IProvideFluidDataStoreRegistry](#IContainerRuntimeBase.IProvideFluidDataStoreRegistry)
-   [\_createDataStoreWithProps returns IFluidRouter](#_createDataStoreWithProps-returns-IFluidRouter)
-   [FluidDataStoreRuntime.registerRequestHandler deprecated](#FluidDataStoreRuntime.registerRequestHandler-deprecated)
-   [snapshot removed from IFluidDataStoreRuntime](#snapshot-removed-from-IFluidDataStoreRuntime)
-   [getAttachSnapshot deprecated in IFluidDataStoreChannel](#getAttachSnapshot-deprecated-in-IFluidDataStoreChannel)

### OdspDriverUrlResolver2 renamed to OdspDriverUrlResolverForShareLink

`OdspDriverUrlResolver2` renamed to `OdspDriverUrlResolverForShareLink`

### removeAllEntriesForDocId api in host storage changed

`removeAllEntriesForDocId` api in host storage is now an async api.

### IContainerRuntimeBase.IProvideFluidDataStoreRegistry

`IProvideFluidDataStoreRegistry` implementation moved from IContainerRuntimeBase to IContainerRuntime. Data stores and objects should not have access to global state in container.
`IProvideFluidDataStoreRegistry` is removed from IFluidDataStoreChannel - it has not been implemented there for a while (it moved to context).

### \_createDataStoreWithProps returns IFluidRouter

`IContainerRuntimeBase._createDataStoreWithProps` returns IFluidRouter instead of IFluidDataStoreChannel. This is done to be consistent with other APIs create data stores, and ensure we do not return internal interfaces. This likely to expose areas where IFluidDataStoreChannel.bindToContext() was called manually on data store. Such usage should be re-evaluate - lifetime management should be left up to runtime, storage of any handle form data store in attached DDS will result in automatic attachment of data store (and all of its objects) to container. If absolutely needed, and only for staging, casting can be done to implement old behavior.

### FluidDataStoreRuntime.registerRequestHandler deprecated

Please use mixinRequestHandler() as a way to create custom data store runtime factory/object and append request handling to existing implementation.

### snapshot removed from IFluidDataStoreRuntime

`snapshot` has been removed from `IFluidDataStoreRuntime`.

### getAttachSnapshot deprecated in IFluidDataStoreChannel

`getAttachSnapshot()` has been deprecated in `IFluidDataStoreChannel`. It is replaced by `getAttachSummary()`.

## 0.28 Breaking Changes

-   [FileName should contain extension for ODSP driver create new path](#FileName-should-contain-extension-for-ODSP-driver-create-new-path)
-   [ODSP Driver IPersistedCache changes](#ODSP-Driver-IPersistedCache-Changes)
-   [IFluidPackage Changes](#IFluidPackage-Changes)
-   [DataObject changes](#DataObject-changes)
-   [RequestParser](#RequestParser)
-   [IFluidLodable.url is removed](#IFluidLodable.url-is-removed)
-   [Loader Constructor Changes](#Loader-Constructor-Changes)
-   [Moving DriverHeader and merge with CreateNewHeader](#moving-driverheader-and-merge-with-createnewheader)
-   [ODSP status codes moved from odsp-driver to odsp-doclib-utils](#ODSP-status-codes-moved-modules-from-odsp-driver-to-odsp-doclib-utils)

### FileName should contain extension for ODSP driver create new path

Now the ODSP driver expects file extension in the file name while creating a new detached container.

### ODSP Driver IPersistedCache-Changes

Added api `removeAllEntriesForDocId` which allows removal of all entries for a given document id. Also the schema for entries stored inside odsp `IPersistedCache` has changed.
It now stores/expect values as `IPersistedCacheValueWithEpoch`. So host needs to clear its cached entries in this version.

### IFluidPackage Changes

-   Moving IFluidPackage and IFluidCodeDetails from "@fluidframework/container-definitions" to '@fluidframework/core-interfaces'
-   Remove npm specific IPackage interface
-   Simplify the IFluidPackage by removing browser and npm specific properties
-   Add new interface IFluidBrowserPackage, and isFluidBrowserPackage which defines browser specific properties
-   Added resolveFluidPackageEnvironment helper for resolving a package environment

### DataObject changes

DataObject are now always created when Data Store is created. Full initialization for existing objects (in file) continues to happen to be on demand, i.e. when request() is processed. Full DataObject initialization does happen for newly created (detached) DataObjects.
The impact of that change is that all changed objects would get loaded by summarizer container, but would not get initialized. Before this change, summarizer would not be loading any DataObjects.
This change

1. Ensures that initial summary generated for when data store attaches to container has fully initialized object, with all DDSes created. Before this change this initial snapshot was empty in most cases.
2. Allows DataObjects to modify FluidDataStoreRuntime behavior before it gets registered and used by the rest of the system, including setting various hooks.

But it also puts more constraints on DataObject - its constructor should be light and not do any expensive work (all such work should be done in corresponding initialize methods), or access any data store runtime functionality that requires fully initialized runtime (like loading DDSes will not work in this state)

### RequestParser

RequestParser's ctor is made protected. Please replace this code

```
    const a = new RequestParser(request);
```

with this one:

```
    const a = RequestParser.create(request);
```

### IFluidLodable.url is removed

`url` property is removed. If you need a path to an object (in a container), you can use IFluidLoadable.handle.absolutePath instead.

### Loader Constructor Changes

The loader constructor has changed to now take a props object, rather than a series of paramaters. This should make it easier to construct loaders as the optional services can be easily excluded.

Before:

```typescript
const loader = new Loader(
    urlResolver,
    documentServiceFactory,
    codeLoader,
    { blockUpdateMarkers: true },
    {},
    new Map()
);
```

After:

```typescript
const loader = new Loader({
    urlResolver,
    documentServiceFactory,
    codeLoader,
});
```

if for some reason this change causes you problems, we've added a deprecated `Loader._create` method that has the same parameters as the previous constructor which can be used in the interim.

### Moving DriverHeader and merge with CreateNewHeader

Compile time only API breaking change between runtime and driver. Only impacts driver implementer.
No back-compat or mix version impact.

DriverHeader is a driver concept, so move from core-interface to driver-definitions. CreateNewHeader is also a kind of driver header, merged it into DriverHeader.

### ODSP status codes moved modules from odsp-driver to odsp-doclib-utils

Error/status codes like `offlineFetchFailureStatusCode` which used to be imported like `import { offlineFetchFailureStatusCode } from '@fluidframework/@odsp-driver';` have been moved to `odspErrorUtils.ts` in `odsp-doclib-utils`.

## 0.27 Breaking Changes

-   [Local Web Host Removed](#Local-Web-Host-Removed)

### Local Web Host Removed

Local Web host is removed. Users who are using the local web host can use examples/utils/get-session-storage-container which provides the same functionality with the detached container flow.

## 0.25 Breaking Changes

-   [External Component Loader and IComponentDefaultFactoryName removed](#External-Component-Loader-and-IComponentDefaultFactoryName-removed)
-   [MockFluidDataStoreRuntime api rename](#MockFluidDataStoreRuntime-api-rename)
-   [Local Web Host API change](#Local-Web-Host-API-change)
-   [Container runtime event changes](#Container-runtime-event-changes)
-   [Component is removed from telemetry event names](#Component-is-removed-from-telemetry-event-names)
-   [IComponentContextLegacy is removed](#IComponentContextLegacy-is-removed)
-   [~~IContainerRuntimeBase.\_createDataStoreWithProps() is removed~~](#IContainerRuntimeBase._createDataStoreWithProps-is-removed)
-   [\_createDataStore() APIs are removed](#_createDataStore-APIs-are-removed)
-   [createDataStoreWithRealizationFn() APIs are removed](<#createDataStoreWithRealizationFn()-APIs-are-removed>)
-   [getDataStore() APIs is removed](<#getDataStore()-APIs-is-removed>)
-   [Package Renames](#package-renames)
-   [IComponent and IComponent Interfaces Removed](#IComponent-and-IComponent-Interfaces-Removed)
-   [@fluidframework/odsp-utils - Minor renames and signature changes](#odsp-utils-Changes)
-   [LastEditedTrackerComponent renamed to LastEditedTrackerDataObject](#lasteditedtrackercomponent-renamed)
-   [ComponentProvider renamed to FluidObjectProvider in @fluidframework/synthesize](#componentProvider-renamed-to-fluidobjectPpovider)

### External Component Loader and IComponentDefaultFactoryName removed

The @fluidframework/external-component-loader package has been removed from the repo. In addition to this, the IFluidExportDefaultFactoryName and the corresponding IProvideFluidExportDefaultFactoryName interfaces have also been dropped.

### MockFluidDataStoreRuntime api rename

Runtime Test Utils's MockFluidDataStoreRuntime now has "requestDataStore" instead of "requestComponent"

### Local Web Host API change

The renderDefaultComponent function has been updated to be renderDefaultFluidObject

### Container runtime event changes

Container runtime now emits the event "fluidDataStoreInstantiated" instead of "componentInstantiated"

### Component is removed from telemetry event names

The following telemetry event names have been updated to drop references to the term component:

ComponentRuntimeDisposeError -> ChannelDisposeError
ComponentContextDisposeError -> FluidDataStoreContextDisposeError
SignalComponentNotFound -> SignalFluidDataStoreNotFound

### IComponentContextLegacy is removed

Deprecated in 0.18, removed.

### IContainerRuntimeBase.\_createDataStoreWithProps is removed

**Note: This change has been reverted for 0.25 and will be pushed to a later release.**

`IContainerRuntimeBase._createDataStoreWithProps()` has been removed. Please use `IContainerRuntimeBase.createDataStore()` (returns IFluidRouter).
If you need to pass props to data store, either use request() route to pass initial props directly, or to query Fluid object to interact with it (pass props / call methods to configure object).

### \_createDataStore APIs are removed

`IFluidDataStoreContext._createDataStore()` & `IContainerRuntimeBase._createDataStore()` are removed
Please switch to using one of the following APIs:

1. `IContainerRuntime.createRootDataStore()` - data store created that way is automatically bound to container. It will immediately be visible to remote clients (when/if container is attached). Such data stores are never garbage collected. Note that this API is on `IContainerRuntime` interface, which is not directly accessible to data stores. The intention is that only container owners are creating roots.
2. `IContainerRuntimeBase.createDataStore()` - creates data store that is not bound to container. In order for this store to be bound to container (and thus be observable on remote clients), ensure that handle to it (or any of its objects / DDS) is stored into any other DDS that is already bound to container. In other words, newly created data store has to be reachable (there has to be a path) from some root data store in container. If, in future, such data store becomes unreachable from one of the roots, it will be garbage collected (implementation pending).

### createDataStoreWithRealizationFn() APIs are removed

Removed from IFluidDataStoreContext & IContainerRuntime.
Consider using (Pure)DataObject(Factory) for your objects - they support passing initial args.
Otherwise consider implementing similar flow of exposing interface from your Fluid object that is used to initialize object after creation.

## getDataStore() APIs is removed

IContainerRuntime.getDataStore() is removed. Only IContainerRuntime.getRootDataStore() is available to retrieve root data stores.
For couple versions we will allow retrieving non-root data stores using this API, but this functionality is temporary and will be removed soon.
You can use handleFromLegacyUri() for creating handles from container-internal URIs (i.e., in format `/${dataStoreId}`) and resolving those containers to get to non-root data stores. Please note that this functionality is strictly added for legacy files! In future, not using handles to refer to content (and storing handles in DDSes) will result in such data stores not being reachable from roots, and thus garbage collected (deleted) from file.

### Package Renames

As a follow up to the changes in 0.24 we are updating a number of package names

-   `@fluidframework/component-core-interfaces` is renamed to `@fluidframework/core-interfaces`
-   `@fluidframework/component-runtime-definitions` is renamed to `@fluidframework/datastore-definitions`
-   `@fluidframework/component-runtime` is renamed to `@fluidframework/datastore`
-   `@fluidframework/webpack-component-loader` is renamed to `@fluidframework/webpack-fluid-loader`

### IComponent and IComponent Interfaces Removed

In 0.24 IComponent and IComponent interfaces were deprecated, they are being removed in this build. Please move to IFluidObject and IFluidObject interfaces.

### odsp-utils Changes

To support additional authentication scenarios, the signature and/or name of a few auth-related functions was modified.

### LastEditedTrackerComponent renamed

It is renamed to LastEditedTrackerDataObject

### ComponentProvider renamed to FluidObjectProvider

In the package @fluidframework/synthesize, these types are renamed:

ComponentKey -> FluidObjectKey
ComponentSymbolProvider -> FluidObjectProvider
AsyncRequiredcomponentProvider -> AsyncRequiredFluidObjectProvider
AsyncOptionalComponentProvider -> AsyncOptionalFluidObjectProvider
AsyncComponentProvider -> AsyncFluidObjectProvider
NonNullableComponent -> NonNullableFluidObject

## 0.24 Breaking Changes

This release only contains renames. There are no functional changes in this release. You should ensure you have integrated and validated up to release 0.23 before integrating this release.

This is a followup to the forward compat added in release 0.22: [Forward Compat For Loader IComponent Interfaces](#Forward-Compat-For-Loader-IComponent-Interfaces)

You should ensure all container and components hosts are running at least 0.22 before integrating this release.

The below json describes all the renames done in this release. If you have a large typescript code base, we have automation that may help. Please contact us if that is the case.

All renames are 1-1, and global case senstive and whole word find replace for all should be safe. For IComponent Interfaces, both the type and property name were re-named.

```json
{
    "dataStore": {
        "types": {
            "IComponentRuntimeChannel": "IFluidDataStoreChannel",
            "IComponentAttributes": "IFluidDataStoretAttributes",

            "IComponentContext": "IFluidDataStoreContext",
            "ComponentContext": "FluidDataStoreContext",
            "LocalComponentContext": "LocalFluidDataStoreContext",
            "RemotedComponentContext": "RemotedFluidDataStoreContext ",

            "IComponentRuntime": "IFluidDataStoreRuntime",
            "ComponentRuntime": "FluidDataStoreRuntime",
            "MockComponentRuntime": "MockFluidDataStoreRuntime"
        },
        "methods": {
            "createComponent": "_createDataStore",
            "createComponentContext": "createDataStoreContext",
            "createComponentWithProps": "createDataStoreWithProps",
            "_createComponentWithProps": "_createDataStoreWithProps",
            "createComponentWithRealizationFn": "createDataStoreWithRealizationFn",
            "getComponentRuntime": "getDataStore",
            "notifyComponentInstantiated": "notifyDataStoreInstantiated"
        }
    },

    "aquaduct": {
        "IComponentInterfaces": {
            "IProvideComponentDefaultFactoryName": "IProvideFluidExportDefaultFactoryName",
            "IComponentDefaultFactoryName": "IFluidExportDefaultFactoryName"
        },
        "types": {
            "SharedComponentFactory": "PureDataObjectFactory",
            "SharedComponent": "PureDataObject",

            "PrimedComponentFactory": "DataObjectFactory",
            "PrimedComponent": "DataObject",

            "ContainerRuntimeFactoryWithDefaultComponent": "ContainerRuntimeFactoryWithDefaultDataStore",

            "defaultComponentRuntimeRequestHandler": "defaultRouteRequestHandler"
        },
        "methods": {
            "getComponent": "requestFluidObject",
            "asComponent": "asFluidObject",
            "createAndAttachComponent": "createAndAttachDataStore",
            "getComponentFromDirectory": "getFluidObjectFromDirectory",
            "getComponent_UNSAFE": "requestFluidObject_UNSAFE",
            "componentInitializingFirstTime": "initializingFirstTime",
            "componentInitializingFromExisting": "initializingFromExisting",
            "componentHasInitialized": "hasInitialized"
        }
    },

    "fluidObject": {
        "IComponentInterfaces": {
            "IProvideComponentRouter": "IProvideFluidRouter",
            "IComponentRouter": "IFluidRouter",

            "IProvideComponentLoadable": "IProvideFluidLoadable",
            "IComponentLoadable": "IFluidLoadable",

            "IProvideComponentHandle": "IProvideFluidHandle",
            "IComponentHandle": "IFluidHandle",

            "IProvideComponentHandleContext": "IProvideFluidHandleContext",
            "IComponentHandleContext": "IFluidHandleContext",

            "IProvideComponentSerializer": "IProvideFluidSerializer",
            "IComponentSerializer": "IFluidSerializer",

            "IProvideComponentRunnable": "IProvideFluidRunnable",
            "IComponentRunnable": "IFluidRunnable",

            "IProvideComponentConfiguration": "IProvideFluidConfiguration",
            "IComponentConfiguration": "IFluidConfiguration",

            "IProvideComponentHTMLView": "IProvideFluidHTMLView",
            "IComponentHTMLView": "IFluidHTMLView",
            "IComponentHTMLOptions": "IFluidHTMLOptions",

            "IProvideComponentMountableView": "IProvideFluidMountableView",
            "IComponentMountableViewClass": "IFluidMountableViewClass",
            "IComponentMountableView": "IFluidMountableView",

            "IProvideComponentLastEditedTracker": "IProvideFluidLastEditedTracker",
            "IComponentLastEditedTracker": "IFluidLastEditedTracker",

            "IProvideComponentRegistry": "IProvideFluidDataStoreRegistry",
            "IComponentRegistry": "IFluidDataStoreRegistry",

            "IProvideComponentFactory": "IProvideFluidDataStoreFactory",
            "IComponentFactory": "IFluidDataStoreFactory",

            "IProvideComponentCollection": "IProvideFluidObjectCollection",
            "IComponentCollection": "IFluidObjectCollection",

            "IProvideComponentDependencySynthesizer": "IProvideFluidDependencySynthesizer",
            "IComponentDependencySynthesizer": "IFluidDependencySynthesizer",

            "IProvideComponentTokenProvider": "IProvideFluidTokenProvider",
            "IComponentTokenProvider": "IFluidTokenProvider"
        },
        "types": {
            "IComponent": "IFluidObject",
            "fluid/component": "fluid/object",

            "SharedObjectComponentHandle": "SharedObjectHandle",
            "RemoteComponentHandle": "RemoteFluidObjectHandle",
            "ComponentHandle": "FluidObjectHandle",
            "ComponentSerializer": "FluidSerializer",

            "ComponentHandleContext": "FluidHandleContext",

            "ComponentRegistryEntry": "FluidDataStoreRegistryEntry",
            "NamedComponentRegistryEntry": "NamedFluidDataStoreRegistryEntry",
            "NamedComponentRegistryEntries": "NamedFluidDataStoreRegistryEntries",
            "ComponentRegistry": "FluidDataStoreRegistry",
            "ContainerRuntimeComponentRegistry": "ContainerRuntimeDataStoreRegistry"
        },
        "methods": {
            "instantiateComponent": "instantiateDataStore"
        }
    }
}
```

## 0.23 Breaking Changes

-   [Removed `collaborating` event on IComponentRuntime](#Removed-`collaborating`-event-on-IComponentRuntime)
-   [ISharedObjectFactory rename](#ISharedObjectFactory)
-   [LocalSessionStorageDbFactory moved to @fluidframework/local-driver](LocalSessionStorageDbFactory-moved-to-@fluidframework/local-driver)

### Removed `collaborating` event on IComponentRuntime

Component Runtime no longer fires the collaborating event on attaching. Now it fires `attaching` event.

### ISharedObjectFactory

`ISharedObjectFactory` renamed to `IChannelFactory` and moved from `@fluidframework/shared-object-base` to `@fluidframework/datastore-definitions`

### LocalSessionStorageDbFactory moved to @fluidframework/local-driver

Previously, `LocalSessionStorageDbFactory` was part of the `@fluidframework/webpack-component-loader` package. It has been moved to the `@fluidframework/local-driver` package.

## 0.22 Breaking Changes

-   [Deprecated `path` from `IComponentHandleContext`](#Deprecated-`path`-from-`IComponentHandleContext`)
-   [Dynamically loaded components compiled against older versions of runtime](#Dynamically-loaded-components)
-   [ContainerRuntime.load Request Handler Changes](#ContainerRuntime.load-Request-Handler-Changes)
-   [IComponentHTMLVisual removed](#IComponentHTMLVisual-removed)
-   [IComponentReactViewable deprecated](#IComponentReactViewable-deprecated)
-   [Forward Compat For Loader IComponent Interfaces](#Forward-Compat-For-Loader-IComponent-Interfaces)
-   [Add Undefined to getAbsoluteUrl return type](#Add-Undefined-to-getAbsoluteUrl-return-type)
-   [Renamed TestDeltaStorageService, TestDocumentDeltaConnection, TestDocumentService, TestDocumentServiceFactory and TestResolver](#Renamed-TestDeltaStorageService,-TestDocumentDeltaConnection,-TestDocumentService,-TestDocumentServiceFactory-and-TestResolver)
-   [DocumentDeltaEventManager has been renamed and moved to "@fluidframework/test-utils"](#DocumentDeltaEventManager-has-been-renamed-and-moved-to-"@fluidframework/test-utils")
-   [`isAttached` replaced with `attachState` property](#`isAttached`-replaced-with-`attachState`-property)

### Deprecated `path` from `IComponentHandleContext`

Deprecated the `path` field from the interface `IComponentHandleContext`. This means that `IComponentHandle` will not have this going forward as well.

Added an `absolutePath` field to `IComponentHandleContext` which is the absolute path to reach it from the container runtime.

### Dynamically loaded components

Components that were compiled against Fluid Framework <= 0.19.x releases will fail to load. A bunch of APIs has been deprecated in 0.20 & 0.21 and back compat support is being removed in 0.22. Some of the key APIs are:

-   IComponentRuntime.attach
-   ContainerContext.isAttached
-   ContainerContext.isLocal
    Such components needs to be compiled against >= 0.21 runtime and can be used in container that is built using >= 0.21 runtime as well.

### ContainerRuntime.load Request Handler Changes

ContainerRuntime.load no longer accepts an array of RuntimeRequestHandlers. It has been changed to a single function parameter with a compatible signature:
`requestHandler?: (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>`

To continue to use RuntimeRequestHandlers you can used the `RuntimeRequestHandlerBuilder` in the package `@fluidframework/request-handler`

example:

```typescript
const builder = new RuntimeRequestHandlerBuilder();
builder.pushHandler(...this.requestHandlers);
builder.pushHandler(defaultRouteRequestHandler("defaultComponent"));
builder.pushHandler(innerRequestHandler());

const runtime = await ContainerRuntime.load(
    context,
    this.registryEntries,
    async (req, rt) => builder.handleRequest(req, rt),
    undefined,
    scope
);
```

Additionally the class `RequestParser` has been moved to the `@fluidframework/runtime-utils` package

This will allow consumers of our ContainerRuntime to substitute other routing frameworks more easily.

### IComponentHTMLVisual removed

The `IComponentHTMLVisual` interface was deprecated in 0.21, and is now removed in 0.22. To support multiview scenarios, consider split view/model patterns like those demonstrated in the multiview sample.

### IComponentReactViewable deprecated

The `IComponentReactViewable` interface is deprecated and will be removed in an upcoming release. For multiview scenarios, instead use a pattern like the one demonstrated in the sample in /components/experimental/multiview. This sample demonstrates how to create multiple views for a component.

### Forward Compat For Loader IComponent Interfaces

As part of the Fluid Data Library (FDL) and Fluid Component Library (FCL) split we will be renaming a significant number of out interfaces. Some of these interfaces are used across the loader -> runtime boundary. For these interfaces we have introduced the newly renamed interfaces in this release. This will allow Host's to implment forward compatbitiy for these interfaces, so they are not broken when the implementations themselves are renamed.

-   `IComponentLastEditedTracker` will become `IFluidLastEditedTracker`
-   `IComponentHTMLView` will become `IFluidHTMLView`
-   `IComponentMountableViewClass` will become `IFluidMountableViewClass`
-   `IComponentLoadable` will become `IFluidLoadable`
-   `IComponentRunnable` will become `IFluidRunnable`
-   `IComponentConfiguration` will become `IFluidConfiguration`
-   `IComponentRouter` will become `IFluidRouter`
-   `IComponentHandleContext` will become `IFluidHandleContext`
-   `IComponentHandle` will become `IFluidHandle`
-   `IComponentSerializer `will become `IFluidSerializer`
-   `IComponentTokenProvider` will become `IFluidTokenProvider`

`IComponent` will also become `IFluidObject`, and the mime type for for requests will change from `fluid/component` to `fluid/object`

To ensure forward compatability when accessing the above interfaces outside the context of a container e.g. from the host, you should use the nullish coalesing operator (??).

For example

```typescript
        if (response.status !== 200 ||
            !(
                response.mimeType === "fluid/component" ||
                response.mimeType === "fluid/object"
            )) {
            return undefined;
        }

        const fluidObject = response.value as IComponent & IFluidObject;
        return fluidObject.IComponentHTMLView ?? fluidObject.IFluidHTMLView.

```

### Add Undefined to getAbsoluteUrl return type

getAbsoluteUrl on the container runtime and component context now returns `string | undefined`. `undefined` will be returned if the container or component is not attached. You can determine if a component is attached and get its url with the below snippit:

```typescript
import { waitForAttach } from "@fluidframework/aqueduct";


protected async hasInitialized() {
        waitForAttach(this.runtime)
            .then(async () => {
                const url = await this.context.getAbsoluteUrl(this.url);
                this._absoluteUrl = url;
                this.emit("stateChanged");
            })
            .catch(console.error);
}
```

### Renamed TestDeltaStorageService, TestDocumentDeltaConnection, TestDocumentService, TestDocumentServiceFactory and TestResolver

Renamed the following in "@fluidframework/local-driver" since these are used beyond testing:

-   `TestDeltaStorageService` -> `LocalDeltaStorageService`
-   `TestDocumentDeltaConnection` -> `LocalDocumentDeltaConnection`
-   `TestDocumentService` -> `LocalDocumentService`
-   `TestDocumentServiceFactory` -> `LocalDocumentServiceFactory`
-   `TestResolver` -> `LocalResolver`

### DocumentDeltaEventManager has been renamed and moved to "@fluidframework/test-utils"

`DocumentDeltaEventManager` has moved to "@fluidframework/test-utils" and renamed to `OpProcessingController`.

The `registerDocuments` method has been renamed to `addDeltaManagers` and should be called with a list of delta managers. Similarly, all the other methods have been updated to be called with delta managers.

So, the usage has now changed to pass in the deltaManager from the object that was passed earlier. For example:

```typescript
// Old usage
containerDeltaEventManager = new DocumentDeltaEventManager(
    deltaConnectionServer
);
containerDeltaEventManager.registerDocuments(
    component1.runtime,
    component2.runtime
);

// New usage
opProcessingController = new OpProcessingController(deltaConnectionServer);
opProcessingController.addDeltaManagers(
    component1.runtime.deltaManager,
    component2.runtime.deltaManager
);
```

### `isAttached` replaced with `attachState` property

`isAttached` is replaced with `attachState` property on `IContainerContext`, `IContainerRuntime` and `IComponentContext`.
`isAttached` returned true when the entity was either attaching or attached to the storage.
So if `attachState` is `AttachState.Attaching` or `AttachState.Attached` then `isAttached` would have returned true.
Attaching is introduced in regards to Detached container where there is a time where state is neither AttachState.Detached nor AttachState.Attached.

## 0.21 Breaking Changes

-   [Removed `@fluidframework/local-test-utils`](#removed-`@fluidframework/local-test-utils`)
-   [IComponentHTMLVisual deprecated](#IComponentHTMLVisual-deprecated)
-   [createValueType removed from SharedMap and SharedDirectory](#createValueType-removed-from-SharedMap-and-SharedDirectory)
-   [Sequence snapshot format change](#Sequence-snapshot-format-change)
-   [isLocal api removed](#isLocal-api-removed)
-   [register/attach api renames on handles, components and dds](#register/attach-api-rename-on-handles,-components-and-dds)
-   [Error handling changes](#Error-handling-changes)
-   [ITelemetryBaseLogger.supportsTags deleted](#ITelemetryBaseLogger.supportstags-deleted)

### Removed `@fluidframework/local-test-utils`

Removed this package so classes like `TestHost` are no longer supported. Please contact us if there were dependencies on this or if any assistance in required to get rid of it.

### IComponentHTMLVisual deprecated

The `IComponentHTMLVisual` interface is deprecated and will be removed in an upcoming release. For multiview scenarios, instead use a pattern like the one demonstrated in the sample in /components/experimental/multiview. This sample demonstrates how to create multiple views for a component.

### createValueType removed from SharedMap and SharedDirectory

The `createValueType()` method on `SharedMap` and `SharedDirectory` was deprecated in 0.20, and is now removed in 0.21. If `Counter` functionality is required, the `@fluidframework/counter` DDS can be used for counter functionality.

### isLocal api removed

isLocal api is removed from the repo. It is now replaced with isAttached which tells that the entity is attached or getting attached to storage. So its meaning is opposite to isLocal.

### register/attach api renames on handles, components and dds

Register on dds and attach on data store runtime is renamed to bindToContext(). attach on handles is renamed to attachGraph().

### Error handling changes

ErrorType enum has been broken into 3 distinct enums / layers:

1. [ContainerErrorType](./packages/loader/container-definitions/src/error.ts) - errors & warnings raised at loader level
2. [OdspErrorType](./packages/drivers/odsp-driver/src/odspError.ts) and [R11sErrorType](./packages/drivers/routerlicious-driver/src/documentDeltaConnection.ts) - errors raised by ODSP and R11S drivers.
3. Runtime errors, like `"summarizingError"`, `"dataCorruptionError"`. This class of errors it not pre-determined and depends on type of container loaded.

[ICriticalContainerError.errorType](./packages/loader/container-definitions/src/error.ts) is now a string, not enum, as loader has no visibility into full set of errors that can be potentially raised. Hosting application may package different drivers and open different types of containers, thus making errors list raised at container level dynamic.

### Sequence snapshot format change

Due to a change in the sequence's snapshot format clients running a version less than 0.19 will not be able to load snapshots generated in 0.21. This will affect all sequence types includes shared string, and sparse matrix. If you need to support pre-0.19 clients please contact us for mitigations.

### ITelemetryBaseLogger.supportsTags deleted

Proper support for tagged events will be assumed going forward. Only at the loader-runtime boundary do we retain
a concession for backwards compatibility, but that's done outside of this interface.

## 0.20 Breaking Changes

-   [Value types deprecated on SharedMap and SharedDirectory](#Value-types-deprecated-on-sharedmap-and-shareddirectory)
-   [rename @fluidframework/aqueduct-react to @fluidframework/react-inputs](#rename-@fluidframework/aqueduct-react-to-@fluidframework/react-inputs)

### Value types deprecated on SharedMap and SharedDirectory

The `Counter` value type and `createValueType()` method on `SharedMap` and `SharedDirectory` are now deprecated and will be removed in an upcoming release. Instead, the `@fluidframework/counter` DDS can be used for counter functionality.

### rename @fluidframework/aqueduct-react to @fluidframework/react-inputs

aqueduct-react is actually just a react library and renamed it to reflect such.

## 0.19 Breaking Changes

-   [Container's "error" event](#Container-Error-Event)
-   [IUrlResolver change from requestUrl to getAbsoluteUrl](#IUrlResolver-change-from-requestUrl-to-getAbsoluteUrl)
-   [Package rename from `@microsoft/fluid-*` to `@fluidframework/*`](#package-rename)

### Package rename

Package with the prefix "@microsoft/fluid-" is renamed to "@fluidframework/" to take advanage a separate namespace for Fluid Framework SDK packages.

### Container Error Event

"error" event is gone. All critical errors are raised on "closed" event via optiona error object.
"warning" event is added to expose warnings. Currently it contains summarizer errors and throttling errors.

### IUrlResolver change from requestUrl to getAbsoluteUrl

As we continue to refine our API around detached containers, and component urls, we've renamed IUrlResolver from requestUrl to getAbsoluteUrl

## 0.18 Breaking Changes

-   [App Id removed as a parameter to OdspDocumentServiceFactory](#App-Id-removed-as-a-parameter-to-OdspDocumentServiceFactory)
-   [ConsensusRegisterCollection now supports storing handles](#ConsensusRegisterCollection-now-supports-storing-handles)
-   [Summarizing errors on parent container](#Summarizing-errors-on-parent-container)
-   [OdspDocumentServiceFactory no longer requires a logger]
    (#OdspDocumentServiceFactory-no-longer-requires-a-logger)

### `App Id` removed as a parameter to OdspDocumentServiceFactory

`@microsoft/fluid-odsp-driver` no longer requires consumers to pass in an app id as an input. Consumers should simply remove this parameter from the OdspDocumentServiceFactory/OdspDocumentServiceFactoryWithCodeSplit constructor.

### ConsensusRegisterCollection now supports storing handles

ConsensusRegisterCollection will properly serialize/deserialize handles added as values.

### Summarizing errors on parent container

The parent container of the summarizing container will now raise "error" events related to summarization problems. These will be of type `ISummarizingError` and will have a description indicating either a problem creating the summarizing container, a problem generating a summary, or a nack or ack wait timeout from the server.

### OdspDocumentServiceFactory no longer requires a logger

The logger will be passed in on createDocumentService or createContainer, no need to pass in one on construction of OdspDocumentServiceFactory.

## 0.17 and earlier Breaking Changes

For older versions' breaking changes, go [here](https://github.com/microsoft/FluidFramework/blob/release/0.17.x/BREAKING.md)
