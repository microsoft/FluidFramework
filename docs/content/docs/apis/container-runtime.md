{
  "title": "@fluidframework/container-runtime Package",
  "kind": "Package",
  "members": {
    "Variable": {
      "AllowTombstoneRequestHeaderKey": "/docs/apis/container-runtime#allowtombstonerequestheaderkey-variable",
      "DefaultSummaryConfiguration": "/docs/apis/container-runtime#defaultsummaryconfiguration-variable",
      "GCNodeType": "/docs/apis/container-runtime#gcnodetype-variable",
      "InactiveResponseHeaderKey": "/docs/apis/container-runtime#inactiveresponseheaderkey-variable",
      "TombstoneResponseHeaderKey": "/docs/apis/container-runtime#tombstoneresponseheaderkey-variable"
    },
    "Enum": {
      "CompressionAlgorithms": "/docs/apis/container-runtime/compressionalgorithms-enum",
      "ContainerMessageType": "/docs/apis/container-runtime/containermessagetype-enum"
    },
    "Class": {
      "ContainerRuntime": "/docs/apis/container-runtime/containerruntime-class",
      "Summarizer": "/docs/apis/container-runtime/summarizer-class",
      "SummaryCollection": "/docs/apis/container-runtime/summarycollection-class"
    },
    "TypeAlias": {
      "EnqueueSummarizeResult": "/docs/apis/container-runtime#enqueuesummarizeresult-typealias",
      "GCFeatureMatrix": "/docs/apis/container-runtime#gcfeaturematrix-typealias",
      "GCNodeType": "/docs/apis/container-runtime#gcnodetype-typealias",
      "GCVersion": "/docs/apis/container-runtime#gcversion-typealias",
      "ISummaryCancellationToken": "/docs/apis/container-runtime#isummarycancellationtoken-typealias",
      "ISummaryConfiguration": "/docs/apis/container-runtime#isummaryconfiguration-typealias",
      "ISummaryMetadataMessage": "/docs/apis/container-runtime#isummarymetadatamessage-typealias",
      "OpActionEventListener": "/docs/apis/container-runtime#opactioneventlistener-typealias",
      "OpActionEventName": "/docs/apis/container-runtime#opactioneventname-typealias",
      "SubmitSummaryResult": "/docs/apis/container-runtime#submitsummaryresult-typealias",
      "SummarizeResultPart": "/docs/apis/container-runtime#summarizeresultpart-typealias",
      "SummarizerStopReason": "/docs/apis/container-runtime#summarizerstopreason-typealias",
      "SummaryStage": "/docs/apis/container-runtime#summarystage-typealias"
    },
    "Interface": {
      "IAckedSummary": "/docs/apis/container-runtime/iackedsummary-interface",
      "IAckSummaryResult": "/docs/apis/container-runtime/iacksummaryresult-interface",
      "IBaseSummarizeResult": "/docs/apis/container-runtime/ibasesummarizeresult-interface",
      "IBlobManagerLoadInfo": "/docs/apis/container-runtime/iblobmanagerloadinfo-interface",
      "IBroadcastSummaryResult": "/docs/apis/container-runtime/ibroadcastsummaryresult-interface",
      "ICancellableSummarizerController": "/docs/apis/container-runtime/icancellablesummarizercontroller-interface",
      "ICancellationToken": "/docs/apis/container-runtime/icancellationtoken-interface",
      "IClientSummaryWatcher": "/docs/apis/container-runtime/iclientsummarywatcher-interface",
      "ICompressionRuntimeOptions": "/docs/apis/container-runtime/icompressionruntimeoptions-interface",
      "IConnectableRuntime": "/docs/apis/container-runtime/iconnectableruntime-interface",
      "IContainerRuntimeMetadata": "/docs/apis/container-runtime/icontainerruntimemetadata-interface",
      "IContainerRuntimeOptions": "/docs/apis/container-runtime/icontainerruntimeoptions-interface",
      "ICreateContainerMetadata": "/docs/apis/container-runtime/icreatecontainermetadata-interface",
      "IEnqueueSummarizeOptions": "/docs/apis/container-runtime/ienqueuesummarizeoptions-interface",
      "IGCMetadata": "/docs/apis/container-runtime/igcmetadata-interface",
      "IGCRuntimeOptions": "/docs/apis/container-runtime/igcruntimeoptions-interface",
      "IGCStats": "/docs/apis/container-runtime/igcstats-interface",
      "IGeneratedSummaryStats": "/docs/apis/container-runtime/igeneratedsummarystats-interface",
      "IGenerateSummaryTreeResult": "/docs/apis/container-runtime/igeneratesummarytreeresult-interface",
      "IMarkPhaseStats": "/docs/apis/container-runtime/imarkphasestats-interface",
      "INackSummaryResult": "/docs/apis/container-runtime/inacksummaryresult-interface",
      "IOnDemandSummarizeOptions": "/docs/apis/container-runtime/iondemandsummarizeoptions-interface",
      "IRefreshSummaryAckOptions": "/docs/apis/container-runtime/irefreshsummaryackoptions-interface",
      "IRetriableFailureResult": "/docs/apis/container-runtime/iretriablefailureresult-interface",
      "ISerializedElection": "/docs/apis/container-runtime/iserializedelection-interface",
      "ISubmitSummaryOpResult": "/docs/apis/container-runtime/isubmitsummaryopresult-interface",
      "ISubmitSummaryOptions": "/docs/apis/container-runtime/isubmitsummaryoptions-interface",
      "ISummarizeEventProps": "/docs/apis/container-runtime/isummarizeeventprops-interface",
      "ISummarizeOptions": "/docs/apis/container-runtime/isummarizeoptions-interface",
      "ISummarizer": "/docs/apis/container-runtime/isummarizer-interface",
      "ISummarizeResults": "/docs/apis/container-runtime/isummarizeresults-interface",
      "ISummarizerEvents": "/docs/apis/container-runtime/isummarizerevents-interface",
      "ISummarizerInternalsProvider": "/docs/apis/container-runtime/isummarizerinternalsprovider-interface",
      "ISummarizerRuntime": "/docs/apis/container-runtime/isummarizerruntime-interface",
      "ISummary": "/docs/apis/container-runtime/isummary-interface",
      "ISummaryAckMessage": "/docs/apis/container-runtime/isummaryackmessage-interface",
      "ISummaryBaseConfiguration": "/docs/apis/container-runtime/isummarybaseconfiguration-interface",
      "ISummaryCollectionOpEvents": "/docs/apis/container-runtime/isummarycollectionopevents-interface",
      "ISummaryConfigurationDisableHeuristics": "/docs/apis/container-runtime/isummaryconfigurationdisableheuristics-interface",
      "ISummaryConfigurationDisableSummarizer": "/docs/apis/container-runtime/isummaryconfigurationdisablesummarizer-interface",
      "ISummaryConfigurationHeuristics": "/docs/apis/container-runtime/isummaryconfigurationheuristics-interface",
      "ISummaryNackMessage": "/docs/apis/container-runtime/isummarynackmessage-interface",
      "ISummaryOpMessage": "/docs/apis/container-runtime/isummaryopmessage-interface",
      "ISummaryRuntimeOptions": "/docs/apis/container-runtime/isummaryruntimeoptions-interface",
      "ISweepPhaseStats": "/docs/apis/container-runtime/isweepphasestats-interface",
      "IUploadSummaryResult": "/docs/apis/container-runtime/iuploadsummaryresult-interface",
      "SubmitSummaryFailureData": "/docs/apis/container-runtime/submitsummaryfailuredata-interface"
    }
  },
  "package": "@fluidframework/container-runtime",
  "unscopedPackageName": "container-runtime"
}

