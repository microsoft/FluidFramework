/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	ISummaryRuntimeOptions,
	ISummaryBaseConfiguration,
	ISummaryConfigurationHeuristics,
	ISummaryConfigurationDisableSummarizer,
	ISummaryConfigurationDisableHeuristics,
	IContainerRuntimeOptions,
	isRuntimeMessage,
	RuntimeMessage,
	agentSchedulerId,
	ContainerRuntime,
	RuntimeHeaders,
	AllowTombstoneRequestHeaderKey,
	AllowInactiveRequestHeaderKey,
	TombstoneResponseHeaderKey,
	InactiveResponseHeaderKey,
	ISummaryConfiguration,
	DefaultSummaryConfiguration,
	ICompressionRuntimeOptions,
	CompressionAlgorithms,
} from "./containerRuntime.js";
export {
	ContainerMessageType,
	ContainerRuntimeMessage,
	IContainerRuntimeMessageCompatDetails,
	CompatModeBehavior,
	RecentlyAddedContainerRuntimeMessageDetails,
	UnknownContainerRuntimeMessage,
} from "./messageTypes.js";
export { IBlobManagerLoadInfo } from "./blobManager.js";
export { FluidDataStoreRegistry } from "./dataStoreRegistry.js";
export { detectOutboundReferences } from "./dataStores.js";
export {
	GCNodeType,
	IGCMetadata,
	GCFeatureMatrix,
	GCVersion,
	IGCRuntimeOptions,
	IMarkPhaseStats,
	ISweepPhaseStats,
	IGCStats,
} from "./gc/index.js";
export {
	IAckedSummary,
	ISummarizer,
	ISummarizeResults,
	ISummaryCancellationToken,
	neverCancelledSummaryToken,
	Summarizer,
	SummarizerStopReason,
	SummaryCollection,
	EnqueueSummarizeResult,
	IAckSummaryResult,
	IBaseSummarizeResult,
	IBroadcastSummaryResult,
	ICancellationToken,
	IConnectableRuntime,
	IContainerRuntimeMetadata,
	ICreateContainerMetadata,
	IEnqueueSummarizeOptions,
	IGenerateSummaryTreeResult,
	IGeneratedSummaryStats,
	INackSummaryResult,
	IOnDemandSummarizeOptions,
	IRefreshSummaryAckOptions,
	ISubmitSummaryOpResult,
	ISubmitSummaryOptions,
	ISerializedElection,
	ISummarizeOptions,
	ISummarizerEvents,
	ISummarizerInternalsProvider,
	ISummarizerRuntime,
	ISummarizingWarning,
	IUploadSummaryResult,
	SubmitSummaryResult,
	SummarizeResultPart,
	IClientSummaryWatcher,
	ISummary,
	ISummaryCollectionOpEvents,
	ISummaryAckMessage,
	ISummaryMetadataMessage,
	ISummaryNackMessage,
	ISummaryOpMessage,
	OpActionEventListener,
	OpActionEventName,
	ICancellableSummarizerController,
	SubmitSummaryFailureData,
	SummaryStage,
	IRetriableFailureResult,
	ISummarizeEventProps,
} from "./summary/index.js";
export { IChunkedOp, unpackRuntimeMessage } from "./opLifecycle/index.js";

// Re-exports for backwards compatibility.
// Will be removed in the future.
export {
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	assertIsStableId,
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	generateStableId,
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	isStableId,
} from "@fluidframework/id-compressor";
