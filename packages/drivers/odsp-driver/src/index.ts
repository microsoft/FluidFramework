/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// public utils
export { checkUrl } from "./checkUrl.js";
export {
	type ISnapshotContentsWithProps,
	parseCompactSnapshotResponse,
} from "./compactSnapshotParser.js";
// Constants
export { OdcApiSiteOrigin, OdcFileSiteOrigin } from "./constants.js";
export {
	ClpCompliantAppHeader,
	type IClpCompliantAppHeader,
	type ISharingLinkHeader,
	type OdspFluidDataStoreLocator,
	SharingLinkHeader,
} from "./contractsPublic.js";
// File creation
export { createOdspCreateContainerRequest } from "./createOdspCreateContainerRequest.js";
export { createOdspUrl } from "./createOdspUrl.js";
export type {
	EpochTracker,
	FetchType,
	FetchTypeInternal,
	ICacheAndTracker,
} from "./epochTracker.js";
export { SnapshotFormatSupportType } from "./fetchSnapshot.js";
export type {
	INonPersistentCache,
	IOdspCache,
	IPersistedFileCache,
	IPrefetchSnapshotContents,
} from "./odspCache.js";
// Factory
export {
	OdspDocumentServiceFactory,
	createLocalOdspDocumentServiceFactory,
} from "./odspDocumentServiceFactory.js";
export { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore.js";
// URI Resolver functionality, URI management
export { OdspDriverUrlResolver } from "./odspDriverUrlResolver.js";
export {
	OdspDriverUrlResolverForShareLink,
	type ShareLinkFetcherProps,
} from "./odspDriverUrlResolverForShareLink.js";
// It's used by URL resolve code, but also has some public functions
export {
	encodeOdspFluidDataStoreLocator,
	getLocatorFromOdspUrl,
	locatorQueryParamName,
	storeLocatorInOdspUrl,
} from "./odspFluidFileLink.js";
// Layer Compat details
export { odspDriverCompatDetailsForLoader } from "./odspLayerCompatState.js";
export { type ISnapshotContents, getHashedDocumentId } from "./odspPublicUtils.js";
export { getOdspUrlParts, isOdcUrl, isSpoUrl } from "./odspUrlHelper.js";
export { type IOdspResponse, isOdspResolvedUrl } from "./odspUtils.js";
// prefetch latest snapshot before container load
export { prefetchLatestSnapshot } from "./prefetchLatestSnapshot.js";
