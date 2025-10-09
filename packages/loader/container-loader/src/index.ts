/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { ConnectionState } from "./connectionState.js";
export { type ContainerAlpha, waitContainerToCatchUp, asLegacyAlpha } from "./container.js";
export { createFrozenDocumentServiceFactory } from "./frozenServices.js";
export {
	createDetachedContainer,
	loadExistingContainer,
	rehydrateDetachedContainer,
	loadFrozenContainerFromPendingState,
	type ICreateAndLoadContainerProps,
	type ICreateDetachedContainerProps,
	type ILoadExistingContainerProps,
	type IRehydrateDetachedContainerProps,
	type ILoadFrozenContainerFromPendingStateProps,
} from "./createAndLoadContainerUtils.js";
export {
	type ICodeDetailsLoader,
	type IFluidModuleWithDetails,
	type ILoaderProps,
	type ILoaderServices,
	Loader,
} from "./loader.js";
export {
	driverSupportRequirementsForLoader,
	loaderCoreCompatDetails,
	runtimeSupportRequirementsForLoader,
	loaderCompatDetailsForRuntime,
} from "./loaderLayerCompatState.js";
export { loadContainerPaused } from "./loadPaused.js";
export {
	isLocationRedirectionError,
	resolveWithLocationRedirectionHandling,
} from "./location-redirection-utilities/index.js";
export type { IProtocolHandler, ProtocolHandlerBuilder } from "./protocol.js";
export {
	tryParseCompatibleResolvedUrl,
	type IParsedUrl,
} from "./utils.js";
export type {
	IBaseProtocolHandler,
	IScribeProtocolState,
	IQuorumSnapshot,
	QuorumClientsSnapshot,
	QuorumProposalsSnapshot,
} from "./protocol/index.js";
