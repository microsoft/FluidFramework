# Breaking changes

## 0.23 Breaking Changes
- [Removed `collaborating` event on IComponentRuntime](#Removed-`collaborating`-event-on-IComponentRuntime)
- [ISharedObjectFactory rename](#ISharedObjectFactory)
- [LocalSessionStorageDbFactory moved to @fluidframework/local-driver](LocalSessionStorageDbFactory-moved-to-@fluidframework/local-driver)

### Removed `collaborating` event on IComponentRuntime
Component Runtime no longer fires the collaborating event on attaching. Now it fires `attaching` event.

### ISharedObjectFactory
`ISharedObjectFactory` renamed to `IChannelFactory` and moved from `@fluidframework/shared-object-base` to `@fluidframework/component-runtime-definitions`

### LocalSessionStorageDbFactory moved to @fluidframework/local-driver
Previously, `LocalSessionStorageDbFactory` was part of the `@fluidframework/webpack-component-loader` package.  It has been moved to the `@fluidframework/local-driver` package.

## 0.22 Breaking Changes
- [Deprecated `path` from `IComponentHandleContext`](#Deprecated-`path`-from-`IComponentHandleContext`)
- [Dynamically loaded components compiled against older versions of runtime](#Dynamically-loaded-components)
- [ContainerRuntime.load Request Handler Changes](#ContainerRuntime.load-Request-Handler-Changes)
- [IComponentHTMLVisual removed](#IComponentHTMLVisual-removed)
- [IComponentReactViewable deprecated](#IComponentReactViewable-deprecated)
- [Forward Compat For Loader IComponent Interfaces](#Forward-Compat-For-Loader-IComponent-Interfaces)
- [Add Undefined to getAbsoluteUrl return type](#Add-Undefined-to-getAbsoluteUrl-return-type)
- [Renamed TestDeltaStorageService, TestDocumentDeltaConnection, TestDocumentService, TestDocumentServiceFactory and TestResolver](#Renamed-TestDeltaStorageService,-TestDocumentDeltaConnection,-TestDocumentService,-TestDocumentServiceFactory-and-TestResolver)
- [DocumentDeltaEventManager has been renamed and moved to "@fluidframework/test-utils"](#DocumentDeltaEventManager-has-been-renamed-and-moved-to-"@fluidframework/test-utils")
- [`isAttached` replaced with `attachState` property](#`isAttached`-replaced-with-`attachState`-property)

### Deprecated `path` from `IComponentHandleContext`
Deprecated the `path` field from the interface `IComponentHandleContext`. This means that `IComponentHandle` will not have this going forward as well.

Added an `absolutePath` field to `IComponentHandleContext` which is the absolute path to reach it from the container runtime.

### Dynamically loaded components
Components that were compiled against Fluid Framework <= 0.19.x releases will fail to load. A bunch of APIs has been deprecated in 0.20 & 0.21 and back compat support is being removed in 0.22. Some of the key APIs are:
   - IComponentRuntime.attach
   - ContainerContext.isAttached
   - ContainerContext.isLocal
Such components needs to be compiled against >= 0.21 runtime and can be used in container that is built using >= 0.21 runtime as well.

### ContainerRuntime.load Request Handler Changes
ContainerRuntime.load no longer accepts an array of RuntimeRequestHandlers. It has been changed to a single function parameter with a compatible signature:
`requestHandler?: (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>`

 To continue to use RuntimeRequestHandlers you can used the `RuntimeRequestHandlerBuilder` in the package `@fluidframework/request-handler`

example:
``` typescript
    const builder = new RuntimeRequestHandlerBuilder();
    builder.pushHandler(...this.requestHandlers);
    builder.pushHandler(componentRuntimeRequestHandler);

    const runtime = await ContainerRuntime.load(
        context,
        this.registryEntries,
        async (req,rt) => builder.handleRequest(req, rt),
        undefined,
        scope);
```

Additionally the class `RequestParser` has been moved to the `@fluidframework/runtime-utils` package

This will allow consumers of our ContainerRuntime to substitute other routing frameworks more easily.

### IComponentHTMLVisual removed
The `IComponentHTMLVisual` interface was deprecated in 0.21, and is now removed in 0.22.  To support multiview scenarios, consider split view/model patterns like those demonstrated in the multiview sample.

### IComponentReactViewable deprecated
The `IComponentReactViewable` interface is deprecated and will be removed in an upcoming release.  For multiview scenarios, instead use a pattern like the one demonstrated in the sample in /components/experimental/multiview.  This sample demonstrates how to create multiple views for a component.


### Forward Compat For Loader IComponent Interfaces

As part of the Fluid Data Library (FDL) and Fluid Component Library (FCL) split we will be renaming a significant number of out interfaces. Some of these interfaces are used across the loader -> runtime boundary. For these interfaces we have introduced the newly renamed interfaces in this release. This will allow Host's to implment forward compatbitiy for these interfaces, so they are not broken when the implementations themselves are renamed.

- `IComponentLastEditedTracker` will become `IFluidLastEditedTracker`
- `IComponentHTMLView` will become `IFluidHTMLView`
- `IComponentMountableViewClass` will become `IFluidMountableViewClass`
- `IComponentLoadable` will become `IFluidLoadable`
- `IComponentRunnable` will become `IFluidRunnable`
- `IComponentConfiguration` will become `IFluidConfiguration`
- `IComponentRouter` will become `IFluidRouter`
- `IComponentHandleContext` will become `IFluidHandleContext`
- `IComponentHandle` will become `IFluidHandle`
- `IComponentSerializer `will become `IFluidSerializer`
- `IComponentTokenProvider` will become `IFluidTokenProvider`

`IComponent` will also become `IFluidObject`, and the mime type for for requests will change from `fluid/component` to `fluid/object`

To ensure forward compatability when accessing the above interfaces outside the context of a container e.g. from the host, you should use the nullish coalesing operator (??).

For example
``` typescript
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

getAbsoluteUrl on the container runtime and component context now returns `string | undefined`. `undefined` will be returned if the container or component is not attached. You can determine if  a component is attached and get its url with the below snippit:
```typescript
import { waitForAttach } from "@fluidframework/aqueduct";


protected async componentHasInitialized() {
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
- `TestDeltaStorageService` -> `LocalDeltaStorageService`
- `TestDocumentDeltaConnection` -> `LocalDocumentDeltaConnection`
- `TestDocumentService` -> `LocalDocumentService`
- `TestDocumentServiceFactory` -> `LocalDocumentServiceFactory`
- `TestResolver` -> `LocalResolver`

### DocumentDeltaEventManager has been renamed and moved to "@fluidframework/test-utils"

`DocumentDeltaEventManager` has moved to "@fluidframework/test-utils" and renamed to `OpProcessingController`.

The `registerDocuments` method has been renamed to `addDeltaManagers` and should be called with a list of delta managers. Similarly, all the other methods have been updated to be called with delta managers.

So, the usage has now changed to pass in the deltaManager from the object that was passed earlier. For example:

```typescript
// Old usage
containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
containerDeltaEventManager.registerDocuments(component1.runtime, component2.runtime);

// New usage
opProcessingController = new OpProcessingController(deltaConnectionServer);
opProcessingController.addDeltaManagers(component1.runtime.deltaManager, component2.runtime.deltaManager);
```

### `isAttached` replaced with `attachState` property

`isAttached` is replaced with `attachState` property on `IContainerContext`, `IContainerRuntime` and `IComponentContext`.
`isAttached` returned true when the entity was either attaching or attached to the storage.
So if `attachState` is `AttachState.Attaching` or `AttachState.Attached` then `isAttached` would have returned true.
Attaching is introduced in regards to Detached container where there is a time where state is neither AttachState.Detached nor AttachState.Attached.

## 0.21 Breaking Changes
- [Removed `@fluidframework/local-test-utils`](#removed-`@fluidframework/local-test-utils`)
- [IComponentHTMLVisual deprecated](#IComponentHTMLVisual-deprecated)
- [createValueType removed from SharedMap and SharedDirectory](#createValueType-removed-from-SharedMap-and-SharedDirectory)
- [Sequence snapshot format change](#Sequence-snapshot-format-change)
- [isLocal api removed](#isLocal-api-removed)
- [register/attach api renames on handles, components and dds](#register/attach-api-rename-on-handles,-components-and-dds)
- [Error handling changes](#Error-handling-changes)

### Removed `@fluidframework/local-test-utils`
Removed this package so classes like `TestHost` are no longer supported. Please contact us if there were dependencies on this or if any assistance in required to get rid of it.

### IComponentHTMLVisual deprecated
The `IComponentHTMLVisual` interface is deprecated and will be removed in an upcoming release.  For multiview scenarios, instead use a pattern like the one demonstrated in the sample in /components/experimental/multiview.  This sample demonstrates how to create multiple views for a component.

### createValueType removed from SharedMap and SharedDirectory
The `createValueType()` method on `SharedMap` and `SharedDirectory` was deprecated in 0.20, and is now removed in 0.21.  If `Counter` functionality is required, the `@fluidframework/counter` DDS can be used for counter functionality.

### isLocal api removed
isLocal api is removed from the repo. It is now replaced with isAttached which tells that the entity is attached or getting attached to storage. So its meaning is opposite to isLocal.

### register/attach api renames on handles, components and dds
Register on dds and attach on component runtime is renamed to bindToContext(). attach on handles is renamed to attachGraph().

### Error handling changes
ErrorType enum has been broken into 3 distinct enums / layers:
1. [ContainerErrorType](./packages/loader/container-definitions/src/error.ts) - errors & warnings raised at loader level
2. [OdspErrorType](./packages/drivers/odsp-driver/src/odspError.ts) and [R11sErrorType](./packages/drivers/routerlicious-driver/src/documentDeltaConnection.ts) - errors raised by ODSP and R11S drivers.
3. Runtime errors, like ```"summarizingError"```, ```"dataCorruptionError"```. This class of errors it not pre-determined and depends on type of container loaded.

[ICriticalContainerError.errorType](./packages/loader/container-definitions/src/error.ts) is now a string, not enum, as loader has no visibility into full set of errors that can be potentially raised. Hosting application may package different drivers and open different types of containers, thus making errors list raised at container level dynamic.

### Sequence snapshot format change

Due to a change in the sequence's snapshot format clients running a version less than 0.19 will not be able to load snapshots generated in 0.21. This will affect all sequence types includes shared string, and sparse matrix. If you need to support pre-0.19 clients please contact us for mitigations.


## 0.20 Breaking Changes
- [Value types deprecated on SharedMap and SharedDirectory](#Value-types-deprecated-on-sharedmap-and-shareddirectory)
- [rename @fluidframework/aqueduct-react to @fluidframework/react-inputs](#rename-@fluidframework/aqueduct-react-to-@fluidframework/react-inputs)

### Value types deprecated on SharedMap and SharedDirectory
The `Counter` value type and `createValueType()` method on `SharedMap` and `SharedDirectory` are now deprecated and will be removed in an upcoming release.  Instead, the `@fluidframework/counter` DDS can be used for counter functionality.

### rename @fluidframework/aqueduct-react to @fluidframework/react-inputs

aqueduct-react is actually just a react library and renamed it to reflect such.

## 0.19 Breaking Changes
- [Container's "error" event](#Container-Error-Event)
- [IUrlResolver change from requestUrl to getAbsoluteUrl](#IUrlResolver-change-from-requestUrl-to-getAbsoluteUrl)
- [Package rename from `@microsoft/fluid-*` to `@fluidframework/*`](#package-rename)

### Package rename
Package with the prefix "@microsoft/fluid-" is renamed to "@fluidframework/" to take advanage a separate namespace for fluid framework SDK packages.

### Container Error Event
"error" event is gone. All critical errors are raised on "closed" event via optiona error object.
"warning" event is added to expose warnings. Currently it contains summarizer errors and throttling errors.

### IUrlResolver change from requestUrl to getAbsoluteUrl
As we continue to refine our API around detached containers, and component urls, we've renamed IUrlResolver from requestUrl to getAbsoluteUrl

## 0.18 Breaking Changes

- [App Id removed as a parameter to OdspDocumentServiceFactory](#App-Id-removed-as-a-parameter-to-OdspDocumentServiceFactory)
- [ConsensusRegisterCollection now supports storing handles](#ConsensusRegisterCollection-now-supports-storing-handles)
- [Summarizing errors on parent container](#Summarizing-errors-on-parent-container)
- [OdspDocumentServiceFactory no longer requires a logger]
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
