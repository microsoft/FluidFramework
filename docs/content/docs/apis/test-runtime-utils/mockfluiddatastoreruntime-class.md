{
  "title": "MockFluidDataStoreRuntime Class",
  "summary": "Mock implementation of IRuntime for testing that does nothing",
  "kind": "Class",
  "members": {
    "Constructor": {
      "(constructor)": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#_constructor_-constructor"
    },
    "Property": {
      "absolutePath": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#absolutepath-property",
      "attachState": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#attachstate-property",
      "channelsRoutingContext": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#channelsroutingcontext-property",
      "clientId": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#clientid-property",
      "connected": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#connected-property",
      "containerRuntime": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#containerruntime-property",
      "deltaManager": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#deltamanager-property",
      "disposed": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#disposed-property",
      "documentId": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#documentid-property",
      "entryPoint": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#entrypoint-property",
      "existing": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#existing-property",
      "id": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#id-property",
      "IFluidHandleContext": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#ifluidhandlecontext-property",
      "IFluidRouter": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#ifluidrouter-property",
      "isAttached": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#isattached-property",
      "loader": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#loader-property",
      "local": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#local-property",
      "logger": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#logger-property",
      "objectsRoutingContext": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#objectsroutingcontext-property",
      "options": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#options-property",
      "path": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#path-property",
      "quorum": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#quorum-property",
      "rootRoutingContext": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#rootroutingcontext-property",
      "visibilityState": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#visibilitystate-property"
    },
    "Method": {
      "addedGCOutboundReference": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#addedgcoutboundreference-method",
      "applyStashedOp": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#applystashedop-method",
      "attachGraph": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#attachgraph-method",
      "bind": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#bind-method",
      "bindChannel": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#bindchannel-method",
      "close": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#close-method",
      "createChannel": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#createchannel-method",
      "createDeltaConnection": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#createdeltaconnection-method",
      "dispose": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#dispose-method",
      "ensureNoDataModelChanges": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#ensurenodatamodelchanges-method",
      "getAttachSnapshot": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getattachsnapshot-method",
      "getAttachSummary": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getattachsummary-method",
      "getAudience": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getaudience-method",
      "getBlob": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getblob-method",
      "getChannel": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getchannel-method",
      "getGCData": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getgcdata-method",
      "getQuorum": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getquorum-method",
      "makeVisibleAndAttachGraph": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#makevisibleandattachgraph-method",
      "process": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#process-method",
      "processSignal": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#processsignal-method",
      "request": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#request-method",
      "requestDataStore": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#requestdatastore-method",
      "resolveHandle": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#resolvehandle-method",
      "reSubmit": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#resubmit-method",
      "rollback": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#rollback-method",
      "save": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#save-method",
      "setAttachState": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#setattachstate-method",
      "setConnectionState": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#setconnectionstate-method",
      "submitMessage": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#submitmessage-method",
      "submitSignal": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#submitsignal-method",
      "summarize": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#summarize-method",
      "updateMinSequenceNumber": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#updateminsequencenumber-method",
      "updateUsedRoutes": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#updateusedroutes-method",
      "uploadBlob": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#uploadblob-method",
      "waitAttached": "/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#waitattached-method"
    }
  },
  "package": "@fluidframework/test-runtime-utils",
  "unscopedPackageName": "test-runtime-utils"
}

[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/test-runtime-utils](/docs/apis/test-runtime-utils) &gt; [MockFluidDataStoreRuntime](/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class)

Mock implementation of IRuntime for testing that does nothing

## Signature {#mockfluiddatastoreruntime-signature}

```typescript
export declare class MockFluidDataStoreRuntime extends EventEmitter implements IFluidDataStoreRuntime, IFluidDataStoreChannel, IFluidHandleContext
```

**Extends:** EventEmitter

**Implements:** [IFluidDataStoreRuntime](/docs/apis/datastore-definitions/ifluiddatastoreruntime-interface), [IFluidDataStoreChannel](/docs/apis/runtime-definitions/ifluiddatastorechannel-interface), [IFluidHandleContext](/docs/apis/core-interfaces/ifluidhandlecontext-interface)

