{
  "title": "ContainerRuntime Class",
  "summary": "Represents the runtime of the container. Contains helper functions/state of the container. It will define the store level mappings.",
  "kind": "Class",
  "members": {
    "Method": {
      "_createDataStoreWithProps": "/docs/apis/container-runtime\\containerruntime-class#_createdatastorewithprops-method",
      "addContainerStateToSummary": "/docs/apis/container-runtime\\containerruntime-class#addcontainerstatetosummary-method",
      "addedGCOutboundReference": "/docs/apis/container-runtime\\containerruntime-class#addedgcoutboundreference-method",
      "collectGarbage": "/docs/apis/container-runtime\\containerruntime-class#collectgarbage-method",
      "createDataStore": "/docs/apis/container-runtime\\containerruntime-class#createdatastore-method",
      "createDetachedDataStore": "/docs/apis/container-runtime\\containerruntime-class#createdetacheddatastore-method",
      "createDetachedRootDataStore": "/docs/apis/container-runtime\\containerruntime-class#createdetachedrootdatastore-method",
      "createSummary": "/docs/apis/container-runtime\\containerruntime-class#createsummary-method",
      "deleteUnusedNodes": "/docs/apis/container-runtime\\containerruntime-class#deleteunusednodes-method",
      "dispose": "/docs/apis/container-runtime\\containerruntime-class#dispose-method",
      "ensureNoDataModelChanges": "/docs/apis/container-runtime\\containerruntime-class#ensurenodatamodelchanges-method",
      "getAbsoluteUrl": "/docs/apis/container-runtime\\containerruntime-class#getabsoluteurl-method",
      "getAudience": "/docs/apis/container-runtime\\containerruntime-class#getaudience-method",
      "getCurrentReferenceTimestampMs": "/docs/apis/container-runtime\\containerruntime-class#getcurrentreferencetimestampms-method",
      "getGCData": "/docs/apis/container-runtime\\containerruntime-class#getgcdata-method",
      "getGCNodePackagePath": "/docs/apis/container-runtime\\containerruntime-class#getgcnodepackagepath-method",
      "getNodeType": "/docs/apis/container-runtime\\containerruntime-class#getnodetype-method",
      "getPendingLocalState": "/docs/apis/container-runtime\\containerruntime-class#getpendinglocalstate-method",
      "getQuorum": "/docs/apis/container-runtime\\containerruntime-class#getquorum-method",
      "getRootDataStore": "/docs/apis/container-runtime\\containerruntime-class#getrootdatastore-method",
      "load": "/docs/apis/container-runtime\\containerruntime-class#load-method",
      "loadRuntime": "/docs/apis/container-runtime\\containerruntime-class#loadruntime-method",
      "notifyAttaching": "/docs/apis/container-runtime\\containerruntime-class#notifyattaching-method",
      "orderSequentially": "/docs/apis/container-runtime\\containerruntime-class#ordersequentially-method",
      "process": "/docs/apis/container-runtime\\containerruntime-class#process-method",
      "processSignal": "/docs/apis/container-runtime\\containerruntime-class#processsignal-method",
      "refreshLatestSummaryAck": "/docs/apis/container-runtime\\containerruntime-class#refreshlatestsummaryack-method",
      "request": "/docs/apis/container-runtime\\containerruntime-class#request-method",
      "resolveHandle": "/docs/apis/container-runtime\\containerruntime-class#resolvehandle-method",
      "setAttachState": "/docs/apis/container-runtime\\containerruntime-class#setattachstate-method",
      "setConnectionState": "/docs/apis/container-runtime\\containerruntime-class#setconnectionstate-method",
      "submitDataStoreAliasOp": "/docs/apis/container-runtime\\containerruntime-class#submitdatastorealiasop-method",
      "submitDataStoreOp": "/docs/apis/container-runtime\\containerruntime-class#submitdatastoreop-method",
      "submitDataStoreSignal": "/docs/apis/container-runtime\\containerruntime-class#submitdatastoresignal-method",
      "submitSignal": "/docs/apis/container-runtime\\containerruntime-class#submitsignal-method",
      "submitSummary": "/docs/apis/container-runtime\\containerruntime-class#submitsummary-method",
      "summarize": "/docs/apis/container-runtime\\containerruntime-class#summarize-method",
      "updateStateBeforeGC": "/docs/apis/container-runtime\\containerruntime-class#updatestatebeforegc-method",
      "updateTombstonedRoutes": "/docs/apis/container-runtime\\containerruntime-class#updatetombstonedroutes-method",
      "updateUnusedRoutes": "/docs/apis/container-runtime\\containerruntime-class#updateunusedroutes-method",
      "updateUsedRoutes": "/docs/apis/container-runtime\\containerruntime-class#updateusedroutes-method",
      "uploadBlob": "/docs/apis/container-runtime\\containerruntime-class#uploadblob-method"
    },
    "Property": {
      "attachState": "/docs/apis/container-runtime\\containerruntime-class#attachstate-property",
      "clientDetails": "/docs/apis/container-runtime\\containerruntime-class#clientdetails-property",
      "clientId": "/docs/apis/container-runtime\\containerruntime-class#clientid-property",
      "closeFn": "/docs/apis/container-runtime\\containerruntime-class#closefn-property",
      "connected": "/docs/apis/container-runtime\\containerruntime-class#connected-property",
      "deltaManager": "/docs/apis/container-runtime\\containerruntime-class#deltamanager-property",
      "disposed": "/docs/apis/container-runtime\\containerruntime-class#disposed-property",
      "disposeFn": "/docs/apis/container-runtime\\containerruntime-class#disposefn-property",
      "enqueueSummarize": "/docs/apis/container-runtime\\containerruntime-class#enqueuesummarize-property",
      "flushMode": "/docs/apis/container-runtime\\containerruntime-class#flushmode-property",
      "gcTombstoneEnforcementAllowed": "/docs/apis/container-runtime\\containerruntime-class#gctombstoneenforcementallowed-property",
      "IContainerRuntime": "/docs/apis/container-runtime\\containerruntime-class#icontainerruntime-property",
      "IFluidDataStoreRegistry": "/docs/apis/container-runtime\\containerruntime-class#ifluiddatastoreregistry-property",
      "IFluidHandleContext": "/docs/apis/container-runtime\\containerruntime-class#ifluidhandlecontext-property",
      "IFluidRouter": "/docs/apis/container-runtime\\containerruntime-class#ifluidrouter-property",
      "IFluidTokenProvider": "/docs/apis/container-runtime\\containerruntime-class#ifluidtokenprovider-property",
      "isDirty": "/docs/apis/container-runtime\\containerruntime-class#isdirty-property",
      "logger": "/docs/apis/container-runtime\\containerruntime-class#logger-property",
      "options": "/docs/apis/container-runtime\\containerruntime-class#options-property",
      "reSubmitFn": "/docs/apis/container-runtime\\containerruntime-class#resubmitfn-property",
      "scope": "/docs/apis/container-runtime\\containerruntime-class#scope-property",
      "storage": "/docs/apis/container-runtime\\containerruntime-class#storage-property",
      "summarizeOnDemand": "/docs/apis/container-runtime\\containerruntime-class#summarizeondemand-property",
      "summarizerClientId": "/docs/apis/container-runtime\\containerruntime-class#summarizerclientid-property"
    }
  },
  "package": "@fluidframework/container-runtime",
  "unscopedPackageName": "container-runtime"
}

