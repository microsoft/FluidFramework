{
  "title": "ContainerRuntime Class",
  "summary": "Represents the runtime of the container. Contains helper functions/state of the container. It will define the store level mappings.",
  "kind": "Class",
  "members": {
    "Method": {
      "addContainerStateToSummary": "/docs/apis/container-runtime/containerruntime-class#addcontainerstatetosummary-method",
      "addedGCOutboundReference": "/docs/apis/container-runtime/containerruntime-class#addedgcoutboundreference-method",
      "collectGarbage": "/docs/apis/container-runtime/containerruntime-class#collectgarbage-method",
      "createDataStore": "/docs/apis/container-runtime/containerruntime-class#createdatastore-method",
      "createDetachedDataStore": "/docs/apis/container-runtime/containerruntime-class#createdetacheddatastore-method",
      "createDetachedRootDataStore": "/docs/apis/container-runtime/containerruntime-class#createdetachedrootdatastore-method",
      "createSummary": "/docs/apis/container-runtime/containerruntime-class#createsummary-method",
      "deleteSweepReadyNodes": "/docs/apis/container-runtime/containerruntime-class#deletesweepreadynodes-method",
      "deleteUnusedNodes": "/docs/apis/container-runtime/containerruntime-class#deleteunusednodes-method",
      "dispose": "/docs/apis/container-runtime/containerruntime-class#dispose-method",
      "enqueueSummarize": "/docs/apis/container-runtime/containerruntime-class#enqueuesummarize-method",
      "ensureNoDataModelChanges": "/docs/apis/container-runtime/containerruntime-class#ensurenodatamodelchanges-method",
      "getAliasedDataStoreEntryPoint": "/docs/apis/container-runtime/containerruntime-class#getaliaseddatastoreentrypoint-method",
      "getAudience": "/docs/apis/container-runtime/containerruntime-class#getaudience-method",
      "getCurrentReferenceTimestampMs": "/docs/apis/container-runtime/containerruntime-class#getcurrentreferencetimestampms-method",
      "getEntryPoint": "/docs/apis/container-runtime/containerruntime-class#getentrypoint-method",
      "getGCData": "/docs/apis/container-runtime/containerruntime-class#getgcdata-method",
      "getGCNodePackagePath": "/docs/apis/container-runtime/containerruntime-class#getgcnodepackagepath-method",
      "getNodeType": "/docs/apis/container-runtime/containerruntime-class#getnodetype-method",
      "getPendingLocalState": "/docs/apis/container-runtime/containerruntime-class#getpendinglocalstate-method",
      "getQuorum": "/docs/apis/container-runtime/containerruntime-class#getquorum-method",
      "getRootDataStore": "/docs/apis/container-runtime/containerruntime-class#getrootdatastore-method",
      "load": "/docs/apis/container-runtime/containerruntime-class#load-method",
      "loadRuntime": "/docs/apis/container-runtime/containerruntime-class#loadruntime-method",
      "notifyAttaching": "/docs/apis/container-runtime/containerruntime-class#notifyattaching-method",
      "notifyOpReplay": "/docs/apis/container-runtime/containerruntime-class#notifyopreplay-method",
      "orderSequentially": "/docs/apis/container-runtime/containerruntime-class#ordersequentially-method",
      "process": "/docs/apis/container-runtime/containerruntime-class#process-method",
      "processSignal": "/docs/apis/container-runtime/containerruntime-class#processsignal-method",
      "refreshLatestSummaryAck": "/docs/apis/container-runtime/containerruntime-class#refreshlatestsummaryack-method",
      "request": "/docs/apis/container-runtime/containerruntime-class#request-method",
      "resolveHandle": "/docs/apis/container-runtime/containerruntime-class#resolvehandle-method",
      "setAttachState": "/docs/apis/container-runtime/containerruntime-class#setattachstate-method",
      "setConnectionState": "/docs/apis/container-runtime/containerruntime-class#setconnectionstate-method",
      "submitDataStoreAliasOp": "/docs/apis/container-runtime/containerruntime-class#submitdatastorealiasop-method",
      "submitDataStoreOp": "/docs/apis/container-runtime/containerruntime-class#submitdatastoreop-method",
      "submitDataStoreSignal": "/docs/apis/container-runtime/containerruntime-class#submitdatastoresignal-method",
      "submitSignal": "/docs/apis/container-runtime/containerruntime-class#submitsignal-method",
      "submitSummary": "/docs/apis/container-runtime/containerruntime-class#submitsummary-method",
      "summarize": "/docs/apis/container-runtime/containerruntime-class#summarize-method",
      "summarizeOnDemand": "/docs/apis/container-runtime/containerruntime-class#summarizeondemand-method",
      "updateStateBeforeGC": "/docs/apis/container-runtime/containerruntime-class#updatestatebeforegc-method",
      "updateTombstonedRoutes": "/docs/apis/container-runtime/containerruntime-class#updatetombstonedroutes-method",
      "updateUnusedRoutes": "/docs/apis/container-runtime/containerruntime-class#updateunusedroutes-method",
      "updateUsedRoutes": "/docs/apis/container-runtime/containerruntime-class#updateusedroutes-method",
      "uploadBlob": "/docs/apis/container-runtime/containerruntime-class#uploadblob-method"
    },
    "Property": {
      "attachState": "/docs/apis/container-runtime/containerruntime-class#attachstate-property",
      "clientDetails": "/docs/apis/container-runtime/containerruntime-class#clientdetails-property",
      "clientId": "/docs/apis/container-runtime/containerruntime-class#clientid-property",
      "closeFn": "/docs/apis/container-runtime/containerruntime-class#closefn-property",
      "connected": "/docs/apis/container-runtime/containerruntime-class#connected-property",
      "deltaManager": "/docs/apis/container-runtime/containerruntime-class#deltamanager-property",
      "disposed": "/docs/apis/container-runtime/containerruntime-class#disposed-property",
      "disposeFn": "/docs/apis/container-runtime/containerruntime-class#disposefn-property",
      "flushMode": "/docs/apis/container-runtime/containerruntime-class#flushmode-property",
      "gcTombstoneEnforcementAllowed": "/docs/apis/container-runtime/containerruntime-class#gctombstoneenforcementallowed-property",
      "getAbsoluteUrl": "/docs/apis/container-runtime/containerruntime-class#getabsoluteurl-property",
      "idCompressor": "/docs/apis/container-runtime/containerruntime-class#idcompressor-property",
      "IFluidDataStoreRegistry": "/docs/apis/container-runtime/containerruntime-class#ifluiddatastoreregistry-property",
      "IFluidHandleContext": "/docs/apis/container-runtime/containerruntime-class#ifluidhandlecontext-property",
      "IFluidRouter": "/docs/apis/container-runtime/containerruntime-class#ifluidrouter-property",
      "isDirty": "/docs/apis/container-runtime/containerruntime-class#isdirty-property",
      "logger": "/docs/apis/container-runtime/containerruntime-class#logger-property",
      "options": "/docs/apis/container-runtime/containerruntime-class#options-property",
      "reSubmitFn": "/docs/apis/container-runtime/containerruntime-class#resubmitfn-property",
      "scope": "/docs/apis/container-runtime/containerruntime-class#scope-property",
      "storage": "/docs/apis/container-runtime/containerruntime-class#storage-property",
      "summarizerClientId": "/docs/apis/container-runtime/containerruntime-class#summarizerclientid-property"
    }
  },
  "package": "@fluidframework/container-runtime",
  "unscopedPackageName": "container-runtime"
}

