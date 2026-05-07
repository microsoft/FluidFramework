/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { ConnectionState } from "./connectionState.js";
export { asLegacyAlpha, type ContainerAlpha, waitContainerToCatchUp } from "./container.js";
export {
	createDetachedContainer,
	type ICreateAndLoadContainerProps,
	type ICreateDetachedContainerProps,
	type ILoadExistingContainerProps,
	type ILoadFrozenContainerFromPendingStateProps,
	type ILoadSummarizerContainerProps,
	type IRehydrateDetachedContainerProps,
	loadExistingContainer,
	loadFrozenContainerFromPendingState,
	loadSummarizerContainerAndMakeSummary,
	rehydrateDetachedContainer,
} from "./createAndLoadContainerUtils.js";
export { createFrozenDocumentServiceFactory } from "./frozenServices.js";
export {
	type ICodeDetailsLoader,
	type IFluidModuleWithDetails,
	type ILoaderProps,
	type ILoaderServices,
	Loader,
} from "./loader.js";
export {
	driverSupportRequirementsForLoader,
	loaderCompatDetailsForRuntime,
	loaderCoreCompatDetails,
	runtimeSupportRequirementsForLoader,
} from "./loaderLayerCompatState.js";
export { loadContainerPaused } from "./loadPaused.js";
export {
	isLocationRedirectionError,
	resolveWithLocationRedirectionHandling,
} from "./location-redirection-utilities/index.js";
export { PendingLocalStateStore } from "./pendingLocalStateStore.js";
export type {
	IBaseProtocolHandler,
	IQuorumSnapshot,
	IScribeProtocolState,
	QuorumClientsSnapshot,
	QuorumProposalsSnapshot,
} from "./protocol/index.js";
export type { IProtocolHandler, ProtocolHandlerBuilder } from "./protocol.js";
export type {
	LoadSummarizerSummaryResult,
	OnDemandSummaryResults,
	SummaryStage,
} from "./summarizerResultTypes.js";
export {
	type IParsedUrl,
	tryParseCompatibleResolvedUrl,
} from "./utils.js";
