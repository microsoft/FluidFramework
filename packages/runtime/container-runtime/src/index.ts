/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type ContainerRuntimeOptions,
	type ContainerRuntimeOptionsInternal,
	type ISummaryRuntimeOptions,
	type IContainerRuntimeOptions,
	type IContainerRuntimeOptionsInternal,
	loadContainerRuntime,
	type LoadContainerRuntimeParams,
	agentSchedulerId,
	ContainerRuntime,
	DeletedResponseHeaderKey,
	TombstoneResponseHeaderKey,
	InactiveResponseHeaderKey,
	type RuntimeHeaderData,
} from "./containerRuntime.js";
export type { ICompressionRuntimeOptions } from "./compressionDefinitions.js";
export { CompressionAlgorithms, disabledCompressionConfig } from "./compressionDefinitions.js";
export type {
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/legacy` instead.
	 */
	MinimumVersionForCollab,
} from "@fluidframework/runtime-definitions/internal";
export {
	ContainerMessageType,
	type UnknownContainerRuntimeMessage,
} from "./messageTypes.js";
export type { IBlobManagerLoadInfo } from "./blobManager/index.js";
export { FluidDataStoreRegistry } from "./dataStoreRegistry.js";
export {
	detectOutboundReferences,
	ChannelCollectionFactory,
	AllowTombstoneRequestHeaderKey,
} from "./channelCollection.js";
export {
	GCNodeType,
	type IGCMetadata,
	type GCFeatureMatrix,
	type GCVersion,
	type IGarbageCollectionRuntime,
	type IGCRuntimeOptions,
	type IMarkPhaseStats,
	type ISweepPhaseStats,
	type IGCNodeUpdatedProps,
	type IGCStats,
} from "./gc/index.js";
export {
	type IAckedSummary,
	type ISummarizer,
	type ISummarizeResults,
	type ISummaryCancellationToken,
	neverCancelledSummaryToken,
	Summarizer,
	SummaryCollection,
	type EnqueueSummarizeResult,
	type IAckSummaryResult,
	type IBaseSummarizeResult,
	type IBroadcastSummaryResult,
	type ICancellationToken,
	type IConnectableRuntime,
	type IContainerRuntimeMetadata,
	type ICreateContainerMetadata,
	type IEnqueueSummarizeOptions,
	type IGenerateSummaryTreeResult,
	type IGeneratedSummaryStats,
	type INackSummaryResult,
	type IOnDemandSummarizeOptions,
	type IRefreshSummaryAckOptions,
	type ISubmitSummaryOpResult,
	type ISubmitSummaryOptions,
	type ISerializedElection,
	type ISummarizeOptions,
	type ISummarizerInternalsProvider,
	type ISummarizerRuntime,
	type ISummarizingWarning,
	type IUploadSummaryResult,
	type SubmitSummaryResult,
	type SummarizeResultPart,
	type IClientSummaryWatcher,
	type ISummary,
	type ISummaryCollectionOpEvents,
	type ISummaryAckMessage,
	type ISummaryMetadataMessage,
	type ISummaryNackMessage,
	type ISummaryOpMessage,
	type OpActionEventListener,
	type OpActionEventName,
	type ICancellableSummarizerController,
	type SubmitSummaryFailureData,
	type SummaryStage,
	type IRetriableFailureError,
	type IdCompressorMode,
	type IDocumentSchema,
	type IDocumentSchemaInfo,
	type DocumentSchemaValueType,
	type IDocumentSchemaCurrent,
	currentDocumentVersionSchema,
	DocumentsSchemaController,
	type IDocumentSchemaChangeMessageIncoming,
	type IDocumentSchemaChangeMessageOutgoing,
	type IDocumentSchemaFeatures,
	type ReadFluidDataStoreAttributes,
	type IFluidDataStoreAttributes0,
	type IFluidDataStoreAttributes1,
	type IFluidDataStoreAttributes2,
	type OmitAttributesVersions,
	type ISummaryBaseConfiguration,
	type ISummaryConfigurationHeuristics,
	type ISummaryConfigurationDisableSummarizer,
	type ISummaryConfigurationDisableHeuristics,
	type ISummaryConfiguration,
	DefaultSummaryConfiguration,
} from "./summary/index.js";
export { type IChunkedOp, unpackRuntimeMessage } from "./opLifecycle/index.js";
export {
	runtimeCoreCompatDetails,
	runtimeCompatDetailsForLoader,
	runtimeCompatDetailsForDataStore,
	loaderSupportRequirementsForRuntime,
	dataStoreSupportRequirementsForRuntime,
} from "./runtimeLayerCompatState.js";
