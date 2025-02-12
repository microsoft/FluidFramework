/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performanceNow } from "@fluid-internal/client-utils";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert, Deferred } from "@fluidframework/core-utils/internal";
import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import {
	IOdspResolvedUrl,
	IOdspUrlParts,
	IPersistedCache,
	ISnapshotOptions,
	OdspResourceTokenFetchOptions,
	TokenFetcher,
	getKeyForCacheEntry,
	type InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	PerformanceEvent,
	createChildMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";

import { IVersionedValueWithEpoch } from "./contracts.js";
import {
	ISnapshotRequestAndResponseOptions,
	SnapshotFormatSupportType,
	downloadSnapshot,
	fetchSnapshotWithRedeem,
} from "./fetchSnapshot.js";
import { IPrefetchSnapshotContents } from "./odspCache.js";
import { OdspDocumentServiceFactory } from "./odspDocumentServiceFactory.js";
import {
	createCacheSnapshotKey,
	createOdspLogger,
	getOdspResolvedUrl,
	snapshotWithLoadingGroupIdSupported,
	toInstrumentedOdspStorageTokenFetcher,
	type TokenFetchOptionsEx,
} from "./odspUtils.js";

/**
 * Function to prefetch the snapshot and cached it in the persistant cache, so that when the container is loaded
 * the cached latest snapshot could be used and removes the network call from the critical path.
 *
 * @param resolvedUrl - Resolved url to fetch the snapshot.
 * @param getStorageToken - function that can provide the storage token for a given site. This is
 * is also referred to as the "VROOM" token in SPO.
 * @param persistedCache - Cache to store the fetched snapshot.
 * @param forceAccessTokenViaAuthorizationHeader - @deprecated Not used, true value always used instead. Whether to force passing given token via authorization header.
 * @param logger - Logger to have telemetry events.
 * @param hostSnapshotFetchOptions - Options to fetch the snapshot if any. Otherwise default will be used.
 * @param enableRedeemFallback - True to have the sharing link redeem fallback in case the Trees Latest/Redeem
 * 1RT call fails with redeem error. During fallback it will first redeem the sharing link and then make
 * the Trees latest call.
 * Note: this can be considered deprecated - it will be replaced with `snapshotFormatFetchType`.
 * @param fetchBinarySnapshotFormat - Control if we want to fetch binary format snapshot.
 * @param snapshotFormatFetchType - Snapshot format to fetch.
 * @param odspDocumentServiceFactory - factory to access the non persistent cache and store the prefetch promise.
 *
 * @returns `true` if the snapshot is cached, `false` otherwise.
 * @legacy
 * @alpha
 */
export async function prefetchLatestSnapshot(
	resolvedUrl: IResolvedUrl,
	getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
	persistedCache: IPersistedCache,
	forceAccessTokenViaAuthorizationHeader: boolean,
	logger: ITelemetryBaseLogger,
	hostSnapshotFetchOptions: ISnapshotOptions | undefined,
	enableRedeemFallback: boolean = true,
	fetchBinarySnapshotFormat?: boolean,
	snapshotFormatFetchType?: SnapshotFormatSupportType,
	odspDocumentServiceFactory?: OdspDocumentServiceFactory,
): Promise<boolean> {
	const mc = createChildMonitoringContext({ logger, namespace: "PrefetchSnapshot" });
	const odspLogger = createOdspLogger(mc.logger);
	const useGroupIdsForSnapshotFetch = snapshotWithLoadingGroupIdSupported(mc.config);
	// For prefetch, we just want to fetch the ungrouped data and want to use the new API if the
	// feature gate is set, so provide an empty array.
	const loadingGroupIds = useGroupIdsForSnapshotFetch ? [] : undefined;
	const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);

	const resolvedUrlData: IOdspUrlParts = {
		siteUrl: odspResolvedUrl.siteUrl,
		driveId: odspResolvedUrl.driveId,
		itemId: odspResolvedUrl.itemId,
	};
	const getAuthHeader = toInstrumentedOdspStorageTokenFetcher(
		odspLogger,
		resolvedUrlData,
		getStorageToken,
	);

	const snapshotDownloader = async (
		finalOdspResolvedUrl: IOdspResolvedUrl,
		storageTokenFetcher: InstrumentedStorageTokenFetcher,
		tokenFetchOptions: TokenFetchOptionsEx,
		loadingGroupId: string[] | undefined,
		snapshotOptions: ISnapshotOptions | undefined,
		controller?: AbortController,
	): Promise<ISnapshotRequestAndResponseOptions> => {
		return downloadSnapshot(
			finalOdspResolvedUrl,
			storageTokenFetcher,
			tokenFetchOptions,
			loadingGroupId,
			snapshotOptions,
			undefined,
			controller,
		);
	};
	const snapshotKey = createCacheSnapshotKey(odspResolvedUrl, useGroupIdsForSnapshotFetch);
	let cacheP: Promise<void> | undefined;
	let snapshotEpoch: string | undefined;
	const putInCache = async (valueWithEpoch: IVersionedValueWithEpoch): Promise<void> => {
		snapshotEpoch = valueWithEpoch.fluidEpoch;
		cacheP = persistedCache.put(snapshotKey, valueWithEpoch);
		return cacheP;
	};

	const removeEntries = async (): Promise<void> =>
		persistedCache.removeEntries(snapshotKey.file);
	return PerformanceEvent.timedExecAsync(
		odspLogger,
		{ eventName: "PrefetchLatestSnapshot" },
		async () => {
			const prefetchStartTime = performanceNow();
			// Add the deferred promise to the cache, so that it can be leveraged while loading the container.
			const snapshotContentsWithEpochP = new Deferred<IPrefetchSnapshotContents>();
			const nonPersistentCacheKey = getKeyForCacheEntry(snapshotKey);
			const snapshotNonPersistentCache =
				odspDocumentServiceFactory?.snapshotPrefetchResultCache;
			snapshotNonPersistentCache?.add(
				nonPersistentCacheKey,
				async () => snapshotContentsWithEpochP.promise,
			);
			await fetchSnapshotWithRedeem(
				odspResolvedUrl,
				getAuthHeader,
				hostSnapshotFetchOptions,
				forceAccessTokenViaAuthorizationHeader,
				odspLogger,
				snapshotDownloader,
				putInCache,
				removeEntries,
				loadingGroupIds,
				enableRedeemFallback,
			)
				.then(async (value) => {
					assert(!!snapshotEpoch, 0x585 /* prefetched snapshot should have a valid epoch */);
					snapshotContentsWithEpochP.resolve({
						...value,
						fluidEpoch: snapshotEpoch,
						prefetchStartTime,
					});
					assert(cacheP !== undefined, 0x1e7 /* "caching was not performed!" */);
					await cacheP;
					// Schedule it to remove from cache after 5s.
					// 1. While it's in snapshotNonPersistentCache: Load flow will use this value and will not attempt
					// to fetch snapshot from network again. That's the best from perf POV, but cache will not be
					// updated if we keep it in this cache, thus we want to eventually remove snapshot from this cache.
					// 2. After it's removed from snapshotNonPersistentCache: snapshot is present in persistent cache,
					// so we sill still use it (in accordance with cache policy controlled by host). But load flow will
					// also fetch snapshot (in parallel) from storage and update cache. This is fine long term,
					// but is an extra cost (unneeded network call). However since it is 5s older, new network call
					// will update the snapshot in cache.
					setTimeout(() => {
						snapshotNonPersistentCache?.remove(nonPersistentCacheKey);
					}, 5000);
				})
				.catch((error) => {
					// Remove it from the non persistent cache if an error occured.
					snapshotNonPersistentCache?.remove(nonPersistentCacheKey);
					snapshotContentsWithEpochP.reject(error);
					throw error;
				});
			return true;
		},
	).catch(async (error) => {
		odspLogger.sendErrorEvent({ eventName: "PrefetchLatestSnapshotError" }, error);
		return false;
	});
}