[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/container-runtime](/docs/apis/container-runtime) &gt; [ContainerRuntime](/docs/apis/container-runtime\containerruntime-class)

Represents the runtime of the container. Contains helper functions/state of the container. It will define the store level mappings.

## Signature {#containerruntime-signature}

```typescript
export declare class ContainerRuntime extends TypedEventEmitter<IContainerRuntimeEvents> implements IContainerRuntime, IGarbageCollectionRuntime, IRuntime, ISummarizerRuntime, ISummarizerInternalsProvider 
```
<b>Extends:</b> [TypedEventEmitter](/docs/apis/common-utils\typedeventemitter-class)<!-- -->&lt;[IContainerRuntimeEvents](/docs/apis/container-runtime-definitions\icontainerruntimeevents-interface)

<b>Implements:</b> [IContainerRuntime](/docs/apis/container-runtime-definitions\icontainerruntime-interface)<!-- -->, IGarbageCollectionRuntime, IRuntime, [ISummarizerRuntime](/docs/apis/container-runtime\isummarizerruntime-interface)<!-- -->, [ISummarizerInternalsProvider](/docs/apis/container-runtime\isummarizerinternalsprovider-interface)

## Remarks {#containerruntime-remarks}

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the `ContainerRuntime` class.

## Static Methods

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Method
      </th>
      <th scope="col">
        Alerts
      </th>
      <th scope="col">
        Return Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#load-method'>load</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
        Promise<<a href='/docs/apis/container-runtime\containerruntime-class'>ContainerRuntime</a>>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#loadruntime-method'>loadRuntime</a>
      </td>
      <td>
      </td>
      <td>
        Promise<<a href='/docs/apis/container-runtime\containerruntime-class'>ContainerRuntime</a>>
      </td>
      <td>
        Load the stores from a snapshot and returns the runtime.
      </td>
    </tr>
  </tbody>
</table>

## Properties

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Property
      </th>
      <th scope="col">
        Alerts
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#attachstate-property'>attachState</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/container-definitions#attachstate-enum'>AttachState</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#clientdetails-property'>clientDetails</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\iclientdetails-interface'>IClientDetails</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#clientid-property'>clientId</a>
      </td>
      <td>
      </td>
      <td>
        string | undefined
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#closefn-property'>closeFn</a>
      </td>
      <td>
      </td>
      <td>
        (error?: <a href='/docs/apis/azure-client#icriticalcontainererror-typealias'>ICriticalContainerError</a>) => void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#connected-property'>connected</a>
      </td>
      <td>
      </td>
      <td>
        boolean
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#deltamanager-property'>deltaManager</a>
      </td>
      <td>
      </td>
      <td>
        IDeltaManager<<a href='/docs/apis/protocol-definitions\isequenceddocumentmessage-interface'>ISequencedDocumentMessage</a>, <a href='/docs/apis/protocol-definitions\idocumentmessage-interface'>IDocumentMessage</a>>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#disposed-property'>disposed</a>
      </td>
      <td>
      </td>
      <td>
        boolean
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#disposefn-property'>disposeFn</a>
      </td>
      <td>
      </td>
      <td>
        (error?: <a href='/docs/apis/azure-client#icriticalcontainererror-typealias'>ICriticalContainerError</a>) => void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#enqueuesummarize-property'>enqueueSummarize</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/container-runtime\isummarizer-interface'>ISummarizer</a>["enqueueSummarize"]
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#flushmode-property'>flushMode</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/runtime-definitions#flushmode-enum'>FlushMode</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#gctombstoneenforcementallowed-property'>gcTombstoneEnforcementAllowed</a>
      </td>
      <td>
      </td>
      <td>
        boolean
      </td>
      <td>
        If false, loading or using a Tombstoned object should merely log, not fail
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#icontainerruntime-property'>IContainerRuntime</a>
      </td>
      <td>
      </td>
      <td>
        this
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#ifluiddatastoreregistry-property'>IFluidDataStoreRegistry</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/runtime-definitions\ifluiddatastoreregistry-interface'>IFluidDataStoreRegistry</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#ifluidhandlecontext-property'>IFluidHandleContext</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/core-interfaces\ifluidhandlecontext-interface'>IFluidHandleContext</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#ifluidrouter-property'>IFluidRouter</a>
      </td>
      <td>
      </td>
      <td>
        this
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#ifluidtokenprovider-property'>IFluidTokenProvider</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
        IFluidTokenProvider | undefined
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#isdirty-property'>isDirty</a>
      </td>
      <td>
      </td>
      <td>
        boolean
      </td>
      <td>
        Returns true of container is dirty, i.e. there are some pending local changes that either were not sent out to delta stream or were not yet acknowledged.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#logger-property'>logger</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/common-definitions\itelemetrylogger-interface'>ITelemetryLogger</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#options-property'>options</a>
      </td>
      <td>
      </td>
      <td>
        ILoaderOptions
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#resubmitfn-property'>reSubmitFn</a>
      </td>
      <td>
      </td>
      <td>
        (type: <a href='/docs/apis/container-runtime#containermessagetype-enum'>ContainerMessageType</a>, content: any, localOpMetadata: unknown, opMetadata: Record<string, unknown> | undefined) => void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#scope-property'>scope</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/core-interfaces#fluidobject-typealias'>FluidObject</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#storage-property'>storage</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/driver-definitions\idocumentstorageservice-interface'>IDocumentStorageService</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#summarizeondemand-property'>summarizeOnDemand</a>
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/container-runtime\isummarizer-interface'>ISummarizer</a>["summarizeOnDemand"]
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#summarizerclientid-property'>summarizerClientId</a>
      </td>
      <td>
      </td>
      <td>
        string | undefined
      </td>
      <td>
        clientId of parent (non-summarizing) container that owns summarizer container
      </td>
    </tr>
  </tbody>
