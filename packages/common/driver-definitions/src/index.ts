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
} from "./driverError";
export { DriverErrorTypes } from "./driverError";
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
} from "./storage";
export { FetchSource, LoaderCachingPolicy } from "./storage";
export type {
	DriverPreCheckInfo,
	IContainerPackageInfo,
	IDriverHeader,
	IResolvedUrl,
	IUrlResolver,
} from "./urlResolver";
export { DriverHeader } from "./urlResolver";
