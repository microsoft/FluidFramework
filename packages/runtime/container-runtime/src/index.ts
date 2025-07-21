/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	loadContainerRuntime,
	LoadContainerRuntimeParams,
	agentSchedulerId,
	ContainerRuntime,
	DeletedResponseHeaderKey,
	TombstoneResponseHeaderKey,
	InactiveResponseHeaderKey,
	RuntimeHeaderData,
} from "./containerRuntime.js";
export {
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	CompressionAlgorithms,
	disabledCompressionConfig,
	type ICompressionRuntimeOptions,
	MinimumVersionForCollab,
	SemanticVersion,
	ContainerRuntimeOptions,
	ContainerRuntimeOptionsInternal,
	ISummaryRuntimeOptions,
	IContainerRuntimeOptions,
	IContainerRuntimeOptionsInternal,
	IGCRuntimeOptions,
	ISummaryBaseConfiguration,
	ISummaryConfiguration,
	ISummaryConfigurationDisableHeuristics,
	ISummaryConfigurationDisableSummarizer,
	ISummaryConfigurationHeuristics,
} from "@fluidframework/runtime-definitions/internal";
export {
	ContainerMessageType,
	UnknownContainerRuntimeMessage,
} from "./messageTypes.js";
export { IBlobManagerLoadInfo } from "./blobManager/index.js";
export { FluidDataStoreRegistry } from "./dataStoreRegistry.js";
export {
	detectOutboundReferences,
	ChannelCollectionFactory,
	AllowTombstoneRequestHeaderKey,
} from "./channelCollection.js";
export {
	GCNodeType,
	IGCMetadata,
	GCFeatureMatrix,
	GCVersion,
	IGarbageCollectionRuntime,
	IMarkPhaseStats,
	ISweepPhaseStats,
	IGCNodeUpdatedProps,
	IGCStats,
} from "./gc/index.js";
export {
	IAckedSummary,
	ISummarizer,
	ISummarizeResults,
	ISummaryCancellationToken,
	neverCancelledSummaryToken,
	Summarizer,
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
	IRetriableFailureError,
	IdCompressorMode,
	IDocumentSchema,
	IDocumentSchemaInfo,
	DocumentSchemaValueType,
	IDocumentSchemaCurrent,
	currentDocumentVersionSchema,
	DocumentsSchemaController,
	IDocumentSchemaChangeMessageIncoming,
	IDocumentSchemaChangeMessageOutgoing,
	IDocumentSchemaFeatures,
	ReadFluidDataStoreAttributes,
	IFluidDataStoreAttributes0,
	IFluidDataStoreAttributes1,
	IFluidDataStoreAttributes2,
	OmitAttributesVersions,
	DefaultSummaryConfiguration,
} from "./summary/index.js";
export { IChunkedOp, unpackRuntimeMessage } from "./opLifecycle/index.js";
export {
	runtimeCoreCompatDetails,
	runtimeCompatDetailsForLoader,
	runtimeCompatDetailsForDataStore,
	loaderSupportRequirementsForRuntime,
	dataStoreSupportRequirementsForRuntime,
} from "./runtimeLayerCompatState.js";