[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/container-runtime](/docs/apis/container-runtime) &gt; [ContainerRuntime](/docs/apis/container-runtime/containerruntime-class)

Represents the runtime of the container. Contains helper functions/state of the container. It will define the store level mappings.

## Signature {#containerruntime-signature}

```typescript
export declare class ContainerRuntime extends TypedEventEmitter<IContainerRuntimeEvents> implements IContainerRuntime, IRuntime, ISummarizerRuntime, ISummarizerInternalsProvider
```

**Extends:** [TypedEventEmitter](/docs/apis/common-utils/typedeventemitter-class)&lt;[IContainerRuntimeEvents](/docs/apis/container-runtime-definitions/icontainerruntimeevents-interface)&gt;

**Implements:** [IContainerRuntime](/docs/apis/container-runtime-definitions/icontainerruntime-interface), IRuntime, [ISummarizerRuntime](/docs/apis/container-runtime/isummarizerruntime-interface), [ISummarizerInternalsProvider](/docs/apis/container-runtime/isummarizerinternalsprovider-interface)

## Remarks {#containerruntime-remarks}

The constructor for this class is marked as internal. Third-party code should not call the constructor directly or create subclasses that extend the `ContainerRuntime` class.

## Static Methods

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Method
      </th>
      <th>
        Alerts
      </th>
      <th>
        Return Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#load-method'>load</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/container-runtime/containerruntime-class'>ContainerRuntime</a>&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#loadruntime-method'>loadRuntime</a>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/container-runtime/containerruntime-class'>ContainerRuntime</a>&gt;</span>
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
      <th>
        Property
      </th>
      <th>
        Alerts
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#attachstate-property'>attachState</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span><a href='/docs/apis/container-definitions#attachstate-enum'>AttachState</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#clientdetails-property'>clientDetails</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span><a href='/docs/apis/protocol-definitions/iclientdetails-interface'>IClientDetails</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#clientid-property'>clientId</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>string &#124; undefined</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#closefn-property'>closeFn</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>(error?: <a href='/docs/apis/azure-client#icriticalcontainererror-typealias'>ICriticalContainerError</a>) =&gt; void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#connected-property'>connected</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>boolean</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#deltamanager-property'>deltaManager</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>IDeltaManager&lt;<a href='/docs/apis/protocol-definitions/isequenceddocumentmessage-interface'>ISequencedDocumentMessage</a>, <a href='/docs/apis/protocol-definitions/idocumentmessage-interface'>IDocumentMessage</a>&gt;</span>
      </td>
      <td>
        This is a proxy to the delta manager provided by the container context (innerDeltaManager). It restricts certain accesses such as sets &quot;read-only&quot; mode for the summarizer client. This is the default delta manager that should be used unless the innerDeltaManager is required.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#disposed-property'>disposed</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>boolean</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#disposefn-property'>disposeFn</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>(error?: <a href='/docs/apis/azure-client#icriticalcontainererror-typealias'>ICriticalContainerError</a>) =&gt; void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#flushmode-property'>flushMode</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span><a href='/docs/apis/runtime-definitions#flushmode-enum'>FlushMode</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#gctombstoneenforcementallowed-property'>gcTombstoneEnforcementAllowed</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>boolean</span>
      </td>
      <td>
        If false, loading or using a Tombstoned object should merely log, not fail
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#getabsoluteurl-property'>getAbsoluteUrl</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>(relativeUrl: string) =&gt; Promise&lt;string &#124; undefined&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#idcompressor-property'>idCompressor</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>(<a href='/docs/apis/runtime-definitions/iidcompressor-interface'>IIdCompressor</a> &amp; <a href='/docs/apis/runtime-definitions/iidcompressorcore-interface'>IIdCompressorCore</a>) &#124; undefined</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#ifluiddatastoreregistry-property'>IFluidDataStoreRegistry</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span><a href='/docs/apis/runtime-definitions/ifluiddatastoreregistry-interface'>IFluidDataStoreRegistry</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#ifluidhandlecontext-property'>IFluidHandleContext</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span><a href='/docs/apis/core-interfaces/ifluidhandlecontext-interface'>IFluidHandleContext</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#ifluidrouter-property'>IFluidRouter</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>this</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#isdirty-property'>isDirty</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>boolean</span>
      </td>
      <td>
        Returns true of container is dirty, i.e. there are some pending local changes that either were not sent out to delta stream or were not yet acknowledged.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#logger-property'>logger</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span><a href='/docs/apis/telemetry-utils/itelemetryloggerext-interface'>ITelemetryLoggerExt</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#options-property'>options</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>ILoaderOptions</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#resubmitfn-property'>reSubmitFn</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>(type: <a href='/docs/apis/container-runtime#containermessagetype-enum'>ContainerMessageType</a>, contents: any, localOpMetadata: unknown, opMetadata: Record&lt;string, unknown&gt; &#124; undefined) =&gt; void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#scope-property'>scope</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span><a href='/docs/apis/core-interfaces#fluidobject-typealias'>FluidObject</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#storage-property'>storage</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span><a href='/docs/apis/driver-definitions/idocumentstorageservice-interface'>IDocumentStorageService</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#summarizerclientid-property'>summarizerClientId</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>string &#124; undefined</span>
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
      <th>
        Method
      </th>
      <th>
        Alerts
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Return Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#addcontainerstatetosummary-method'>addContainerStateToSummary</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#addedgcoutboundreference-method'>addedGCOutboundReference</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
        Called when a new outbound reference is added to another node. This is used by garbage collection to identify all references added in the system.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#collectgarbage-method'>collectGarbage</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/container-runtime/igcstats-interface'>IGCStats</a> &#124; undefined&gt;</span>
      </td>
      <td>
        Runs garbage collection and updates the reference / used state of the nodes in the container.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#createdatastore-method'>createDataStore</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/runtime-definitions/idatastore-interface'>IDataStore</a>&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#createdetacheddatastore-method'>createDetachedDataStore</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/runtime-definitions/ifluiddatastorecontextdetached-interface'>IFluidDataStoreContextDetached</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#createdetachedrootdatastore-method'>createDetachedRootDataStore</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/runtime-definitions/ifluiddatastorecontextdetached-interface'>IFluidDataStoreContextDetached</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#createsummary-method'>createSummary</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/protocol-definitions/isummarytree-interface'>ISummaryTree</a></span>
      </td>
      <td>
        Create a summary. Used when attaching or serializing a detached container.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#deletesweepreadynodes-method'>deleteSweepReadyNodes</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>string[]</span>
      </td>
      <td>
        After GC has run and identified nodes that are sweep ready, this is called to delete the sweep ready nodes.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#deleteunusednodes-method'>deleteUnusedNodes</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
      </td>
      <td>
        <span>string[]</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#dispose-method'>dispose</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#enqueuesummarize-method'>enqueueSummarize</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/container-runtime#enqueuesummarizeresult-typealias'>EnqueueSummarizeResult</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#ensurenodatamodelchanges-method'>ensureNoDataModelChanges</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>T</span>
      </td>
      <td>
        <p>
          Invokes the given callback and expects that no ops are submitted until execution finishes. If an op is submitted, an error will be raised.
        </p>
        <p>
          Can be disabled by feature gate <code>Fluid.ContainerRuntime.DisableOpReentryCheck</code>
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#getaliaseddatastoreentrypoint-method'>getAliasedDataStoreEntryPoint</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/core-interfaces/ifluidhandle-interface'>IFluidHandle</a>&lt;<a href='/docs/apis/core-interfaces#fluidobject-typealias'>FluidObject</a>&gt; &#124; undefined&gt;</span>
      </td>
      <td>
        Returns the aliased data store's entryPoint, given the alias.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#getaudience-method'>getAudience</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>IAudience</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#getcurrentreferencetimestampms-method'>getCurrentReferenceTimestampMs</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>number &#124; undefined</span>
      </td>
      <td>
        Returns a server generated referenced timestamp to be used to track unreferenced nodes by GC.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#getentrypoint-method'>getEntryPoint</a>
      </td>
      <td>
      </td>
      <td>
        <code>optional</code>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/core-interfaces#fluidobject-typealias'>FluidObject</a> &#124; undefined&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#getgcdata-method'>getGCData</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/runtime-definitions/igarbagecollectiondata-interface'>IGarbageCollectionData</a>&gt;</span>
      </td>
      <td>
        Generates and returns the GC data for this container.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#getgcnodepackagepath-method'>getGCNodePackagePath</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;readonly string[] &#124; undefined&gt;</span>
      </td>
      <td>
        Called by GC to retrieve the package path of the node with the given path. The node should belong to a data store or an attachment blob.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#getnodetype-method'>getNodeType</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>GCNodeType</span>
      </td>
      <td>
        Returns the type of the GC node. Currently, there are nodes that belong to the root (&quot;/&quot;), data stores or blob manager.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#getpendinglocalstate-method'>getPendingLocalState</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;unknown&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#getquorum-method'>getQuorum</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/protocol-definitions/iquorumclients-interface'>IQuorumClients</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#getrootdatastore-method'>getRootDataStore</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/core-interfaces/ifluidrouter-interface'>IFluidRouter</a>&gt;</span>
      </td>
      <td>
        Returns the runtime of the data store.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#notifyattaching-method'>notifyAttaching</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#notifyopreplay-method'>notifyOpReplay</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;void&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#ordersequentially-method'>orderSequentially</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>T</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#process-method'>process</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#processsignal-method'>processSignal</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#refreshlatestsummaryack-method'>refreshLatestSummaryAck</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;void&gt;</span>
      </td>
      <td>
        Implementation of ISummarizerInternalsProvider.refreshLatestSummaryAck
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#request-method'>request</a>
      </td>
      <td>
        <code>DEPRECATED</code>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/core-interfaces/iresponse-interface'>IResponse</a>&gt;</span>
      </td>
      <td>
        Notifies this object about the request made to the container.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#resolvehandle-method'>resolveHandle</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/core-interfaces/iresponse-interface'>IResponse</a>&gt;</span>
      </td>
      <td>
        Resolves URI representing handle
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#setattachstate-method'>setAttachState</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#setconnectionstate-method'>setConnectionState</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#submitdatastorealiasop-method'>submitDataStoreAliasOp</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#submitdatastoreop-method'>submitDataStoreOp</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#submitdatastoresignal-method'>submitDataStoreSignal</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#submitsignal-method'>submitSignal</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
        Submits the signal to be sent to other clients.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#submitsummary-method'>submitSummary</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/container-runtime#submitsummaryresult-typealias'>SubmitSummaryResult</a>&gt;</span>
      </td>
      <td>
        Generates the summary tree, uploads it to storage, and then submits the summarize op. This is intended to be called by the summarizer, since it is the implementation of ISummarizerInternalsProvider.submitSummary. It takes care of state management at the container level, including pausing inbound op processing, updating SummarizerNode state tracking, and garbage collection.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#summarize-method'>summarize</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/runtime-definitions/isummarytreewithstats-interface'>ISummaryTreeWithStats</a>&gt;</span>
      </td>
      <td>
        Returns a summary of the runtime at the current sequence number.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#summarizeondemand-method'>summarizeOnDemand</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/container-runtime/isummarizeresults-interface'>ISummarizeResults</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#updatestatebeforegc-method'>updateStateBeforeGC</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;void&gt;</span>
      </td>
      <td>
        Before GC runs, called by the garbage collector to update any pending GC state. This is mainly used to notify the garbage collector of references detected since the last GC run. Most references are notified immediately but there can be some for which async operation is required (such as detecting new root data stores).
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#updatetombstonedroutes-method'>updateTombstonedRoutes</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
        This is called to update objects that are tombstones.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#updateunusedroutes-method'>updateUnusedRoutes</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
        This is called to update objects whose routes are unused.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#updateusedroutes-method'>updateUsedRoutes</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
        After GC has run, called to notify this container's nodes of routes that are used in it.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class#uploadblob-method'>uploadBlob</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/core-interfaces/ifluidhandle-interface'>IFluidHandle</a>&lt;ArrayBufferLike&gt;&gt;</span>
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
readonly clientDetails: IClientDetails;
```

### clientId {#clientid-property}

#### Signature {#clientid-signature}

```typescript
get clientId(): string | undefined;
```

### closeFn {#closefn-property}

#### Signature {#closefn-signature}

```typescript
readonly closeFn: (error?: ICriticalContainerError) => void;
```

### connected {#connected-property}

#### Signature {#connected-signature}

```typescript
get connected(): boolean;
```

### deltaManager {#deltamanager-property}

This is a proxy to the delta manager provided by the container context (innerDeltaManager). It restricts certain accesses such as sets "read-only" mode for the summarizer client. This is the default delta manager that should be used unless the innerDeltaManager is required.

#### Signature {#deltamanager-signature}

```typescript
readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
```

### disposed {#disposed-property}

#### Signature {#disposed-signature}

```typescript
get disposed(): boolean;
```

### disposeFn {#disposefn-property}

#### Signature {#disposefn-signature}

```typescript
readonly disposeFn: (error?: ICriticalContainerError) => void;
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

