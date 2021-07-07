/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { default as AbortController } from "abort-controller";
import { v4 as uuid } from "uuid";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, fromUtf8ToBase64, performance } from "@fluidframework/common-utils";
import { DriverErrorType } from "@fluidframework/driver-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IOdspResolvedUrl,
    ISnapshotOptions,
    TokenFetchOptions,
    OdspErrorType,
} from "@fluidframework/odsp-driver-definitions";
import { IOdspSnapshot, IVersionedValueWithEpoch } from "./contracts";
import { getQueryString } from "./getQueryString";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import {
    fetchAndParseAsJSONHelper,
    getWithRetryForTokenRefresh,
    getWithRetryForTokenRefreshRepeat,
    IOdspResponse,
    ISnapshotCacheValue,
} from "./odspUtils";

/**
 * Fetches a snapshot from the server with a given version id.
 * @param snapshotUrl - snapshot url from where the odsp snapshot will be fetched
 * @param token - token used for authorization in the request
 * @param storageFetchWrapper - Implementation of the get/post methods used to fetch the snapshot
 * @param versionId - id of specific snapshot to be fetched
 * @param fetchFullSnapshot - whether we want to fetch full snapshot(with blobs)
 * @returns A promise of the snapshot and the status code of the response
 */
export async function fetchSnapshot(
    snapshotUrl: string,
    token: string | null,
    versionId: string,
    fetchFullSnapshot: boolean,
    logger: ITelemetryLogger,
    snapshotDownloader: (url: string, fetchOptions: {[index: string]: any}) => Promise<IOdspResponse<IOdspSnapshot>>,
): Promise<IOdspResponse<IOdspSnapshot>> {
    const path = `/trees/${versionId}`;
    let queryParams: ISnapshotOptions = {};

    if (fetchFullSnapshot) {
        if (versionId !== "latest") {
            queryParams = { channels: 1, blobs: 2 };
        } else {
            queryParams = { deltas: 1, channels: 1, blobs: 2 };
        }
    }

    const queryString = getQueryString(queryParams);
    const { url, headers } = getUrlAndHeadersWithAuth(`${snapshotUrl}${path}${queryString}`, token);
    return PerformanceEvent.timedExecAsync(
        logger,
        {
            eventName: "fetchSnapshot",
            headers: Object.keys(headers).length !== 0 ? true : undefined,
        },
        async () => snapshotDownloader(url, { headers }),
    );
}

export async function fetchSnapshotWithRedeem(
    odspResolvedUrl: IOdspResolvedUrl,
    storageTokenFetcher: (options: TokenFetchOptions, name: string) => Promise<string | null>,
    snapshotOptions: ISnapshotOptions | undefined,
    logger: ITelemetryLogger,
    snapshotDownloader: (url: string, fetchOptions: {[index: string]: any}) => Promise<IOdspResponse<IOdspSnapshot>>,
    putInCache: (valueWithEpoch: IVersionedValueWithEpoch) => Promise<void>,
    removeEntries: () => Promise<void>,
    enableRedeemFallback?: boolean,
): Promise<ISnapshotCacheValue> {
    return fetchLatestSnapshotCore(
        odspResolvedUrl,
        storageTokenFetcher,
        snapshotOptions,
        logger,
        snapshotDownloader,
        putInCache,
    ).catch(async (error) => {
        if (enableRedeemFallback && isRedeemSharingLinkError(odspResolvedUrl, error)) {
            // Execute the redeem fallback
            logger.sendErrorEvent({
                eventName: "RedeemFallback",
                errorType: error.errorType,
            });
            await redeemSharingLink(odspResolvedUrl, storageTokenFetcher, logger);
            const odspResolvedUrlWithoutShareLink: IOdspResolvedUrl =
                { ...odspResolvedUrl, sharingLinkToRedeem: undefined };
            return fetchLatestSnapshotCore(
                odspResolvedUrlWithoutShareLink,
                storageTokenFetcher,
                snapshotOptions,
                logger,
                snapshotDownloader,
                putInCache,
            );
        } else {
            throw error;
        }
    }).catch(async (error) => {
        // Clear the cache on 401/403/404 on snapshot fetch from network because this means either the user doesn't
        // have permissions for the file or it was deleted. So, if we do not clear cache, we will continue fetching
        // snapshot from cache in the future.
        if (typeof error === "object" && error !== null && error.errorType === DriverErrorType.authorizationError
            || error.errorType === DriverErrorType.fileNotFoundOrAccessDeniedError) {
            await removeEntries();
        }
        throw error;
    });
}

