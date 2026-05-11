/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type IOdspError,
	type IOdspErrorAugmentations,
	type OdspError,
	OdspErrorTypes,
} from "./errors.js";
export type {
	HostStoragePolicy,
	ICollabSessionOptions,
	IOpsCachingPolicy,
	ISnapshotOptions,
} from "./factory.js";
export {
	type CacheContentType,
	snapshotKey,
	snapshotWithLoadingGroupIdKey,
	type ICacheEntry,
	type IPersistedCache,
	type IFileEntry,
	type IEntry,
} from "./odspCache.js";
export {
	type IOdspResolvedUrl,
	type IOdspUrlParts,
	type ISharingLink,
	type ISharingLinkKind,
	type ShareLinkInfoType,
	SharingLinkRole,
	SharingLinkScope,
} from "./resolvedUrl.js";
export {
	type IdentityType,
	type InstrumentedStorageTokenFetcher,
	type InstrumentedTokenFetcher,
	isTokenFromCache,
	type OdspResourceTokenFetchOptions,
	type TokenFetcher,
	type TokenFetchOptions,
	authHeaderFromTokenResponse,
	tokenFromResponse,
	type TokenResponse,
} from "./tokenFetch.js";
export type {
	IProvideSessionAwareDriverFactory,
	IRelaySessionAwareDriverFactory,
	ISensitivityLabel,
	ISensitivityLabelsInfo,
	ISocketStorageDiscovery,
} from "./sessionProvider.js";