### getAbsoluteUrl {#getabsoluteurl-property}

#### Signature {#getabsoluteurl-signature}

```typescript
readonly getAbsoluteUrl: (relativeUrl: string) => Promise<string | undefined>;
```

### idCompressor {#idcompressor-property}

#### Signature {#idcompressor-signature}

```typescript
idCompressor: (IIdCompressor & IIdCompressorCore) | undefined;
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

{{% callout warning Deprecated %}}
- Will be removed in future major release. Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md

{{% /callout %}}

#### Signature {#ifluidrouter-signature}

```typescript
get IFluidRouter(): this;
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
readonly logger: ITelemetryLoggerExt;
```

### options {#options-property}

#### Signature {#options-signature}

```typescript
readonly options: ILoaderOptions;
```

### reSubmitFn {#resubmitfn-property}

{{% callout warning Deprecated %}}
- The functionality is no longer exposed publicly

{{% /callout %}}

#### Signature {#resubmitfn-signature}

```typescript
get reSubmitFn(): (type: ContainerMessageType, contents: any, localOpMetadata: unknown, opMetadata: Record<string, unknown> | undefined) => void;
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

### summarizerClientId {#summarizerclientid-property}

clientId of parent (non-summarizing) container that owns summarizer container

#### Signature {#summarizerclientid-signature}

