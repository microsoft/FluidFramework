/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { default as AbortController } from "abort-controller";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import {
    IOdspResolvedUrl,
    IPersistedCache,
    ISnapshotOptions,
    OdspResourceTokenFetchOptions,
    TokenFetcher,
    IOdspUrlParts,
} from "@fluidframework/odsp-driver-definitions";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    createCacheSnapshotKey,
    createOdspLogger,
    getOdspResolvedUrl,
    toInstrumentedOdspTokenFetcher,
} from "./odspUtils";
import { downloadSnapshot, fetchSnapshotWithRedeem } from "./fetchSnapshot";
import { IVersionedValueWithEpoch } from "./contracts";

/**
 * Function to prefetch the snapshot and cached it in the persistant cache, so that when the container is loaded
 * the cached latest snapshot could be used and removes the network call from the critical path.
 * @param resolvedUrl - Resolved url to fetch the snapshot.
 * @param getStorageToken - function that can provide the storage token for a given site. This is
 *  is also referred to as the "VROOM" token in SPO.
 * @param persistedCache - Cache to store the fetched snapshot.
 * @param forceAccessTokenViaAuthorizationHeader - whether to force passing given token via authorization header.
 * @param logger - Logger to have telemetry events.
 * @param hostSnapshotFetchOptions - Options to fetch the snapshot if any. Otherwise default will be used.
 * @param enableRedeemFallback - True to have the sharing link redeem fallback in case the Trees Latest/Redeem
 *  1RT call fails with redeem error. During fallback it will first redeem the sharing link and then make
 *  the Trees latest call.
 * @returns - True if the snapshot is cached, false otherwise.
 */
export async function prefetchLatestSnapshot(
    resolvedUrl: IResolvedUrl,
    getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
    persistedCache: IPersistedCache,
    forceAccessTokenViaAuthorizationHeader: boolean,
    logger: ITelemetryBaseLogger,
    hostSnapshotFetchOptions: ISnapshotOptions | undefined,
    enableRedeemFallback?: boolean,
    fetchBinarySnapshotFormat?: boolean,
): Promise<boolean> {
    const odspLogger = createOdspLogger(ChildLogger.create(logger, "PrefetchSnapshot"));
    const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);

    const resolvedUrlData: IOdspUrlParts = {
        siteUrl: odspResolvedUrl.siteUrl,
        driveId: odspResolvedUrl.driveId,
        itemId: odspResolvedUrl.itemId,
    };
    const storageTokenFetcher = toInstrumentedOdspTokenFetcher(
        odspLogger,
        resolvedUrlData,
        getStorageToken,
        true /* throwOnNullToken */,
    );

    const snapshotDownloader = async (
        finalOdspResolvedUrl: IOdspResolvedUrl,
        storageToken: string,
        snapshotOptions: ISnapshotOptions | undefined,
        controller?: AbortController,
    ) => {
        return downloadSnapshot(
            finalOdspResolvedUrl, storageToken, odspLogger, snapshotOptions, fetchBinarySnapshotFormat, controller);
    };
    const snapshotKey = createCacheSnapshotKey(odspResolvedUrl);
    let cacheP: Promise<void> | undefined;
    const putInCache = async (valueWithEpoch: IVersionedValueWithEpoch) => {
        cacheP = persistedCache.put(
            snapshotKey,
            valueWithEpoch,
        );
        return cacheP;
    };
    const removeEntries = async () => persistedCache.removeEntries(snapshotKey.file);
    return PerformanceEvent.timedExecAsync(
        odspLogger,
        { eventName: "PrefetchLatestSnapshot" },
        async () => {
            await fetchSnapshotWithRedeem(
                    odspResolvedUrl,
                    storageTokenFetcher,
                    hostSnapshotFetchOptions,
                    forceAccessTokenViaAuthorizationHeader,
                    odspLogger,
                    snapshotDownloader,
                    putInCache,
                    removeEntries,
                    enableRedeemFallback,
                );
            assert(cacheP !== undefined, 0x1e7 /* "caching was not performed!" */);
            await cacheP;
            return true;
    }).catch(async (error) => false);
}
