/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	AttributionInfo,
	AttributionKey,
	DetachedAttributionKey,
	LocalAttributionKey,
	OpAttributionKey,
} from "./attribution";
export {
	AliasResult,
	CreateChildSummarizerNodeFn,
	FlushMode,
	FlushModeExperimental,
	IContainerRuntimeBase,
	IContainerRuntimeBaseEvents,
	IDataStore,
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreContextDetached,
	IFluidDataStoreContextEvents,
	VisibilityState,
} from "./dataStoreContext";
export { IFluidDataStoreFactory, IProvideFluidDataStoreFactory } from "./dataStoreFactory";
export {
	FluidDataStoreRegistryEntry,
	IFluidDataStoreRegistry,
	IProvideFluidDataStoreRegistry,
	NamedFluidDataStoreRegistryEntries,
	NamedFluidDataStoreRegistryEntry,
} from "./dataStoreRegistry";
export {
	gcBlobPrefix,
	gcDeletedBlobKey,
	gcTombstoneBlobKey,
	gcTreeKey,
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
} from "./garbageCollection";
export {
	IAttachMessage,
	IEnvelope,
	IInboundSignalMessage,
	InboundAttachMessage,
	ISignalEnvelope,
} from "./protocol";
export {
	blobCountPropertyName,
	channelsTreeName,
	CreateChildSummarizerNodeParam,
	CreateSummarizerNodeSource,
	IExperimentalIncrementalSummaryContext,
	ISummarizeInternalResult,
	ISummarizeResult,
	ISummarizerNode,
	ISummarizerNodeConfig,
	ISummarizerNodeConfigWithGC,
	ISummarizerNodeWithGC,
	ISummaryStats,
	ISummaryTreeWithStats,
	ITelemetryContext,
	SummarizeInternalFn,
	totalBlobSizePropertyName,
} from "./summary";

// Re-exports for backwards compatibility.
// Will be removed in the future.
export {
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	IdCompressor,
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	IIdCompressor,
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	IIdCompressorCore,
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	IdCreationRange,
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	OpSpaceCompressedId,
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	SerializedIdCompressor,
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	SerializedIdCompressorWithNoSession,
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	SerializedIdCompressorWithOngoingSession,
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	SessionId,
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	SessionSpaceCompressedId,
	/**
	 * @deprecated Import from `@fluidframework/id-compressor` instead.
	 */
	StableId,
} from "@fluidframework/id-compressor";