```typescript
get summarizerClientId(): string | undefined;
```

## Method Details

### addContainerStateToSummary {#addcontainerstatetosummary-method}

#### Signature {#addcontainerstatetosummary-signature}

```typescript
protected addContainerStateToSummary(summaryTree: ISummaryTreeWithStats, fullTree: boolean, trackState: boolean, telemetryContext?: ITelemetryContext): void;
```

#### Parameters {#addcontainerstatetosummary-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/runtime-definitions/isummarytreewithstats-interface'>ISummaryTreeWithStats</a></span>
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
        <span>boolean</span>
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
        <span>boolean</span>
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
        <span><a href='/docs/apis/runtime-definitions/itelemetrycontext-interface'>ITelemetryContext</a></span>
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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/core-interfaces/ifluidhandle-interface'>IFluidHandle</a></span>
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
        <span><a href='/docs/apis/core-interfaces/ifluidhandle-interface'>IFluidHandle</a></span>
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
        logger?: ITelemetryLoggerExt;
        runSweep?: boolean;
        fullGC?: boolean;
    }, telemetryContext?: ITelemetryContext): Promise<IGCStats | undefined>;
```

#### Parameters {#collectgarbage-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>{         logger?: <a href='/docs/apis/telemetry-utils/itelemetryloggerext-interface'>ITelemetryLoggerExt</a>;         runSweep?: boolean;         fullGC?: boolean;     }</span>
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
        <span><a href='/docs/apis/runtime-definitions/itelemetrycontext-interface'>ITelemetryContext</a></span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#collectgarbage-returns}

the statistics of the garbage collection run; undefined if GC did not run.

**Return type:** Promise&lt;[IGCStats](/docs/apis/container-runtime/igcstats-interface) \| undefined&gt;

### createDataStore {#createdatastore-method}

#### Signature {#createdatastore-signature}

```typescript
createDataStore(pkg: string | string[]): Promise<IDataStore>;
```

#### Parameters {#createdatastore-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>string &#124; string[]</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#createdatastore-returns}

**Return type:** Promise&lt;[IDataStore](/docs/apis/runtime-definitions/idatastore-interface)&gt;

### createDetachedDataStore {#createdetacheddatastore-method}

#### Signature {#createdetacheddatastore-signature}

```typescript
createDetachedDataStore(pkg: Readonly<string[]>): IFluidDataStoreContextDetached;
```

#### Parameters {#createdetacheddatastore-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>Readonly&lt;string[]&gt;</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#createdetacheddatastore-returns}

**Return type:** [IFluidDataStoreContextDetached](/docs/apis/runtime-definitions/ifluiddatastorecontextdetached-interface)

### createDetachedRootDataStore {#createdetachedrootdatastore-method}

#### Signature {#createdetachedrootdatastore-signature}

```typescript
createDetachedRootDataStore(pkg: Readonly<string[]>, rootDataStoreId: string): IFluidDataStoreContextDetached;
```

#### Parameters {#createdetachedrootdatastore-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>Readonly&lt;string[]&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        rootDataStoreId
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#createdetachedrootdatastore-returns}

**Return type:** [IFluidDataStoreContextDetached](/docs/apis/runtime-definitions/ifluiddatastorecontextdetached-interface)

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
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>Map&lt;string, string&gt;</span>
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
        <span><a href='/docs/apis/runtime-definitions/itelemetrycontext-interface'>ITelemetryContext</a></span>
      </td>
      <td>
        summary data passed through the layers for telemetry purposes
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#createsummary-returns}

**Return type:** [ISummaryTree](/docs/apis/protocol-definitions/isummarytree-interface)

### deleteSweepReadyNodes {#deletesweepreadynodes-method}

After GC has run and identified nodes that are sweep ready, this is called to delete the sweep ready nodes.

#### Signature {#deletesweepreadynodes-signature}

```typescript
deleteSweepReadyNodes(sweepReadyRoutes: string[]): string[];
```

#### Parameters {#deletesweepreadynodes-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        sweepReadyRoutes
      </td>
      <td>
        <span>string[]</span>
      </td>
      <td>
        The routes of nodes that are sweep ready and should be deleted.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#deletesweepreadynodes-returns}

- The routes of nodes that were deleted.

**Return type:** string\[\]

### deleteUnusedNodes {#deleteunusednodes-method}

{{% callout warning Deprecated %}}
- Replaced by deleteSweepReadyNodes.

{{% /callout %}}

#### Signature {#deleteunusednodes-signature}

```typescript
deleteUnusedNodes(unusedRoutes: string[]): string[];
```

#### Parameters {#deleteunusednodes-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>string[]</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#deleteunusednodes-returns}

**Return type:** string\[\]

### dispose {#dispose-method}

#### Signature {#dispose-signature}

```typescript
dispose(error?: Error): void;
```

#### Parameters {#dispose-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>Error</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### enqueueSummarize {#enqueuesummarize-method}

#### Signature {#enqueuesummarize-signature}

```typescript
enqueueSummarize(options: IEnqueueSummarizeOptions): EnqueueSummarizeResult;
```

#### Parameters {#enqueuesummarize-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/container-runtime/ienqueuesummarizeoptions-interface'>IEnqueueSummarizeOptions</a></span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#enqueuesummarize-returns}

**Return type:** [EnqueueSummarizeResult](/docs/apis/container-runtime#enqueuesummarizeresult-typealias)

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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>() =&gt; T</span>
      </td>
      <td>
        the callback to be invoked
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#ensurenodatamodelchanges-returns}

**Return type:** T

### getAliasedDataStoreEntryPoint {#getaliaseddatastoreentrypoint-method}

Returns the aliased data store's entryPoint, given the alias.

#### Signature {#getaliaseddatastoreentrypoint-signature}

```typescript
getAliasedDataStoreEntryPoint(alias: string): Promise<IFluidHandle<FluidObject> | undefined>;
```

#### Parameters {#getaliaseddatastoreentrypoint-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        alias
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
        The alias for the data store.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getaliaseddatastoreentrypoint-returns}

- The data store's entry point (IFluidHandle) if it exists and is aliased. Returns undefined if no data store has been assigned the given alias.

**Return type:** Promise&lt;[IFluidHandle](/docs/apis/core-interfaces/ifluidhandle-interface)&lt;[FluidObject](/docs/apis/core-interfaces#fluidobject-typealias)&gt; \| undefined&gt;

### getAudience {#getaudience-method}

#### Signature {#getaudience-signature}

```typescript
getAudience(): IAudience;
```

#### Returns {#getaudience-returns}

**Return type:** IAudience

### getCurrentReferenceTimestampMs {#getcurrentreferencetimestampms-method}

Returns a server generated referenced timestamp to be used to track unreferenced nodes by GC.

#### Signature {#getcurrentreferencetimestampms-signature}

```typescript
getCurrentReferenceTimestampMs(): number | undefined;
```

#### Returns {#getcurrentreferencetimestampms-returns}

**Return type:** number \| undefined

### getEntryPoint {#getentrypoint-method}

#### Signature {#getentrypoint-signature}

```typescript
getEntryPoint?(): Promise<FluidObject | undefined>;
```

#### Returns {#getentrypoint-returns}

**Return type:** Promise&lt;[FluidObject](/docs/apis/core-interfaces#fluidobject-typealias) \| undefined&gt;

### getGCData {#getgcdata-method}

Generates and returns the GC data for this container.

#### Signature {#getgcdata-signature}

```typescript
getGCData(fullGC?: boolean): Promise<IGarbageCollectionData>;
```

#### Parameters {#getgcdata-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>boolean</span>
      </td>
      <td>
        true to bypass optimizations and force full generation of GC data.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getgcdata-returns}

**Return type:** Promise&lt;[IGarbageCollectionData](/docs/apis/runtime-definitions/igarbagecollectiondata-interface)&gt;

#### See Also {#getgcdata-see-also}

IGarbageCollectionRuntime.getGCData

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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getgcnodepackagepath-returns}

**Return type:** Promise&lt;readonly string\[\] \| undefined&gt;

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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getnodetype-returns}

**Return type:** GCNodeType

### getPendingLocalState {#getpendinglocalstate-method}

#### Signature {#getpendinglocalstate-signature}

```typescript
getPendingLocalState(props?: {
        notifyImminentClosure: boolean;
    }): Promise<unknown>;
