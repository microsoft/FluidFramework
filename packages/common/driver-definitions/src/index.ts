/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	DriverError,
	IAnyDriverError,
	IAuthorizationError,
	IDriverErrorBase,
	IDriverBasicError,
	IGenericNetworkError,
	ILocationRedirectionError,
	IThrottlingWarning,
} from "./driverError.js";
export { DriverErrorTypes } from "./driverError.js";
export type {
	FiveDaysMs,
	IDeltasFetchResult,
	IDeltaStorageService,
	IDocumentDeltaConnection,
	IDocumentDeltaConnectionEvents,
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentServiceFactory,
	IDocumentServicePolicies,
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	ISnapshot,
	ISnapshotFetchOptions,
	IStream,
	IStreamResult,
	ISummaryContext,
} from "./storage.js";
export { FetchSource, LoaderCachingPolicy } from "./storage.js";
export type {
	DriverPreCheckInfo,
	IContainerPackageInfo,
	IDriverHeader,
	IResolvedUrl,
	IUrlResolver,
} from "./urlResolver.js";
export { DriverHeader } from "./urlResolver.js";