</table>

## Methods

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Method
      </th>
      <th scope="col">
        Return Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#_createdatastorewithprops-method'>_createDataStoreWithProps</a>
      </td>
      <td>
        Promise<<a href='/docs/apis/runtime-definitions\idatastore-interface'>IDataStore</a>>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#addcontainerstatetosummary-method'>addContainerStateToSummary</a>
      </td>
      <td>
        void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#addedgcoutboundreference-method'>addedGCOutboundReference</a>
      </td>
      <td>
        void
      </td>
      <td>
        Called when a new outbound reference is added to another node. This is used by garbage collection to identify all references added in the system.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#collectgarbage-method'>collectGarbage</a>
      </td>
      <td>
        Promise<<a href='/docs/apis/container-runtime\igcstats-interface'>IGCStats</a> | undefined>
      </td>
      <td>
        Runs garbage collection and updates the reference / used state of the nodes in the container.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#createdatastore-method'>createDataStore</a>
      </td>
      <td>
        Promise<<a href='/docs/apis/runtime-definitions\idatastore-interface'>IDataStore</a>>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#createdetacheddatastore-method'>createDetachedDataStore</a>
      </td>
      <td>
        <a href='/docs/apis/runtime-definitions\ifluiddatastorecontextdetached-interface'>IFluidDataStoreContextDetached</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#createdetachedrootdatastore-method'>createDetachedRootDataStore</a>
      </td>
      <td>
        <a href='/docs/apis/runtime-definitions\ifluiddatastorecontextdetached-interface'>IFluidDataStoreContextDetached</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#createsummary-method'>createSummary</a>
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\isummarytree-interface'>ISummaryTree</a>
      </td>
      <td>
        Create a summary. Used when attaching or serializing a detached container.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#deleteunusednodes-method'>deleteUnusedNodes</a>
      </td>
      <td>
        string[]
      </td>
      <td>
        This is called to delete objects from the runtime
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#dispose-method'>dispose</a>
      </td>
      <td>
        void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#ensurenodatamodelchanges-method'>ensureNoDataModelChanges</a>
      </td>
      <td>
        T
      </td>
      <td>
        <p>Invokes the given callback and expects that no ops are submitted until execution finishes. If an op is submitted, an error will be raised.</p><p>Can be disabled by feature gate <code>Fluid.ContainerRuntime.DisableOpReentryCheck</code></p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#getabsoluteurl-method'>getAbsoluteUrl</a>
      </td>
      <td>
        Promise<string | undefined>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#getaudience-method'>getAudience</a>
      </td>
      <td>
        IAudience
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#getcurrentreferencetimestampms-method'>getCurrentReferenceTimestampMs</a>
      </td>
      <td>
        number | undefined
      </td>
      <td>
        Returns a server generated referenced timestamp to be used to track unreferenced nodes by GC.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#getgcdata-method'>getGCData</a>
      </td>
      <td>
        Promise<<a href='/docs/apis/runtime-definitions\igarbagecollectiondata-interface'>IGarbageCollectionData</a>>
      </td>
      <td>
        Implementation of IGarbageCollectionRuntime::getGCData. Generates and returns the GC data for this container.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#getgcnodepackagepath-method'>getGCNodePackagePath</a>
      </td>
      <td>
        Promise<readonly string[] | undefined>
      </td>
      <td>
        Called by GC to retrieve the package path of the node with the given path. The node should belong to a data store or an attachment blob.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#getnodetype-method'>getNodeType</a>
      </td>
      <td>
        GCNodeType
      </td>
      <td>
        Returns the type of the GC node. Currently, there are nodes that belong to the root ("/"), data stores or blob manager.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#getpendinglocalstate-method'>getPendingLocalState</a>
      </td>
      <td>
        unknown
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#getquorum-method'>getQuorum</a>
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\iquorumclients-interface'>IQuorumClients</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#getrootdatastore-method'>getRootDataStore</a>
      </td>
      <td>
        Promise<<a href='/docs/apis/core-interfaces\ifluidrouter-interface'>IFluidRouter</a>>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#notifyattaching-method'>notifyAttaching</a>
      </td>
      <td>
        void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#ordersequentially-method'>orderSequentially</a>
      </td>
      <td>
        T
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#process-method'>process</a>
      </td>
      <td>
        void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#processsignal-method'>processSignal</a>
      </td>
      <td>
        void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#refreshlatestsummaryack-method'>refreshLatestSummaryAck</a>
      </td>
      <td>
        Promise<void>
      </td>
      <td>
        Implementation of ISummarizerInternalsProvider.refreshLatestSummaryAck
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#request-method'>request</a>
      </td>
      <td>
        Promise<<a href='/docs/apis/core-interfaces\iresponse-interface'>IResponse</a>>
      </td>
      <td>
        Notifies this object about the request made to the container.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#resolvehandle-method'>resolveHandle</a>
      </td>
      <td>
        Promise<<a href='/docs/apis/core-interfaces\iresponse-interface'>IResponse</a>>
      </td>
      <td>
        Resolves URI representing handle
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#setattachstate-method'>setAttachState</a>
      </td>
      <td>
        void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#setconnectionstate-method'>setConnectionState</a>
      </td>
      <td>
        void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#submitdatastorealiasop-method'>submitDataStoreAliasOp</a>
      </td>
      <td>
        void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#submitdatastoreop-method'>submitDataStoreOp</a>
      </td>
      <td>
        void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#submitdatastoresignal-method'>submitDataStoreSignal</a>
      </td>
      <td>
        void
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#submitsignal-method'>submitSignal</a>
      </td>
      <td>
        void
      </td>
      <td>
        Submits the signal to be sent to other clients.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#submitsummary-method'>submitSummary</a>
      </td>
      <td>
        Promise<<a href='/docs/apis/container-runtime#submitsummaryresult-typealias'>SubmitSummaryResult</a>>
      </td>
      <td>
        Generates the summary tree, uploads it to storage, and then submits the summarize op. This is intended to be called by the summarizer, since it is the implementation of ISummarizerInternalsProvider.submitSummary. It takes care of state management at the container level, including pausing inbound op processing, updating SummarizerNode state tracking, and garbage collection.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#summarize-method'>summarize</a>
      </td>
      <td>
        Promise<<a href='/docs/apis/container-runtime\irootsummarytreewithstats-interface'>IRootSummaryTreeWithStats</a>>
      </td>
      <td>
        Returns a summary of the runtime at the current sequence number.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#updatestatebeforegc-method'>updateStateBeforeGC</a>
      </td>
      <td>
        Promise<void>
      </td>
      <td>
        Implementation of IGarbageCollectionRuntime::updateStateBeforeGC. Before GC runs, called by the garbage collector to update any pending GC state. This is mainly used to notify the garbage collector of references detected since the last GC run. Most references are notified immediately but there can be some for which async operation is required (such as detecting new root data stores).
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#updatetombstonedroutes-method'>updateTombstonedRoutes</a>
      </td>
      <td>
        void
      </td>
      <td>
        This is called to update objects that are tombstones.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#updateunusedroutes-method'>updateUnusedRoutes</a>
      </td>
      <td>
        void
      </td>
      <td>
        This is called to update objects whose routes are unused.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#updateusedroutes-method'>updateUsedRoutes</a>
      </td>
      <td>
        void
      </td>
      <td>
        Implementation of IGarbageCollectionRuntime::updateUsedRoutes. After GC has run, called to notify this container's nodes of routes that are used in it.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime\containerruntime-class#uploadblob-method'>uploadBlob</a>
      </td>
      <td>
        Promise<<a href='/docs/apis/core-interfaces\ifluidhandle-interface'>IFluidHandle</a><ArrayBufferLike>>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Property Details