```

#### Parameters {#getpendinglocalstate-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        props
      </td>
      <td>
        optional
      </td>
      <td>
        <span>{         notifyImminentClosure: boolean;     }</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getpendinglocalstate-returns}

**Return type:** Promise&lt;unknown&gt;

### getQuorum {#getquorum-method}

#### Signature {#getquorum-signature}

```typescript
getQuorum(): IQuorumClients;
```

#### Returns {#getquorum-returns}

**Return type:** [IQuorumClients](/docs/apis/protocol-definitions/iquorumclients-interface)

### getRootDataStore {#getrootdatastore-method}

{{% callout warning Deprecated %}}
- Use getAliasedDataStoreEntryPoint instead to get an aliased data store's entry point.

{{% /callout %}}

Returns the runtime of the data store.

#### Signature {#getrootdatastore-signature}

```typescript
getRootDataStore(id: string, wait?: boolean): Promise<IFluidRouter>;
```

#### Parameters {#getrootdatastore-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>string</span>
      </td>
      <td>
        Id supplied during creating the data store.
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
        <span>boolean</span>
      </td>
      <td>
        True if you want to wait for it.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getrootdatastore-returns}

**Return type:** Promise&lt;[IFluidRouter](/docs/apis/core-interfaces/ifluidrouter-interface)&gt;

### load {#load-method}

{{% callout warning Deprecated %}}
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
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>IContainerContext</span>
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
        <span><a href='/docs/apis/runtime-definitions#namedfluiddatastoreregistryentries-typealias'>NamedFluidDataStoreRegistryEntries</a></span>
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
        <span>(request: <a href='/docs/apis/core-interfaces/irequest-interface'>IRequest</a>, runtime: <a href='/docs/apis/container-runtime-definitions/icontainerruntime-interface'>IContainerRuntime</a>) =&gt; Promise&lt;<a href='/docs/apis/core-interfaces/iresponse-interface'>IResponse</a>&gt;</span>
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
        <span><a href='/docs/apis/container-runtime/icontainerruntimeoptions-interface'>IContainerRuntimeOptions</a></span>
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
        <span><a href='/docs/apis/core-interfaces#fluidobject-typealias'>FluidObject</a></span>
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
        <span>boolean</span>
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
        <span>typeof <a href='/docs/apis/container-runtime/containerruntime-class'>ContainerRuntime</a></span>
      </td>
      <td>
        (optional) Constructor to use to create the ContainerRuntime instance. This allows mixin classes to leverage this method to define their own async initializer.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#load-returns}

**Return type:** Promise&lt;[ContainerRuntime](/docs/apis/container-runtime/containerruntime-class)&gt;

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
        initializeEntryPoint?: (containerRuntime: IContainerRuntime) => Promise<FluidObject>;
    }): Promise<ContainerRuntime>;
```