[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)

## Interfaces

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Interface
      </th>
      <th>
        Alerts
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/iackedsummary-interface'>IAckedSummary</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        A single summary which has already been acked by the server.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/iacksummaryresult-interface'>IAckSummaryResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/ibasesummarizeresult-interface'>IBaseSummarizeResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Base results for all submitSummary attempts.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/iblobmanagerloadinfo-interface'>IBlobManagerLoadInfo</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Information from a snapshot needed to load BlobManager
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/ibroadcastsummaryresult-interface'>IBroadcastSummaryResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/icancellablesummarizercontroller-interface'>ICancellableSummarizerController</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Similar to AbortController, but using promise instead of events
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/icancellationtoken-interface'>ICancellationToken</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Similar to AbortSignal, but using promise instead of events
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/iclientsummarywatcher-interface'>IClientSummaryWatcher</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Watches summaries created by a specific client.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/icompressionruntimeoptions-interface'>ICompressionRuntimeOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Options for op compression.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/iconnectableruntime-interface'>IConnectableRuntime</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/icontainerruntimemetadata-interface'>IContainerRuntimeMetadata</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/icontainerruntimeoptions-interface'>IContainerRuntimeOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Options for container runtime.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/icreatecontainermetadata-interface'>ICreateContainerMetadata</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/ienqueuesummarizeoptions-interface'>IEnqueueSummarizeOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Options to use when enqueueing a summarize attempt.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/igcmetadata-interface'>IGCMetadata</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/igcruntimeoptions-interface'>IGCRuntimeOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/igcstats-interface'>IGCStats</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The statistics of the system state after a garbage collection run.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/igeneratedsummarystats-interface'>IGeneratedSummaryStats</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        In addition to the normal summary tree + stats, this contains additional stats only relevant at the root of the tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/igeneratesummarytreeresult-interface'>IGenerateSummaryTreeResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Results of submitSummary after generating the summary tree.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/imarkphasestats-interface'>IMarkPhaseStats</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The statistics of the system state after a garbage collection mark phase run.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/inacksummaryresult-interface'>INackSummaryResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/iondemandsummarizeoptions-interface'>IOnDemandSummarizeOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/irefreshsummaryackoptions-interface'>IRefreshSummaryAckOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Data required to update internal tracking state after receiving a Summary Ack.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/iretriablefailureresult-interface'>IRetriableFailureResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Type for summarization failures that are retriable.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/iserializedelection-interface'>ISerializedElection</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Serialized state of IOrderedClientElection.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isubmitsummaryopresult-interface'>ISubmitSummaryOpResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Results of submitSummary after submitting the summarize op.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isubmitsummaryoptions-interface'>ISubmitSummaryOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummarizeeventprops-interface'>ISummarizeEventProps</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummarizeoptions-interface'>ISummarizeOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Options affecting summarize behavior.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummarizer-interface'>ISummarizer</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummarizeresults-interface'>ISummarizeResults</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummarizerevents-interface'>ISummarizerEvents</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummarizerinternalsprovider-interface'>ISummarizerInternalsProvider</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummarizerruntime-interface'>ISummarizerRuntime</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummary-interface'>ISummary</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        A single summary which can be tracked as it goes through its life cycle. The life cycle is: Local to Broadcast to Acked/Nacked.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummaryackmessage-interface'>ISummaryAckMessage</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Interface for summary ack messages with typed contents.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummarybaseconfiguration-interface'>ISummaryBaseConfiguration</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummarycollectionopevents-interface'>ISummaryCollectionOpEvents</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummaryconfigurationdisableheuristics-interface'>ISummaryConfigurationDisableHeuristics</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummaryconfigurationdisablesummarizer-interface'>ISummaryConfigurationDisableSummarizer</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummaryconfigurationheuristics-interface'>ISummaryConfigurationHeuristics</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummarynackmessage-interface'>ISummaryNackMessage</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Interface for summary nack messages with typed contents.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummaryopmessage-interface'>ISummaryOpMessage</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Interface for summary op messages with typed contents.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isummaryruntimeoptions-interface'>ISummaryRuntimeOptions</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/isweepphasestats-interface'>ISweepPhaseStats</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The statistics of the system state after a garbage collection sweep phase run.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/iuploadsummaryresult-interface'>IUploadSummaryResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Results of submitSummary after uploading the tree to storage.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/submitsummaryfailuredata-interface'>SubmitSummaryFailureData</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The data in summarizer result when submit summary stage fails.
      </td>
    </tr>
  </tbody>
