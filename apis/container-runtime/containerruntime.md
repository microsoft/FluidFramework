{"kind":"Class","title":"ContainerRuntime Class","summary":"Represents the runtime of the container. Contains helper functions/state of the container. It will define the store level mappings.","members":{"Method":{"_createDataStoreWithProps":"/docs/apis/container-runtime/containerruntime#_createdatastorewithprops-Method","addedGCOutboundReference":"/docs/apis/container-runtime/containerruntime#addedgcoutboundreference-Method","collectGarbage":"/docs/apis/container-runtime/containerruntime#collectgarbage-Method","createDataStore":"/docs/apis/container-runtime/containerruntime#createdatastore-Method","createDetachedDataStore":"/docs/apis/container-runtime/containerruntime#createdetacheddatastore-Method","createDetachedRootDataStore":"/docs/apis/container-runtime/containerruntime#createdetachedrootdatastore-Method","createRootDataStore":"/docs/apis/container-runtime/containerruntime#createrootdatastore-Method","createSummary":"/docs/apis/container-runtime/containerruntime#createsummary-Method","deleteUnusedRoutes":"/docs/apis/container-runtime/containerruntime#deleteunusedroutes-Method","dispose":"/docs/apis/container-runtime/containerruntime#dispose-Method","flush":"/docs/apis/container-runtime/containerruntime#flush-Method","getAbsoluteUrl":"/docs/apis/container-runtime/containerruntime#getabsoluteurl-Method","getAudience":"/docs/apis/container-runtime/containerruntime#getaudience-Method","getCurrentReferenceTimestampMs":"/docs/apis/container-runtime/containerruntime#getcurrentreferencetimestampms-Method","getGCData":"/docs/apis/container-runtime/containerruntime#getgcdata-Method","getGCNodePackagePath":"/docs/apis/container-runtime/containerruntime#getgcnodepackagepath-Method","getNodeType":"/docs/apis/container-runtime/containerruntime#getnodetype-Method","getPendingLocalState":"/docs/apis/container-runtime/containerruntime#getpendinglocalstate-Method","getQuorum":"/docs/apis/container-runtime/containerruntime#getquorum-Method","getRootDataStore":"/docs/apis/container-runtime/containerruntime#getrootdatastore-Method","getSnapshotBlobs":"/docs/apis/container-runtime/containerruntime#getsnapshotblobs-Method","load":"/docs/apis/container-runtime/containerruntime#load-Method","notifyAttaching":"/docs/apis/container-runtime/containerruntime#notifyattaching-Method","orderSequentially":"/docs/apis/container-runtime/containerruntime#ordersequentially-Method","process":"/docs/apis/container-runtime/containerruntime#process-Method","processSignal":"/docs/apis/container-runtime/containerruntime#processsignal-Method","refreshLatestSummaryAck":"/docs/apis/container-runtime/containerruntime#refreshlatestsummaryack-Method","request":"/docs/apis/container-runtime/containerruntime#request-Method","resolveHandle":"/docs/apis/container-runtime/containerruntime#resolvehandle-Method","setAttachState":"/docs/apis/container-runtime/containerruntime#setattachstate-Method","setConnectionState":"/docs/apis/container-runtime/containerruntime#setconnectionstate-Method","setFlushMode":"/docs/apis/container-runtime/containerruntime#setflushmode-Method","submitDataStoreAliasOp":"/docs/apis/container-runtime/containerruntime#submitdatastorealiasop-Method","submitDataStoreOp":"/docs/apis/container-runtime/containerruntime#submitdatastoreop-Method","submitDataStoreSignal":"/docs/apis/container-runtime/containerruntime#submitdatastoresignal-Method","submitSignal":"/docs/apis/container-runtime/containerruntime#submitsignal-Method","submitSummary":"/docs/apis/container-runtime/containerruntime#submitsummary-Method","summarize":"/docs/apis/container-runtime/containerruntime#summarize-Method","updateStateBeforeGC":"/docs/apis/container-runtime/containerruntime#updatestatebeforegc-Method","updateUsedRoutes":"/docs/apis/container-runtime/containerruntime#updateusedroutes-Method","uploadBlob":"/docs/apis/container-runtime/containerruntime#uploadblob-Method"},"Property":{"attachState":"/docs/apis/container-runtime/containerruntime#attachstate-Property","clientDetails":"/docs/apis/container-runtime/containerruntime#clientdetails-Property","clientId":"/docs/apis/container-runtime/containerruntime#clientid-Property","closeFn":"/docs/apis/container-runtime/containerruntime#closefn-Property","connected":"/docs/apis/container-runtime/containerruntime#connected-Property","deltaManager":"/docs/apis/container-runtime/containerruntime#deltamanager-Property","disableIsolatedChannels":"/docs/apis/container-runtime/containerruntime#disableisolatedchannels-Property","disposed":"/docs/apis/container-runtime/containerruntime#disposed-Property","enqueueSummarize":"/docs/apis/container-runtime/containerruntime#enqueuesummarize-Property","flushMode":"/docs/apis/container-runtime/containerruntime#flushmode-Property","IContainerRuntime":"/docs/apis/container-runtime/containerruntime#icontainerruntime-Property","IFluidDataStoreRegistry":"/docs/apis/container-runtime/containerruntime#ifluiddatastoreregistry-Property","IFluidHandleContext":"/docs/apis/container-runtime/containerruntime#ifluidhandlecontext-Property","IFluidRouter":"/docs/apis/container-runtime/containerruntime#ifluidrouter-Property","IFluidTokenProvider":"/docs/apis/container-runtime/containerruntime#ifluidtokenprovider-Property","isDirty":"/docs/apis/container-runtime/containerruntime#isdirty-Property","logger":"/docs/apis/container-runtime/containerruntime#logger-Property","options":"/docs/apis/container-runtime/containerruntime#options-Property","reSubmitFn":"/docs/apis/container-runtime/containerruntime#resubmitfn-Property","scope":"/docs/apis/container-runtime/containerruntime#scope-Property","storage":"/docs/apis/container-runtime/containerruntime#storage-Property","summarizeOnDemand":"/docs/apis/container-runtime/containerruntime#summarizeondemand-Property","summarizerClientId":"/docs/apis/container-runtime/containerruntime#summarizerclientid-Property"}},"package":"@fluidframework/container-runtime","unscopedPackageName":"container-runtime"}