### attachState {#attachstate-property}

#### Signature {#attachstate-signature}

```typescript
get attachState(): AttachState;
```

### clientDetails {#clientdetails-property}

#### Signature {#clientdetails-signature}

```typescript
get clientDetails(): IClientDetails;
```

### clientId {#clientid-property}

#### Signature {#clientid-signature}

```typescript
get clientId(): string | undefined;
```

### closeFn {#closefn-property}

#### Signature {#closefn-signature}

```typescript
get closeFn(): (error?: ICriticalContainerError) => void;
```

### connected {#connected-property}

#### Signature {#connected-signature}

```typescript
get connected(): boolean;
```

### deltaManager {#deltamanager-property}

#### Signature {#deltamanager-signature}

```typescript
get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
```

### disposed {#disposed-property}

#### Signature {#disposed-signature}

```typescript
get disposed(): boolean;
```

### disposeFn {#disposefn-property}

#### Signature {#disposefn-signature}

```typescript
get disposeFn(): (error?: ICriticalContainerError) => void;
```

### enqueueSummarize {#enqueuesummarize-property}

#### Signature {#enqueuesummarize-signature}

```typescript
readonly enqueueSummarize: ISummarizer["enqueueSummarize"];
```

### flushMode {#flushmode-property}

#### Signature {#flushmode-signature}

```typescript
get flushMode(): FlushMode;
```

### gcTombstoneEnforcementAllowed {#gctombstoneenforcementallowed-property}

If false, loading or using a Tombstoned object should merely log, not fail

#### Signature {#gctombstoneenforcementallowed-signature}

```typescript
readonly gcTombstoneEnforcementAllowed: boolean;
```

### IContainerRuntime {#icontainerruntime-property}

#### Signature {#icontainerruntime-signature}

```typescript
get IContainerRuntime(): this;
```

### IFluidDataStoreRegistry {#ifluiddatastoreregistry-property}

#### Signature {#ifluiddatastoreregistry-signature}

```typescript
get IFluidDataStoreRegistry(): IFluidDataStoreRegistry;
```

### IFluidHandleContext {#ifluidhandlecontext-property}

#### Signature {#ifluidhandlecontext-signature}

```typescript
get IFluidHandleContext(): IFluidHandleContext;
```

### IFluidRouter {#ifluidrouter-property}

#### Signature {#ifluidrouter-signature}

```typescript
get IFluidRouter(): this;
```

### IFluidTokenProvider {#ifluidtokenprovider-property}

{{% callout Warning Deprecated %}}
2.0.0-internal.3.2.0 ContainerRuntime is not an IFluidTokenProvider. Token providers should be accessed using normal provider patterns.


{{% /callout %}}

#### Signature {#ifluidtokenprovider-signature}

```typescript
get IFluidTokenProvider(): IFluidTokenProvider | undefined;
```

### isDirty {#isdirty-property}

Returns true of container is dirty, i.e. there are some pending local changes that either were not sent out to delta stream or were not yet acknowledged.

#### Signature {#isdirty-signature}

```typescript
get isDirty(): boolean;
```

### logger {#logger-property}

#### Signature {#logger-signature}

```typescript
readonly logger: ITelemetryLogger;
```

### options {#options-property}

#### Signature {#options-signature}

```typescript
get options(): ILoaderOptions;
```

### reSubmitFn {#resubmitfn-property}

#### Signature {#resubmitfn-signature}

```typescript
get reSubmitFn(): (type: ContainerMessageType, content: any, localOpMetadata: unknown, opMetadata: Record<string, unknown> | undefined) => void;
```

### scope {#scope-property}

#### Signature {#scope-signature}

```typescript
get scope(): FluidObject;
```

### storage {#storage-property}

#### Signature {#storage-signature}

```typescript
get storage(): IDocumentStorageService;
```

### summarizeOnDemand {#summarizeondemand-property}

#### Signature {#summarizeondemand-signature}

```typescript
readonly summarizeOnDemand: ISummarizer["summarizeOnDemand"];
```

### summarizerClientId {#summarizerclientid-property}

clientId of parent (non-summarizing) container that owns summarizer container

#### Signature {#summarizerclientid-signature}

```typescript
get summarizerClientId(): string | undefined;
```

## Method Details

### \_createDataStoreWithProps {#_createdatastorewithprops-method}

#### Signature {#_createdatastorewithprops-signature}

```typescript
_createDataStoreWithProps(pkg: string | string[], props?: any, id?: string): Promise<IDataStore>;
```

#### Parameters {#_createdatastorewithprops-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        pkg
      </td>
      <td>
      </td>
      <td>
        string | string[]
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        props
      </td>
      <td>
        optional
      </td>
      <td>
        any
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        id
      </td>
      <td>
        optional
      </td>
      <td>
        string
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#_createdatastorewithprops-returns}