#### Parameters {#loadruntime-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>{         context: IContainerContext;         registryEntries: <a href='/docs/apis/runtime-definitions#namedfluiddatastoreregistryentries-typealias'>NamedFluidDataStoreRegistryEntries</a>;         existing: boolean;         requestHandler?: (request: <a href='/docs/apis/core-interfaces/irequest-interface'>IRequest</a>, runtime: <a href='/docs/apis/container-runtime-definitions/icontainerruntime-interface'>IContainerRuntime</a>) =&gt; Promise&lt;<a href='/docs/apis/core-interfaces/iresponse-interface'>IResponse</a>&gt;;         runtimeOptions?: <a href='/docs/apis/container-runtime/icontainerruntimeoptions-interface'>IContainerRuntimeOptions</a>;         containerScope?: <a href='/docs/apis/core-interfaces#fluidobject-typealias'>FluidObject</a>;         containerRuntimeCtor?: typeof <a href='/docs/apis/container-runtime/containerruntime-class'>ContainerRuntime</a>;         initializeEntryPoint?: (containerRuntime: <a href='/docs/apis/container-runtime-definitions/icontainerruntime-interface'>IContainerRuntime</a>) =&gt; Promise&lt;<a href='/docs/apis/core-interfaces#fluidobject-typealias'>FluidObject</a>&gt;;     }</span>
      </td>
      <td>
        An object housing the runtime properties: - context - Context of the container. - registryEntries - Mapping from data store types to their corresponding factories. - existing - Pass 'true' if loading from an existing snapshot. - requestHandler - (optional) Request handler for the request() method of the container runtime. Only relevant for back-compat while we remove the request() method and move fully to entryPoint as the main pattern. - runtimeOptions - Additional options to be passed to the runtime - containerScope - runtime services provided with context - containerRuntimeCtor - Constructor to use to create the ContainerRuntime instance. This allows mixin classes to leverage this method to define their own async initializer. - initializeEntryPoint - Promise that resolves to an object which will act as entryPoint for the Container. This object should provide all the functionality that the Container is expected to provide to the loader layer.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#loadruntime-returns}