## Constructors

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Constructor
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#_constructor_-constructor'>(constructor)</a>
      </td>
      <td>
        Constructs a new instance of the <code>MockFluidDataStoreRuntime</code> class
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#absolutepath-property'>absolutePath</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#attachstate-property'>attachState</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#channelsroutingcontext-property'>channelsRoutingContext</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#clientid-property'>clientId</a>
      </td>
      <td>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#connected-property'>connected</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#containerruntime-property'>containerRuntime</a>
      </td>
      <td>
      </td>
      <td>
        <code>optional</code>
      </td>
      <td>
        <span><a href='/docs/apis/test-runtime-utils/mockcontainerruntime-class'>MockContainerRuntime</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#deltamanager-property'>deltaManager</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/test-runtime-utils/mockdeltamanager-class'>MockDeltaManager</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#disposed-property'>disposed</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#documentid-property'>documentId</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#entrypoint-property'>entryPoint</a>
      </td>
      <td>
      </td>
      <td>
        <code>optional</code>, <code>readonly</code>
      </td>
      <td>
        <span><a href='/docs/apis/core-interfaces/ifluidhandle-interface'>IFluidHandle</a>&lt;<a href='/docs/apis/core-interfaces#fluidobject-typealias'>FluidObject</a>&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#existing-property'>existing</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#id-property'>id</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#ifluidhandlecontext-property'>IFluidHandleContext</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#ifluidrouter-property'>IFluidRouter</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#isattached-property'>isAttached</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#loader-property'>loader</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>ILoader</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#local-property'>local</a>
      </td>
      <td>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#logger-property'>logger</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#objectsroutingcontext-property'>objectsRoutingContext</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#options-property'>options</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>ILoaderOptions</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#path-property'>path</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#quorum-property'>quorum</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/test-runtime-utils/mockquorumclients-class'>MockQuorumClients</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#rootroutingcontext-property'>rootRoutingContext</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#visibilitystate-property'>visibilityState</a>
      </td>
      <td>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        <span>VisibilityState</span>
      </td>
      <td>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#addedgcoutboundreference-method'>addedGCOutboundReference</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#applystashedop-method'>applyStashedOp</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#attachgraph-method'>attachGraph</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#bind-method'>bind</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#bindchannel-method'>bindChannel</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#close-method'>close</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#createchannel-method'>createChannel</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/datastore-definitions/ichannel-interface'>IChannel</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#createdeltaconnection-method'>createDeltaConnection</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/test-runtime-utils/mockdeltaconnection-class'>MockDeltaConnection</a></span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#dispose-method'>dispose</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#ensurenodatamodelchanges-method'>ensureNoDataModelChanges</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getattachsnapshot-method'>getAttachSnapshot</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span><a href='/docs/apis/protocol-definitions#itreeentry-typealias'>ITreeEntry</a>[]</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getattachsummary-method'>getAttachSummary</a>
      </td>
      <td>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getaudience-method'>getAudience</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getblob-method'>getBlob</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;any&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getchannel-method'>getChannel</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/datastore-definitions/ichannel-interface'>IChannel</a>&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getgcdata-method'>getGCData</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/runtime-definitions/igarbagecollectiondata-interface'>IGarbageCollectionData</a>&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#getquorum-method'>getQuorum</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#makevisibleandattachgraph-method'>makeVisibleAndAttachGraph</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#process-method'>process</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#processsignal-method'>processSignal</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#request-method'>request</a>
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
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#requestdatastore-method'>requestDataStore</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/core-interfaces/iresponse-interface'>IResponse</a>&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#resolvehandle-method'>resolveHandle</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/core-interfaces/iresponse-interface'>IResponse</a>&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#resubmit-method'>reSubmit</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#rollback-method'>rollback</a>
      </td>
      <td>
      </td>
      <td>
        <code>optional</code>
      </td>
      <td>
        <span>void</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#save-method'>save</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#setattachstate-method'>setAttachState</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#setconnectionstate-method'>setConnectionState</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#submitmessage-method'>submitMessage</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>null</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#submitsignal-method'>submitSignal</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>null</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#summarize-method'>summarize</a>
      </td>
      <td>
      </td>
      <td>
      </td>
      <td>
        <span>Promise&lt;<a href='/docs/apis/runtime-definitions/isummarytreewithstats-interface'>ISummaryTreeWithStats</a>&gt;</span>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#updateminsequencenumber-method'>updateMinSequenceNumber</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#updateusedroutes-method'>updateUsedRoutes</a>
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
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#uploadblob-method'>uploadBlob</a>
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
    <tr>
      <td>
        <a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime-class#waitattached-method'>waitAttached</a>
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
  </tbody>