</table>

## Classes

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Class
      </th>
      <th>
        Alerts
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containerruntime-class'>ContainerRuntime</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Represents the runtime of the container. Contains helper functions/state of the container. It will define the store level mappings.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/summarizer-class'>Summarizer</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Summarizer is responsible for coordinating when to generate and send summaries. It is the main entry point for summary work. It is created only by summarizing container (i.e. one with clientType === &quot;summarizer&quot;)
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/summarycollection-class'>SummaryCollection</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Data structure that looks at the op stream to track summaries as they are broadcast, acked and nacked. It provides functionality for watching specific summaries.
      </td>
    </tr>
  </tbody>
</table>

## Enumerations

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Enum
      </th>
      <th>
        Alerts
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/compressionalgorithms-enum'>CompressionAlgorithms</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Available compression algorithms for op compression.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime/containermessagetype-enum'>ContainerMessageType</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
  </tbody>
</table>

## Types

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        TypeAlias
      </th>
      <th>
        Alerts
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#enqueuesummarizeresult-typealias'>EnqueueSummarizeResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#gcfeaturematrix-typealias'>GCFeatureMatrix</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#gcnodetype-typealias'>GCNodeType</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#gcversion-typealias'>GCVersion</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#isummarycancellationtoken-typealias'>ISummaryCancellationToken</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        Similar to AbortSignal, but using promise instead of events
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#isummaryconfiguration-typealias'>ISummaryConfiguration</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#isummarymetadatamessage-typealias'>ISummaryMetadataMessage</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The properties of an ISequencedDocumentMessage to be stored in the metadata blob in summary.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#opactioneventlistener-typealias'>OpActionEventListener</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#opactioneventname-typealias'>OpActionEventName</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#submitsummaryresult-typealias'>SubmitSummaryResult</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <p>
          Strict type representing result of a submitSummary attempt. The result consists of 4 possible stages, each with its own data. The data is cumulative, so each stage will contain the data from the previous stages. If the final &quot;submitted&quot; stage is not reached, the result may contain the error object.
        </p>
        <p>
          Stages:
        </p>
        <p>
          1. &quot;base&quot; - stopped before the summary tree was even generated, and the result only contains the base data
        </p>
        <p>
          2. &quot;generate&quot; - the summary tree was generated, and the result will contain that tree + stats
        </p>
        <p>
          3. &quot;upload&quot; - the summary was uploaded to storage, and the result contains the server-provided handle
        </p>
        <p>
          4. &quot;submit&quot; - the summarize op was submitted, and the result contains the op client sequence number.
        </p>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#summarizeresultpart-typealias'>SummarizeResultPart</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#summarizerstopreason-typealias'>SummarizerStopReason</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#summarystage-typealias'>SummaryStage</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        The stages of Summarize, used to describe how far progress succeeded in case of a failure at a later stage.
      </td>
    </tr>
  </tbody>
