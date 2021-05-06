/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import {
    IPersistedCache,
    ISnapshotOptions,
    OdspResourceTokenFetchOptions,
    TokenFetcher,
} from "@fluidframework/odsp-driver-definitions";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    createOdspLogger,
    fetchAndParseAsJSONHelper,
    getOdspResolvedUrl,
    getWithRetryForTokenRefresh,
    toInstrumentedOdspTokenFetcher,
} from "./odspUtils";
import { fetchLatestSnapshotCore } from "./fetchSnapshot";
import { IOdspSnapshot } from "./contracts";

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
    const odspLogger = createOdspLogger(ChildLogger.create(logger, "PrefetchSnapshot", { all: { prefetch: true }}));
    const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);

    const storageTokenFetcher = toInstrumentedOdspTokenFetcher(
        odspLogger,
        odspResolvedUrl,
        getStorageToken,
        true /* throwOnNullToken */,
    );

    const snapshotUploader = async (url: string, fetchOptions: {[index: string]: any}) => {
        return fetchAndParseAsJSONHelper<IOdspSnapshot>(
            url,
            fetchOptions,
        );
    };

    return PerformanceEvent.timedExecAsync(
        odspLogger,
        { eventName: "PrefetchLatestSnapshot" },
        async (event: PerformanceEvent) => {
            let attempts = 1;
            const success = await getWithRetryForTokenRefresh(async (tokenFetchOptions) => {
                // Sometimes the token supplied by host is expired, so we attempt again by asking the host
                // to give us a new valid token.
                if (tokenFetchOptions.refresh) {
                    attempts = 2;
                }
                const { cacheP } = await fetchLatestSnapshotCore(
                    odspResolvedUrl,
                    storageTokenFetcher,
                    tokenFetchOptions,
                    hostSnapshotFetchOptions,
                    odspLogger,
                    snapshotUploader,
                    persistedCache,
                );
                let cached = false;
                await cacheP?.then(() => cached = true);
                return cached;
            });
        event.end({ attempts });
        return success;
    }).catch((error) => false);
}