</table>

## Constructor Details

### (constructor) {#_constructor_-constructor}

Constructs a new instance of the `MockFluidDataStoreRuntime` class

#### Signature {#_constructor_-signature}

```typescript
constructor(overrides?: {
        clientId?: string;
        entryPoint?: IFluidHandle<FluidObject>;
        id?: string;
        logger?: ITelemetryLoggerExt;
    });
```

#### Parameters {#_constructor_-parameters}

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
        overrides
      </td>
      <td>
        optional
      </td>
      <td>
        <span>{         clientId?: string;         entryPoint?: <a href='/docs/apis/core-interfaces/ifluidhandle-interface'>IFluidHandle</a>&lt;<a href='/docs/apis/core-interfaces#fluidobject-typealias'>FluidObject</a>&gt;;         id?: string;         logger?: <a href='/docs/apis/telemetry-utils/itelemetryloggerext-interface'>ITelemetryLoggerExt</a>;     }</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Property Details

### absolutePath {#absolutepath-property}

#### Signature {#absolutepath-signature}

```typescript
get absolutePath(): string;
```

### attachState {#attachstate-property}

#### Signature {#attachstate-signature}

```typescript
get attachState(): AttachState;
```

### channelsRoutingContext {#channelsroutingcontext-property}

#### Signature {#channelsroutingcontext-signature}

```typescript
get channelsRoutingContext(): IFluidHandleContext;
```

### clientId {#clientid-property}

#### Signature {#clientid-signature}

```typescript
clientId: string;
```

### connected {#connected-property}

#### Signature {#connected-signature}

```typescript
readonly connected = true;
```

### containerRuntime {#containerruntime-property}

#### Signature {#containerruntime-signature}

```typescript
containerRuntime?: MockContainerRuntime;
```

### deltaManager {#deltamanager-property}

#### Signature {#deltamanager-signature}

```typescript
deltaManager: MockDeltaManager;
```

### disposed {#disposed-property}

#### Signature {#disposed-signature}

```typescript
get disposed(): boolean;
```

### documentId {#documentid-property}

#### Signature {#documentid-signature}

```typescript
readonly documentId: string;
```

### entryPoint {#entrypoint-property}

#### Signature {#entrypoint-signature}

```typescript
readonly entryPoint?: IFluidHandle<FluidObject>;
```

### existing {#existing-property}

#### Signature {#existing-signature}

```typescript
readonly existing: boolean;
```

### id {#id-property}

#### Signature {#id-signature}

