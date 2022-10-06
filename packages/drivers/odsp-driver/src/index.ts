/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Constants
export { OdcApiSiteOrigin, OdcFileSiteOrigin } from "./constants";

export {
	OdspFluidDataStoreLocator,
	SharingLinkHeader,
	ISharingLinkHeader,
	ClpCompliantAppHeader,
	IClpCompliantAppHeader,
} from "./contractsPublic";

// public utils
export { getHashedDocumentId, ISnapshotContents } from "./odspPublicUtils";
export { isOdcOrigin, getApiRoot, isSpoUrl, isOdcUrl, getOdspUrlParts } from "./odspUrlHelper";
export { createOdspUrl } from "./createOdspUrl";
export { checkUrl } from "./checkUrl";

// prefetch latest snapshot before container load
export { prefetchLatestSnapshot } from "./prefetchLatestSnapshot";

// Factory
export { OdspDocumentServiceFactoryCore } from "./odspDocumentServiceFactoryCore";
export { createLocalOdspDocumentServiceFactory, OdspDocumentServiceFactory } from "./odspDocumentServiceFactory";
export { OdspDocumentServiceFactoryWithCodeSplit } from "./odspDocumentServiceFactoryWithCodeSplit";

// File creation
export { createOdspCreateContainerRequest } from "./createOdspCreateContainerRequest";

// URI Resolver functionality, URI management
export { ShareLinkFetcherProps, OdspDriverUrlResolverForShareLink } from "./odspDriverUrlResolverForShareLink";
export { OdspDriverUrlResolver } from "./odspDriverUrlResolver";

// It's used by URL resolve code, but also has some public functions
export {
	encodeOdspFluidDataStoreLocator,
	storeLocatorInOdspUrl,
	getLocatorFromOdspUrl,
	locatorQueryParamName,
} from "./odspFluidFileLink";

export { parseCompactSnapshotResponse } from "./compactSnapshotParser";