<b>Return type:</b> Promise&lt;[IDataStore](/docs/apis/runtime-definitions\idatastore-interface)<!-- -->&gt;

### addContainerStateToSummary {#addcontainerstatetosummary-method}

#### Signature {#addcontainerstatetosummary-signature}

```typescript
protected addContainerStateToSummary(summaryTree: ISummaryTreeWithStats, fullTree: boolean, trackState: boolean, telemetryContext?: ITelemetryContext): void;
```

#### Parameters {#addcontainerstatetosummary-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        summaryTree
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/runtime-definitions\isummarytreewithstats-interface'>ISummaryTreeWithStats</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        fullTree
      </td>
      <td>
      </td>
      <td>
        boolean
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        trackState
      </td>
      <td>
      </td>
      <td>
        boolean
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        telemetryContext
      </td>
      <td>
        optional
      </td>
      <td>
        <a href='/docs/apis/runtime-definitions\itelemetrycontext-interface'>ITelemetryContext</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### addedGCOutboundReference {#addedgcoutboundreference-method}

Called when a new outbound reference is added to another node. This is used by garbage collection to identify all references added in the system.

#### Signature {#addedgcoutboundreference-signature}

```typescript
addedGCOutboundReference(srcHandle: IFluidHandle, outboundHandle: IFluidHandle): void;
```

#### Parameters {#addedgcoutboundreference-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        srcHandle
      </td>
      <td>
        <a href='/docs/apis/core-interfaces\ifluidhandle-interface'>IFluidHandle</a>
      </td>
      <td>
        The handle of the node that added the reference.
      </td>
    </tr>
    <tr>
      <td>
        outboundHandle
      </td>
      <td>
        <a href='/docs/apis/core-interfaces\ifluidhandle-interface'>IFluidHandle</a>
      </td>
      <td>
        The handle of the outbound node that is referenced.
      </td>
    </tr>
  </tbody>
</table>

### collectGarbage {#collectgarbage-method}

Runs garbage collection and updates the reference / used state of the nodes in the container.

#### Signature {#collectgarbage-signature}

```typescript
collectGarbage(options: {
        logger?: ITelemetryLogger;
        runSweep?: boolean;
        fullGC?: boolean;
    }, telemetryContext?: ITelemetryContext): Promise<IGCStats | undefined>;
```

#### Parameters {#collectgarbage-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        options
      </td>
      <td>
      </td>
      <td>
        { logger?: <a href='/docs/apis/common-definitions\itelemetrylogger-interface'>ITelemetryLogger</a>; runSweep?: boolean; fullGC?: boolean; }
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        telemetryContext
      </td>
      <td>
        optional
      </td>
      <td>
        <a href='/docs/apis/runtime-definitions\itelemetrycontext-interface'>ITelemetryContext</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#collectgarbage-returns}

the statistics of the garbage collection run; undefined if GC did not run.

<b>Return type:</b> Promise&lt;[IGCStats](/docs/apis/container-runtime\igcstats-interface) \| undefined&gt;

### createDataStore {#createdatastore-method}

#### Signature {#createdatastore-signature}

```typescript
createDataStore(pkg: string | string[]): Promise<IDataStore>;
```

#### Parameters {#createdatastore-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        pkg
      </td>
      <td>
        string | string[]
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#createdatastore-returns}

<b>Return type:</b> Promise&lt;[IDataStore](/docs/apis/runtime-definitions\idatastore-interface)<!-- -->&gt;

### createDetachedDataStore {#createdetacheddatastore-method}

#### Signature {#createdetacheddatastore-signature}

```typescript
createDetachedDataStore(pkg: Readonly<string[]>): IFluidDataStoreContextDetached;
```

#### Parameters {#createdetacheddatastore-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        pkg
      </td>
      <td>
        Readonly<string[]>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#createdetacheddatastore-returns}

<b>Return type:</b> [IFluidDataStoreContextDetached](/docs/apis/runtime-definitions\ifluiddatastorecontextdetached-interface)

### createDetachedRootDataStore {#createdetachedrootdatastore-method}

#### Signature {#createdetachedrootdatastore-signature}

```typescript
createDetachedRootDataStore(pkg: Readonly<string[]>, rootDataStoreId: string): IFluidDataStoreContextDetached;
```

#### Parameters {#createdetachedrootdatastore-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        pkg
      </td>
      <td>
        Readonly<string[]>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        rootDataStoreId
      </td>
      <td>
        string
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#createdetachedrootdatastore-returns}

<b>Return type:</b> [IFluidDataStoreContextDetached](/docs/apis/runtime-definitions\ifluiddatastorecontextdetached-interface)

### createSummary {#createsummary-method}

Create a summary. Used when attaching or serializing a detached container.

#### Signature {#createsummary-signature}

```typescript
createSummary(blobRedirectTable?: Map<string, string>, telemetryContext?: ITelemetryContext): ISummaryTree;
```

#### Parameters {#createsummary-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        blobRedirectTable
      </td>
      <td>
        optional
      </td>
      <td>
        Map<string, string>
      </td>
      <td>
        A table passed during the attach process. While detached, blob upload is supported using IDs generated locally. After attach, these IDs cannot be used, so this table maps the old local IDs to the new storage IDs so requests can be redirected.
      </td>
    </tr>
    <tr>
      <td>
        telemetryContext
      </td>
      <td>
        optional
      </td>
      <td>
        <a href='/docs/apis/runtime-definitions\itelemetrycontext-interface'>ITelemetryContext</a>
      </td>
      <td>
        summary data passed through the layers for telemetry purposes
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#createsummary-returns}

<b>Return type:</b> [ISummaryTree](/docs/apis/protocol-definitions\isummarytree-interface)

### deleteUnusedNodes {#deleteunusednodes-method}

This is called to delete objects from the runtime

#### Signature {#deleteunusednodes-signature}

```typescript
deleteUnusedNodes(unusedRoutes: string[]): string[];
```

#### Parameters {#deleteunusednodes-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        unusedRoutes
      </td>
      <td>
        string[]
      </td>
      <td>
        object routes and sub routes that can be deleted
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#deleteunusednodes-returns}

- routes of objects deleted from the runtime

<b>Return type:</b> string\[\]

### dispose {#dispose-method}

#### Signature {#dispose-signature}

```typescript
dispose(error?: Error): void;
```

#### Parameters {#dispose-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        error
      </td>
      <td>
        optional
      </td>
      <td>
        Error
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### ensureNoDataModelChanges {#ensurenodatamodelchanges-method}