```typescript
readonly id: string;
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

### isAttached {#isattached-property}

#### Signature {#isattached-signature}

```typescript
get isAttached(): boolean;
```

### loader {#loader-property}

#### Signature {#loader-signature}

```typescript
readonly loader: ILoader;
```

### local {#local-property}

#### Signature {#local-signature}

```typescript
get local(): boolean;
set local(local: boolean);
```

### logger {#logger-property}

#### Signature {#logger-signature}

```typescript
readonly logger: ITelemetryLoggerExt;
```

### objectsRoutingContext {#objectsroutingcontext-property}

#### Signature {#objectsroutingcontext-signature}

```typescript
get objectsRoutingContext(): IFluidHandleContext;
```

### options {#options-property}

#### Signature {#options-signature}

```typescript
options: ILoaderOptions;
```

### path {#path-property}

#### Signature {#path-signature}

```typescript
readonly path = "";
```

### quorum {#quorum-property}

#### Signature {#quorum-signature}

```typescript
quorum: MockQuorumClients;
```

### rootRoutingContext {#rootroutingcontext-property}

#### Signature {#rootroutingcontext-signature}

```typescript
get rootRoutingContext(): IFluidHandleContext;
```

### visibilityState {#visibilitystate-property}

#### Signature {#visibilitystate-signature}

```typescript
get visibilityState(): VisibilityState;
```

## Method Details

### addedGCOutboundReference {#addedgcoutboundreference-method}

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
      </td>
    </tr>
  </tbody>
</table>

### applyStashedOp {#applystashedop-method}

#### Signature {#applystashedop-signature}

```typescript
applyStashedOp(content: any): Promise<void>;
```

#### Parameters {#applystashedop-parameters}

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

#### Returns {#applystashedop-returns}

**Return type:** Promise&lt;void&gt;

### attachGraph {#attachgraph-method}

#### Signature {#attachgraph-signature}

```typescript
attachGraph(): void;
```

### bind {#bind-method}

#### Signature {#bind-signature}

```typescript
bind(handle: IFluidHandle): void;
```

#### Parameters {#bind-parameters}

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
        handle
      </td>
      <td>
        <span><a href='/docs/apis/core-interfaces/ifluidhandle-interface'>IFluidHandle</a></span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### bindChannel {#bindchannel-method}

#### Signature {#bindchannel-signature}

```typescript
bindChannel(channel: IChannel): void;
```

#### Parameters {#bindchannel-parameters}

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
        channel
      </td>
      <td>
        <span><a href='/docs/apis/datastore-definitions/ichannel-interface'>IChannel</a></span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### close {#close-method}

#### Signature {#close-signature}

```typescript
close(): Promise<void>;
```

#### Returns {#close-returns}

**Return type:** Promise&lt;void&gt;

### createChannel {#createchannel-method}

#### Signature {#createchannel-signature}

```typescript
createChannel(id: string, type: string): IChannel;
```

#### Parameters {#createchannel-parameters}

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
        id
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
  </tbody>
</table>

#### Returns {#createchannel-returns}

**Return type:** [IChannel](/docs/apis/datastore-definitions/ichannel-interface)

### createDeltaConnection {#createdeltaconnection-method}

#### Signature {#createdeltaconnection-signature}

```typescript
createDeltaConnection(): MockDeltaConnection;
```

#### Returns {#createdeltaconnection-returns}

**Return type:** [MockDeltaConnection](/docs/apis/test-runtime-utils/mockdeltaconnection-class)

### dispose {#dispose-method}

#### Signature {#dispose-signature}

```typescript
dispose(): void;
```

### ensureNoDataModelChanges {#ensurenodatamodelchanges-method}

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
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#ensurenodatamodelchanges-returns}

**Return type:** T

### getAttachSnapshot {#getattachsnapshot-method}

#### Signature {#getattachsnapshot-signature}

```typescript
getAttachSnapshot(): ITreeEntry[];
```

#### Returns {#getattachsnapshot-returns}

**Return type:** [ITreeEntry](/docs/apis/protocol-definitions#itreeentry-typealias)\[\]

### getAttachSummary {#getattachsummary-method}

#### Signature {#getattachsummary-signature}

```typescript
getAttachSummary(): ISummaryTreeWithStats;
```

#### Returns {#getattachsummary-returns}

**Return type:** [ISummaryTreeWithStats](/docs/apis/runtime-definitions/isummarytreewithstats-interface)

### getAudience {#getaudience-method}

#### Signature {#getaudience-signature}

```typescript
getAudience(): IAudience;
```

#### Returns {#getaudience-returns}

**Return type:** IAudience

### getBlob {#getblob-method}

#### Signature {#getblob-signature}

```typescript
getBlob(blobId: string): Promise<any>;
```

#### Parameters {#getblob-parameters}

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
        blobId
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getblob-returns}

**Return type:** Promise&lt;any&gt;

### getChannel {#getchannel-method}

#### Signature {#getchannel-signature}

```typescript
getChannel(id: string): Promise<IChannel>;
```

#### Parameters {#getchannel-parameters}

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
        id
      </td>
      <td>
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#getchannel-returns}

**Return type:** Promise&lt;[IChannel](/docs/apis/datastore-definitions/ichannel-interface)&gt;

### getGCData {#getgcdata-method}

#### Signature {#getgcdata-signature}

```typescript
getGCData(): Promise<IGarbageCollectionData>;
```

#### Returns {#getgcdata-returns}

**Return type:** Promise&lt;[IGarbageCollectionData](/docs/apis/runtime-definitions/igarbagecollectiondata-interface)&gt;

### getQuorum {#getquorum-method}

#### Signature {#getquorum-signature}

```typescript
getQuorum(): IQuorumClients;
```

#### Returns {#getquorum-returns}

**Return type:** [IQuorumClients](/docs/apis/protocol-definitions/iquorumclients-interface)

### makeVisibleAndAttachGraph {#makevisibleandattachgraph-method}

#### Signature {#makevisibleandattachgraph-signature}

```typescript
makeVisibleAndAttachGraph(): void;
```

### process {#process-method}

#### Signature {#process-signature}

```typescript
process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void;
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
        message
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

