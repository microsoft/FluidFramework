/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { assert } from "@fluidframework/common-utils";
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { IResolvedUrl } from "@fluidframework/driver-definitions";
import {
    ICacheEntry,
    IOdspResolvedUrl,
    IPersistedCache,
    ISnapshotOptions,
    OdspResourceTokenFetchOptions,
    snapshotKey,
    TokenFetcher,
} from "@fluidframework/odsp-driver-definitions";
import { ChildLogger, PerformanceEvent, TelemetryLogger } from "@fluidframework/telemetry-utils";
import { LocalPersistentCache } from "./odspCache";
import { ISnapshotCacheValue } from "./odspDocumentStorageManager";
import {
    createOdspLogger,
    fetchAndParseAsJSONHelper,
    getOdspResolvedUrl,
    getWithRetryForTokenRefresh,
    IOdspResponse,
} from "./odspUtils";
import { IOdspSnapshot } from "./contracts";
import { evalBlobsAndTrees, toInstrumentedOdspTokenFetcher } from "./odspUtils2";

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
    const snapshotUrl = odspResolvedUrl.endpoints.snapshotStorageUrl;
    const snapshotOptions: ISnapshotOptions = {
        deltas: 1,
        channels: 1,
        blobs: 2,
        ...hostSnapshotFetchOptions,
    };

    const storageTokenFetcher = toInstrumentedOdspTokenFetcher(
        odspLogger,
        odspResolvedUrl,
        getStorageToken,
        true /* throwOnNullToken */,
    );

    const snapshotCacheEntry: ICacheEntry = {
        type: snapshotKey,
        key: "",
        file: {
            resolvedUrl: odspResolvedUrl,
            docId: odspResolvedUrl.hashedDocumentId,
        },
    };

    return PerformanceEvent.timedExecAsync(
        odspLogger,
        { eventName: "PrefetchLatestSnapshot" },
        async (event: PerformanceEvent) => {
            let attempts = 1;
            const success = await getWithRetryForTokenRefresh(async (tokenFetchOptions) => {
                if (tokenFetchOptions.refresh) {
                    attempts = 2;
                }
                const storageToken = await storageTokenFetcher(tokenFetchOptions, "PrefetchLatestSnapshot");
                assert(storageToken !== null, "Storage token should not be null");
                return fetchSnapshot(
                    snapshotUrl,
                    odspResolvedUrl,
                    snapshotOptions,
                    storageToken,
                    odspLogger,
                    persistedCache,
                    snapshotCacheEntry,
                );
            });
        event.end({ attempts });
        return success;
    }).catch((error) => false);
}

async function fetchSnapshot(
    snapshotUrl: string,
    odspResolvedUrl: IOdspResolvedUrl,
    snapshotOptions: ISnapshotOptions,
    storageToken: string,
    logger: TelemetryLogger,
    persistedCache: IPersistedCache,
    snapshotCacheEntry: ICacheEntry,
): Promise<boolean> {
    let success = false;
    const url = `${snapshotUrl}/trees/latest?ump=1`;
    const formBoundary = uuid();
    let postBody = `--${formBoundary}\r\n`;
    postBody += `Authorization: Bearer ${storageToken}\r\n`;
    postBody += `X-HTTP-Method-Override: GET\r\n`;
    const logOptions = {};
    Object.entries(snapshotOptions).forEach(([key, value]) => {
        if (value !== undefined) {
            postBody += `${key}: ${value}\r\n`;
            logOptions[`snapshotOption_${key}`] = value;
        }
    });
    if (odspResolvedUrl.sharingLinkToRedeem) {
        postBody += `sl: ${odspResolvedUrl.sharingLinkToRedeem}\r\n`;
    }
    postBody += `_post: 1\r\n`;
    postBody += `\r\n--${formBoundary}--`;
    const headers: {[index: string]: any} = {
        "Content-Type": `multipart/form-data;boundary=${formBoundary}`,
    };

    const controller: AbortController = new AbortController();
    setTimeout(
        () => controller.abort(),
        snapshotOptions.timeout,
    );

    // This event measures only successful cases of getLatest call (no tokens, no retries).
    return PerformanceEvent.timedExecAsync(
        logger,
        {
            eventName: "PrefetchTreesLatest",
            ...logOptions,
        },
        async (event) => {
            const response: IOdspResponse<IOdspSnapshot> = await fetchAndParseAsJSONHelper<IOdspSnapshot>(
                url,
                {
                    body: postBody,
                    headers,
                    signal: controller?.signal,
                    method: "POST",
                },
            );
            const snapshot: IOdspSnapshot = response.content;
            const spReqDuration = response.headers.get("sprequestduration");

            const { numTrees, numBlobs, encodedBlobsSize, decodedBlobsSize } = evalBlobsAndTrees(snapshot);

            // There are some scenarios in ODSP where we cannot cache, trees/latest will explicitly tell us when
            // we cannot cache using an HTTP response header.
            const canCache = response.headers.get("disablebrowsercachingofusercontent") !== "true";
            // There maybe no snapshot - TreesLatest would return just ops.
            const sequenceNumber: number = (snapshot.trees && (snapshot.trees[0] as any).sequenceNumber) ?? 0;
            const seqNumberFromOps = snapshot.ops && snapshot.ops.length > 0 ?
                snapshot.ops[0].sequenceNumber - 1 :
                undefined;

            const value: ISnapshotCacheValue = { snapshot, sequenceNumber };

            if (!Number.isInteger(sequenceNumber)
                || seqNumberFromOps !== undefined && seqNumberFromOps !== sequenceNumber)
            {
                logger.sendErrorEvent({ eventName: "fetchSnapshotError", sequenceNumber, seqNumberFromOps });
                value.sequenceNumber = undefined;
            } else if (canCache) {
                persistedCache.put(
                    snapshotCacheEntry,
                    value,
                ).then(() => success = true)
                .catch(() => {});
            }

            event.end({
                trees: numTrees,
                blobs: snapshot.blobs?.length ?? 0,
                leafNodes: numBlobs,
                encodedBlobsSize,
                decodedBlobsSize,
                sequenceNumber,
                ops: snapshot.ops?.length ?? 0,
                headers: Object.keys(headers).length !== 0 ? true : undefined,
                spReqDuration,
                // Sharing link telemetry regarding sharing link redeem status and performance. Ex: FRL; dur=100, FRS;
                // desc=S, FRP; desc=False. Here, FRL is the duration taken for redeem, FRS is the redeem status
                // (S means success), and FRP is a flag to indicate if the permission has changed.
                sltelemetry: response.headers.get("x-fluid-sltelemetry"),
                ...response.commonSpoHeaders,
            });
            return success;
        },
    );
}
