{"kind":"Class","title":"MockFluidDataStoreRuntime Class","summary":"Mock implementation of IRuntime for testing that does nothing","members":{"Constructor":{"(constructor)":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#_constructor_-Constructor"},"Property":{"absolutePath":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#absolutepath-Property","attachState":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#attachstate-Property","channelsRoutingContext":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#channelsroutingcontext-Property","clientId":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#clientid-Property","connected":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#connected-Property","deltaManager":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#deltamanager-Property","disposed":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#disposed-Property","documentId":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#documentid-Property","existing":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#existing-Property","id":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#id-Property","IFluidHandleContext":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#ifluidhandlecontext-Property","IFluidRouter":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#ifluidrouter-Property","isAttached":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#isattached-Property","loader":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#loader-Property","local":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#local-Property","logger":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#logger-Property","objectsRoutingContext":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#objectsroutingcontext-Property","options":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#options-Property","path":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#path-Property","quorum":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#quorum-Property","rootRoutingContext":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#rootroutingcontext-Property"},"Method":{"addedGCOutboundReference":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#addedgcoutboundreference-Method","applyStashedOp":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#applystashedop-Method","attachGraph":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#attachgraph-Method","bind":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#bind-Method","bindChannel":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#bindchannel-Method","close":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#close-Method","createChannel":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#createchannel-Method","dispose":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#dispose-Method","getAttachSnapshot":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getattachsnapshot-Method","getAttachSummary":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getattachsummary-Method","getAudience":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getaudience-Method","getBlob":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getblob-Method","getChannel":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getchannel-Method","getGCData":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getgcdata-Method","getQuorum":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getquorum-Method","makeVisibleAndAttachGraph":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#makevisibleandattachgraph-Method","process":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#process-Method","processSignal":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#processsignal-Method","request":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#request-Method","requestDataStore":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#requestdatastore-Method","resolveHandle":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#resolvehandle-Method","reSubmit":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#resubmit-Method","rollback":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#rollback-Method","save":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#save-Method","setAttachState":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#setattachstate-Method","setConnectionState":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#setconnectionstate-Method","submitMessage":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#submitmessage-Method","submitSignal":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#submitsignal-Method","summarize":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#summarize-Method","updateMinSequenceNumber":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#updateminsequencenumber-Method","updateUsedRoutes":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#updateusedroutes-Method","uploadBlob":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#uploadblob-Method","waitAttached":"/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#waitattached-Method"}},"package":"@fluidframework/test-runtime-utils","unscopedPackageName":"test-runtime-utils"}

[//]: # (Do not edit this file. It is automatically generated by API Documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/test-runtime-utils](/docs/apis/test-runtime-utils) &gt; [MockFluidDataStoreRuntime](/docs/apis/test-runtime-utils/mockfluiddatastoreruntime)

Mock implementation of IRuntime for testing that does nothing

<b>Signature:</b>

```typescript
export declare class MockFluidDataStoreRuntime extends EventEmitter implements IFluidDataStoreRuntime, IFluidDataStoreChannel, IFluidHandleContext 
```
<b>Extends:</b> EventEmitter

<b>Implements:</b> [IFluidDataStoreRuntime](/docs/apis/datastore-definitions/ifluiddatastoreruntime)<!-- -->, [IFluidDataStoreChannel](/docs/apis/runtime-definitions/ifluiddatastorechannel)<!-- -->, [IFluidHandleContext](/docs/apis/core-interfaces/ifluidhandlecontext)

<b>Implements:</b> [IFluidDataStoreRuntime](/docs/apis/datastore-definitions/ifluiddatastoreruntime)<!-- -->, [IFluidDataStoreChannel](/docs/apis/runtime-definitions/ifluiddatastorechannel)<!-- -->, [IFluidHandleContext](/docs/apis/core-interfaces/ifluidhandlecontext)

<b>Implements:</b> [IFluidDataStoreRuntime](/docs/apis/datastore-definitions/ifluiddatastoreruntime)<!-- -->, [IFluidDataStoreChannel](/docs/apis/runtime-definitions/ifluiddatastorechannel)<!-- -->, [IFluidHandleContext](/docs/apis/core-interfaces/ifluidhandlecontext)

## Constructors

<table class="table table-striped table-hover constructor-list">
<caption>List of constructors for this class</caption>
  <thead>
    <tr>
     <th scope="col">Constructor</th>
 <th scope="col">Modifiers</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#_constructor_-Constructor'>(constructor)(overrides)</a></td>
      <td></td>
      <td>Constructs a new instance of the <code>MockFluidDataStoreRuntime</code> class</td>
    </tr>
  </tbody>
</table>

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
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#absolutepath-Property'>absolutePath</a></td>
      <td></td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#attachstate-Property'>attachState</a></td>
      <td></td>
      <td><a href='/docs/apis/container-definitions#attachstate-Enum'>AttachState</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#channelsroutingcontext-Property'>channelsRoutingContext</a></td>
      <td></td>
      <td><a href='/docs/apis/core-interfaces/ifluidhandlecontext'>IFluidHandleContext</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#clientid-Property'>clientId</a></td>
      <td></td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#connected-Property'>connected</a></td>
      <td></td>
      <td>(not declared)</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#deltamanager-Property'>deltaManager</a></td>
      <td></td>
      <td><a href='/docs/apis/test-runtime-utils/mockdeltamanager'>MockDeltaManager</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#disposed-Property'>disposed</a></td>
      <td></td>
      <td>boolean</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#documentid-Property'>documentId</a></td>
      <td></td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#existing-Property'>existing</a></td>
      <td></td>
      <td>boolean</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#id-Property'>id</a></td>
      <td></td>
      <td>string</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#ifluidhandlecontext-Property'>IFluidHandleContext</a></td>
      <td></td>
      <td><a href='/docs/apis/core-interfaces/ifluidhandlecontext'>IFluidHandleContext</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#ifluidrouter-Property'>IFluidRouter</a></td>
      <td></td>
      <td>this</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#isattached-Property'>isAttached</a></td>
      <td></td>
      <td>boolean</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#loader-Property'>loader</a></td>
      <td></td>
      <td>ILoader</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#local-Property'>local</a></td>
      <td></td>
      <td>boolean</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#logger-Property'>logger</a></td>
      <td></td>
      <td><a href='/docs/apis/common-definitions/itelemetrylogger'>ITelemetryLogger</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#objectsroutingcontext-Property'>objectsRoutingContext</a></td>
      <td></td>
      <td><a href='/docs/apis/core-interfaces/ifluidhandlecontext'>IFluidHandleContext</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#options-Property'>options</a></td>
      <td></td>
      <td>ILoaderOptions</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#path-Property'>path</a></td>
      <td></td>
      <td>(not declared)</td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#quorum-Property'>quorum</a></td>
      <td></td>
      <td><a href='/docs/apis/test-runtime-utils/mockquorumclients'>MockQuorumClients</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#rootroutingcontext-Property'>rootRoutingContext</a></td>
      <td></td>
      <td><a href='/docs/apis/core-interfaces/ifluidhandlecontext'>IFluidHandleContext</a></td>
      <td></td>
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
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#addedgcoutboundreference-Method'>addedGCOutboundReference(srcHandle, outboundHandle)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#applystashedop-Method'>applyStashedOp(content)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#attachgraph-Method'>attachGraph()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#bind-Method'>bind(handle)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#bindchannel-Method'>bindChannel(channel)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#close-Method'>close()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#createchannel-Method'>createChannel(id, type)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#dispose-Method'>dispose()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getattachsnapshot-Method'>getAttachSnapshot()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getattachsummary-Method'>getAttachSummary()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getaudience-Method'>getAudience()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getblob-Method'>getBlob(blobId)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getchannel-Method'>getChannel(id)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getgcdata-Method'>getGCData()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#getquorum-Method'>getQuorum()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#makevisibleandattachgraph-Method'>makeVisibleAndAttachGraph()</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#process-Method'>process(message, local)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#processsignal-Method'>processSignal(message, local)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#request-Method'>request(request)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#requestdatastore-Method'>requestDataStore(request)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#resolvehandle-Method'>resolveHandle(request)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#resubmit-Method'>reSubmit(content, localOpMetadata)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#rollback-Method'>rollback(message, localOpMetadata)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#save-Method'>save(message)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#setattachstate-Method'>setAttachState(attachState)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#setconnectionstate-Method'>setConnectionState(connected, clientId)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#submitmessage-Method'>submitMessage(type, content)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#submitsignal-Method'>submitSignal(type, content)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#summarize-Method'>summarize(fullTree, trackState)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#updateminsequencenumber-Method'>updateMinSequenceNumber(value)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#updateusedroutes-Method'>updateUsedRoutes(usedRoutes, gcTimestamp)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#uploadblob-Method'>uploadBlob(blob)</a></td>
      <td></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/test-runtime-utils/mockfluiddatastoreruntime#waitattached-Method'>waitAttached()</a></td>
      <td></td>
      <td></td>
    </tr>
  </tbody>
</table>

<hr><div id=class-details>

## Constructor Details {#constructors-details}

### MockFluidDataStoreRuntime.(constructor) {#_constructor_-Constructor}

Constructs a new instance of the `MockFluidDataStoreRuntime` class

<b>Signature:</b>

```typescript
constructor(overrides?: {
        clientId?: string;
    });
```

#### Parameters {#_constructor_-Constructor-parameters}


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
      <td>overrides</td>
      <td>{ clientId?: string; }</td>
      <td></td>
    </tr>
  </tbody>
</table>


## Property Details {#properties-details}

### absolutePath {#absolutepath-Property}

<b>Signature:</b>

```typescript
get absolutePath(): string;
```

### attachState {#attachstate-Property}

<b>Signature:</b>

```typescript
get attachState(): AttachState;
```

### channelsRoutingContext {#channelsroutingcontext-Property}

<b>Signature:</b>

```typescript
get channelsRoutingContext(): IFluidHandleContext;
```

### clientId {#clientid-Property}

<b>Signature:</b>

```typescript
clientId: string;
```

### connected {#connected-Property}

<b>Signature:</b>

```typescript
readonly connected = true;
```

### deltaManager {#deltamanager-Property}

<b>Signature:</b>

```typescript
deltaManager: MockDeltaManager;
```

### disposed {#disposed-Property}

<b>Signature:</b>

```typescript
get disposed(): boolean;
```

### documentId {#documentid-Property}

<b>Signature:</b>

```typescript
readonly documentId: string;
```

### existing {#existing-Property}

<b>Signature:</b>

```typescript
readonly existing: boolean;
```

### id {#id-Property}

<b>Signature:</b>

```typescript
readonly id: string;
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

### isAttached {#isattached-Property}

<b>Signature:</b>

```typescript
get isAttached(): boolean;
```

### loader {#loader-Property}

<b>Signature:</b>

```typescript
readonly loader: ILoader;
```

### local {#local-Property}

<b>Signature:</b>

```typescript
get local(): boolean;

set local(local: boolean);
```

### logger {#logger-Property}

<b>Signature:</b>

```typescript
readonly logger: ITelemetryLogger;
```

### objectsRoutingContext {#objectsroutingcontext-Property}

<b>Signature:</b>

```typescript
get objectsRoutingContext(): IFluidHandleContext;
```

### options {#options-Property}

<b>Signature:</b>

```typescript
options: ILoaderOptions;
```

### path {#path-Property}

<b>Signature:</b>

```typescript
readonly path = "";
```

### quorum {#quorum-Property}

<b>Signature:</b>

```typescript
quorum: MockQuorumClients;
```

### rootRoutingContext {#rootroutingcontext-Property}

<b>Signature:</b>

```typescript
get rootRoutingContext(): IFluidHandleContext;
```

## Method Details {#methods-details}

### addedGCOutboundReference {#addedgcoutboundreference-Method}

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
      <td></td>
    </tr>
    <tr>
      <td>outboundHandle</td>
      <td><a href='/docs/apis/core-interfaces/ifluidhandle'>IFluidHandle</a></td>
      <td></td>
    </tr>
  </tbody>
</table>

### applyStashedOp {#applystashedop-Method}

<b>Signature:</b>

```typescript
applyStashedOp(content: any): Promise<void>;
```

#### Parameters {#applystashedop-Method-parameters}


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
      <td>content</td>
      <td>any</td>
      <td></td>
    </tr>
  </tbody>
</table>

### attachGraph {#attachgraph-Method}

<b>Signature:</b>

```typescript
attachGraph(): void;
```

### bind {#bind-Method}

<b>Signature:</b>

```typescript
bind(handle: IFluidHandle): void;
```

#### Parameters {#bind-Method-parameters}


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
      <td>handle</td>
      <td><a href='/docs/apis/core-interfaces/ifluidhandle'>IFluidHandle</a></td>
      <td></td>
    </tr>
  </tbody>
</table>

### bindChannel {#bindchannel-Method}

<b>Signature:</b>

```typescript
bindChannel(channel: IChannel): void;
```

#### Parameters {#bindchannel-Method-parameters}


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
      <td>channel</td>
      <td><a href='/docs/apis/datastore-definitions/ichannel'>IChannel</a></td>
      <td></td>
    </tr>
  </tbody>
</table>

### close {#close-Method}

<b>Signature:</b>

```typescript
close(): Promise<void>;
```

### createChannel {#createchannel-Method}

<b>Signature:</b>

```typescript
createChannel(id: string, type: string): IChannel;
```

#### Parameters {#createchannel-Method-parameters}


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
      <td>type</td>
      <td>string</td>
      <td></td>
    </tr>
  </tbody>
</table>

### dispose {#dispose-Method}

<b>Signature:</b>

```typescript
dispose(): void;
```

### getAttachSnapshot {#getattachsnapshot-Method}

<b>Signature:</b>

```typescript
getAttachSnapshot(): ITreeEntry[];
```

### getAttachSummary {#getattachsummary-Method}

<b>Signature:</b>

```typescript
getAttachSummary(): ISummaryTreeWithStats;
```

### getAudience {#getaudience-Method}

<b>Signature:</b>

```typescript
getAudience(): IAudience;
```

### getBlob {#getblob-Method}

<b>Signature:</b>

```typescript
getBlob(blobId: string): Promise<any>;
```

#### Parameters {#getblob-Method-parameters}


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
      <td>blobId</td>
      <td>string</td>
      <td></td>
    </tr>
  </tbody>
</table>

### getChannel {#getchannel-Method}

<b>Signature:</b>

```typescript
getChannel(id: string): Promise<IChannel>;
```

#### Parameters {#getchannel-Method-parameters}


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
  </tbody>
</table>

### getGCData {#getgcdata-Method}

<b>Signature:</b>

```typescript
getGCData(): Promise<IGarbageCollectionData>;
```

### getQuorum {#getquorum-Method}

<b>Signature:</b>

```typescript
getQuorum(): IQuorumClients;
```

### makeVisibleAndAttachGraph {#makevisibleandattachgraph-Method}

<b>Signature:</b>

```typescript
makeVisibleAndAttachGraph(): void;
```

### process {#process-Method}

<b>Signature:</b>

```typescript
process(message: ISequencedDocumentMessage, local: boolean): void;
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
      <td>message</td>
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
processSignal(message: any, local: boolean): void;
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
      <td>any</td>
      <td></td>
    </tr>
    <tr>
      <td>local</td>
      <td>boolean</td>
      <td></td>
    </tr>
  </tbody>
</table>

### request {#request-Method}

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
      <td></td>
    </tr>
  </tbody>
</table>

### requestDataStore {#requestdatastore-Method}

<b>Signature:</b>

```typescript
requestDataStore(request: IRequest): Promise<IResponse>;
```

#### Parameters {#requestdatastore-Method-parameters}


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
      <td></td>
    </tr>
  </tbody>
</table>

### resolveHandle {#resolvehandle-Method}

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
      <td></td>
    </tr>
  </tbody>
</table>

### reSubmit {#resubmit-Method}

<b>Signature:</b>

```typescript
reSubmit(content: any, localOpMetadata: unknown): void;
```

#### Parameters {#resubmit-Method-parameters}


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
      <td>content</td>
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

### rollback {#rollback-Method}

<b>Signature:</b>

```typescript
rollback?(message: any, localOpMetadata: unknown): void;
```

#### Parameters {#rollback-Method-parameters}


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

### save {#save-Method}

<b>Signature:</b>

```typescript
save(message: string): void;
```

#### Parameters {#save-Method-parameters}


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
      <td>string</td>
      <td></td>
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

### submitMessage {#submitmessage-Method}

<b>Signature:</b>

```typescript
submitMessage(type: MessageType, content: any): null;
```

#### Parameters {#submitmessage-Method-parameters}


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
      <td><a href='/docs/apis/protocol-definitions#messagetype-Enum'>MessageType</a></td>
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

<b>Signature:</b>

```typescript
submitSignal(type: string, content: any): null;
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
      <td></td>
    </tr>
    <tr>
      <td>content</td>
      <td>any</td>
      <td></td>
    </tr>
  </tbody>
</table>

### summarize {#summarize-Method}

<b>Signature:</b>

```typescript
summarize(fullTree?: boolean, trackState?: boolean): Promise<ISummaryTreeWithStats>;
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
      <td>fullTree</td>
      <td>boolean</td>
      <td></td>
    </tr>
    <tr>
      <td>trackState</td>
      <td>boolean</td>
      <td></td>
    </tr>
  </tbody>
</table>

### updateMinSequenceNumber {#updateminsequencenumber-Method}

<b>Signature:</b>

```typescript
updateMinSequenceNumber(value: number): void;
```

#### Parameters {#updateminsequencenumber-Method-parameters}


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
      <td>value</td>
      <td>number</td>
      <td></td>
    </tr>
  </tbody>
</table>

### updateUsedRoutes {#updateusedroutes-Method}

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
      <td></td>
    </tr>
    <tr>
      <td>gcTimestamp</td>
      <td>number</td>
      <td></td>
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

### waitAttached {#waitattached-Method}

<b>Signature:</b>

```typescript
waitAttached(): Promise<void>;
```

</div>
