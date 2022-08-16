{"kind":"Package","title":"@fluidframework/container-runtime Package","members":{"Variable":{"agentSchedulerId":"/docs/apis/container-runtime#agentschedulerid-Variable","DefaultSummaryConfiguration":"/docs/apis/container-runtime#defaultsummaryconfiguration-Variable","gcBlobPrefix":"/docs/apis/container-runtime#gcblobprefix-Variable","gcTreeKey":"/docs/apis/container-runtime#gctreekey-Variable","ISummarizer":"/docs/apis/container-runtime#isummarizer-Variable","neverCancelledSummaryToken":"/docs/apis/container-runtime#nevercancelledsummarytoken-Variable"},"Enum":{"ContainerMessageType":"/docs/apis/container-runtime#containermessagetype-Enum","RuntimeHeaders":"/docs/apis/container-runtime#runtimeheaders-Enum","RuntimeMessage":"/docs/apis/container-runtime#runtimemessage-Enum"},"Class":{"ContainerRuntime":"/docs/apis/container-runtime/containerruntime","DeltaScheduler":"/docs/apis/container-runtime/deltascheduler","FluidDataStoreRegistry":"/docs/apis/container-runtime/fluiddatastoreregistry","ScheduleManager":"/docs/apis/container-runtime/schedulemanager","Summarizer":"/docs/apis/container-runtime/summarizer","SummaryCollection":"/docs/apis/container-runtime/summarycollection"},"Interface":{"ContainerRuntimeMessage":"/docs/apis/container-runtime/containerruntimemessage","IAckedSummary":"/docs/apis/container-runtime/iackedsummary","IAckSummaryResult":"/docs/apis/container-runtime/iacksummaryresult","IBaseSummarizeResult":"/docs/apis/container-runtime/ibasesummarizeresult","IBroadcastSummaryResult":"/docs/apis/container-runtime/ibroadcastsummaryresult","ICancellableSummarizerController":"/docs/apis/container-runtime/icancellablesummarizercontroller","ICancellationToken":"/docs/apis/container-runtime/icancellationtoken","IChunkedOp":"/docs/apis/container-runtime/ichunkedop","IClientSummaryWatcher":"/docs/apis/container-runtime/iclientsummarywatcher","IConnectableRuntime":"/docs/apis/container-runtime/iconnectableruntime","IContainerRuntimeOptions":"/docs/apis/container-runtime/icontainerruntimeoptions","IEnqueueSummarizeOptions":"/docs/apis/container-runtime/ienqueuesummarizeoptions","IGarbageCollectionRuntime":"/docs/apis/container-runtime/igarbagecollectionruntime","IGCRuntimeOptions":"/docs/apis/container-runtime/igcruntimeoptions","IGCStats":"/docs/apis/container-runtime/igcstats","IGeneratedSummaryStats":"/docs/apis/container-runtime/igeneratedsummarystats","IGenerateSummaryTreeResult":"/docs/apis/container-runtime/igeneratesummarytreeresult","INackSummaryResult":"/docs/apis/container-runtime/inacksummaryresult","IOnDemandSummarizeOptions":"/docs/apis/container-runtime/iondemandsummarizeoptions","IPendingFlush":"/docs/apis/container-runtime/ipendingflush","IPendingFlushMode":"/docs/apis/container-runtime/ipendingflushmode","IPendingLocalState":"/docs/apis/container-runtime/ipendinglocalstate","IPendingMessage":"/docs/apis/container-runtime/ipendingmessage","IPendingRuntimeState":"/docs/apis/container-runtime/ipendingruntimestate","IProvideSummarizer":"/docs/apis/container-runtime/iprovidesummarizer","IRootSummaryTreeWithStats":"/docs/apis/container-runtime/irootsummarytreewithstats","ISubmitSummaryOpResult":"/docs/apis/container-runtime/isubmitsummaryopresult","ISubmitSummaryOptions":"/docs/apis/container-runtime/isubmitsummaryoptions","ISummarizeOptions":"/docs/apis/container-runtime/isummarizeoptions","ISummarizer":"/docs/apis/container-runtime/isummarizer","ISummarizeResults":"/docs/apis/container-runtime/isummarizeresults","ISummarizerEvents":"/docs/apis/container-runtime/isummarizerevents","ISummarizerInternalsProvider":"/docs/apis/container-runtime/isummarizerinternalsprovider","ISummarizerRuntime":"/docs/apis/container-runtime/isummarizerruntime","ISummarizingWarning":"/docs/apis/container-runtime/isummarizingwarning","ISummary":"/docs/apis/container-runtime/isummary","ISummaryAckMessage":"/docs/apis/container-runtime/isummaryackmessage","ISummaryBaseConfiguration":"/docs/apis/container-runtime/isummarybaseconfiguration","ISummaryCollectionOpEvents":"/docs/apis/container-runtime/isummarycollectionopevents","ISummaryConfigurationDisableHeuristics":"/docs/apis/container-runtime/isummaryconfigurationdisableheuristics","ISummaryConfigurationDisableSummarizer":"/docs/apis/container-runtime/isummaryconfigurationdisablesummarizer","ISummaryConfigurationHeuristics":"/docs/apis/container-runtime/isummaryconfigurationheuristics","ISummaryNackMessage":"/docs/apis/container-runtime/isummarynackmessage","ISummaryOpMessage":"/docs/apis/container-runtime/isummaryopmessage","ISummaryRuntimeOptions":"/docs/apis/container-runtime/isummaryruntimeoptions","IUploadSummaryResult":"/docs/apis/container-runtime/iuploadsummaryresult"},"TypeAlias":{"EnqueueSummarizeResult":"/docs/apis/container-runtime#enqueuesummarizeresult-TypeAlias","IPendingState":"/docs/apis/container-runtime#ipendingstate-TypeAlias","ISummaryCancellationToken":"/docs/apis/container-runtime#isummarycancellationtoken-TypeAlias","ISummaryConfiguration":"/docs/apis/container-runtime#isummaryconfiguration-TypeAlias","OpActionEventListener":"/docs/apis/container-runtime#opactioneventlistener-TypeAlias","OpActionEventName":"/docs/apis/container-runtime#opactioneventname-TypeAlias","SubmitSummaryResult":"/docs/apis/container-runtime#submitsummaryresult-TypeAlias","SummarizeResultPart":"/docs/apis/container-runtime#summarizeresultpart-TypeAlias","SummarizerStopReason":"/docs/apis/container-runtime#summarizerstopreason-TypeAlias"},"Function":{"isRuntimeMessage":"/docs/apis/container-runtime#isruntimemessage-Function","unpackRuntimeMessage":"/docs/apis/container-runtime#unpackruntimemessage-Function"}},"package":"@fluidframework/container-runtime","unscopedPackageName":"container-runtime"}

