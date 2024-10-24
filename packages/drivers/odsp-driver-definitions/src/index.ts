/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { IOdspError, IOdspErrorAugmentations, OdspError, OdspErrorTypes } from "./errors.js";
export {
	HostStoragePolicy,
	ICollabSessionOptions,
	IOpsCachingPolicy,
	ISnapshotOptions,
} from "./factory.js";
export {
	CacheContentType,
	maximumCacheDurationMs,
	getKeyForCacheEntry,
	ICacheEntry,
	IEntry,
	IFileEntry,
	IPersistedCache,
	snapshotKey,
	snapshotWithLoadingGroupIdKey,
} from "./odspCache.js";
export {
	IOdspResolvedUrl,
	IOdspUrlParts,
	ISharingLink,
	ISharingLinkKind,
	ShareLinkInfoType,
	SharingLinkRole,
	SharingLinkScope,
} from "./resolvedUrl.js";
export {
	IdentityType,
	InstrumentedStorageTokenFetcher,
	InstrumentedTokenFetcher,
	isTokenFromCache,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
	TokenFetchOptions,
	authHeaderFromTokenResponse,
	tokenFromResponse,
	TokenResponse,
} from "./tokenFetch.js";
export {
	IProvideSessionAwareDriverFactory,
	IRelaySessionAwareDriverFactory,
	ISocketStorageDiscovery,
} from "./sessionProvider.js";
