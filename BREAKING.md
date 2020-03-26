# Breaking changes

## 0.15 Breaking Changes

- [`getComponentRuntime` no longer on `IComponentContext`](#getComponentRuntime-no-longer-on-IComponentContext)
- [Container.autoReconnect & Container.reconnect changes](#Container.reconnect-Container.reconnect-changes)
- [0.13 backwards compatibility removed](#013-backwards-compatibility-removed)
- [Base host no longer renders](#Base-host-no-longer-renders)

### `getComponentRuntime` no longer on `IComponentContext`

We've removed `getComponentRuntime` on `IComponentContext` and subsequently `ComponentContext`. Developers should not be getting the
`ComponentRuntime` of other components. If you want to get another component you can currently store a `handle` to that component or you
can get it via a `request(...)` to the ContainerRuntime.

If for some reason you do this and continue to need this functional; it is still exposed on the `ContainerRuntime`. You can access it via
`...context.hostRuntime.getComponentRuntime`. If you are doing this please reach out to the runtime team so we can better understand your
scenario.

### Container.reconnect, Container.reconnect changes

autoReconnect property is gone, as well as reconnect() method.  
Use Container.setAutoReconnect() instead.

Note that there is difference in behavior. It used to be that one needed to do

```typescript
Container.autoReconnect = false;
Container.reconnect()
```

in order to trigger reconnect. Now, calling Container.setAutoReconnect(true) is enough.

### 0.13 backwards compatibility removed

- The following changes break compatibility between loader and runtime, meaning 0.15 loader cannot load 0.13 runtime and 0.13 loader cannot load 0.15 runtime:
    - While `IContainerContext.baseSnapshot` was defined to be possibly `null`, `ContainerContext` and `ContainerRuntime` would not correctly handle being passed `baseSnapshot` as `null` in 0.13 and below, and `Container` would not pass it as `null`, passing an empty snapshot instead. `Container` will now potentially pass `baseSnapshot` as `null`.
    - `ContainerRuntime.stop()` is now expected to return an `IRuntimeState`, rather than `void` as previously returned in 0.13 and below. This `IRuntimeState` can be an empty object, but cannot be null.

### Base host no longer renders

`BaseHost.start()` and `BaseHost.loadAndRender()` have been removed.  They have been replaced by `initializeContainer()`, which similarly resolves a container at the url provided and initializes it with the package provided if needed, but does not perform any rendering.

To facilitate rendering `getComponent()` has also been added, which requests the component at the given url.  Once you've requested a component, you can take whatever steps you would like to render it (e.g. querying its interfaces or passing it into an adapter like `ReactAdapter` or `HTMLViewAdapter` from `@microsoft/fluid-view-adapters`).

## 0.14 Breaking Changes

- [Packages move and renamed](#packages-moved-and-renamed)
- [Top-level `type` on `IClient` removed](#top-level-type-on-iclient-removed)
- [Remove back-compat support for loader <= 0.8](#remove-back-compat-support-for-loader--0.8)
- [New Error types](#new-error-types)
- [`IComponentContext` - `createSubComponent` removed, `createComponent` signature updated](#icomponentcontext---createsubcomponent-removed-createcomponent-signature-updated)
- [`IComponentHandle` - Moved type parameter from get to interface](#icomponenthandle---type-parameter-moved)
- [Changes to the render interfaces](#changes-to-the-render-interfaces)
- [Old runtime container cannot load new components](#old-runtime-container-cannot-load-new-components)
- [PrimedComponent and SharedComponent interfaces are now more restrictive](#restricted-component-interfaces)

### Packages moved and renamed

#### `fluid-core-utils` package renamed

The package name is changed to `fluid-common-utils` to make it parallel to `fluid-common-definitions`

#### `fluid-local-test-server` package move and rename

The following classes / interfaces have moved from `@microsoft/fluid-local-test-server` to `@microsoft/fluid-test-driver` in `./packages`:

```text
DocumentDeltaEventManager
IDocumentDeltaEvent
TestDocumentService
TestDocumentServiceFactory
TestResolver
```

The following classes / interfaces have been renamed and have moved from `@microsoft/fluid-local-test-server` in
`./packages` to `@microsoft/fluid-server-local-server` in `./server`:

```text
ITestDeltaConnectionServer -> ILocalDeltaConnectionServer
TestDeltaConnectionServer -> LocalDeltaConnectionServer
TestReservationManager -> LocalReservationManager
```

The following packages have been renamed in `./packages`:

```text
@microsoft/fluid-local-test-server -> @microsoft/fluid-local-test-utils
@microsoft/fluid-test-driver -> @microsoft/fluid-local-driver
```

#### `samples` and `chaincode` directories have been renamed to `examples` and `components` respectively

The directories themselves have been renamed.
All path references in the dockerfile and json manifests have been updated along with variables assigned using path constants in code

### Top-level `type` on `IClient` removed

The `type` field on `IClient` has been removed.

### Remove back-compat support for loader <= 0.8

Back-compat support code for postProcess and ScheduleManager is removed for loader <= 0.8, which doesn't support group ops.
Any component based on runtime >= 0.14 will no longer work with loader <= 0.8

### New Error types

The following new error interfaces have been added:

- `IWriteError` is thrown when ops are sent on a read-only document
- `IFatalError` is thrown when a fatal error (500) is received from ODSP

### `IComponentContext` - `createSubComponent` removed, `createComponent` signature updated

The `createSubComponent` method on `IComponentContext` has been removed. Use `createComponent` instead whose signature
has been updated. The new function signature is as below:

```typescript
public async createComponent(
        pkgOrId: string | undefined,
        pkg?: string,
        props?: any) {
```

It does not acccept a package path anymore but just a package name. To pass in props, an ID has to be provided now.
However, ID is being deprecated so prefer passing undefined in its place (the runtime will generate an ID in this case).
This API will now attempt to create the specified package off the current sub-registry and if that fails, it will
attempt to create it off the global registry.

For creating a component with a specific package path, use `createComponent` or `_createComponentWithProps` in `IHostRuntime`.

### `IComponentHandle` - Type parameter moved

The type parameter previously on the `get()` method has moved to the `IComponentHandle` type.

Old:

```ts
    map.get<IComponentHandle>(..).get<ISharedMap>();
```

New:

```ts
    map.get<IComponentHandle<ISharedMap>>(..).get();
```

### Changes to the render interfaces

The rendering interfaces have undergone several changes:

- `IComponentHTMLRender` has been removed.  `IComponentHTMLView` now has a `render()` member, and `IComponentHTMLVisual` does not.  If your component renders, it should probably be an `IComponentHTMLView`.
- Since `IComponentHTMLVisual` now only has the member `addView()`, it is mandatory.  If your component does not already implement `addView`, it should not be an `IComponentHTMLVisual`.
- On `IComponentHTMLView`, `remove()` is now optional.  If your view component needs to perform cleanup when removed from the DOM, do it in `remove()` - otherwise there is no need to implement it.
- `IComponentHTMLView` now extends the new `IProvideComponentHTMLView`, so you can query for whether a component is a view.  You must implement the `IComponentHTMLView` member if you implement the interface.

### Old runtime container cannot load new components

The way that summaries are generated has changed in such a way that the runtime container is backwards compatible with 0.13 components, but 0.13 runtime container cannot load 0.14 or later components.

### PrimedComponent and SharedComponent interfaces are now more restrictive
The following class variables have been changed from public -> protected
In PrimedComponent:
- root
- taskManager
- writeBlob
In SharedComponent:
- asComponent
If you still need to access these methods, you can still do so by overloading the needed method in your class
and making it public.
An example of this can be seen in primedComponent.spec.ts 

## 0.13 Breaking Changes

- [Fluid Packages Require Consumers on TypeScript `>=3.6`](##Fluid-Packages-Require-Consumers-on-TypeScript->=3.6)
- [IHost interface removed, Loader constructor signature updated](#IHost-interface-removed-Loader-constructor-signature-updated)

New error types are added in 0.13. So whenever any error is emitted from container it will be of type IError which will have the property errorType which will tell the app, what type of error it is.
It will also contain the property critical which will tell the app that the error is critical if it is true. Different errorTypes are defined in loader/driver-definitions/src/error.ts.

### Fluid Packages Require Consumers on TypeScript `>=3.6`

Fluid now requires consumers of our packages to use a TypeScript compiler version `>=3.6`. The Fluid `./packages` repo has upgraded to TypeScript `3.7.4`. TypeScript 3.7 has a breaking change to the `.d.ts` format having to do with getters and setters and is part of an effort to do [Class Field Mitigations](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#class-field-mitigations).

TypeScript now emits `get/set` accessors in `.d.ts` files. TypeScript versions `3.5` and prior do not know how to read these and throw the below error when compiling. TypeScript version `3.6` is forwards compatible but does not emit the accessors.

```text
"error TS1086: An accessor cannot be declared in an ambient context."
```

More about the changes:

- [Class Field Mitigations](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#class-field-mitigations)  
- [Full list of TypeScript changes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html)

### IHost interface removed, Loader constructor signature updated

The IHost interface has been removed.  This primarily impacts the signature of the `Loader` constructor, which now just takes the `IUrlResolver` directly in its place.

## 0.12 Breaking Changes

- [Packages moved from packages to server](#Packages-moved-from-packages-to-server)
- [LoaderHeader enum moved from @microsoft/fluid-container-loader to @microsoft/fluid-container-definitions](#LoaderHeader-moved-to-fluid-container-definitions)
- [Driver interface moved from @microsoft/fluid-protocol-defintions to @microsoft/fluid-driver-definitions](#driver-interfaces-moved-to-fluid-driver-definitions)
- [Top-level `type` on `IClient` deprecated](#Top-level-type-on-IClient-deprecated)
- [Support for `IFluidResolvedUrl.type` === "prague" removed](#support-for-ifluidresolvedurltype--prague-removed)
- [`connect` header replaced with `pause` header; ability to load closed containers removed](#connect-header-replaced-with-pause-header-ability-to-load-closed-containers-removed)

### Packages moved from packages to server

There are a collection of packages that have moved from `./packages` to `./server`. This means these packages are now being versioned with the `./server` folder and not with the existing `./ packages` folder.

```text
@microsoft/fluid-gitresources
@microsoft/fluid-server-kafka-orderer
@microsoft/fluid-server-lambdas
@microsoft/fluid-server-lambdas-driver
@microsoft/fluid-server-memory-orderer
@microsoft/fluid-protocol-base
@microsoft/fluid-protocol-definitions
@microsoft/fluid-server-routerlicious
@microsoft/fluid-server-services
@microsoft/fluid-server-services-client
@microsoft/fluid-server-services-core
@microsoft/fluid-server-services-utils
@microsoft/fluid-server-test-utils
```

### LoaderHeader moved to fluid-container-definitions

`LoaderHeader` enum is a shared definitions between the runtime and the loader and is moved to fluid-container-definitions from fluid-container-loader

### Driver interfaces moved to fluid-driver-definitions

The following interfaces/types have been moved to `@microsoft/fluid-protocol-definitions`:

```text
ConnectionState
IProposal
ISequencedProposal
IApprovedProposal
ICommittedProposal
IPendingProposal
IQuorum
IProtocolState
IProcessMessageResult
IHelpMessage
QueueMessage
IConnect
IConnected
```

The following interfaces/types have been moved to `@microsoft/fluid-driver-definitions`:

```text
IDeltaStorageService
IDocumentDeltaStorageService
IDocumentStorageService
IDocumentDeltaConnection
IDocumentStorageService
IDocumentService
IDocumentServiceFactory
INetworkError
IResolvedUrl
IResolvedUrlBase
IWebResolvedUrl
IFluidResolvedUrl
IUrlResolver
```

The following interfaces/types have been moved to `@microsoft/fluid-common-definitions`:

```text
IDisposable
ITelemetry*
```

The following enums/classes/functions have been moved to `@microsoft/fluid-driver-utils`:

```text
configurableUrlResolver
isOnline
NetworkError
OnlineStatus
readAndParse
```

### Top-level `type` on `IClient` deprecated

The `type` field on `IClient` has been deprecated and will be removed in the future. There is now an optional type in the new `details` member of `IClient`. Some of the functionality of the top-level `type` field has been replaced by the `capabilities` member in `IClient.details`, specifically the `interactive` boolean is used to distinguish between human and non-human clients.

### Support for `IFluidResolvedUrl.type` === "prague" removed

As previously mentioned, `IFluidResolvedUrl.type` should now be "fluid". Backwards compatibility for type "prague" has now been removed.

### `connect` header replaced with `pause` header; ability to load closed containers removed

The comma-separated string `connect` header has been replaced with the boolean `pause` header. `pause: true` is equivalent to `connect: "open,pause"` and `pause: false` is equivalent to `connect: "open"`. If undefined, container will start unpaused. It is no longer possible to load a closed container. Instead, use a paused container.

## 0.11 Breaking Changes

- [SequenceEvent start/end replaced with first/last](#SequenceEvent-startend-replaced-with-firstlast)
- [Undefined keys and subdirectory names on SharedMap and SharedDirectory throw](#Undefined-keys-and-subdirectory-names-on-SharedMap-and-SharedDirectory-throw)
- [SharedComponent extends IComponentHandles](#SharedComponent-extends-IComponentHandles)
- [Remove ComponentFactoryTypes and ComponentRegistryTypes](#Remove-ComponentFactoryTypes-and-ComponentRegistryTypes)
- [`ContainerRuntime.load` now takes an array of requestHandlers instead of a createRequestHandler function](#ContainerRuntime.load-now-takes-an-array-of-requestHandlers-instead-of-a-createRequestHandler-function)
- [`Loader` constructor takes a `Map<string, IProxyLoaderFactory>`](#Loader-constructor-takes-a-Mapstring-IProxyLoaderFactory)

### SequenceEvent start/end replaced with first/last

The `start` and `end` members of SequenceEvent (and SequenceDeltaEvent) have been replaced with `first` and `last`, which return the first and last range, respectively. The values equivalent to `start` and `end` can be obtained with `first.position` and `last.position + last.segment.cachedLength`.

### Undefined keys and subdirectory names on SharedMap and SharedDirectory throw

Previously, attempting to set `undefined` as a key on a SharedMap or SharedDirectory, or creating a subdirectory with name `undefined` would appear to succeed but would cause inconsistencies in snapshotting.  This will now throw immediately upon trying to set an `undefined` key or subdirectory name.

### SharedComponent extends IComponentHandles

You can now store SharedComponent components as handles on SharedMap and SharedDirectory. The `@fluid-example/pond` in our component samples shows how to create and store components as handles. This makes storing SharedComponents the same as storing SharedObjects.

Component handles that are stored on a SharedObject will become attached when the SharedObject is attached. If the SharedObject is already attached it will become attached right away.

> Note: Components can currently still be created and retrieved via the container. This is not technically a breaking change.

#### Creating and Storing a Component

Below we create a new component and store it directly in the root SharedDirectory

```typescript
    const clickerRuntime = await this.context.createComponent(ClickerName);
    const response = clickerRuntime.request({url: "/"});
    const clicker = await this.asComponent<Clicker>(response);

    this.root.set(this.clickerKey, clicker.handle);
```

Below we are retrieving the Component from the root map.

```typescript
const clicker = await this.root.get<IComponentHandle>(this.clickerKey).get<IComponent>();
```

### Remove ComponentFactoryTypes and ComponentRegistryTypes

Removed ComponentFactoryTypes and ComponentRegistryTypes. These types created problems as they broke feature discovery via the IComponent pattern.

ComponentFactoryTypes are un-used as the non-IComponent pattern has been deprecated for multiple releases.

ComponentRegistryTypes should no longer be needed, as we now accept NamedComponentRegistryEntries which is compatible with getter version of ComponentRegistryTypes.
For IComponentRegistrys you should make then named registries in the NamedComponentRegistryEntries.

### `ContainerRuntime.load` now takes an array of requestHandlers instead of a createRequestHandler function

Instead of passing it a createRequestHandler function, passit an array of requestHandlers.

### `Loader` constructor takes a `Map<string, IProxyLoaderFactory>`

Pass in a new Map<string, IProxyLoaderFactory>.

## 0.10 Breaking Changes

- [`@fluid-example/tiny-web-host` prague -> fluid changes](#fluid-exampletiny-web-host-prague---fluid-changes)
- [prague URIs changed to fluid](#prague-URIs-changed-to-fluid)
- [DistributedSet removed](#distributedset-removed)
- [`Stream` renamed to `Ink`](#stream-renamed-to-ink)
- [`insertSiblingSegment` change to `insertAtReferencePosition`](#insertAtReferencePosition)
- [MergeTree Client No Longer Public on Sequence](#MergeTree-Client-No-Longer-Public-on-Sequence)
- [`.createValueType` replaces third argument to `.set`](#.createValueType-replaces-third-argument-to-.set)
- [Package rename](#package-rename)
- [Support for IPraguePackage removed](#support-for-IPraguePackage-removed)
- [`IComponentForge` no longer necessary](#icomponentforge-no-longer-necessary)


### `@fluid-example/tiny-web-host` prague -> fluid changes

`loadPragueComponent`, `loadIFramedPragueComponent`, and `isPragueUrl` from `@fluid-example/tiny-web-host` have been renamed to `loadFluidComponent`, `loadIFramedFluidComponent`, and `isFluidUrl`, respectively.

### prague URIs changed to fluid

`prague://` and `prague-odsp://` URIs have been changed to `fluid://` and `fluid-odsp://` respectively.

### DistributedSet removed

The DistributedSet value type has been removed.

### `Stream` renamed to `Ink`

The `Stream` data structure (and associated interfaces and classes like `IStream`, `StreamFactory`, etc.) have been renamed to `Ink` (`IInk`, `InkFactory`, etc.).  They are available in `@microsoft/fluid-ink`.

### insertAtReferencePosition

insertSiblingSegment has been removed and insertAtReferencePosition has been added.

Before:

```typescript
    const insertSegment = this.sequence.segmentFromSpec(sg.toJSONObject());
    const insertOp = this.sequence.client.insertSiblingSegment(sg, insertSegment);
    if (insertOp) {
        this.sequence.submitSequenceMessage(insertOp);
    }
```

After:

```typescript
    const insertSegment = this.sequence.segmentFromSpec(sg.toJSONObject());
    this.sequence.insertAtReferencePosition(
            this.sequence.createPositionReference(sg, 0, ReferenceType.Transient),
            insertSegment);
```

### MergeTree Client No Longer Public on Sequence

The client property is not longer public on sequence. All existing and supported functionality should be used off sequence itself.

### `.createValueType` replaces third argument to `.set`

Previously, to create a value type on an ISharedMap or IDirectory you would pass a third type argument to `.set`.  This functionality has been moved to a separate API, `.createValueType`.

Before:

```typescript
myMap.set("myKey", 0, CounterValueType.Name);
```

After:

```typescript
myMap.createValueType("myKey", CounterValueType.Name, 0);
```

### Package rename

The following packages have been renamed:

| old name                              | new name                                   |
| ------------------------------------- | ------------------------------------------ |
| @chaincode/flow-intel                 | @fluid-example/flow-intel                  |
| @chaincode/flow-intel-viewer          | @fluid-example/flow-intel-viewer           |
| @prague/intelligence-runner           | @fluid-example/intelligence-runner-agent   |
| @prague/snapshotter                   | @fluid-example/snapshotter-agent           |
| @prague/spellchecker                  | @fluid-example/spellchecker-agent          |
| @prague/translator                    | @fluid-example/translator-agent            |
| @component/agent-scheduler            | @microsoft/fluid-agent-scheduler           |
| @component/blob-manager               | @microsoft/fluid-blob-manager              |
| @chaincode/canvas                     | @fluid-example/canvas                      |
| @chaincode/clicker                    | @fluid-example/clicker                     |
| @prague/client-ui                     | @fluid-example/client-ui-lib               |
| @chaincode/externalcomponentloader    | @microsoft/fluid-external-component-loader |
| @chaincode/flow-scroll                | @fluid-example/flow-scroll                 |
| @prague/flow-util                     | @fluid-example/flow-util-lib               |
| @chaincode/image-collection           | @fluid-example/image-collection            |
| @chaincode/key-value                  | @fluid-example/key-value                   |
| @chaincode/markflow                   | @fluid-example/markflow                    |
| @chaincode/math                       | @fluid-example/math                        |
| @chaincode/monaco                     | @fluid-example/monaco                      |
| @chaincode/owned-map                  | @fluid-example/owned-map                   |
| @chaincode/pinpoint-editor            | @fluid-example/pinpoint-editor             |
| @chaincode/pond                       | @fluid-example/pond                        |
| @chaincode/progress-bars              | @fluid-example/progress-bars               |
| @chaincode/scoreboard                 | @fluid-example/scoreboard                  |
| @chaincode/scribe                     | @fluid-example/scribe                      |
| @chaincode/search-menu                | @fluid-example/search-menu                 |
| @chaincode/shared-map-visualizer      | @fluid-example/shared-map-visualizer       |
| @chaincode/shared-text                | @fluid-example/shared-text                 |
| @chaincode/table-document             | @fluid-example/table-document              |
| @prague/table-test                    | @fluid-example/table-test-lib              |
| @chaincode/table-view                 | @fluid-example/table-view                  |
| @chaincode/todo                       | @fluid-example/todo                        |
| @chaincode/video-players              | @fluid-example/video-players               |
| @chaincode/webflow                    | @fluid-example/webflow                     |
| @prague/file-socket-storage           | @microsoft/fluid-file-driver               |
| @prague/fluid-debugger                | @microsoft/fluid-debugger                  |
| @prague/odsp-socket-storage           | @microsoft/fluid-odsp-driver               |
| @prague/replay-socket-storage         | @microsoft/fluid-replay-driver             |
| @prague/routerlicious-host            | @microsoft/fluid-routerlicious-host        |
| @prague/routerlicious-socket-storage  | @microsoft/fluid-routerlicious-driver      |
| @prague/socket-storage-shared         | @microsoft/fluid-driver-base               |
| @prague/aqueduct                      | @microsoft/fluid-aqueduct                  |
| @prague/aqueduct-react                | @microsoft/fluid-aqueduct-react            |
| @prague/framework-definitions         | @microsoft/fluid-framework-interfaces      |
| @prague/base-host                     | @microsoft/fluid-base-host                 |
| @prague/react-web-host                | @fluid-example/react-web-host              |
| @prague/tiny-web-host                 | @fluid-example/tiny-web-host               |
| @prague/component-core-interfaces     | @microsoft/fluid-component-core-interfaces |
| @prague/container-definitions         | @microsoft/fluid-container-definitions     |
| @prague/container-loader              | @microsoft/fluid-container-loader          |
| @prague/gitresources                  | @microsoft/fluid-gitresources              |
| @prague/loader-web                    | @microsoft/fluid-web-code-loader           |
| @prague/protocol-definitions          | @microsoft/fluid-protocol-definitions      |
| @prague/utils                         | @microsoft/fluid-core-utils                |
| @prague/cell                          | @microsoft/fluid-cell                      |
| @prague/client-api                    | @fluid-internal/client-api                 |
| @prague/component-runtime             | @microsoft/fluid-component-runtime         |
| @prague/consensus-ordered-collection  | @microsoft/fluid-ordered-collection        |
| @prague/consensus-register-collection | @microsoft/fluid-register-collection       |
| @prague/container-runtime             | @microsoft/fluid-container-runtime         |
| @prague/map                           | @microsoft/fluid-map                       |
| @prague/merge-tree                    | @microsoft/fluid-merge-tree                |
| @prague/runtime-definitions           | @microsoft/fluid-runtime-definitions       |
| @prague/runtime-test-utils            | @microsoft/fluid-test-runtime-utils        |
| @prague/sequence                      | @microsoft/fluid-sequence                  |
| @prague/shared-object-common          | @microsoft/fluid-shared-object-base        |
| @prague/stream                        | @microsoft/fluid-ink                       |
| @prague/agent                         | @microsoft/fluid-server-agent              |
| @prague/gateway                       | @microsoft/fluid-server-gateway            |
| @prague/kafka-orderer                 | @microsoft/fluid-server-kafka-orderer      |
| @prague/lambdas                       | @microsoft/fluid-server-lambdas            |
| @prague/lambdas-driver                | @microsoft/fluid-server-lambdas-driver     |
| @prague/local-test-server             | @microsoft/fluid-local-test-server         |
| @prague/memory-orderer                | @microsoft/fluid-server-memory-orderer     |
| @prague/routerlicious                 | @microsoft/fluid-server-routerlicious      |
| @prague/services                      | @microsoft/fluid-server-services           |
| @prague/services-client               | @microsoft/fluid-server-services-client    |
| @prague/services-core                 | @microsoft/fluid-server-services-core      |
| @prague/services-utils                | @microsoft/fluid-server-services-utils     |
| @prague/test-utils                    | @microsoft/fluid-server-test-utils         |
| @prague/tools-core                    | @microsoft/fluid-server-tools-core         |
| @prague/test-snapshots                | @microsoft/fluid-test-snapshots            |
| @prague/prague-dump                   | @microsoft/fluid-fetch                     |
| @prague/replay-tool                   | @microsoft/fluid-replay-tool               |
| @prague/build-common                  | @microsoft/fluid-build-common              |
| @prague/odsp-utils                    | @microsoft/fluid-odsp-utils                |
| @prague/generator-fluid               | @microsoft/generator-fluid                 |
| @prague/url-generator                 | @fluid-internal/url-generator              |
| @prague/iframe-socket-storage         | @microsoft/fluid-iframe-driver             |
| @prague/host-service-interfaces       | @microsoft/fluid-host-service-interfaces   |
| @prague/auspkn                        | @fluid-internal/auspkn                     |
| @prague/service                       | @fluid-internal/server-service             |

### Support for IPraguePackage removed

Support for IPraguePackage and the `"prague"` entry in `package.json` has been removed. It has been replaced by IFluidPackage and a `"fluid"` entry in `package.json`:

```json
"fluid": {
    "browser": {
      "umd": {
        "files": [
          "dist/main.bundle.js"
        ],
        "library": "main"
      }
    }
  },
```

### `IComponentForge` no longer necessary

`IComponentForge` is no longer necessary. If you use Aqueduct for your component, Component initialization will be done automatically on creation, so no need to call `IComponentForge.forge` explicitly any more.  If you implement IComponentForge, simply remove it.

## 0.9 Breaking Changes (August 26, 2019)

- [PrimedComponent root is now a SharedDirectory](#primedcomponent-root-is-now-a-shareddirectory)
- [Handles to SharedObjects must be used on map sets](#handles-to-sharedobjects-must-be-used-on-map-sets)
- [`mergeTree` is now protected on `MergeTree.Client`](#mergetree-is-now-protected-on-mergetree.client)
- [No more Value Type registration](#no-more-value-type-registration)

### PrimedComponent root is now a SharedDirectory

Previously, the root provided by `PrimedComponent` was a `SharedMap`.  Now it is a `SharedDirectory`.

This should be compatible for usage (e.g. existing calls to `get`, `set`, `wait`, etc. should work as before), but explicit type checks against `SharedMap` or `ISharedMap` should be updated to `SharedDirectory` and `ISharedDirectory` respectively.  Additionally, if your component is currently using a `SharedComponentFactory` you'll want to instead use a `PrimedComponentFactory` which will register the correct root factories on your behalf.

Before:

```typescript
export const ClickerInstantiationFactory = new SharedComponentFactory(
  Clicker,
  [
    SharedMap.getFactory([new CounterValueType()]),
  ],
);
```

After:

```typescript
export const ClickerInstantiationFactory = new PrimedComponentFactory(
  Clicker,
  [],
);
```

Alternatively you can register the `SharedDirectory` factory yourself (similar to how you were already registering the `SharedMap` factory), but the `PrimedComponentFactory` is recommended.

### Handles to SharedObjects must be used on map sets

It is no longer allowed to directly set a SharedObject as a map key. Instead its handle must be set. Get also only
returns handles. You can retrieve the value by calling get on the handle.

i.e. this

```typescript
const map = SharedMap.create(runtime);
root.set("test", map);
const retrievedMap = root.get("test");
```

Becomes

```typescript
const map = SharedMap.create(runtime);
root.set("test", map.handle);
const retrievedMap = await root.get<IComponentHandle>("test").get<ISharedMap>();
```

### `mergeTree` is now protected on `MergeTree.Client`

The merge tree in Client should be interacted with indirectly through Client or Sequence methods, rather than directly as was possible before. See "[Updated sequence API to provide richer access to the underlying merge tree](#updated-sequence-api-to-provide-richer-access-to-the-underlying-merge-tree)" from 0.8 breaking changes for more info.

### No more Value Type registration

Previously, you would register for value types on `SharedMap` and `SharedDirectory` either by passing an argument to the `MapFactory` or `DirectoryFactory` or by calling `registerValueType` on the map/directory itself.  Now all valid ValueTypes are registered by default.  You should remove these arguments/calls as they are no longer necessary and may cause compile errors.

### `prague/*` -> `fluid/*` MIME type

The `prague/component`, `prague/container`, and `prague/dataType` MIME types have been changed to `fluid/component`, `fluid/container`, and `fluid/dataType` respectively in requests/responses.

## 0.8 Breaking Changes (August 13, 2019)

- [`IComponent` not to be derived from](#icomponent-not-to-be-derived-from)
- [`sequence.annotateRange()` argument order changed](#sequenceannotaterange-argument-order-changed)
- [`sharedString.insertText()` argument order changed](#sharedstringinserttext-argument-order-changed)
- [`mergeTree.getOffset()` -> `mergeTree.getPosition()`](#mergetreegetoffset---mergetreegetposition)
- [Updated sequence API to provide richer access to the underlying merge tree](#updated-sequence-api-to-provide-richer-access-to-the-underlying-merge-tree)
- [ISequenceDeltaRange.offset -> ISequenceDeltaRange.position](#isequencedeltarangeoffset-isequencedeltarangeposition)
- [IComponent* interfaces from @prague/container-definitions are moved to @prague/component-core-interfaces](#icomponent-interfaces-from-praguecontainer-definitions-are-moved-to-praguecomponent-core-interfaces)
- [Deprecate @prague/app-component](#deprecate-pragueapp-component)
- [Query and List Removed From IComponent](#query-and-list-removed-from-icomponent)
- [Value type op change](#value-type-op-change)
- [`SharedMap.values()` and `.entries()` unpack local values](#sharedmapvalues-and-entries-unpack-local-values)
- [Deprecate @prague/app-datastore](#deprecate-pragueapp-datastore)

### `IComponent` not to be derived from

`IComponent` is no longer intended to be derived from. Instead it serves as a Fluid specific form of 'any' and that
clients can cast objects to in order to probe for implemented component interfaces.

### `sequence.annotateRange()` argument order changed

The `start` and `end` arguments of `sequence.annotateRange()` have been changed to the first two arguments to make the codebase more consistent. The new function signature is as below:

```typescript
public annotateRange(
        start: number,
        end: number,
        props: MergeTree.PropertySet,
        combiningOp?: MergeTree.ICombiningOp) {
```

### `sharedString.insertText()` argument order changed

The `pos` and `text` arguments of `sharedString.insertText()` have been switched to make it more consistent with other sharedString methods. The new function signature is as below:

```typescript
public insertText(pos: number, text: string, props?: MergeTree.PropertySet) {
```

### `mergeTree.getOffset()` -> `mergeTree.getPosition()`

`mergeTree.getOffset()` and `Client.getOffset()` have been renamed to `getPosition()` to more accurately reflect their functionality.

### Updated sequence API to provide richer access to the underlying merge tree

The following methods of mergeTree have been exposed on sequence:

- `addLocalReference()`
- `removeLocalReference()`
- `posFromRelativePos()`
- `getPosition()`
- `getSegmentFromId()` (as `getMarkerFromId() on sharedString)
- `getContainingSegment()` (takes only one argument: position. If you want to use a remote refseq and/or clientID, use sequence.resolveRemoteClientPosition())
- `walkSegments()` (this should be used instead of `mergeTree.mapRange()`)
- `getStackContext()`

If these are being accessed directly from the sequence or client, they should be changed to access through sequence, since these will become private in mergeTree/mergeTree client in the future.

### ISequenceDeltaRange.offset -> ISequenceDeltaRange.position

The `offset` member of the ISequenceDeltaRange interface has been renamed to `position`

### IComponent* interfaces from @prague/container-definitions are moved to @prague/component-core-interfaces

The following interfaces have moved:

`IComponent`
`IComponentLoadable`
`IComponentRunnable`
`ISharedComponent`
`IComponentConfiguration`
`IComponentTokenProvider`
`IComponentRouter`
`IComponentHTMLRender`
`IComponentHTMLVisual`
`IComponentHTMLView`
`IComponentHTMLOptions`
`IRequest`
`IResponse`

### Query and List Removed From IComponent

The query and list methods have been removed from IComponent and been replaced with strongly type properties.

#### Component Consumers

Consumers should update their code as follows.

Before:

```typescript
const thing = component.query<IComponentThing>('IComponentThing');
```

After:

```typescript
const thing = component.IComponentThing;
```

in both cases the consumer should check for undefined before using.

#### Component Implementors

Component implementors no longer need to implement query, list, or supported interfaces. They now need to add a property for
each interface they implement, or wish to expose. They will get compile time errors if they do not implement these properties for
interfaces they implement.

Before:

```typescript
class MyComponent implements IComponentThing {
    private static readonly supportedInterfaces = ["IComponentThing"];

    public query<T>(id: string): T{
        if(this.list().indexOf(id) !== -1){
            return this as T
        }
        return undefined;
    }

    public list(): string[]{
        return MyComponent.supportedInterfaces;
    }

    public doThing(){
       // ...
    }
}
```

After:

```typescript
class MyComponent implements IComponentThing {

    public get IComponentThing() { return this; }

    public doThing() {
       // ...
    }
}
```

#### Component Interface Implementors

Component interface implementors must do the following so that their interfaces are exposed off IComponent for consumers,
and so Component implementors get strong typing.

 Before:

```typescript
export interface IComponentThing {
    doThing(): void;
}
```

After:

```typescript
export interface IProvideComponentThing {
    // This property will be implemented
    // to expose this interface IComponentThing
    // For both direct implementors, and those that
    // delegate the implmentation to another object
    readonly IComponentThing: IComponentThing;
}

export interface IComponentThing extends IProvideComponentThing {
    doThing(): void;
}

// This augments the IComponent interface, so that
// all consumers who use your package will see your
// interface optionally exposed on IComponent
// You can find out more about module augmentation
// and interface merging here:
// https://www.typescriptlang.org/docs/handbook/declaration-merging.html
declare module "@prague/component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentThing>> {
    }
}
```

### Deprecate @prague/app-component

@prague/app-component is deprecated. Please switch to use @prague/aqueduct for the new component interfaces

### Value type op change

In 0.7 and below, the type of a SharedMap message for value types (Counter, DistributedSet, etc.) would match the type
("counter", "distributedSet", etc.).  In 0.8 the message type is "act" for all value types.  Value type ops produced
from runtimes before 0.8 are not compatible with 0.8 as a result (e.g. if replaying old ops).

### `SharedMap.values()` and `.entries()` unpack local values

Previously, `SharedMap.values()` and `SharedMap.entries()` would iterate over `ILocalViewElement`s rather than the
contained values.  To retrieve the contained values you would have then extracted the ILocalViewElement.localValue.
In 0.8 these methods now iterate over the contained values directly, so calls to get the .localValue should be
removed.

### Deprecate @prague/app-datastore

The package @prague/app-datastore is deprecated. Please switch to use tiny-web-host

## 0.7 Breaking Changes (July 30, 2019)

- [instantiateComponent changes](#instantiatecomponent-changes)

### instantiateComponent changes

`ComponentRuntime.load` no longer returns the runtime as a promise. Instead clients need to provide a callback to the
method which is called with the runtime as an argument once the runtime is loaded and ready. This method will be
called prior to resolving any requests for the component. Because of this clients should make sure to register all
request handlers prior to returning from the callback.

To convert modify

```typescript
const runtime = await ComponentRuntime.load(context, dataTypes);
const progressCollectionP = VideoPlayerCollection.load(runtime, context);
runtime.registerRequestHandler(async (request: IRequest) => {
    const progressCollection = await progressCollectionP;
    return progressCollection.request(request);
});
```

to

```typescript
ComponentRuntime.load(
    context,
    dataTypes,
    (runtime) => {
        const progressCollectionP = VideoPlayerCollection.load(runtime, context);
        runtime.registerRequestHandler(async (request: IRequest) => {
            const progressCollection = await progressCollectionP;
            return progressCollection.request(request);
        });
    });
```

`instantiateComponent` is now a void return type.

## 0.6 Breaking Changes (July 17, 2019)

- [Interface renames](#interface-renames)
- [defaultValueTypes is no longer global](#defaultvaluetypes-is-no-longer-global)
- [ContainerRuntime registerRequestHandler passed into the constructor](#containerruntime-registerrequesthandler-passed-into-the-constructor)

### Interface renames

- Interface `IPragueResolvedUrl` renamed to `IFluidResolvedUrl`
- Interface `IChaincodeFactory` renamed to `IRuntimeFactory`.
- Deprecated `IComponent` interface has been removed
- Deprecated `IPlatform` has been removed

### defaultValueTypes is no longer global

Previously, value types for `SharedMap`s were registered via calls to `registerDefaultValueType(type)`, which would add the type to a global collection.  This global has been replaced by a member on the extension, which can be set as a parameter to the `.getFactory()` method.  So for example, the following usage:

```typescript
registerDefaultValueType(new DistributedSetValueType());
registerDefaultValueType(new CounterValueType());
const mapExtension = SharedMap.getFactory();
```

Should change to the following:

```typescript
const mapValueTypes = [
    new DistributedSetValueType(),
    new CounterValueType(),
];
const mapExtension = SharedMap.getFactory(mapValueTypes);
```

You can also still register value types on a `SharedMap` itself via `map.registerValueType(type)` after it is created.

### ContainerRuntime registerRequestHandler passed into the constructor

Previously you would call something like this:

```javascript
const runtime = await ContainerRuntime.load(context, registry);
runtime.registerRequestHandler(async (request: IRequest) => {
    // Request Handling Logic
});
```

In `ContainerRuntime.load(...)` if we are loading from a snapshot we trigger the load of all the components. This means if any of the components call `request(...)` on the ContainerRuntime it will not be registered yet. By passing in a `createRequestHandler` we can set the requestHandler before we load any components.

Now:

```javascript
const createRequestHandler = (runtime: ContainerRuntime) => {
    return(async (request: IRequest) => {
        // Request Handling Logic
    });
};
const runtime = await ContainerRuntime.load(context, registry, createRequestHandler);
```

We use a factory so we can pass in the runtime after it has been created to be used in the request routing.

## 0.5 Breaking Changes (July 3, 2019)

Renamed the sharepoint driver files and class names in odsp-socket-storage. Deleted the previous implementation of odsp driver.

- [attach() on IChannel/ISharedObject is now register()](#attach-on-ichannelisharedobject-is-now-register)
- [Separate Create and Attach Component](#separate-create-and-attach-component)
- [Stream inheritance and Cell rename](#stream-inheritance-and-cell-rename)

### attach() on IChannel/ISharedObject is now register()

We always assumed that if you had a channel you were in a state that they could be attached. This is no longer true because of the Separate Create and Attach Component work (See below). Channels are tied to component runtime and if the runtime is not attached but you try to attach the channel bad things happen.

The `register()` call, instead of simply attaching, will register a channel with the underlying component runtime. If the runtime is already attached it will attach the channel. If the runtime is not attached it will queue the channel to be attached when the runtime is attached.

### Separate Create and Attach Component

There used to be only one method to add a component that was called `createAndAttachComponent`. The logic lived on the `ContainerRuntime` and the method was piped through the `IComponentContext` and also lived on the `ComponentRuntime`.

Now the `ContainerRuntime` consists of a `createComponent(id: string, pkg: string)` method. `createComponent` will produce and return a new `ComponentRuntime` based on the `id` and `pkg` provided. Creating a ComponentRuntime requires calling the `instantiateComponent` function on your factory. This code will be executed before returning the new `ComponentRuntime` object.

To attach a `ComponentRuntime` you need to call `attach()` on the `ComponentRuntime` directly. The framework guarantees that any channels `registered()`on the runtime when attach is called will be snapshotted and sent as a part of the original Attach OP (see above).

For compatibility there is still a `createAndAttachComponent` method on the `ComponentRuntime`. This method simply calls `createComponent` then calls `attach()` right away on that new component before returning.

### Stream inheritance and Cell rename

- Stream no longer inherit from SharedMap.   Create a separate SharedMap if needed. This also mean Stream snapshot format has changed
- class Cell is renamed SharedCell

## 0.4 Breaking Changes (June 17, 2019)

The IComponent in @prague/runtime-defintions and IPlatform in @prague/container-definitions have been deprecated and
will be removed in the next release.

They have been replaced with the IComponent inside of @prague/container-definitions.

All static methods have been changed from PascalCase to camelCase.

Deleted sharepoint-socket-storage package from drivers. Moved all files from sharepoint-socket-storage to odsp-socket-storage.

## 0.3 Breaking Changes (June 3, 2019)

- [Legacy chaincode API removal](#legacy-chaincode-api-removal)
- [Container and Component Packages and Classes Renamed](#container-and-component-packages-and-classes-renamed)
- [SparseMatrix moved](#sparsematrix-moved)
- [Rename one of the IComponentRegistry definition to ISharedObjectRegistry](#rename-one-of-the-icomponentregistry-definition-to-isharedobjectregistry)
- [API ITree and ISnapshotTree "sha" properties have been renamed to "id"](#api-itree-and-isnapshottree-sha-properties-have-been-renamed-to-id)
- [Rename IComponentContext getComponent method](#rename-icomponent-getcomponent-method)
- [Rename api-definitions package](#rename-api-definitions-package)
- [Rename IDistributedObjectServices](#rename-idistributedobjectservices)

### Legacy chaincode API removal

The legacy definitions inside of @prague/runtime-defintions have been removed. This primarily was the `IChaincode`
and `IRuntime` interfaces. These interfaces existed to make use of the legacy chaincode packages as the component
runtime was bootstrapped. Now that these legacy packages have been converted to the updated API there is no longer
a need to have these legacy interfaces in the core runtime.

#### instantiateComponent

In 0.2 `instantiateComponent` is defined as

```typescript
export interface IComponentFactory {
    instantiateComponent(): Promise<IChaincodeComponent>;
}
```

With the switch to 0.3 we now have `instantiateComponent` look similar to `instantiateRuntime`. Rather than binding
the context to the component after making the instantiate call we now do it as part of it. This simplifies
the startup logic.

Also similar to `instantiateRuntime` the `instantiateComponent` returns the created runtime object. This object will
be what gets notified of core operations like op processing and request handling.

```typescript
export interface IComponentFactory {
    instantiateComponent(context: IComponentContext): Promise<IComponentRuntime>;
}
```

If you were making use of the @prague/app-component package then there is a static helper function on `Component`
called `createComponentFactory` that simplifies this startup behavior.

#### ComponentHost is now ComponentRuntime

The old `ComponentHost` has been renamed `ComponentRuntime`.

Similar to the underlying runtime this class serves as a common set of code used to manage the runtime behavior for
a component. It deals with op routing, snapshot loads, and data structure management.

#### ComponentRuntime does not reference app code

The old `ComponentHost` would take a reference to the dynamically loaded chaincode. This led to needing
to dot into the runtime in most cases to find its component.

Instead in 0.3 the `ComponentRuntime` matches the underlying `Runtime` in giving access to app defined components
via the request mechanism. `ComponentRuntime` exposes a `registerRequestHandler` function which can be used
to define URL request routes. The default behavior when making use of @prague/app-component is to return the
`Component` when making a request against / as shown in the snippet below. App developers can customize
this behavior should they need more control.

```typescript
debug(`${this.dbgName}.instantiateComponent()`);

// Instantiation of underlying data model for the component
debug(`${this.dbgName}.LoadFromSnapshot() - begin`);
this._host = await ComponentRuntime.LoadFromSnapshot(context, new Map(this[typeToFactorySym]));
debug(`${this.dbgName}.LoadFromSnapshot() - end`);

// Load the app specific code. We do not await on it because it is not needed to begin inbounding operations.
// The promise is awaited on when URL request are made against the component.
this._host.registerRequestHandler(async (request: IRequest) => {
    debug(`request(url=${request.url})`);
    return request.url && request.url !== "/"
        ? this.request(request)
        : { status: 200, mimeType: "prague/component", value: this };
});

return this._host;
```

Developers should gain access to components in almost all cases by URL. The API will both make this simpler to do
and begin requiring it in later PRs.

#### @prague/app-component Component

The Component defined in the app-component package largely has stayed the same. The one primary change is that
it now takes in an `IComponentRegistry` rather than a map of strings to `IChaincodeComponent` constructors.

The `IComponentRegistry` is defined as

```typescript
export interface IComponentRegistry {
    get(name: string): Promise<IComponentFactory>;
}
```

By using the registry a developer can make use of components not defined with @prague/app-component. The es6 map
can be used to easily implement this type. But an end user can have more control, especially with regards to dynamic
loading, by directly implenting it.

Conversion from the old constructor form to this new one is largely a mechanical process of wrapping the constructor
with a call to `Component.createComponentFactory`. For example here is an existing call and its updating version.

Existing:

```typescript
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(context, pkg.name, [
        ["@chaincode/chart-view", Promise.resolve(chartView.ChartView)],
        ["@chaincode/flow-document", Promise.resolve(flowDocument.FlowDocument)],
    ]);
}
```

And then its updated version:

```typescript
return Component.instantiateRuntime(
        context,
        pkg.name,
        new Map([
            ["@chaincode/chart-view", Promise.resolve(Component.createComponentFactory(chartView.ChartView))],
            ["@chaincode/flow-document", Promise.resolve(Component.createComponentFactory(flowDocument.FlowDocument))],
        ]));
```

#### @prague/merge-tree Remove ISegment.getType() and SegmentType enum

We are trying to decouple merge tree from specific segment types, as
the segment types are defined by the sequence, like sharedstring.
So we've removed the centralized enum of segment types from mergeTree
and it's useage on ISegment.

```typescript
if(segment.getType() === SegmentType.Text){
    const text = segment as TextSegment
    ...
} else if(segment.getType() === SegmentType.Marker){
    const marker = segment as Marker
    ...
}
```

Becomes:

```typescript
if(TextSegment.Is(segment)) {
    // segment will now know it's a text segment
    // and can be used as such
    ...
}else if (Marker.is(segment)) {
    // segment will now know it's a marker
    // and can be used as such
    ...
}
```

#### @prague/merge-tree Remove text specific functions from merge tree and move to SharedString

We are trying to decouple merge tree from specific segment types, as
the segment types are defined by the sequence, like sharedstring.
So we've moved all text specific method to shared string from client
and merge tree.

```typescript
sharedString.client.getTextAndMarkers("pg");
sharedString.client.getText();
```

Becomes:

```typescript
sharedString.getTextAndMarkers("pg");
sharedString.getText(start?, end?);
```

### Container and Component Packages and Classes Renamed

The following classes and packages are renamed to align with what they are.

```text
Context -> ContainerContext
Runtime -> ContainerRuntime
```

```text
Package @prague/runtime -> @prague/container-runtime
Package @prague/component -> @prague/component-runtime
```

### SparseMatrix moved

Move SparseMatrix to @prague/sequence to avoid circular dependencies when adding to client-api

### Rename one of the IComponentRegistry definition to ISharedObjectRegistry

The IComponentRegistry in component-runtime should be a ISharedObjectRegistry
Also renamed ComponentRuntime.LoadFromSnapshot to ComponentRuntime.Load
and switch the argument order for ContainerRuntime.Load to make those match

### API ITree and ISnapshotTree "sha" properties have been renamed to "id"

The "sha" property has been renamed to "id" on the ITree and ISnapshotTree interfaces in  @prague/container-definitions since this property should not be assumed to be a sha. Storage drivers may need to be updated to accommodate this change

### Rename IComponentContext getComponent method

To match what the method is returning, rename:
  `IComponentContext.getComponent` -> `IComponentContext.getComponentRuntime`

### Rename api-definitions package

This package no longer houses interface definitions, but rather has the base class of all the shared objects in the runtime.  Renaming:
  `@prague/api-definitions` -> `@prague/shared-object-common`

### Rename IDistributedObjectServices

Renaming for consistency with the rest of the runtime:
  `IDistributedObjectServices` -> `ISharedObjectServices`