**Return type:** Promise&lt;[ContainerRuntime](/docs/apis/container-runtime/containerruntime-class)&gt;

### notifyAttaching {#notifyattaching-method}

#### Signature {#notifyattaching-signature}

```typescript
notifyAttaching(): void;
```

### notifyOpReplay {#notifyopreplay-method}

#### Signature {#notifyopreplay-signature}

```typescript
notifyOpReplay(message: ISequencedDocumentMessage): Promise<void>;
```

#### Parameters {#notifyopreplay-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/protocol-definitions/isequenceddocumentmessage-interface'>ISequencedDocumentMessage</a></span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#notifyopreplay-returns}

**Return type:** Promise&lt;void&gt;

### orderSequentially {#ordersequentially-method}

#### Signature {#ordersequentially-signature}

```typescript
orderSequentially<T>(callback: () => T): T;
```

#### Parameters {#ordersequentially-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>() =&gt; T</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#ordersequentially-returns}

**Return type:** T

### process {#process-method}

#### Signature {#process-signature}

```typescript
process(messageArg: ISequencedDocumentMessage, local: boolean): void;
```

#### Parameters {#process-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/protocol-definitions/isequenceddocumentmessage-interface'>ISequencedDocumentMessage</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        local
      </td>
      <td>
        <span>boolean</span>
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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/protocol-definitions/isignalmessage-interface'>ISignalMessage</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        local
      </td>
      <td>
        <span>boolean</span>
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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/container-runtime/irefreshsummaryackoptions-interface'>IRefreshSummaryAckOptions</a></span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#refreshlatestsummaryack-returns}

**Return type:** Promise&lt;void&gt;

### request {#request-method}

{{% callout warning Deprecated %}}
- Will be removed in future major release. Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md

{{% /callout %}}

Notifies this object about the request made to the container.

