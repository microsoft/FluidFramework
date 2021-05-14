/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import {
    IPersistedCache,
    ISnapshotOptions,
    OdspResourceTokenFetchOptions,
    TokenFetcher,
} from "@fluidframework/odsp-driver-definitions";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    createCacheSnapshotKey,
    createOdspLogger,
    fetchAndParseAsJSONHelper,
    getOdspResolvedUrl,
    toInstrumentedOdspTokenFetcher,
} from "./odspUtils";
import { fetchSnapshotWithRedeem } from "./fetchSnapshot";
import { IOdspSnapshot, IVersionedValueWithEpoch } from "./contracts";

/**
 * Function to prefetch the snapshot and cached it in the persistant cache, so that when the container is loaded
 * the cached latest snapshot could be used and removes the network call from the critical path.
 * @param resolvedUrl - Resolved url to fetch the snapshot.
 * @param getStorageToken - function that can provide the storage token for a given site. This is
 *  is also referred to as the "VROOM" token in SPO.
 * @param persistedCache - Cache to store the fetched snapshot.
 * @param logger - Logger to have telemetry events.
 * @param hostSnapshotFetchOptions - Options to fetch the snapshot if any. Otherwise default will be used.
 * @returns - True if the snapshot is cached, false otherwise.
 */
export async function prefetchLatestSnapshot(
    resolvedUrl: IResolvedUrl,
    getStorageToken: TokenFetcher<OdspResourceTokenFetchOptions>,
    persistedCache: IPersistedCache,
    logger: ITelemetryBaseLogger,
    hostSnapshotFetchOptions: ISnapshotOptions | undefined,
): Promise<boolean> {
    const odspLogger = createOdspLogger(ChildLogger.create(logger, "PrefetchSnapshot"));
    const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);

    const storageTokenFetcher = toInstrumentedOdspTokenFetcher(
        odspLogger,
        odspResolvedUrl,
        getStorageToken,
        true /* throwOnNullToken */,
    );

    const snapshotDownloader = async (url: string, fetchOptions: {[index: string]: any}) => {
        return fetchAndParseAsJSONHelper<IOdspSnapshot>(
            url,
            fetchOptions,
        );
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
                    odspLogger,
                    snapshotDownloader,
                    putInCache,
                    removeEntries,
                );
            assert(cacheP !== undefined, 0x1e7 /* "caching was not performed!" */);
            await cacheP;
            return true;
    }).catch(async (error) => false);
}
