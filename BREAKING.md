# Breaking changes

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