async function redeemSharingLink(
    odspResolvedUrl: IOdspResolvedUrl,
    storageTokenFetcher: (options: TokenFetchOptions, name: string) => Promise<string | null>,
    logger: ITelemetryLogger,
) {
    return PerformanceEvent.timedExecAsync(
        logger,
        {
            eventName: "RedeemShareLink",
        },
        async () => getWithRetryForTokenRefresh(async (tokenFetchOptions) => {
                assert(!!odspResolvedUrl.sharingLinkToRedeem, 0x1ed /* "Share link should be present" */);
                const storageToken = await storageTokenFetcher(tokenFetchOptions, "RedeemShareLink");
                const encodedShareUrl = getEncodedShareUrl(odspResolvedUrl.sharingLinkToRedeem);
                const redeemUrl = `${odspResolvedUrl.siteUrl}/_api/v2.0/shares/${encodedShareUrl}`;
                const { url, headers } = getUrlAndHeadersWithAuth(redeemUrl, storageToken);
                headers.prefer = "redeemSharingLink";
                return fetchAndParseAsJSONHelper(url, { headers });
        }),
    );
}

async function fetchLatestSnapshotCore(
    odspResolvedUrl: IOdspResolvedUrl,
    storageTokenFetcher: (options: TokenFetchOptions, name: string) => Promise<string | null>,
    snapshotOptions: ISnapshotOptions | undefined,
    logger: ITelemetryLogger,
    snapshotDownloader: (url: string, fetchOptions: {[index: string]: any}) => Promise<IOdspResponse<IOdspSnapshot>>,
    putInCache: (valueWithEpoch: IVersionedValueWithEpoch) => Promise<void>,
): Promise<ISnapshotCacheValue> {
    return getWithRetryForTokenRefresh(async (tokenFetchOptions) => {
        if (tokenFetchOptions.refresh) {
            // This is the most critical code path for boot.
            // If we get incorrect / expired token first time, that adds up to latency of boot
            logger.sendErrorEvent({
                eventName: "TreeLatest_SecondCall",
                hasClaims: !!tokenFetchOptions.claims,
                hasTenantId: !!tokenFetchOptions.tenantId,
                // We have two "TreeLatest_SecondCall" events and the other one uses errorType to differentiate cases
                // Continue that pattern here.
                errorType: "access denied",
            }, tokenFetchOptions.previousError);
        }
        const snapshotUrl = odspResolvedUrl.endpoints.snapshotStorageUrl;
        const url = `${snapshotUrl}/trees/latest?ump=1`;
        const storageToken = await storageTokenFetcher(tokenFetchOptions, "TreesLatest");
        assert(storageToken !== null, 0x1e5 /* "Storage token should not be null" */);
        const formBoundary = uuid();
        const formParams: string[] = [];
        formParams.push(`--${formBoundary}`);
        formParams.push(`Authorization: Bearer ${storageToken}`);
        formParams.push(`X-HTTP-Method-Override: GET`);
        const logOptions = {};
        if (snapshotOptions !== undefined) {
            Object.entries(snapshotOptions).forEach(([key, value]) => {
                if (value !== undefined) {
                    formParams.push(`${key}: ${value}`);
                    logOptions[`snapshotOption_${key}`] = value;
                }
            });
        }
        if (odspResolvedUrl.sharingLinkToRedeem) {
            formParams.push(`sl: ${odspResolvedUrl.sharingLinkToRedeem}`);
        }
        formParams.push(`_post: 1`);
        formParams.push(`\r\n--${formBoundary}--`);
        const postBody = formParams.join("\r\n");
        const headers: {[index: string]: any} = {
            "Content-Type": `multipart/form-data;boundary=${formBoundary}`,
        };

        let controller: AbortController | undefined;
        if (snapshotOptions?.timeout !== undefined) {
            controller = new AbortController();
            setTimeout(
                () => controller!.abort(),
                snapshotOptions.timeout,
            );
        }

        // This event measures only successful cases of getLatest call (no tokens, no retries).
        return PerformanceEvent.timedExecAsync(
            logger,
            {
                eventName: "TreesLatest",
                ...logOptions,
            },
            async (event) => {
                const startTime = performance.now();
                const response: IOdspResponse<IOdspSnapshot> = await snapshotDownloader(
                    url,
                    {
                        body: postBody,
                        headers,
                        signal: controller?.signal,
                        method: "POST",
                    },
                );
                const endTime = performance.now();
                const overallTime = endTime - startTime;
                const snapshot: IOdspSnapshot = response.content;
                let dnstime: number | undefined; // domainLookupEnd - domainLookupStart
                let redirectTime: number | undefined; // redirectEnd -redirectStart
                let tcpHandshakeTime: number | undefined; // connectEnd  - connectStart
                let secureConntime: number | undefined; // connectEnd  - secureConnectionStart
                let responseTime: number | undefined; // responsEnd - responseStart
                let fetchStToRespEndTime: number | undefined; // responseEnd  - fetchStart
                let reqStToRespEndTime: number | undefined; // responseEnd - requestStart
                let networkTime: number | undefined; // responseEnd - startTime
                const spReqDuration = response.headers.get("sprequestduration");

                // getEntriesByType is only available in browser performance object
                const resources1 = performance.getEntriesByType?.("resource") ?? [];
                // Usually the latest fetch call is to the end of resources, so we start from the end.
                for (let i = resources1.length - 1; i > 0; i--) {
                    const indResTime = resources1[i] as PerformanceResourceTiming;
                    const resource_name = indResTime.name;
                    const resource_initiatortype = indResTime.initiatorType;
                    if ((resource_initiatortype.localeCompare("fetch") === 0)
                        && (resource_name.localeCompare(url) === 0)) {
                        redirectTime = indResTime.redirectEnd - indResTime.redirectStart;
                        dnstime = indResTime.domainLookupEnd - indResTime.domainLookupStart;
                        tcpHandshakeTime = indResTime.connectEnd - indResTime.connectStart;
                        secureConntime = (indResTime.secureConnectionStart > 0) ?
                            (indResTime.connectEnd - indResTime.secureConnectionStart) : 0;
                        responseTime = indResTime.responseEnd - indResTime.responseStart;
                        fetchStToRespEndTime = (indResTime.fetchStart > 0) ?
                            (indResTime.responseEnd - indResTime.fetchStart) : 0;
                        reqStToRespEndTime = (indResTime.requestStart > 0) ?
                            (indResTime.responseEnd - indResTime.requestStart) : 0;
                        networkTime = (indResTime.startTime > 0) ? (indResTime.responseEnd - indResTime.startTime) : 0;
                        if (spReqDuration) {
                            networkTime = networkTime - parseInt(spReqDuration, 10);
                        }
                        break;
                    }
                }

                const { numTrees, numBlobs, encodedBlobsSize, decodedBlobsSize } = evalBlobsAndTrees(snapshot);
                const clientTime = networkTime ? overallTime - networkTime : undefined;

                // There are some scenarios in ODSP where we cannot cache, trees/latest will explicitly tell us when we
                // cannot cache using an HTTP response header.
                const canCache = response.headers.get("disablebrowsercachingofusercontent") !== "true";
                // There maybe no snapshot - TreesLatest would return just ops.
                const sequenceNumber: number = (snapshot.trees && (snapshot.trees[0] as any).sequenceNumber) ?? 0;
                const seqNumberFromOps = snapshot.ops && snapshot.ops.length > 0 ?
                    snapshot.ops[0].sequenceNumber - 1 :
                    undefined;

                const value: ISnapshotCacheValue = { snapshot, sequenceNumber };
                if (!Number.isInteger(sequenceNumber)
                    || seqNumberFromOps !== undefined && seqNumberFromOps !== sequenceNumber) {
                    logger.sendErrorEvent({ eventName: "fetchSnapshotError", sequenceNumber, seqNumberFromOps });
                    value.sequenceNumber = undefined;
                } else if (canCache) {
                    const fluidEpoch = response.headers.get("x-fluid-epoch");
                    assert(fluidEpoch !== undefined, 0x1e6 /* "Epoch  should be present in response" */);
                    const valueWithEpoch: IVersionedValueWithEpoch = {
                        value,
                        fluidEpoch,
                        version: 2,
                    };
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    putInCache(valueWithEpoch);
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
                    redirecttime: redirectTime,
                    dnsLookuptime: dnstime,
                    responsenetworkTime: responseTime,
                    tcphandshakeTime: tcpHandshakeTime,
                    secureconnectiontime: secureConntime,
                    fetchstarttorespendtime: fetchStToRespEndTime,
                    reqstarttorespendtime: reqStToRespEndTime,
                    overalltime: overallTime,
                    networktime: networkTime,
                    clienttime: clientTime,
                    // Sharing link telemetry regarding sharing link redeem status and performance. Ex: FRL; dur=100,
                    // FRS; desc=S, FRP; desc=False. Here, FRL is the duration taken for redeem, FRS is the redeem
                    // status (S means success), and FRP is a flag to indicate if the permission has changed.
                    sltelemetry: response.headers.get("x-fluid-sltelemetry"),
                    attempts: tokenFetchOptions.refresh ? 2 : 1,
                    ...response.commonSpoHeaders,
                });
                return value;
            },
        ).catch((error) => {
            // Issue #5895:
            // If we are offline, this error is retryable. But that means that RetriableDocumentStorageService
            // will run in circles calling getSnapshotTree, which would result in OdspDocumentStorageService class
            // going getVersions / individual blob download path. This path is very slow, and will not work with
            // delay-loaded data stores and ODSP storage deleting old snapshots and blobs.
            if (typeof error === "object" && error !== null) {
                error.canRetry = false;
                // We hit these errors in stress tests, under load
                // It's useful to try one more time in such case.
                // We might want to add DriverErrorType.offlineError in the future if we see evidence it happens
                // (not in "real" offline) and it actually helps.
                if (error.errorType === DriverErrorType.fetchFailure ||
                    error.errorType === OdspErrorType.fetchTimeout) {
                    error[getWithRetryForTokenRefreshRepeat] = true;
                }
            }
            throw error;
        });
    });
}

