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

### AgentScheduler removed by default
In 0.38, the `IContainerRuntimeOptions` option `addGlobalAgentSchedulerAndLeaderElection` was added (on by default), which could be explicitly disabled to remove the built-in `AgentScheduler` and leader election functionality.  This flag has now been turned off by default.  If you still depend on this functionality, you can re-enable it by setting the flag to `true`, though this option will be removed in a future release.

See [AgentScheduler-related deprecations](#AgentScheduler-related-deprecations) for more information on this deprecation and back-compat support, as well as recommendations on how to migrate away from the built-in.

### ITelemetryProperties may be tagged for privacy purposes
Telemetry properties on logs *can (but are **not** yet required to)* now be tagged. This is **not** a breaking change in 0.40, but users are strongly encouraged to add support for tags (see [UPCOMING.md](./UPCOMING.md) for more details).

### IContainerRuntimeDirtyable removed
The `IContainerRuntimeDirtyable` interface and `isMessageDirtyable()` method were deprecated in release 0.38.  They have now been removed in 0.40.  Please refer to the breaking change notice in 0.38 for instructions on migrating away from use of this interface.

### Most RouterliciousDocumentServiceFactory params removed

The `RouterliciousDocumentServiceFactory` constructor no longer accepts the following params: `useDocumentService2`, `disableCache`, `historianApi`, `gitCache`, and `credentials`. Please open an issue if these flags/params were important to your project so that they can be re-incorporated into the upcoming `IRouterliciousDriverPolicies` param.

## 0.39 Breaking changes
- [connect event removed from Container](#connect-event-removed-from-Container)
- [LoaderHeader.pause](#LoaderHeader.pause)
- [ODSP driver definitions](#ODSP-driver-definitions)
- [ITelemetryLogger Remove redundant methods](#ITelemetryLogger-Remove-redundant-methods)
- [fileOverwrittenInStorage](#fileOverwrittenInStorage)
- [absolutePath use in IFluidHandle is deprecated](#absolutepath-use-in-ifluidhandle-is-deprecated)
- [ITelemetryBaseLogger now has a supportsTags property (not breaking)](#itelemetrybaselogger-now-has-a-supportstags-property-not-breaking)

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

1. Ensures that initial summary generated for when data store attaches to container has fully initialized object, with all DDSs created. Before this change this initial snapshot was empty in most cases.
2. Allows DataObjects to modify FluidDataStoreRuntime behavior before it gets registered and used by the rest of the system, including setting various hooks.

But it also puts more constraints on DataObject - its constructor should be light and not do any expensive work (all such work should be done in corresponding initialize methods), or access any data store runtime functionality that requires fully initialized runtime (like loading DDSs will not work in this state)

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
