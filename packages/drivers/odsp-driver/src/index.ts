/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Constants
export { OdcApiSiteOrigin, OdcFileSiteOrigin } from "./constants.js";

export {
	ClpCompliantAppHeader,
	IClpCompliantAppHeader,
	ISharingLinkHeader,
	OdspFluidDataStoreLocator,
	SharingLinkHeader,
} from "./contractsPublic.js";

// public utils
export { checkUrl } from "./checkUrl.js";
export { createOdspUrl } from "./createOdspUrl.js";
export { getHashedDocumentId, ISnapshotContents } from "./odspPublicUtils.js";
export { getApiRoot, getOdspUrlParts, isOdcOrigin, isOdcUrl, isSpoUrl } from "./odspUrlHelper.js";

// prefetch latest snapshot before container load
export { prefetchLatestSnapshot } from "./prefetchLatestSnapshot.js";

// Factory
export {
	createLocalOdspDocumentServiceFactory,
	OdspDocumentServiceFactory,
} from "./odspDocumentServiceFactory.js";
export { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore.js";
export { OdspDocumentServiceFactoryWithCodeSplit } from "./odspDocumentServiceFactoryWithCodeSplit.js";

// File creation
export { createOdspCreateContainerRequest } from "./createOdspCreateContainerRequest.js";

// URI Resolver functionality, URI management
export { OdspDriverUrlResolver } from "./odspDriverUrlResolver.js";
export {
	OdspDriverUrlResolverForShareLink,
	ShareLinkFetcherProps,
} from "./odspDriverUrlResolverForShareLink.js";

// It's used by URL resolve code, but also has some public functions
export {
	encodeOdspFluidDataStoreLocator,
	getLocatorFromOdspUrl,
	locatorQueryParamName,
	storeLocatorInOdspUrl,
} from "./odspFluidFileLink.js";

export {
	IOdspCache,
	IPersistedFileCache,
	INonPersistentCache,
	IPrefetchSnapshotContents,
} from "./odspCache.js";
export {
	ICacheAndTracker,
	type EpochTracker,
	FetchType,
	FetchTypeInternal,
} from "./epochTracker.js";
export { IOdspResponse, isOdspResolvedUrl } from "./odspUtils.js";
export { SnapshotFormatSupportType } from "./fetchSnapshot.js";
export {
	ISnapshotContentsWithProps,
	parseCompactSnapshotResponse,
} from "./compactSnapshotParser.js";