function evalBlobsAndTrees(snapshot: IOdspSnapshot) {
    let numTrees = 0;
    let numBlobs = 0;
    let encodedBlobsSize = 0;
    let decodedBlobsSize = 0;
    for (const tree of snapshot.trees) {
        for (const treeEntry of tree.entries) {
            if (treeEntry.type === "blob") {
                numBlobs++;
            } else if (treeEntry.type === "tree") {
                numTrees++;
            }
        }
    }
    if (snapshot.blobs !== undefined) {
        for (const blob of snapshot.blobs) {
            decodedBlobsSize += blob.size;
            encodedBlobsSize += blob.content.length;
        }
    }
    return { numTrees, numBlobs, encodedBlobsSize, decodedBlobsSize };
}

function isRedeemSharingLinkError(odspResolvedUrl: IOdspResolvedUrl, error: any) {
    if (odspResolvedUrl.sharingLinkToRedeem !== undefined
        && (typeof error === "object" && error !== null)
        && (error.errorType === DriverErrorType.authorizationError
        || error.errorType === DriverErrorType.fileNotFoundOrAccessDeniedError)) {
        return true;
    }
    return false;
}

function getEncodedShareUrl(url: string): string {
    /**
     * Encode the url to accepted format by Sharepoint
     * https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/shares_get
     */
    let encodedUrl = fromUtf8ToBase64(encodeURI(url));
    encodedUrl = encodedUrl
      .replace(/=+$/g, "")
      .replace(/\//g, "_")
      .replace(/\+/g, "-");
    encodedUrl = "u!".concat(encodedUrl);
    return encodedUrl;
}