Invokes the given callback and expects that no ops are submitted until execution finishes. If an op is submitted, an error will be raised.

Can be disabled by feature gate `Fluid.ContainerRuntime.DisableOpReentryCheck`

#### Signature {#ensurenodatamodelchanges-signature}

```typescript
ensureNoDataModelChanges<T>(callback: () => T): T;
```

#### Parameters {#ensurenodatamodelchanges-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        callback
      </td>
      <td>
        () => T
      </td>
      <td>
        the callback to be invoked
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#ensurenodatamodelchanges-returns}

<b>Return type:</b> T

### getAbsoluteUrl {#getabsoluteurl-method}

#### Signature {#getabsoluteurl-signature}

```typescript
getAbsoluteUrl(relativeUrl: string): Promise<string | undefined>;
```

#### Parameters {#getabsoluteurl-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        relativeUrl
      </td>
      <td>
        string
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getabsoluteurl-returns}

<b>Return type:</b> Promise&lt;string \| undefined&gt;

### getAudience {#getaudience-method}

#### Signature {#getaudience-signature}

```typescript
getAudience(): IAudience;
```

#### Returns {#getaudience-returns}

<b>Return type:</b> IAudience

### getCurrentReferenceTimestampMs {#getcurrentreferencetimestampms-method}

Returns a server generated referenced timestamp to be used to track unreferenced nodes by GC.

#### Signature {#getcurrentreferencetimestampms-signature}

```typescript
getCurrentReferenceTimestampMs(): number | undefined;
```

#### Returns {#getcurrentreferencetimestampms-returns}

<b>Return type:</b> number \| undefined

### getGCData {#getgcdata-method}

Implementation of IGarbageCollectionRuntime::getGCData. Generates and returns the GC data for this container.

#### Signature {#getgcdata-signature}

```typescript
getGCData(fullGC?: boolean): Promise<IGarbageCollectionData>;
```

#### Parameters {#getgcdata-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        fullGC
      </td>
      <td>
        optional
      </td>
      <td>
        boolean
      </td>
      <td>
        true to bypass optimizations and force full generation of GC data.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getgcdata-returns}

<b>Return type:</b> Promise&lt;[IGarbageCollectionData](/docs/apis/runtime-definitions\igarbagecollectiondata-interface)<!-- -->&gt;

### getGCNodePackagePath {#getgcnodepackagepath-method}

Called by GC to retrieve the package path of the node with the given path. The node should belong to a data store or an attachment blob.

#### Signature {#getgcnodepackagepath-signature}

```typescript
getGCNodePackagePath(nodePath: string): Promise<readonly string[] | undefined>;
```

#### Parameters {#getgcnodepackagepath-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        nodePath
      </td>
      <td>
        string
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getgcnodepackagepath-returns}

<b>Return type:</b> Promise&lt;readonly string\[\] \| undefined&gt;

### getNodeType {#getnodetype-method}

Returns the type of the GC node. Currently, there are nodes that belong to the root ("/"), data stores or blob manager.

#### Signature {#getnodetype-signature}

```typescript
getNodeType(nodePath: string): GCNodeType;
```

#### Parameters {#getnodetype-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        nodePath
      </td>
      <td>
        string
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getnodetype-returns}

<b>Return type:</b> GCNodeType

### getPendingLocalState {#getpendinglocalstate-method}

#### Signature {#getpendinglocalstate-signature}

```typescript
getPendingLocalState(): unknown;
```

#### Returns {#getpendinglocalstate-returns}

<b>Return type:</b> unknown

### getQuorum {#getquorum-method}

#### Signature {#getquorum-signature}

```typescript
getQuorum(): IQuorumClients;
```

#### Returns {#getquorum-returns}

<b>Return type:</b> [IQuorumClients](/docs/apis/protocol-definitions\iquorumclients-interface)

### getRootDataStore {#getrootdatastore-method}

#### Signature {#getrootdatastore-signature}

```typescript
getRootDataStore(id: string, wait?: boolean): Promise<IFluidRouter>;
```

#### Parameters {#getrootdatastore-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        id
      </td>
      <td>
      </td>
      <td>
        string
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        wait
      </td>
      <td>
        optional
      </td>
      <td>
        boolean
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getrootdatastore-returns}

<b>Return type:</b> Promise&lt;[IFluidRouter](/docs/apis/core-interfaces\ifluidrouter-interface)<!-- -->&gt;

### load {#load-method}

{{% callout Warning Deprecated %}}
- use loadRuntime instead. Load the stores from a snapshot and returns the runtime.


{{% /callout %}}

#### Signature {#load-signature}

```typescript
static load(context: IContainerContext, registryEntries: NamedFluidDataStoreRegistryEntries, requestHandler?: (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>, runtimeOptions?: IContainerRuntimeOptions, containerScope?: FluidObject, existing?: boolean, containerRuntimeCtor?: typeof ContainerRuntime): Promise<ContainerRuntime>;
```

#### Parameters {#load-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        context
      </td>
      <td>
      </td>
      <td>
        IContainerContext
      </td>
      <td>
        Context of the container.
      </td>
    </tr>
    <tr>
      <td>
        registryEntries
      </td>
      <td>
      </td>
      <td>
        <a href='/docs/apis/runtime-definitions#namedfluiddatastoreregistryentries-typealias'>NamedFluidDataStoreRegistryEntries</a>
      </td>
      <td>
        Mapping to the stores.
      </td>
    </tr>
    <tr>
      <td>
        requestHandler
      </td>
      <td>
        optional
      </td>
      <td>
        (request: <a href='/docs/apis/core-interfaces\irequest-interface'>IRequest</a>, runtime: <a href='/docs/apis/container-runtime-definitions\icontainerruntime-interface'>IContainerRuntime</a>) => Promise<<a href='/docs/apis/core-interfaces\iresponse-interface'>IResponse</a>>
      </td>
      <td>
        Request handlers for the container runtime
      </td>
    </tr>
    <tr>
      <td>
        runtimeOptions
      </td>
      <td>
        optional
      </td>
      <td>
        <a href='/docs/apis/container-runtime\icontainerruntimeoptions-interface'>IContainerRuntimeOptions</a>
      </td>
      <td>
        Additional options to be passed to the runtime
      </td>
    </tr>
    <tr>
      <td>
        containerScope
      </td>
      <td>
        optional
      </td>
      <td>
        <a href='/docs/apis/core-interfaces#fluidobject-typealias'>FluidObject</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        existing
      </td>
      <td>
        optional
      </td>
      <td>
        boolean
      </td>
      <td>
        (optional) When loading from an existing snapshot. Precedes context.existing if provided
      </td>
    </tr>
    <tr>
      <td>
        containerRuntimeCtor
      </td>
      <td>
        optional
      </td>
      <td>
        typeof <a href='/docs/apis/container-runtime\containerruntime-class'>ContainerRuntime</a>
      </td>
      <td>
        (optional) Constructor to use to create the ContainerRuntime instance. This allows mixin classes to leverage this method to define their own async initializer.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#load-returns}

