# Breaking changes

## 0.22 Breaking Changes
- [Deprecated `path` from `IComponentHandleContext`](#Deprecated-`path`-from-`IComponentHandleContext`)


### Deprecated `path` from `IComponentHandleContext`
Deprecated the `path` field from the interface `IComponentHandleContext`. This means that `IComponentHandle` will not have this going forward as well.

Added an `absolutePath` field to `IComponentHandleContext` which is the absolute path to reach it from the container runtime.

## 0.21 Breaking Changes
- [Removed `@fluidframework/local-test-utils`](#removed-`@fluidframework/local-test-utils`)
- [IComponentHTMLVisual deprecated](#IComponentHTMLVisual-deprecated)
- [createValueType removed from SharedMap and SharedDirectory](#createValueType-removed-from-SharedMap-and-SharedDirectory)
- [Sequence snapshot format change](#Sequence-snapshot-format-change)
- [Error handling changes](#Error-handling-changes)


### Removed `@fluidframework/local-test-utils`
Removed this package so classes like `TestHost` are no longer supported. Please contact us if there were dependencies on this or if any assistance in required to get rid of it.

### IComponentHTMLVisual deprecated
The `IComponentHTMLVisual` interface is deprecated and will be removed in an upcoming release.  For multiview scenarios, instead use a pattern like the one demonstrated in the sample in /components/experimental/multiview.  This sample demonstrates how to create multiple views for a component.

### createValueType removed from SharedMap and SharedDirectory
The `createValueType()` method on `SharedMap` and `SharedDirectory` was deprecated in 0.20, and is now removed in 0.21.  If `Counter` functionality is required, the `@fluidframework/counter` DDS can be used for counter functionality.

### Error handling changes
ErrorType enum has been broken into 3 distinct enums / layers:
1. [ContainerErrorType](./packages/loader/container-definitions/src/error.ts) - errors & warnings raised at loader level
2. [OdspErrorType](./packages/drivers/odsp-driver/src/odspError.ts) and [R11sErrorType](./packages/drivers/routerlicious-driver/src/documentDeltaConnection.ts) - errors raised by ODSP and R11S drivers.
3. Runtime errors, like ```"summarizingError"```, ```"dataCorruptionError"```. This class of errors it not pre-determined and depends on type of container loaded.

[ICriticalContainerError.errorType](./packages/loader/container-definitions/src/error.ts) is now a string, not enum, as loader has no visibility into full set of errors that can be potentially raised. Hosting application may package different drivers and open different types of containers, thus making errors list raised at container level dynamic.

## 0.20 Breaking Changes
- [Value types deprecated on SharedMap and SharedDirectory](#Value-types-deprecated-on-sharedmap-and-shareddirectory)
- [rename @fluidframework/aqueduct-react to @fluidframework/react-inputs](#rename-@fluidframework/aqueduct-react-to-@fluidframework/react-inputs)

### Value types deprecated on SharedMap and SharedDirectory
The `Counter` value type and `createValueType()` method on `SharedMap` and `SharedDirectory` are now deprecated and will be removed in an upcoming release.  Instead, the `@fluidframework/counter` DDS can be used for counter functionality.

### rename @fluidframework/aqueduct-react to @fluidframework/react-inputs

aqueduct-react is actually just a react library and renamed it to reflect such.


### Sequence snapshot format change

Due to a change in the sequence's snapshot format clients running a version less than 0.19 will not be able to load snapshots generated in 0.21. This will affect all sequence types includes shared string, and sparse matrix. If you need to support pre-0.19 clients please contact us for mitigations.

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
