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
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	disabledCompressionConfig,
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	type ICompressionRuntimeOptions,
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	MinimumVersionForCollab,
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	ContainerRuntimeOptions,
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	ISummaryRuntimeOptions,
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	IContainerRuntimeOptions,
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	IGCRuntimeOptions,
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	ISummaryBaseConfiguration,
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	ISummaryConfiguration,
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	ISummaryConfigurationDisableHeuristics,
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	ISummaryConfigurationDisableSummarizer,
	/**
	 * @deprecated Import from `@fluidframework/runtime-definitions/internal` instead.
	 */
	ISummaryConfigurationHeuristics,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/runtime-definitions/legacy";
export {
	SemanticVersion,
	ContainerRuntimeOptionsInternal,
	IContainerRuntimeOptionsInternal,
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