<b>Return type:</b> Promise&lt;[ContainerRuntime](/docs/apis/container-runtime\containerruntime-class)<!-- -->&gt;

### loadRuntime {#loadruntime-method}

Load the stores from a snapshot and returns the runtime.

#### Signature {#loadruntime-signature}

```typescript
static loadRuntime(params: {
        context: IContainerContext;
        registryEntries: NamedFluidDataStoreRegistryEntries;
        existing: boolean;
        requestHandler?: (request: IRequest, runtime: IContainerRuntime) => Promise<IResponse>;
        runtimeOptions?: IContainerRuntimeOptions;
        containerScope?: FluidObject;
        containerRuntimeCtor?: typeof ContainerRuntime;
    }): Promise<ContainerRuntime>;
```

#### Parameters {#loadruntime-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        params
      </td>
      <td>
        { context: IContainerContext; registryEntries: <a href='/docs/apis/runtime-definitions#namedfluiddatastoreregistryentries-typealias'>NamedFluidDataStoreRegistryEntries</a>; existing: boolean; requestHandler?: (request: <a href='/docs/apis/core-interfaces\irequest-interface'>IRequest</a>, runtime: <a href='/docs/apis/container-runtime-definitions\icontainerruntime-interface'>IContainerRuntime</a>) => Promise<<a href='/docs/apis/core-interfaces\iresponse-interface'>IResponse</a>>; runtimeOptions?: <a href='/docs/apis/container-runtime\icontainerruntimeoptions-interface'>IContainerRuntimeOptions</a>; containerScope?: <a href='/docs/apis/core-interfaces#fluidobject-typealias'>FluidObject</a>; containerRuntimeCtor?: typeof <a href='/docs/apis/container-runtime\containerruntime-class'>ContainerRuntime</a>; }
      </td>
      <td>
        An object housing the runtime properties: - context - Context of the container. - registryEntries - Mapping to the stores. - existing - When loading from an existing snapshot - requestHandler - Request handlers for the container runtime - runtimeOptions - Additional options to be passed to the runtime - containerScope - runtime services provided with context - containerRuntimeCtor - Constructor to use to create the ContainerRuntime instance. This allows mixin classes to leverage this method to define their own async initializer.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#loadruntime-returns}

<b>Return type:</b> Promise&lt;[ContainerRuntime](/docs/apis/container-runtime\containerruntime-class)<!-- -->&gt;

### notifyAttaching {#notifyattaching-method}

#### Signature {#notifyattaching-signature}

```typescript
notifyAttaching(snapshot: ISnapshotTreeWithBlobContents): void;
```

#### Parameters {#notifyattaching-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        snapshot
      </td>
      <td>
        ISnapshotTreeWithBlobContents
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### orderSequentially {#ordersequentially-method}

#### Signature {#ordersequentially-signature}

```typescript
orderSequentially<T>(callback: () => T): T;
```

#### Parameters {#ordersequentially-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        callback
      </td>
      <td>
        () => T
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#ordersequentially-returns}

<b>Return type:</b> T

### process {#process-method}

#### Signature {#process-signature}

```typescript
process(messageArg: ISequencedDocumentMessage, local: boolean): void;
```

#### Parameters {#process-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        messageArg
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\isequenceddocumentmessage-interface'>ISequencedDocumentMessage</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        local
      </td>
      <td>
        boolean
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### processSignal {#processsignal-method}

#### Signature {#processsignal-signature}

```typescript
processSignal(message: ISignalMessage, local: boolean): void;
```

#### Parameters {#processsignal-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        message
      </td>
      <td>
        <a href='/docs/apis/protocol-definitions\isignalmessage-interface'>ISignalMessage</a>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        local
      </td>
      <td>
        boolean
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### refreshLatestSummaryAck {#refreshlatestsummaryack-method}

Implementation of ISummarizerInternalsProvider.refreshLatestSummaryAck

#### Signature {#refreshlatestsummaryack-signature}

```typescript
refreshLatestSummaryAck(options: IRefreshSummaryAckOptions): Promise<void>;
```

#### Parameters {#refreshlatestsummaryack-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        options
      </td>
      <td>
        <a href='/docs/apis/container-runtime\irefreshsummaryackoptions-interface'>IRefreshSummaryAckOptions</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#refreshlatestsummaryack-returns}

<b>Return type:</b> Promise&lt;void&gt;

### request {#request-method}

Notifies this object about the request made to the container.

#### Signature {#request-signature}

```typescript
request(request: IRequest): Promise<IResponse>;
```

#### Parameters {#request-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        request
      </td>
      <td>
        <a href='/docs/apis/core-interfaces\irequest-interface'>IRequest</a>
      </td>
      <td>
        Request made to the handler.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#request-returns}

<b>Return type:</b> Promise&lt;[IResponse](/docs/apis/core-interfaces\iresponse-interface)<!-- -->&gt;

### resolveHandle {#resolvehandle-method}

Resolves URI representing handle

#### Signature {#resolvehandle-signature}

```typescript
resolveHandle(request: IRequest): Promise<IResponse>;
```

#### Parameters {#resolvehandle-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        request
      </td>
      <td>
        <a href='/docs/apis/core-interfaces\irequest-interface'>IRequest</a>
      </td>
      <td>
        Request made to the handler.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#resolvehandle-returns}

<b>Return type:</b> Promise&lt;[IResponse](/docs/apis/core-interfaces\iresponse-interface)<!-- -->&gt;

### setAttachState {#setattachstate-method}

#### Signature {#setattachstate-signature}

```typescript
setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void;
```

#### Parameters {#setattachstate-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        attachState
      </td>
      <td>
        <a href='/docs/apis/container-definitions#attachstate-attaching-enummember'>AttachState.Attaching</a> | <a href='/docs/apis/container-definitions#attachstate-attached-enummember'>AttachState.Attached</a>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### setConnectionState {#setconnectionstate-method}

