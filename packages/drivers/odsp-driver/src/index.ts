/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Constants
export { OdcApiSiteOrigin, OdcFileSiteOrigin } from "./constants";

export {
	ClpCompliantAppHeader,
	IClpCompliantAppHeader,
	ISharingLinkHeader,
	OdspFluidDataStoreLocator,
	SharingLinkHeader,
} from "./contractsPublic";

// public utils
export { checkUrl } from "./checkUrl";
export { createOdspUrl } from "./createOdspUrl";
export { getHashedDocumentId, ISnapshotContents } from "./odspPublicUtils";
export { getApiRoot, getOdspUrlParts, isOdcOrigin, isOdcUrl, isSpoUrl } from "./odspUrlHelper";

// prefetch latest snapshot before container load
export { prefetchLatestSnapshot } from "./prefetchLatestSnapshot";

// Factory
export { createLocalOdspDocumentServiceFactory, OdspDocumentServiceFactory } from "./odspDocumentServiceFactory";
export { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore";
export { OdspDocumentServiceFactoryWithCodeSplit } from "./odspDocumentServiceFactoryWithCodeSplit";

// File creation
export { createOdspCreateContainerRequest } from "./createOdspCreateContainerRequest";

// URI Resolver functionality, URI management
export { OdspDriverUrlResolver } from "./odspDriverUrlResolver";
export { OdspDriverUrlResolverForShareLink, ShareLinkFetcherProps } from "./odspDriverUrlResolverForShareLink";

// It's used by URL resolve code, but also has some public functions
export {
	encodeOdspFluidDataStoreLocator,
	getLocatorFromOdspUrl,
	locatorQueryParamName,
	storeLocatorInOdspUrl,
} from "./odspFluidFileLink";

export { parseCompactSnapshotResponse } from "./compactSnapshotParser";