</table>

## Variables

<table class="table table-striped table-hover">
  <thead>
    <tr>
      <th>
        Variable
      </th>
      <th>
        Alerts
      </th>
      <th>
        Modifiers
      </th>
      <th>
        Description
      </th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#allowtombstonerequestheaderkey-variable'>AllowTombstoneRequestHeaderKey</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        True if a tombstoned object should be returned without erroring
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#defaultsummaryconfiguration-variable'>DefaultSummaryConfiguration</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#gcnodetype-variable'>GCNodeType</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        The types of GC nodes in the GC reference graph.
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#inactiveresponseheaderkey-variable'>InactiveResponseHeaderKey</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        Inactive error responses will have this header set to true
      </td>
    </tr>
    <tr>
      <td>
        <a href='/docs/apis/container-runtime#tombstoneresponseheaderkey-variable'>TombstoneResponseHeaderKey</a>
      </td>
      <td>
        <code>ALPHA</code>
      </td>
      <td>
        <code>readonly</code>
      </td>
      <td>
        Tombstone error responses will have this header set to true
      </td>
    </tr>
  </tbody>
</table>

## Type Details

### EnqueueSummarizeResult (ALPHA) {#enqueuesummarizeresult-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#enqueuesummarizeresult-signature}

```typescript
export type EnqueueSummarizeResult = (ISummarizeResults & {
    readonly alreadyEnqueued?: undefined;
}) | (ISummarizeResults & {
    readonly alreadyEnqueued: true;
    readonly overridden: true;
}) | {
    readonly alreadyEnqueued: true;
    readonly overridden?: undefined;
};
```

### GCFeatureMatrix (ALPHA) {#gcfeaturematrix-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#gcfeaturematrix-signature}

```typescript
export type GCFeatureMatrix = {
    gcGeneration?: number;
    tombstoneGeneration?: undefined;
} | {
    tombstoneGeneration: number;
};
```

#### See Also {#gcfeaturematrix-see-also}

IGCMetadata.gcFeatureMatrix and

gcGenerationOptionName

### GCNodeType (ALPHA) {#gcnodetype-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#gcnodetype-signature}

```typescript
export type GCNodeType = (typeof GCNodeType)[keyof typeof GCNodeType];
```

### GCVersion (ALPHA) {#gcversion-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#gcversion-signature}

```typescript
export type GCVersion = number;
```

### ISummaryCancellationToken (ALPHA) {#isummarycancellationtoken-typealias}

Similar to AbortSignal, but using promise instead of events

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#isummarycancellationtoken-signature}

```typescript
export type ISummaryCancellationToken = ICancellationToken<SummarizerStopReason>;
```

### ISummaryConfiguration (ALPHA) {#isummaryconfiguration-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#isummaryconfiguration-signature}

```typescript
export type ISummaryConfiguration = ISummaryConfigurationDisableSummarizer | ISummaryConfigurationDisableHeuristics | ISummaryConfigurationHeuristics;
```