### processSignal {#processsignal-method}

#### Signature {#processsignal-signature}

```typescript
processSignal(message: any, local: boolean): void;
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
        <span>any</span>
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

### request {#request-method}

{{% callout warning Deprecated %}}
- Will be removed in future major release. Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md

{{% /callout %}}

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
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#request-returns}

**Return type:** Promise&lt;[IResponse](/docs/apis/core-interfaces/iresponse-interface)&gt;

### requestDataStore {#requestdatastore-method}

#### Signature {#requestdatastore-signature}

```typescript
requestDataStore(request: IRequest): Promise<IResponse>;
```

#### Parameters {#requestdatastore-parameters}

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
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#requestdatastore-returns}

**Return type:** Promise&lt;[IResponse](/docs/apis/core-interfaces/iresponse-interface)&gt;

### resolveHandle {#resolvehandle-method}

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
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#resolvehandle-returns}

**Return type:** Promise&lt;[IResponse](/docs/apis/core-interfaces/iresponse-interface)&gt;

### reSubmit {#resubmit-method}

#### Signature {#resubmit-signature}

```typescript
reSubmit(content: any, localOpMetadata: unknown): void;
```

#### Parameters {#resubmit-parameters}

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
        content
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

### rollback {#rollback-method}

#### Signature {#rollback-signature}

```typescript
rollback?(message: any, localOpMetadata: unknown): void;
```

#### Parameters {#rollback-parameters}

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

### save {#save-method}

#### Signature {#save-signature}

```typescript
save(message: string): void;
```

#### Parameters {#save-parameters}

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
        <span>string</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

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

### submitMessage {#submitmessage-method}

#### Signature {#submitmessage-signature}

```typescript
submitMessage(type: MessageType, content: any): null;
```

#### Parameters {#submitmessage-parameters}

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
        <span><a href='/docs/apis/protocol-definitions#messagetype-enum'>MessageType</a></span>
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

#### Returns {#submitmessage-returns}

**Return type:** null

### submitSignal {#submitsignal-method}

#### Signature {#submitsignal-signature}

```typescript
submitSignal(type: string, content: any): null;
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

#### Returns {#submitsignal-returns}

**Return type:** null

### summarize {#summarize-method}

#### Signature {#summarize-signature}

```typescript
summarize(fullTree?: boolean, trackState?: boolean): Promise<ISummaryTreeWithStats>;
```

#### Parameters {#summarize-parameters}

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
        fullTree
      </td>
      <td>
        optional
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
        optional
      </td>
      <td>
        <span>boolean</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#summarize-returns}

**Return type:** Promise&lt;[ISummaryTreeWithStats](/docs/apis/runtime-definitions/isummarytreewithstats-interface)&gt;

### updateMinSequenceNumber {#updateminsequencenumber-method}

#### Signature {#updateminsequencenumber-signature}

```typescript
updateMinSequenceNumber(value: number): void;
```

#### Parameters {#updateminsequencenumber-parameters}

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
        value
      </td>
      <td>
        <span>number</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

### updateUsedRoutes {#updateusedroutes-method}

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
        blob
      </td>
      <td>
        <span>ArrayBufferLike</span>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

#### Returns {#uploadblob-returns}

**Return type:** Promise&lt;[IFluidHandle](/docs/apis/core-interfaces/ifluidhandle-interface)&lt;ArrayBufferLike&gt;&gt;

### waitAttached {#waitattached-method}

#### Signature {#waitattached-signature}

```typescript
waitAttached(): Promise<void>;
```

#### Returns {#waitattached-returns}

**Return type:** Promise&lt;void&gt;