[//]: # (Do not edit this file. It is automatically generated by API Documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/container-runtime](/docs/apis/container-runtime) &gt; [ContainerRuntime](/docs/apis/container-runtime/containerruntime)

Represents the runtime of the container. Contains helper functions/state of the container. It will define the store level mappings.

<b>Signature:</b>

```typescript
export declare class ContainerRuntime extends TypedEventEmitter<IContainerRuntimeEvents> implements IContainerRuntime, IGarbageCollectionRuntime, IRuntime, ISummarizerRuntime, ISummarizerInternalsProvider 
```
<b>Extends:</b> [TypedEventEmitter](/docs/apis/common-utils/typedeventemitter)<!-- -->&lt;[IContainerRuntimeEvents](/docs/apis/container-runtime-definitions/icontainerruntimeevents)

<b>Implements:</b> [IContainerRuntime](/docs/apis/container-runtime-definitions/icontainerruntime)<!-- -->, [IGarbageCollectionRuntime](/docs/apis/container-runtime/igarbagecollectionruntime)<!-- -->, IRuntime, [ISummarizerRuntime](/docs/apis/container-runtime/isummarizerruntime)<!-- -->, [ISummarizerInternalsProvider](/docs/apis/container-runtime/isummarizerinternalsprovider)

<b>Implements:</b> [IContainerRuntime](/docs/apis/container-runtime-definitions/icontainerruntime)<!-- -->, [IGarbageCollectionRuntime](/docs/apis/container-runtime/igarbagecollectionruntime)<!-- -->, IRuntime, [ISummarizerRuntime](/docs/apis/container-runtime/isummarizerruntime)<!-- -->, [ISummarizerInternalsProvider](/docs/apis/container-runtime/isummarizerinternalsprovider)

<b>Implements:</b> [IContainerRuntime](/docs/apis/container-runtime-definitions/icontainerruntime)<!-- -->, [IGarbageCollectionRuntime](/docs/apis/container-runtime/igarbagecollectionruntime)<!-- -->, IRuntime, [ISummarizerRuntime](/docs/apis/container-runtime/isummarizerruntime)<!-- -->, [ISummarizerInternalsProvider](/docs/apis/container-runtime/isummarizerinternalsprovider)

<b>Implements:</b> [IContainerRuntime](/docs/apis/container-runtime-definitions/icontainerruntime)<!-- -->, [IGarbageCollectionRuntime](/docs/apis/container-runtime/igarbagecollectionruntime)<!-- -->, IRuntime, [ISummarizerRuntime](/docs/apis/container-runtime/isummarizerruntime)<!-- -->, [ISummarizerInternalsProvider](/docs/apis/container-runtime/isummarizerinternalsprovider)

<b>Implements:</b> [IContainerRuntime](/docs/apis/container-runtime-definitions/icontainerruntime)<!-- -->, [IGarbageCollectionRuntime](/docs/apis/container-runtime/igarbagecollectionruntime)<!-- -->, IRuntime, [ISummarizerRuntime](/docs/apis/container-runtime/isummarizerruntime)<!-- -->, [ISummarizerInternalsProvider](/docs/apis/container-runtime/isummarizerinternalsprovider)

## Properties

<table class="table table-striped table-hover property-list">
<caption>List of properties on this class</caption>
  <thead>
    <tr>
     <th scope="col">Property</th>
 <th scope="col">Modifiers</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#attachstate-Property'>attachState</a></td>
      <td></td>
      <td><a href='/docs/apis/container-definitions#attachstate-Enum'>AttachState</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#clientdetails-Property'>clientDetails</a></td>
      <td></td>
      <td><a href='/docs/apis/protocol-definitions/iclientdetails'>IClientDetails</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#clientid-Property'>clientId</a></td>
      <td></td>
      <td>string | undefined</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#closefn-Property'>closeFn</a></td>
      <td></td>
      <td>(error?: ICriticalContainerError) => void</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#connected-Property'>connected</a></td>
      <td></td>
      <td>boolean</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#deltamanager-Property'>deltaManager</a></td>
      <td></td>
      <td>IDeltaManager<<a href='/docs/apis/protocol-definitions/isequenceddocumentmessage'>ISequencedDocumentMessage</a>, <a href='/docs/apis/protocol-definitions/idocumentmessage'>IDocumentMessage</a>></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#disableisolatedchannels-Property'>disableIsolatedChannels</a></td>
      <td></td>
      <td>boolean</td>
      <td>True if generating summaries with isolated channels is explicitly disabled. This only affects how summaries are written, and is the single source of truth for this container.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#disposed-Property'>disposed</a></td>
      <td></td>
      <td>boolean</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#enqueuesummarize-Property'>enqueueSummarize</a></td>
      <td></td>
      <td><a href='/docs/apis/container-runtime/isummarizer'>ISummarizer</a>["enqueueSummarize"]</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#flushmode-Property'>flushMode</a></td>
      <td></td>
      <td><a href='/docs/apis/runtime-definitions#flushmode-Enum'>FlushMode</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#icontainerruntime-Property'>IContainerRuntime</a></td>
      <td></td>
      <td>this</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#ifluiddatastoreregistry-Property'>IFluidDataStoreRegistry</a></td>
      <td></td>
      <td><a href='/docs/apis/runtime-definitions/ifluiddatastoreregistry'>IFluidDataStoreRegistry</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#ifluidhandlecontext-Property'>IFluidHandleContext</a></td>
      <td></td>
      <td><a href='/docs/apis/core-interfaces/ifluidhandlecontext'>IFluidHandleContext</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#ifluidrouter-Property'>IFluidRouter</a></td>
      <td></td>
      <td>this</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#ifluidtokenprovider-Property'>IFluidTokenProvider</a></td>
      <td></td>
      <td>IFluidTokenProvider | undefined</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#isdirty-Property'>isDirty</a></td>
      <td></td>
      <td>boolean</td>
      <td>Returns true of container is dirty, i.e. there are some pending local changes that either were not sent out to delta stream or were not yet acknowledged.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#logger-Property'>logger</a></td>
      <td></td>
      <td><a href='/docs/apis/common-definitions/itelemetrylogger'>ITelemetryLogger</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#options-Property'>options</a></td>
      <td></td>
      <td>ILoaderOptions</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#resubmitfn-Property'>reSubmitFn</a></td>
      <td></td>
      <td>(type: <a href='/docs/apis/container-runtime#containermessagetype-Enum'>ContainerMessageType</a>, content: any, localOpMetadata: unknown, opMetadata: Record<string, unknown> | undefined) => void</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#scope-Property'>scope</a></td>
      <td></td>
      <td><a href='/docs/apis/core-interfaces#fluidobject-TypeAlias'>FluidObject</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#storage-Property'>storage</a></td>
      <td></td>
      <td><a href='/docs/apis/driver-definitions/idocumentstorageservice'>IDocumentStorageService</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#summarizeondemand-Property'>summarizeOnDemand</a></td>
      <td></td>
      <td><a href='/docs/apis/container-runtime/isummarizer'>ISummarizer</a>["summarizeOnDemand"]</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#summarizerclientid-Property'>summarizerClientId</a></td>
      <td></td>
      <td>string | undefined</td>
      <td>clientId of parent (non-summarizing) container that owns summarizer container</td>
    </tr>
  </tbody>
</table>

## Methods

<table class="table table-striped table-hover method-list">
<caption>List of methods on this class</caption>
  <thead>
    <tr>
     <th scope="col">Method</th>
 <th scope="col">Modifiers</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#_createdatastorewithprops-Method'>_createDataStoreWithProps(pkg, props, id, isRoot)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#addedgcoutboundreference-Method'>addedGCOutboundReference(srcHandle, outboundHandle)</a></td>
      <td></td>
      <td>Called when a new outbound reference is added to another node. This is used by garbage collection to identify all references added in the system.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#collectgarbage-Method'>collectGarbage(options)</a></td>
      <td></td>
      <td>Runs garbage collection and updates the reference / used state of the nodes in the container.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#createdatastore-Method'>createDataStore(pkg)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#createdetacheddatastore-Method'>createDetachedDataStore(pkg)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#createdetachedrootdatastore-Method'>createDetachedRootDataStore(pkg, rootDataStoreId)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#createrootdatastore-Method'>createRootDataStore(pkg, rootDataStoreId)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#createsummary-Method'>createSummary(blobRedirectTable, telemetryContext)</a></td>
      <td></td>
      <td>Create a summary. Used when attaching or serializing a detached container.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#deleteunusedroutes-Method'>deleteUnusedRoutes(unusedRoutes)</a></td>
      <td></td>
      <td>When running GC in test mode, this is called to delete objects whose routes are unused. This enables testing scenarios with accessing deleted content.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#dispose-Method'>dispose(error)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#flush-Method'>flush()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#getabsoluteurl-Method'>getAbsoluteUrl(relativeUrl)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#getaudience-Method'>getAudience()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#getcurrentreferencetimestampms-Method'>getCurrentReferenceTimestampMs()</a></td>
      <td></td>
      <td>Returns a server generated referenced timestamp to be used to track unreferenced nodes by GC.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#getgcdata-Method'>getGCData(fullGC)</a></td>
      <td></td>
      <td>Implementation of IGarbageCollectionRuntime::getGCData. Generates and returns the GC data for this container.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#getgcnodepackagepath-Method'>getGCNodePackagePath(nodePath)</a></td>
      <td></td>
      <td>Called by GC to retrieve the package path of the node with the given path. The node should belong to a data store or an attachment blob.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#getnodetype-Method'>getNodeType(nodePath)</a></td>
      <td></td>
      <td>Returns the type of the GC node. Currently, there are nodes that belong to the root ("/"), data stores or blob manager.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#getpendinglocalstate-Method'>getPendingLocalState()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#getquorum-Method'>getQuorum()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#getrootdatastore-Method'>getRootDataStore(id, wait)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#getsnapshotblobs-Method'>getSnapshotBlobs()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#load-Method'>load(context, registryEntries, requestHandler, runtimeOptions, containerScope, existing)</a></td>
      <td><code>static</code></td>
      <td>Load the stores from a snapshot and returns the runtime.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#notifyattaching-Method'>notifyAttaching(snapshot)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#ordersequentially-Method'>orderSequentially(callback)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#process-Method'>process(messageArg, local)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#processsignal-Method'>processSignal(message, local)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#refreshlatestsummaryack-Method'>refreshLatestSummaryAck(proposalHandle, ackHandle, summaryRefSeq, summaryLogger)</a></td>
      <td></td>
      <td>Implementation of ISummarizerInternalsProvider.refreshLatestSummaryAck</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#request-Method'>request(request)</a></td>
      <td></td>
      <td>Notifies this object about the request made to the container.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#resolvehandle-Method'>resolveHandle(request)</a></td>
      <td></td>
      <td>Resolves URI representing handle</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#setattachstate-Method'>setAttachState(attachState)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#setconnectionstate-Method'>setConnectionState(connected, clientId)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#setflushmode-Method'>setFlushMode(mode)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#submitdatastorealiasop-Method'>submitDataStoreAliasOp(contents, localOpMetadata)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#submitdatastoreop-Method'>submitDataStoreOp(id, contents, localOpMetadata)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#submitdatastoresignal-Method'>submitDataStoreSignal(address, type, content)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#submitsignal-Method'>submitSignal(type, content)</a></td>
      <td></td>
      <td>Submits the signal to be sent to other clients.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#submitsummary-Method'>submitSummary(options)</a></td>
      <td></td>
      <td>Generates the summary tree, uploads it to storage, and then submits the summarize op. This is intended to be called by the summarizer, since it is the implementation of ISummarizerInternalsProvider.submitSummary. It takes care of state management at the container level, including pausing inbound op processing, updating SummarizerNode state tracking, and garbage collection.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#summarize-Method'>summarize(options)</a></td>
      <td></td>
      <td>Returns a summary of the runtime at the current sequence number.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#updatestatebeforegc-Method'>updateStateBeforeGC()</a></td>
      <td></td>
      <td>Implementation of IGarbageCollectionRuntime::updateStateBeforeGC. Before GC runs, called by the garbage collector to update any pending GC state. This is mainly used to notify the garbage collector of references detected since the last GC run. Most references are notified immediately but there can be some for which async operation is required (such as detecting new root data stores).</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#updateusedroutes-Method'>updateUsedRoutes(usedRoutes, gcTimestamp)</a></td>
      <td></td>
      <td>Implementation of IGarbageCollectionRuntime::updateUsedRoutes. After GC has run, called to notify this container's nodes of routes that are used in it.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime#uploadblob-Method'>uploadBlob(blob)</a></td>
      <td></td>
      <td></td>
    </tr>
  </tbody>
</table>

<hr><div id=class-details>

## Property Details {#properties-details}

### attachState {#attachstate-Property}

<b>Signature:</b>

```typescript
get attachState(): AttachState;
```

### clientDetails {#clientdetails-Property}

<b>Signature:</b>

```typescript
get clientDetails(): IClientDetails;
```

### clientId {#clientid-Property}

<b>Signature:</b>

```typescript
get clientId(): string | undefined;
```

### closeFn {#closefn-Property}

<b>Signature:</b>

```typescript
get closeFn(): (error?: ICriticalContainerError) => void;
```

### connected {#connected-Property}

<b>Signature:</b>

```typescript
get connected(): boolean;
```

### deltaManager {#deltamanager-Property}

<b>Signature:</b>

```typescript
get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
```

### disableIsolatedChannels {#disableisolatedchannels-Property}

True if generating summaries with isolated channels is explicitly disabled. This only affects how summaries are written, and is the single source of truth for this container.

<b>Signature:</b>

```typescript
readonly disableIsolatedChannels: boolean;
```

### disposed {#disposed-Property}

<b>Signature:</b>

```typescript
get disposed(): boolean;
```

### enqueueSummarize {#enqueuesummarize-Property}

<b>Signature:</b>

```typescript
readonly enqueueSummarize: ISummarizer["enqueueSummarize"];
```

### flushMode {#flushmode-Property}

<b>Signature:</b>

```typescript
get flushMode(): FlushMode;
```

### IContainerRuntime {#icontainerruntime-Property}

<b>Signature:</b>

```typescript
get IContainerRuntime(): this;
```

### IFluidDataStoreRegistry {#ifluiddatastoreregistry-Property}

<b>Signature:</b>

```typescript
get IFluidDataStoreRegistry(): IFluidDataStoreRegistry;
```

### IFluidHandleContext {#ifluidhandlecontext-Property}

<b>Signature:</b>

```typescript
get IFluidHandleContext(): IFluidHandleContext;
```

### IFluidRouter {#ifluidrouter-Property}

<b>Signature:</b>

```typescript
get IFluidRouter(): this;
```

### IFluidTokenProvider {#ifluidtokenprovider-Property}

<b>Signature:</b>

```typescript
get IFluidTokenProvider(): IFluidTokenProvider | undefined;
```

### isDirty {#isdirty-Property}

Returns true of container is dirty, i.e. there are some pending local changes that either were not sent out to delta stream or were not yet acknowledged.

<b>Signature:</b>

```typescript
get isDirty(): boolean;
```

### logger {#logger-Property}

<b>Signature:</b>

```typescript
readonly logger: ITelemetryLogger;
```

### options {#options-Property}

<b>Signature:</b>

```typescript
get options(): ILoaderOptions;
```

### reSubmitFn {#resubmitfn-Property}

<b>Signature:</b>

```typescript
get reSubmitFn(): (type: ContainerMessageType, content: any, localOpMetadata: unknown, opMetadata: Record<string, unknown> | undefined) => void;
```

### scope {#scope-Property}

<b>Signature:</b>

```typescript
get scope(): FluidObject;
```

### storage {#storage-Property}

<b>Signature:</b>

```typescript
get storage(): IDocumentStorageService;
```

### summarizeOnDemand {#summarizeondemand-Property}

<b>Signature:</b>

```typescript
readonly summarizeOnDemand: ISummarizer["summarizeOnDemand"];
```

### summarizerClientId {#summarizerclientid-Property}

clientId of parent (non-summarizing) container that owns summarizer container

<b>Signature:</b>

```typescript
get summarizerClientId(): string | undefined;
```

## Method Details {#methods-details}

### \_createDataStoreWithProps {#_createdatastorewithprops-Method}

<b>Signature:</b>

```typescript
_createDataStoreWithProps(pkg: string | string[], props?: any, id?: string, isRoot?: boolean): Promise<IDataStore>;
```

#### Parameters {#_createdatastorewithprops-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>pkg</td>
      <td>string | string[]</td>
      <td></td>
    </tr>
    <tr>
      <td>props</td>
      <td>any</td>
      <td></td>
    </tr>
    <tr>
      <td>id</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>isRoot</td>
      <td>boolean</td>
      <td></td>
    </tr>
  </tbody>
</table>

### addedGCOutboundReference {#addedgcoutboundreference-Method}

Called when a new outbound reference is added to another node. This is used by garbage collection to identify all references added in the system.

<b>Signature:</b>

```typescript
addedGCOutboundReference(srcHandle: IFluidHandle, outboundHandle: IFluidHandle): void;
```

#### Parameters {#addedgcoutboundreference-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>srcHandle</td>
      <td><a href='/docs/apis/core-interfaces/ifluidhandle'>IFluidHandle</a></td>
      <td>The handle of the node that added the reference.</td>
    </tr>
    <tr>
      <td>outboundHandle</td>
      <td><a href='/docs/apis/core-interfaces/ifluidhandle'>IFluidHandle</a></td>
      <td>The handle of the outbound node that is referenced.</td>
    </tr>
  </tbody>
</table>

### collectGarbage {#collectgarbage-Method}

Runs garbage collection and updates the reference / used state of the nodes in the container.

<b>Signature:</b>

```typescript
collectGarbage(options: {
        logger?: ITelemetryLogger;
        runSweep?: boolean;
        fullGC?: boolean;
    }): Promise<IGCStats>;
```

#### Parameters {#collectgarbage-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>options</td>
      <td>{ logger?: <a href='/docs/apis/common-definitions/itelemetrylogger'>ITelemetryLogger</a>; runSweep?: boolean; fullGC?: boolean; }</td>
      <td></td>
    </tr>
  </tbody>
</table>

#### Returns {#collectgarbage-Method-returns}


the statistics of the garbage collection run.

<b>Return type(s):</b> Promise&lt;[IGCStats](/docs/apis/container-runtime/igcstats)<!-- -->&gt;

### createDataStore {#createdatastore-Method}

<b>Signature:</b>

```typescript
createDataStore(pkg: string | string[]): Promise<IDataStore>;
```

#### Parameters {#createdatastore-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>pkg</td>
      <td>string | string[]</td>
      <td></td>
    </tr>
  </tbody>
</table>

### createDetachedDataStore {#createdetacheddatastore-Method}

<b>Signature:</b>

```typescript
createDetachedDataStore(pkg: Readonly<string[]>): IFluidDataStoreContextDetached;
```

#### Parameters {#createdetacheddatastore-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>pkg</td>
      <td>Readonly<string[]></td>
      <td></td>
    </tr>
  </tbody>
</table>

### createDetachedRootDataStore {#createdetachedrootdatastore-Method}

<b>Signature:</b>

```typescript
createDetachedRootDataStore(pkg: Readonly<string[]>, rootDataStoreId: string): IFluidDataStoreContextDetached;
```

#### Parameters {#createdetachedrootdatastore-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>pkg</td>
      <td>Readonly<string[]></td>
      <td></td>
    </tr>
    <tr>
      <td>rootDataStoreId</td>
      <td>string</td>
      <td></td>
    </tr>
  </tbody>
</table>

### createRootDataStore {#createrootdatastore-Method}

{{% callout warning Deprecated %}}
- will be removed in an upcoming release. See \#9660.

{{% /callout %}}

<b>Signature:</b>

```typescript
createRootDataStore(pkg: string | string[], rootDataStoreId: string): Promise<IFluidRouter>;
```

#### Parameters {#createrootdatastore-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>pkg</td>
      <td>string | string[]</td>
      <td></td>
    </tr>
    <tr>
      <td>rootDataStoreId</td>
      <td>string</td>
      <td></td>
    </tr>
  </tbody>
</table>

### createSummary {#createsummary-Method}

Create a summary. Used when attaching or serializing a detached container.

<b>Signature:</b>

```typescript
createSummary(blobRedirectTable?: Map<string, string>, telemetryContext?: ITelemetryContext): ISummaryTree;
```

#### Parameters {#createsummary-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>blobRedirectTable</td>
      <td>Map<string, string></td>
      <td>A table passed during the attach process. While detached, blob upload is supported using IDs generated locally. After attach, these IDs cannot be used, so this table maps the old local IDs to the new storage IDs so requests can be redirected.</td>
    </tr>
    <tr>
      <td>telemetryContext</td>
      <td><a href='/docs/apis/runtime-definitions/itelemetrycontext'>ITelemetryContext</a></td>
      <td>summary data passed through the layers for telemetry purposes</td>
    </tr>
  </tbody>
</table>

### deleteUnusedRoutes {#deleteunusedroutes-Method}

When running GC in test mode, this is called to delete objects whose routes are unused. This enables testing scenarios with accessing deleted content.

<b>Signature:</b>

```typescript
deleteUnusedRoutes(unusedRoutes: string[]): void;
```

#### Parameters {#deleteunusedroutes-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>unusedRoutes</td>
      <td>string[]</td>
      <td>The routes that are unused in all data stores in this Container.</td>
    </tr>
  </tbody>
</table>

### dispose {#dispose-Method}

<b>Signature:</b>

```typescript
dispose(error?: Error): void;
```

#### Parameters {#dispose-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>error</td>
      <td>Error</td>
      <td></td>
    </tr>
  </tbody>
</table>

### flush {#flush-Method}

<b>Signature:</b>

```typescript
flush(): void;
```

### getAbsoluteUrl {#getabsoluteurl-Method}

<b>Signature:</b>

```typescript
getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;
```

#### Parameters {#getabsoluteurl-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>relativeUrl</td>
      <td>string</td>
      <td></td>
    </tr>
  </tbody>
</table>

### getAudience {#getaudience-Method}

<b>Signature:</b>

```typescript
getAudience(): IAudience;
```

### getCurrentReferenceTimestampMs {#getcurrentreferencetimestampms-Method}

Returns a server generated referenced timestamp to be used to track unreferenced nodes by GC.

<b>Signature:</b>

```typescript
getCurrentReferenceTimestampMs(): number | undefined;
```

### getGCData {#getgcdata-Method}

Implementation of IGarbageCollectionRuntime::getGCData. Generates and returns the GC data for this container.

<b>Signature:</b>

```typescript
getGCData(fullGC?: boolean): Promise<IGarbageCollectionData>;
```

#### Parameters {#getgcdata-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>fullGC</td>
      <td>boolean</td>
      <td>true to bypass optimizations and force full generation of GC data.</td>
    </tr>
  </tbody>
</table>

### getGCNodePackagePath {#getgcnodepackagepath-Method}

Called by GC to retrieve the package path of the node with the given path. The node should belong to a data store or an attachment blob.

<b>Signature:</b>

```typescript
getGCNodePackagePath(nodePath: string): Promise<readonly string[] | undefined>;
```

#### Parameters {#getgcnodepackagepath-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>nodePath</td>
      <td>string</td>
      <td></td>
    </tr>
  </tbody>
</table>

### getNodeType {#getnodetype-Method}

Returns the type of the GC node. Currently, there are nodes that belong to the root ("/"), data stores or blob manager.

<b>Signature:</b>

```typescript
getNodeType(nodePath: string): GCNodeType;
```

#### Parameters {#getnodetype-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>nodePath</td>
      <td>string</td>
      <td></td>
    </tr>
  </tbody>
</table>

### getPendingLocalState {#getpendinglocalstate-Method}

<b>Signature:</b>

```typescript
getPendingLocalState(): IPendingRuntimeState;
```

### getQuorum {#getquorum-Method}

<b>Signature:</b>

```typescript
getQuorum(): IQuorumClients;
```

### getRootDataStore {#getrootdatastore-Method}

<b>Signature:</b>

```typescript
getRootDataStore(id: string, wait?: boolean): Promise<IFluidRouter>;
```

#### Parameters {#getrootdatastore-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>id</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>wait</td>
      <td>boolean</td>
      <td></td>
    </tr>
  </tbody>
</table>

### getSnapshotBlobs {#getsnapshotblobs-Method}

<b>Signature:</b>

```typescript
getSnapshotBlobs(): Promise<void>;
```

### load {#load-Method}

Load the stores from a snapshot and returns the runtime.

<b>Signature:</b>

```typescript
static load(context: IContainerContext, registryEntries: NamedFluidDataStoreRegistryEntries, requestHandler?: (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>, runtimeOptions?: IContainerRuntimeOptions, containerScope?: FluidObject, existing?: boolean): Promise<ContainerRuntime>;
```

#### Parameters {#load-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>context</td>
      <td>IContainerContext</td>
      <td>Context of the container.</td>
    </tr>
    <tr>
      <td>registryEntries</td>
      <td><a href='/docs/apis/runtime-definitions#namedfluiddatastoreregistryentries-TypeAlias'>NamedFluidDataStoreRegistryEntries</a></td>
      <td>Mapping to the stores.</td>
    </tr>
    <tr>
      <td>requestHandler</td>
      <td>(request: <a href='/docs/apis/core-interfaces/irequest'>IRequest</a>, runtime: <a href='/docs/apis/container-runtime-definitions/icontainerruntime'>IContainerRuntime</a>) => Promise<<a href='/docs/apis/core-interfaces/iresponse'>IResponse</a>></td>
      <td>Request handlers for the container runtime</td>
    </tr>
    <tr>
      <td>runtimeOptions</td>
      <td><a href='/docs/apis/container-runtime/icontainerruntimeoptions'>IContainerRuntimeOptions</a></td>
      <td>Additional options to be passed to the runtime</td>
    </tr>
    <tr>
      <td>containerScope</td>
      <td><a href='/docs/apis/core-interfaces#fluidobject-TypeAlias'>FluidObject</a></td>
      <td></td>
    </tr>
    <tr>
      <td>existing</td>
      <td>boolean</td>
      <td>(optional) When loading from an existing snapshot. Precedes context.existing if provided</td>
    </tr>
  </tbody>
</table>

### notifyAttaching {#notifyattaching-Method}

<b>Signature:</b>

```typescript
notifyAttaching(snapshot: ISnapshotTreeWithBlobContents): void;
```

#### Parameters {#notifyattaching-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>snapshot</td>
      <td>ISnapshotTreeWithBlobContents</td>
      <td></td>
    </tr>
  </tbody>
</table>

### orderSequentially {#ordersequentially-Method}

<b>Signature:</b>

```typescript
orderSequentially(callback: () => void): void;
```

#### Parameters {#ordersequentially-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>callback</td>
      <td>() => void</td>
      <td></td>
    </tr>
  </tbody>
</table>

### process {#process-Method}

<b>Signature:</b>

```typescript
process(messageArg: ISequencedDocumentMessage, local: boolean): void;
```

#### Parameters {#process-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>messageArg</td>
      <td><a href='/docs/apis/protocol-definitions/isequenceddocumentmessage'>ISequencedDocumentMessage</a></td>
      <td></td>
    </tr>
    <tr>
      <td>local</td>
      <td>boolean</td>
      <td></td>
    </tr>
  </tbody>
</table>

### processSignal {#processsignal-Method}

<b>Signature:</b>

```typescript
processSignal(message: ISignalMessage, local: boolean): void;
```

#### Parameters {#processsignal-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>message</td>
      <td><a href='/docs/apis/protocol-definitions/isignalmessage'>ISignalMessage</a></td>
      <td></td>
    </tr>
    <tr>
      <td>local</td>
      <td>boolean</td>
      <td></td>
    </tr>
  </tbody>
</table>

### refreshLatestSummaryAck {#refreshlatestsummaryack-Method}

Implementation of ISummarizerInternalsProvider.refreshLatestSummaryAck

<b>Signature:</b>

```typescript
refreshLatestSummaryAck(proposalHandle: string | undefined, ackHandle: string, summaryRefSeq: number, summaryLogger: ITelemetryLogger): Promise<void>;
```

#### Parameters {#refreshlatestsummaryack-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>proposalHandle</td>
      <td>string | undefined</td>
      <td></td>
    </tr>
    <tr>
      <td>ackHandle</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>summaryRefSeq</td>
      <td>number</td>
      <td></td>
    </tr>
    <tr>
      <td>summaryLogger</td>
      <td><a href='/docs/apis/common-definitions/itelemetrylogger'>ITelemetryLogger</a></td>
      <td></td>
    </tr>
  </tbody>
</table>

### request {#request-Method}

Notifies this object about the request made to the container.

<b>Signature:</b>

```typescript
request(request: IRequest): Promise<IResponse>;
```

#### Parameters {#request-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>request</td>
      <td><a href='/docs/apis/core-interfaces/irequest'>IRequest</a></td>
      <td>Request made to the handler.</td>
    </tr>
  </tbody>
</table>

### resolveHandle {#resolvehandle-Method}

Resolves URI representing handle

<b>Signature:</b>

```typescript
resolveHandle(request: IRequest): Promise<IResponse>;
```

#### Parameters {#resolvehandle-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>request</td>
      <td><a href='/docs/apis/core-interfaces/irequest'>IRequest</a></td>
      <td>Request made to the handler.</td>
    </tr>
  </tbody>
</table>

### setAttachState {#setattachstate-Method}

<b>Signature:</b>

```typescript
setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void;
```

#### Parameters {#setattachstate-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>attachState</td>
      <td><a href='/docs/apis/container-definitions#attachstate-Enum'>AttachState.Attaching</a> | <a href='/docs/apis/container-definitions#attachstate-Enum'>AttachState.Attached</a></td>
      <td></td>
    </tr>
  </tbody>
</table>

### setConnectionState {#setconnectionstate-Method}

<b>Signature:</b>

```typescript
setConnectionState(connected: boolean, clientId?: string): void;
```

#### Parameters {#setconnectionstate-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>connected</td>
      <td>boolean</td>
      <td></td>
    </tr>
    <tr>
      <td>clientId</td>
      <td>string</td>
      <td></td>
    </tr>
  </tbody>
</table>

### setFlushMode {#setflushmode-Method}

<b>Signature:</b>

```typescript
setFlushMode(mode: FlushMode): void;
```

#### Parameters {#setflushmode-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>mode</td>
      <td><a href='/docs/apis/runtime-definitions#flushmode-Enum'>FlushMode</a></td>
      <td></td>
    </tr>
  </tbody>
</table>

### submitDataStoreAliasOp {#submitdatastorealiasop-Method}

<b>Signature:</b>

```typescript
submitDataStoreAliasOp(contents: any, localOpMetadata: unknown): void;
```

#### Parameters {#submitdatastorealiasop-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>contents</td>
      <td>any</td>
      <td></td>
    </tr>
    <tr>
      <td>localOpMetadata</td>
      <td>unknown</td>
      <td></td>
    </tr>
  </tbody>
</table>

### submitDataStoreOp {#submitdatastoreop-Method}

<b>Signature:</b>

```typescript
submitDataStoreOp(id: string, contents: any, localOpMetadata?: unknown): void;
```

#### Parameters {#submitdatastoreop-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>id</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>contents</td>
      <td>any</td>
      <td></td>
    </tr>
    <tr>
      <td>localOpMetadata</td>
      <td>unknown</td>
      <td></td>
    </tr>
  </tbody>
</table>

### submitDataStoreSignal {#submitdatastoresignal-Method}

<b>Signature:</b>

```typescript
submitDataStoreSignal(address: string, type: string, content: any): void;
```

#### Parameters {#submitdatastoresignal-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>address</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>type</td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td>content</td>
      <td>any</td>
      <td></td>
    </tr>
  </tbody>
</table>

### submitSignal {#submitsignal-Method}

Submits the signal to be sent to other clients.

<b>Signature:</b>

```typescript
submitSignal(type: string, content: any): void;
```

#### Parameters {#submitsignal-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>type</td>
      <td>string</td>
      <td>Type of the signal.</td>
    </tr>
    <tr>
      <td>content</td>
      <td>any</td>
      <td>Content of the signal.</td>
    </tr>
  </tbody>
</table>

### submitSummary {#submitsummary-Method}

Generates the summary tree, uploads it to storage, and then submits the summarize op. This is intended to be called by the summarizer, since it is the implementation of ISummarizerInternalsProvider.submitSummary. It takes care of state management at the container level, including pausing inbound op processing, updating SummarizerNode state tracking, and garbage collection.

<b>Signature:</b>

```typescript
submitSummary(options: ISubmitSummaryOptions): Promise<SubmitSummaryResult>;
```

#### Parameters {#submitsummary-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>options</td>
      <td><a href='/docs/apis/container-runtime/isubmitsummaryoptions'>ISubmitSummaryOptions</a></td>
      <td>options controlling how the summary is generated or submitted</td>
    </tr>
  </tbody>
</table>

### summarize {#summarize-Method}

Returns a summary of the runtime at the current sequence number.

<b>Signature:</b>

```typescript
summarize(options: {
        fullTree?: boolean;
        trackState?: boolean;
        summaryLogger?: ITelemetryLogger;
        runGC?: boolean;
        fullGC?: boolean;
        runSweep?: boolean;
    }): Promise<IRootSummaryTreeWithStats>;
```

#### Parameters {#summarize-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>options</td>
      <td>{ fullTree?: boolean; trackState?: boolean; summaryLogger?: <a href='/docs/apis/common-definitions/itelemetrylogger'>ITelemetryLogger</a>; runGC?: boolean; fullGC?: boolean; runSweep?: boolean; }</td>
      <td></td>
    </tr>
  </tbody>
</table>

### updateStateBeforeGC {#updatestatebeforegc-Method}

Implementation of IGarbageCollectionRuntime::updateStateBeforeGC. Before GC runs, called by the garbage collector to update any pending GC state. This is mainly used to notify the garbage collector of references detected since the last GC run. Most references are notified immediately but there can be some for which async operation is required (such as detecting new root data stores).

<b>Signature:</b>

```typescript
updateStateBeforeGC(): Promise<void>;
```

### updateUsedRoutes {#updateusedroutes-Method}

Implementation of IGarbageCollectionRuntime::updateUsedRoutes. After GC has run, called to notify this container's nodes of routes that are used in it.

<b>Signature:</b>

```typescript
updateUsedRoutes(usedRoutes: string[], gcTimestamp?: number): void;
```

#### Parameters {#updateusedroutes-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>usedRoutes</td>
      <td>string[]</td>
      <td>The routes that are used in all nodes in this Container.</td>
    </tr>
    <tr>
      <td>gcTimestamp</td>
      <td>number</td>
      <td>The time when GC was run that generated these used routes. If any node node becomes unreferenced as part of this GC run, this should be used to update the time when it happens.</td>
    </tr>
  </tbody>
</table>

### uploadBlob {#uploadblob-Method}

<b>Signature:</b>

```typescript
uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>>;
```

#### Parameters {#uploadblob-Method-parameters}


<table class="table table-striped table-hover param-list">
<caption>List of parameters</caption>
  <thead>
    <tr>
     <th scope="col">Parameter</th>
 <th scope="col">Type</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>blob</td>
      <td>ArrayBufferLike</td>
      <td></td>
    </tr>
  </tbody>
</table>


</div>