### ISummaryMetadataMessage (ALPHA) {#isummarymetadatamessage-typealias}

The properties of an ISequencedDocumentMessage to be stored in the metadata blob in summary.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#isummarymetadatamessage-signature}

```typescript
export type ISummaryMetadataMessage = Pick<ISequencedDocumentMessage, "clientId" | "clientSequenceNumber" | "minimumSequenceNumber" | "referenceSequenceNumber" | "sequenceNumber" | "timestamp" | "type">;
```

### OpActionEventListener (ALPHA) {#opactioneventlistener-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#opactioneventlistener-signature}

```typescript
export type OpActionEventListener = (op: ISequencedDocumentMessage) => void;
```

### OpActionEventName (ALPHA) {#opactioneventname-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#opactioneventname-signature}

```typescript
export type OpActionEventName = MessageType.Summarize | MessageType.SummaryAck | MessageType.SummaryNack | "default";
```

### SubmitSummaryResult (ALPHA) {#submitsummaryresult-typealias}

Strict type representing result of a submitSummary attempt. The result consists of 4 possible stages, each with its own data. The data is cumulative, so each stage will contain the data from the previous stages. If the final "submitted" stage is not reached, the result may contain the error object.

Stages:

1. "base" - stopped before the summary tree was even generated, and the result only contains the base data

2. "generate" - the summary tree was generated, and the result will contain that tree + stats

3. "upload" - the summary was uploaded to storage, and the result contains the server-provided handle

4. "submit" - the summarize op was submitted, and the result contains the op client sequence number.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#submitsummaryresult-signature}

```typescript
export type SubmitSummaryResult = IBaseSummarizeResult | IGenerateSummaryTreeResult | IUploadSummaryResult | ISubmitSummaryOpResult;
```

### SummarizeResultPart (ALPHA) {#summarizeresultpart-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#summarizeresultpart-signature}

```typescript
export type SummarizeResultPart<TSuccess, TFailure = undefined> = {
    success: true;
    data: TSuccess;
} | {
    success: false;
    data: TFailure | undefined;
    message: string;
    error: any;
};
```

### SummarizerStopReason (ALPHA) {#summarizerstopreason-typealias}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#summarizerstopreason-signature}

```typescript
export type SummarizerStopReason = 
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
 | "notElectedParent"
/**
 * We are not already running the summarizer and we are not the current elected client id.
 */
 | "notElectedClient"
/** Summarizer client was disconnected */
 | "summarizerClientDisconnected"
/** running summarizer threw an exception */
 | "summarizerException"
/**
 * The previous summary state on the summarizer is not the most recently acked summary. this also happens when the
 * first submitSummary attempt fails for any reason and there's a 2nd summary attempt without an ack
 */
 | "latestSummaryStateStale";
```

### SummaryStage (ALPHA) {#summarystage-typealias}

The stages of Summarize, used to describe how far progress succeeded in case of a failure at a later stage.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#summarystage-signature}

```typescript
export type SummaryStage = SubmitSummaryResult["stage"] | "unknown";
```

## Variable Details

### AllowTombstoneRequestHeaderKey (ALPHA) {#allowtombstonerequestheaderkey-variable}

True if a tombstoned object should be returned without erroring

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#allowtombstonerequestheaderkey-signature}

```typescript
AllowTombstoneRequestHeaderKey = "allowTombstone"
```

### DefaultSummaryConfiguration (ALPHA) {#defaultsummaryconfiguration-variable}

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#defaultsummaryconfiguration-signature}

```typescript
DefaultSummaryConfiguration: ISummaryConfiguration
```

### GCNodeType (ALPHA) {#gcnodetype-variable}

The types of GC nodes in the GC reference graph.

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#gcnodetype-signature}

```typescript
GCNodeType: {
    DataStore: string;
    SubDataStore: string;
    Blob: string;
    Other: string;
}
```

### InactiveResponseHeaderKey (ALPHA) {#inactiveresponseheaderkey-variable}

Inactive error responses will have this header set to true

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#inactiveresponseheaderkey-signature}

```typescript
InactiveResponseHeaderKey = "isInactive"
```

### TombstoneResponseHeaderKey (ALPHA) {#tombstoneresponseheaderkey-variable}

Tombstone error responses will have this header set to true

WARNING: This API is provided as an alpha preview and may change without notice. Use at your own risk.

#### Signature {#tombstoneresponseheaderkey-signature}

```typescript
TombstoneResponseHeaderKey = "isTombstoned"
```