[//]: # (Do not edit this file. It is automatically generated by API Documenter.)

[Packages](/docs/apis/) &gt; [@fluidframework/container-runtime](/docs/apis/container-runtime)

## Classes

<table class="table table-striped table-hover class-list">
<caption>List of classes contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Class</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntime'>ContainerRuntime</a></td>
      <td>Represents the runtime of the container. Contains helper functions/state of the container. It will define the store level mappings.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/deltascheduler'>DeltaScheduler</a></td>
      <td>DeltaScheduler is responsible for the scheduling of inbound delta queue in cases where there is more than one op a particular run of the queue. It does not schedule if there is just one op or just one batch in the run. It does the following two things: 1. If the ops have been processed for more than a specific amount of time, it pauses the queue and calls setTimeout to schedule a resume of the queue. This ensures that we don't block the JS thread for a long time processing ops synchronously (for example, when catching up ops right after boot or catching up ops / delayed realizing data stores by summarizer). 2. If we scheduled a particular run of the queue, it logs telemetry for the number of ops processed, the time and number of turns it took to process the ops.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/fluiddatastoreregistry'>FluidDataStoreRegistry</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/schedulemanager'>ScheduleManager</a></td>
      <td>This class has the following responsibilities: 1. It tracks batches as we process ops and raises "batchBegin" and "batchEnd" events. As part of it, it validates batch correctness (i.e. no system ops in the middle of batch) 2. It creates instance of ScheduleManagerCore that ensures we never start processing ops from batch unless all ops of the batch are in.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/summarizer'>Summarizer</a></td>
      <td>Summarizer is responsible for coordinating when to generate and send summaries. It is the main entry point for summary work. It is created only by summarizing container (i.e. one with clientType === "summarizer")</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/summarycollection'>SummaryCollection</a></td>
      <td>Data structure that looks at the op stream to track summaries as they are broadcast, acked and nacked. It provides functionality for watching specific summaries.</td>
    </tr>
  </tbody>
</table>

## Enumerations

<table class="table table-striped table-hover enum-list">
<caption>List of enums contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Enumeration</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/container-runtime#containermessagetype-Enum'>ContainerMessageType</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#runtimeheaders-Enum'>RuntimeHeaders</a></td>
      <td>Accepted header keys for requests coming to the runtime.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#runtimemessage-Enum'>RuntimeMessage</a></td>
      <td></td>
    </tr>
  </tbody>
</table>

## Functions

<table class="table table-striped table-hover function-list">
<caption>List of functions contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Function</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/container-runtime#isruntimemessage-Function'>isRuntimeMessage(message)</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#unpackruntimemessage-Function'>unpackRuntimeMessage(message)</a></td>
      <td></td>
    </tr>
  </tbody>
</table>

## Interfaces

<table class="table table-striped table-hover interface-list">
<caption>List of interfaces contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Interface</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/container-runtime/containerruntimemessage'>ContainerRuntimeMessage</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/iackedsummary'>IAckedSummary</a></td>
      <td>A single summary which has already been acked by the server.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/iacksummaryresult'>IAckSummaryResult</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/ibasesummarizeresult'>IBaseSummarizeResult</a></td>
      <td>Base results for all submitSummary attempts.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/ibroadcastsummaryresult'>IBroadcastSummaryResult</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/icancellablesummarizercontroller'>ICancellableSummarizerController</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/icancellationtoken'>ICancellationToken</a></td>
      <td>Similar to AbortSignal, but using promise instead of events</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/ichunkedop'>IChunkedOp</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/iclientsummarywatcher'>IClientSummaryWatcher</a></td>
      <td>Watches summaries created by a specific client.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/iconnectableruntime'>IConnectableRuntime</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/icontainerruntimeoptions'>IContainerRuntimeOptions</a></td>
      <td>Options for container runtime.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/ienqueuesummarizeoptions'>IEnqueueSummarizeOptions</a></td>
      <td>Options to use when enqueueing a summarize attempt.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/igarbagecollectionruntime'>IGarbageCollectionRuntime</a></td>
      <td>Defines the APIs for the runtime object to be passed to the garbage collector.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/igcruntimeoptions'>IGCRuntimeOptions</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/igcstats'>IGCStats</a></td>
      <td>The statistics of the system state after a garbage collection run.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/igeneratedsummarystats'>IGeneratedSummaryStats</a></td>
      <td>In addition to the normal summary tree + stats, this contains additional stats only relevant at the root of the tree.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/igeneratesummarytreeresult'>IGenerateSummaryTreeResult</a></td>
      <td>Results of submitSummary after generating the summary tree.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/inacksummaryresult'>INackSummaryResult</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/iondemandsummarizeoptions'>IOnDemandSummarizeOptions</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/ipendingflush'>IPendingFlush</a></td>
      <td>This represents an explicit flush call and is added to the pending queue when flush is called on the ContainerRuntime to flush pending messages.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/ipendingflushmode'>IPendingFlushMode</a></td>
      <td>This represents a FlushMode update and is added to the pending queue when <code>setFlushMode</code> is called on the ContainerRuntime and the FlushMode changes.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/ipendinglocalstate'>IPendingLocalState</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/ipendingmessage'>IPendingMessage</a></td>
      <td>This represents a message that has been submitted and is added to the pending queue when <code>submit</code> is called on the ContainerRuntime. This message has either not been ack'd by the server or has not been submitted to the server yet.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/ipendingruntimestate'>IPendingRuntimeState</a></td>
      <td>State saved when the container closes, to be given back to a newly instantiated runtime in a new instance of the container, so it can load to the same state</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/iprovidesummarizer'>IProvideSummarizer</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/irootsummarytreewithstats'>IRootSummaryTreeWithStats</a></td>
      <td>The summary tree returned by the root node. It adds state relevant to the root of the tree.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isubmitsummaryopresult'>ISubmitSummaryOpResult</a></td>
      <td>Results of submitSummary after submitting the summarize op.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isubmitsummaryoptions'>ISubmitSummaryOptions</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummarizeoptions'>ISummarizeOptions</a></td>
      <td>Options affecting summarize behavior.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummarizer'>ISummarizer</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummarizeresults'>ISummarizeResults</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummarizerevents'>ISummarizerEvents</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummarizerinternalsprovider'>ISummarizerInternalsProvider</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummarizerruntime'>ISummarizerRuntime</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummarizingwarning'>ISummarizingWarning</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummary'>ISummary</a></td>
      <td>A single summary which can be tracked as it goes through its life cycle. The life cycle is: Local to Broadcast to Acked/Nacked.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummaryackmessage'>ISummaryAckMessage</a></td>
      <td>Interface for summary ack messages with typed contents.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummarybaseconfiguration'>ISummaryBaseConfiguration</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummarycollectionopevents'>ISummaryCollectionOpEvents</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummaryconfigurationdisableheuristics'>ISummaryConfigurationDisableHeuristics</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummaryconfigurationdisablesummarizer'>ISummaryConfigurationDisableSummarizer</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummaryconfigurationheuristics'>ISummaryConfigurationHeuristics</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummarynackmessage'>ISummaryNackMessage</a></td>
      <td>Interface for summary nack messages with typed contents.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummaryopmessage'>ISummaryOpMessage</a></td>
      <td>Interface for summary op messages with typed contents.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/isummaryruntimeoptions'>ISummaryRuntimeOptions</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime/iuploadsummaryresult'>IUploadSummaryResult</a></td>
      <td>Results of submitSummary after uploading the tree to storage.</td>
    </tr>
  </tbody>
</table>

## Variables

<table class="table table-striped table-hover variable-list">
<caption>List of variables contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Variable</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/container-runtime#agentschedulerid-Variable'>agentSchedulerId</a></td>
      <td>Legacy ID for the built-in AgentScheduler. To minimize disruption while removing it, retaining this as a special-case for document dirty state. Ultimately we should have no special-cases from the ContainerRuntime's perspective.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#defaultsummaryconfiguration-Variable'>DefaultSummaryConfiguration</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#gcblobprefix-Variable'>gcBlobPrefix</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#gctreekey-Variable'>gcTreeKey</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#isummarizer-Variable'>ISummarizer</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#nevercancelledsummarytoken-Variable'>neverCancelledSummaryToken</a></td>
      <td>Can be useful in testing as well as in places where caller does not use cancellation. This object implements ISummaryCancellationToken interface but cancellation is never leveraged.</td>
    </tr>
  </tbody>
</table>

## Type Aliases

<table class="table table-striped table-hover alias-list">
<caption>List of type aliases contained in this package</caption>
  <thead>
    <tr>
     <th scope="col">Type Alias</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><a href='/docs/apis/container-runtime#enqueuesummarizeresult-TypeAlias'>EnqueueSummarizeResult</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#ipendingstate-TypeAlias'>IPendingState</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#isummarycancellationtoken-TypeAlias'>ISummaryCancellationToken</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#isummaryconfiguration-TypeAlias'>ISummaryConfiguration</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#opactioneventlistener-TypeAlias'>OpActionEventListener</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#opactioneventname-TypeAlias'>OpActionEventName</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#submitsummaryresult-TypeAlias'>SubmitSummaryResult</a></td>
      <td>Strict type representing result of a submitSummary attempt. The result consists of 4 possible stages, each with its own data. The data is cumulative, so each stage will contain the data from the previous stages. If the final "submitted" stage is not reached, the result may contain the error object. Stages: 1. "base" - stopped before the summary tree was even generated, and the result only contains the base data 2. "generate" - the summary tree was generated, and the result will contain that tree + stats 3. "upload" - the summary was uploaded to storage, and the result contains the server-provided handle 4. "submit" - the summarize op was submitted, and the result contains the op client sequence number.</td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#summarizeresultpart-TypeAlias'>SummarizeResultPart</a></td>
      <td></td>
    </tr>
    <tr>
      <td><a href='/docs/apis/container-runtime#summarizerstopreason-TypeAlias'>SummarizerStopReason</a></td>
      <td></td>
    </tr>
  </tbody>
</table>

<hr><div id=package-details>

## Enumeration Details {#enumerations-details}

### ContainerMessageType enum {#containermessagetype-Enum}

<b>Signature:</b>

```typescript
export declare enum ContainerMessageType 
```

### Enumeration Members

<table class="table table-striped table-hover enum-list">
<caption>List of members in use in this enum</caption>
  <thead>
    <tr>
     <th scope="col">Member</th>
 <th scope="col">Value</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Alias</td>
      <td><code>&quot;alias&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Attach</td>
      <td><code>&quot;attach&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>BlobAttach</td>
      <td><code>&quot;blobAttach&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>ChunkedOp</td>
      <td><code>&quot;chunkedOp&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>FluidDataStoreOp</td>
      <td><code>&quot;component&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Rejoin</td>
      <td><code>&quot;rejoin&quot;</code></td>
      <td></td>
    </tr>
  </tbody>
</table>

### RuntimeHeaders enum {#runtimeheaders-Enum}

Accepted header keys for requests coming to the runtime.

<b>Signature:</b>

```typescript
export declare enum RuntimeHeaders 
```

### Enumeration Members

<table class="table table-striped table-hover enum-list">
<caption>List of members in use in this enum</caption>
  <thead>
    <tr>
     <th scope="col">Member</th>
 <th scope="col">Value</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>externalRequest</td>
      <td><code>&quot;externalRequest&quot;</code></td>
      <td>True if the request is from an external app. Used for GC to handle scenarios where a data store is deleted and requested via an external app.</td>
    </tr>
    <tr>
      <td>viaHandle</td>
      <td><code>&quot;viaHandle&quot;</code></td>
      <td>True if the request is coming from an IFluidHandle.</td>
    </tr>
    <tr>
      <td>wait</td>
      <td><code>&quot;wait&quot;</code></td>
      <td>True to wait for a data store to be created and loaded before returning it.</td>
    </tr>
  </tbody>
</table>

### RuntimeMessage enum {#runtimemessage-Enum}

<b>Signature:</b>

```typescript
export declare enum RuntimeMessage 
```

### Enumeration Members

<table class="table table-striped table-hover enum-list">
<caption>List of members in use in this enum</caption>
  <thead>
    <tr>
     <th scope="col">Member</th>
 <th scope="col">Value</th>
 <th scope="col">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Alias</td>
      <td><code>&quot;alias&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Attach</td>
      <td><code>&quot;attach&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>BlobAttach</td>
      <td><code>&quot;blobAttach&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>ChunkedOp</td>
      <td><code>&quot;chunkedOp&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>FluidDataStoreOp</td>
      <td><code>&quot;component&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Operation</td>
      <td><code>&quot;op&quot;</code></td>
      <td></td>
    </tr>
    <tr>
      <td>Rejoin</td>
      <td><code>&quot;rejoin&quot;</code></td>
      <td></td>
    </tr>
  </tbody>
</table>


## Function Details {#functions-details}

### isRuntimeMessage {#isruntimemessage-Function}

<b>Signature:</b>

```typescript
export declare function isRuntimeMessage(message: ISequencedDocumentMessage): boolean;
```

#### Parameters {#isruntimemessage-Function-parameters}


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
  </tbody>
</table>

### unpackRuntimeMessage {#unpackruntimemessage-Function}

<b>Signature:</b>

```typescript
export declare function unpackRuntimeMessage(message: ISequencedDocumentMessage): ISequencedDocumentMessage;
```

#### Parameters {#unpackruntimemessage-Function-parameters}


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
  </tbody>
</table>


## Variable Details {#variables-details}

### agentSchedulerId {#agentschedulerid-Variable}

Legacy ID for the built-in AgentScheduler. To minimize disruption while removing it, retaining this as a special-case for document dirty state. Ultimately we should have no special-cases from the ContainerRuntime's perspective.

<b>Signature:</b>

```typescript
agentSchedulerId = "_scheduler"
```

### DefaultSummaryConfiguration {#defaultsummaryconfiguration-Variable}

<b>Signature:</b>

```typescript
DefaultSummaryConfiguration: ISummaryConfiguration
```

### gcBlobPrefix {#gcblobprefix-Variable}

<b>Signature:</b>

```typescript
gcBlobPrefix = "__gc"
```

### gcTreeKey {#gctreekey-Variable}

<b>Signature:</b>

```typescript
gcTreeKey = "gc"
```

### ISummarizer {#isummarizer-Variable}

{{% callout warning Deprecated %}}
- This will be removed in a later release.

{{% /callout %}}

<b>Signature:</b>

```typescript
ISummarizer: keyof IProvideSummarizer
```

### neverCancelledSummaryToken {#nevercancelledsummarytoken-Variable}

Can be useful in testing as well as in places where caller does not use cancellation. This object implements ISummaryCancellationToken interface but cancellation is never leveraged.

<b>Signature:</b>

```typescript
neverCancelledSummaryToken: ISummaryCancellationToken
```

## Type Alias Details {#type-aliases-details}

### EnqueueSummarizeResult {#enqueuesummarizeresult-TypeAlias}

<b>Signature:</b>

```typescript
export declare type EnqueueSummarizeResult = (ISummarizeResults & {
    readonly alreadyEnqueued?: undefined;
}) | (ISummarizeResults & {
    readonly alreadyEnqueued: true;
    readonly overridden: true;
}) | {
    readonly alreadyEnqueued: true;
    readonly overridden?: undefined;
};
```

### IPendingState {#ipendingstate-TypeAlias}

<b>Signature:</b>

```typescript
export declare type IPendingState = IPendingMessage | IPendingFlushMode | IPendingFlush;
```

### ISummaryCancellationToken {#isummarycancellationtoken-TypeAlias}

<b>Signature:</b>

```typescript
export declare type ISummaryCancellationToken = ICancellationToken<SummarizerStopReason>;
```

### ISummaryConfiguration {#isummaryconfiguration-TypeAlias}

<b>Signature:</b>

```typescript
export declare type ISummaryConfiguration = ISummaryConfigurationDisableSummarizer | ISummaryConfigurationDisableHeuristics | ISummaryConfigurationHeuristics;
```

### OpActionEventListener {#opactioneventlistener-TypeAlias}

<b>Signature:</b>

```typescript
export declare type OpActionEventListener = (op: ISequencedDocumentMessage) => void;
```

### OpActionEventName {#opactioneventname-TypeAlias}

<b>Signature:</b>

```typescript
export declare type OpActionEventName = MessageType.Summarize | MessageType.SummaryAck | MessageType.SummaryNack | "default";
```

### SubmitSummaryResult {#submitsummaryresult-TypeAlias}

Strict type representing result of a submitSummary attempt. The result consists of 4 possible stages, each with its own data. The data is cumulative, so each stage will contain the data from the previous stages. If the final "submitted" stage is not reached, the result may contain the error object. Stages: 1. "base" - stopped before the summary tree was even generated, and the result only contains the base data 2. "generate" - the summary tree was generated, and the result will contain that tree + stats 3. "upload" - the summary was uploaded to storage, and the result contains the server-provided handle 4. "submit" - the summarize op was submitted, and the result contains the op client sequence number.

<b>Signature:</b>

```typescript
export declare type SubmitSummaryResult = IBaseSummarizeResult | IGenerateSummaryTreeResult | IUploadSummaryResult | ISubmitSummaryOpResult;
```

### SummarizeResultPart {#summarizeresultpart-TypeAlias}

<b>Signature:</b>

```typescript
export declare type SummarizeResultPart<TSuccess, TFailure = undefined> = {
    success: true;
    data: TSuccess;
} | {
    success: false;
    data: TFailure | undefined;
    message: string;
    error: any;
    retryAfterSeconds?: number;
};
```

### SummarizerStopReason {#summarizerstopreason-TypeAlias}

<b>Signature:</b>

```typescript
export declare type SummarizerStopReason = 
/** Summarizer client failed to summarize in all 3 consecutive attempts. */
"failToSummarize"
/** Parent client reported that it is no longer connected. */
 | "parentNotConnected"
/**
 * Parent client reported that it is no longer elected the summarizer.
 * This is the normal flow; a disconnect will always trigger the parent
 * client to no longer be elected as responsible for summaries. Then it
 * tries to stop its spawned summarizer client.
 */
 | "parentShouldNotSummarize"
/** Summarizer client was disconnected */
 | "summarizerClientDisconnected" | "summarizerException";
```

</div>