#### Signature {#setconnectionstate-signature}

```typescript
setConnectionState(connected: boolean, clientId?: string): void;
```

#### Parameters {#setconnectionstate-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        connected
      </td>
      <td>
      </td>
      <td>
        boolean
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        clientId
      </td>
      <td>
        optional
      </td>
      <td>
        string
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### submitDataStoreAliasOp {#submitdatastorealiasop-method}

#### Signature {#submitdatastorealiasop-signature}

```typescript
submitDataStoreAliasOp(contents: any, localOpMetadata: unknown): void;
```

#### Parameters {#submitdatastorealiasop-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        contents
      </td>
      <td>
        any
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        localOpMetadata
      </td>
      <td>
        unknown
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### submitDataStoreOp {#submitdatastoreop-method}

#### Signature {#submitdatastoreop-signature}

```typescript
submitDataStoreOp(id: string, contents: any, localOpMetadata?: unknown): void;
```

#### Parameters {#submitdatastoreop-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Modifiers
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        id
      </td>
      <td>
      </td>
      <td>
        string
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        contents
      </td>
      <td>
      </td>
      <td>
        any
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        localOpMetadata
      </td>
      <td>
        optional
      </td>
      <td>
        unknown
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### submitDataStoreSignal {#submitdatastoresignal-method}

#### Signature {#submitdatastoresignal-signature}

```typescript
submitDataStoreSignal(address: string, type: string, content: any): void;
```

#### Parameters {#submitdatastoresignal-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        address
      </td>
      <td>
        string
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        type
      </td>
      <td>
        string
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        content
      </td>
      <td>
        any
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### submitSignal {#submitsignal-method}

Submits the signal to be sent to other clients.

#### Signature {#submitsignal-signature}

```typescript
submitSignal(type: string, content: any): void;
```

#### Parameters {#submitsignal-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        type
      </td>
      <td>
        string
      </td>
      <td>
        Type of the signal.
      </td>
    </tr>
    <tr>
      <td>
        content
      </td>
      <td>
        any
      </td>
      <td>
        Content of the signal.
      </td>
    </tr>
  </tbody>
</table>

### submitSummary {#submitsummary-method}

Generates the summary tree, uploads it to storage, and then submits the summarize op. This is intended to be called by the summarizer, since it is the implementation of ISummarizerInternalsProvider.submitSummary. It takes care of state management at the container level, including pausing inbound op processing, updating SummarizerNode state tracking, and garbage collection.

#### Signature {#submitsummary-signature}

```typescript
submitSummary(options: ISubmitSummaryOptions): Promise<SubmitSummaryResult>;
```

#### Parameters {#submitsummary-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        options
      </td>
      <td>
        <a href='/docs/apis/container-runtime\isubmitsummaryoptions-interface'>ISubmitSummaryOptions</a>
      </td>
      <td>
        options controlling how the summary is generated or submitted
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#submitsummary-returns}

<b>Return type:</b> Promise&lt;[SubmitSummaryResult](/docs/apis/container-runtime#submitsummaryresult-typealias)<!-- -->&gt;

### summarize {#summarize-method}

Returns a summary of the runtime at the current sequence number.

#### Signature {#summarize-signature}

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

#### Parameters {#summarize-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        options
      </td>
      <td>
        { fullTree?: boolean; trackState?: boolean; summaryLogger?: <a href='/docs/apis/common-definitions\itelemetrylogger-interface'>ITelemetryLogger</a>; runGC?: boolean; fullGC?: boolean; runSweep?: boolean; }
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#summarize-returns}

<b>Return type:</b> Promise&lt;[IRootSummaryTreeWithStats](/docs/apis/container-runtime\irootsummarytreewithstats-interface)<!-- -->&gt;

### updateStateBeforeGC {#updatestatebeforegc-method}

Implementation of IGarbageCollectionRuntime::updateStateBeforeGC. Before GC runs, called by the garbage collector to update any pending GC state. This is mainly used to notify the garbage collector of references detected since the last GC run. Most references are notified immediately but there can be some for which async operation is required (such as detecting new root data stores).

#### Signature {#updatestatebeforegc-signature}

```typescript
updateStateBeforeGC(): Promise<void>;
```

#### Returns {#updatestatebeforegc-returns}

<b>Return type:</b> Promise&lt;void&gt;

### updateTombstonedRoutes {#updatetombstonedroutes-method}

This is called to update objects that are tombstones.

#### Signature {#updatetombstonedroutes-signature}

```typescript
updateTombstonedRoutes(tombstonedRoutes: string[]): void;
```

#### Parameters {#updatetombstonedroutes-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        tombstonedRoutes
      </td>
      <td>
        string[]
      </td>
      <td>
        Data store and attachment blob routes that are tombstones in this Container.
      </td>
    </tr>
  </tbody>
</table>

### updateUnusedRoutes {#updateunusedroutes-method}

This is called to update objects whose routes are unused.

#### Signature {#updateunusedroutes-signature}

```typescript
updateUnusedRoutes(unusedRoutes: string[]): void;
```

#### Parameters {#updateunusedroutes-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        unusedRoutes
      </td>
      <td>
        string[]
      </td>
      <td>
        Data store and attachment blob routes that are unused in this Container.
      </td>
    </tr>
  </tbody>
</table>

### updateUsedRoutes {#updateusedroutes-method}

Implementation of IGarbageCollectionRuntime::updateUsedRoutes. After GC has run, called to notify this container's nodes of routes that are used in it.

#### Signature {#updateusedroutes-signature}

```typescript
updateUsedRoutes(usedRoutes: string[]): void;
```

#### Parameters {#updateusedroutes-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        usedRoutes
      </td>
      <td>
        string[]
      </td>
      <td>
        The routes that are used in all nodes in this Container.
      </td>
    </tr>
  </tbody>
</table>

### uploadBlob {#uploadblob-method}

#### Signature {#uploadblob-signature}

```typescript
uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>>;
```

#### Parameters {#uploadblob-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th scope="col">
        Parameter
      </th>
      <th scope="col">
        Type
      </th>
      <th scope="col">
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        blob
      </td>
      <td>
        ArrayBufferLike
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#uploadblob-returns}

<b>Return type:</b> Promise&lt;[IFluidHandle](/docs/apis/core-interfaces\ifluidhandle-interface)<!-- -->&lt;ArrayBufferLike&gt;&gt;