#### Signature {#request-signature}

```typescript
request(request: IRequest): Promise<IResponse>;
```

#### Parameters {#request-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/core-interfaces/irequest-interface'>IRequest</a></span>
      </td>
      <td>
        Request made to the handler.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#request-returns}

**Return type:** Promise&lt;[IResponse](/docs/apis/core-interfaces/iresponse-interface)&gt;

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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/core-interfaces/irequest-interface'>IRequest</a></span>
      </td>
      <td>
        Request made to the handler.
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#resolvehandle-returns}

**Return type:** Promise&lt;[IResponse](/docs/apis/core-interfaces/iresponse-interface)&gt;

### setAttachState {#setattachstate-method}

#### Signature {#setattachstate-signature}

```typescript
setAttachState(attachState: AttachState.Attaching | AttachState.Attached): void;
```

#### Parameters {#setattachstate-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/container-definitions#attachstate-attaching-enummember'>AttachState.Attaching</a> &#124; <a href='/docs/apis/container-definitions#attachstate-attached-enummember'>AttachState.Attached</a></span>
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
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>boolean</span>
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
        <span>string</span>
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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>any</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        localOpMetadata
      </td>
      <td>
        <span>unknown</span>
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
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>string</span>
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
        <span>any</span>
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
        <span>unknown</span>
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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        type
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        content
      </td>
      <td>
        <span>any</span>
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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>string</span>
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
        <span>any</span>
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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/container-runtime/isubmitsummaryoptions-interface'>ISubmitSummaryOptions</a></span>
      </td>
      <td>
        options controlling how the summary is generated or submitted
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#submitsummary-returns}

**Return type:** Promise&lt;[SubmitSummaryResult](/docs/apis/container-runtime#submitsummaryresult-typealias)&gt;

### summarize {#summarize-method}

Returns a summary of the runtime at the current sequence number.

#### Signature {#summarize-signature}

```typescript
summarize(options: {
        fullTree?: boolean;
        trackState?: boolean;
        summaryLogger?: ITelemetryLoggerExt;
        runGC?: boolean;
        fullGC?: boolean;
        runSweep?: boolean;
    }): Promise<ISummaryTreeWithStats>;
```

#### Parameters {#summarize-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>{         fullTree?: boolean;         trackState?: boolean;         summaryLogger?: <a href='/docs/apis/telemetry-utils/itelemetryloggerext-interface'>ITelemetryLoggerExt</a>;         runGC?: boolean;         fullGC?: boolean;         runSweep?: boolean;     }</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#summarize-returns}

**Return type:** Promise&lt;[ISummaryTreeWithStats](/docs/apis/runtime-definitions/isummarytreewithstats-interface)&gt;

### summarizeOnDemand {#summarizeondemand-method}

#### Signature {#summarizeondemand-signature}

```typescript
summarizeOnDemand(options: IOnDemandSummarizeOptions): ISummarizeResults;
```

#### Parameters {#summarizeondemand-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span><a href='/docs/apis/container-runtime/iondemandsummarizeoptions-interface'>IOnDemandSummarizeOptions</a></span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#summarizeondemand-returns}

**Return type:** [ISummarizeResults](/docs/apis/container-runtime/isummarizeresults-interface)

### updateStateBeforeGC {#updatestatebeforegc-method}

Before GC runs, called by the garbage collector to update any pending GC state. This is mainly used to notify the garbage collector of references detected since the last GC run. Most references are notified immediately but there can be some for which async operation is required (such as detecting new root data stores).

#### Signature {#updatestatebeforegc-signature}

```typescript
updateStateBeforeGC(): Promise<void>;
```

#### Returns {#updatestatebeforegc-returns}

**Return type:** Promise&lt;void&gt;

#### See Also {#updatestatebeforegc-see-also}

IGarbageCollectionRuntime.updateStateBeforeGC

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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>string[]</span>
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
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>string[]</span>
      </td>
      <td>
        Data store and attachment blob routes that are unused in this Container.
      </td>
    </tr>
  </tbody>
</table>

### updateUsedRoutes {#updateusedroutes-method}

After GC has run, called to notify this container's nodes of routes that are used in it.

#### Signature {#updateusedroutes-signature}

```typescript
updateUsedRoutes(usedRoutes: string[]): void;
```

#### Parameters {#updateusedroutes-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Type
      </th>
      <th>
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
        <span>string[]</span>
      </td>
      <td>
        The routes that are used in all nodes in this Container.
      </td>
    </tr>
  </tbody>
</table>

#### See Also {#updateusedroutes-see-also}

IGarbageCollectionRuntime.updateUsedRoutes

### uploadBlob {#uploadblob-method}

#### Signature {#uploadblob-signature}

```typescript
uploadBlob(blob: ArrayBufferLike, signal?: AbortSignal): Promise<IFluidHandle<ArrayBufferLike>>;
```

#### Parameters {#uploadblob-parameters}

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Parameter
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Type
      </th>
      <th>
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
      </td>
      <td>
        <span>ArrayBufferLike</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        signal
      </td>
      <td>
        optional
      </td>
      <td>
        <span>AbortSignal</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#uploadblob-returns}

**Return type:** Promise&lt;[IFluidHandle](/docs/apis/core-interfaces/ifluidhandle-interface)&lt;ArrayBufferLike&gt;&gt;
