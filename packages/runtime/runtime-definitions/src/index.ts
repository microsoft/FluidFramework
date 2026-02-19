/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	AttributionInfo,
	AttributionKey,
	DetachedAttributionKey,
	LocalAttributionKey,
	OpAttributionKey,
} from "./attribution.js";
export type {
	ContainerExtensionId,
	ContainerExtensionProvider,
	ContainerExtensionExpectations,
	ExtensionCompatibilityDetails,
	UnknownExtensionInstantiation,
} from "./containerExtensionProvider.js";
export type {
	AliasResult,
	CreateChildSummarizerNodeFn,
	FluidDataStoreContextInternal,
	IContainerRuntimeBase,
	IContainerRuntimeBaseEvents,
	IDataStore,
	IFluidDataStoreChannel,
	IFluidDataStorePolicies,
	IFluidDataStoreContext,
	IFluidParentContext,
	IFluidDataStoreContextDetached,
	IPendingMessagesState,
	PackagePath,
} from "./dataStoreContext.js";
export { FlushMode, FlushModeExperimental, VisibilityState } from "./dataStoreContext.js";
export type { IProvideFluidDataStoreFactory } from "./dataStoreFactory.js";
export { IFluidDataStoreFactory } from "./dataStoreFactory.js";
export type {
	FluidDataStoreRegistryEntry,
	IProvideFluidDataStoreRegistry,
	NamedFluidDataStoreRegistryEntries,
	NamedFluidDataStoreRegistryEntry,
	NamedFluidDataStoreRegistryEntry2,
} from "./dataStoreRegistry.js";
export { IFluidDataStoreRegistry } from "./dataStoreRegistry.js";
export type {
	IGarbageCollectionData,
	IGarbageCollectionDetailsBase,
} from "./garbageCollectionDefinitions.js";
export {
	gcBlobPrefix,
	gcDataBlobKey,
	gcDeletedBlobKey,
	gcTombstoneBlobKey,
	gcTreeKey,
} from "./garbageCollectionDefinitions.js";
export type {
	FluidDataStoreMessage,
	IAttachMessage,
	IEnvelope,
	IInboundSignalMessage,
	InboundAttachMessage,
	IRuntimeMessageCollection,
	IRuntimeMessagesContent,
	ISequencedMessageEnvelope,
	IRuntimeStorageService,
} from "./protocol.js";
export {
	encodeHandlesInContainerRuntime,
	notifiesReadOnlyState,
} from "./runtimeLayerCompatFeatureNames.js";
export type {
	CreateChildSummarizerNodeParam,
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
	ITelemetryContextExt,
	SummarizeInternalFn,
} from "./summary.js";
export {
	blobCountPropertyName,
	channelsTreeName,
	CreateSummarizerNodeSource,
	currentSummarizeStepPrefix,
	currentSummarizeStepPropertyName,
	totalBlobSizePropertyName,
} from "./summary.js";
export type { MinimumVersionForCollab } from "./compatibilityDefinitions.js";

export {
	type ContainerRuntimeBaseAlpha,
	type StageControlsAlpha,
	type CommitStagedChangesOptionsInternal,
	type IContainerRuntimeBaseInternal,
	type StageControlsInternal,
	asLegacyAlpha,
} from "./stagingMode.js";
