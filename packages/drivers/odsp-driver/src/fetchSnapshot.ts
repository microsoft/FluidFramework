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
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IOdspSnapshot, IVersionedValueWithEpoch, persistedCacheValueVersion } from "./contracts";
import { getQueryString } from "./getQueryString";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import {
    fetchAndParseAsJSONHelper,
    getWithRetryForTokenRefresh,
    getWithRetryForTokenRefreshRepeat,
    IOdspResponse,
    ISnapshotContents,
} from "./odspUtils";
import { convertOdspSnapshotToSnapsohtTreeAndBlobs } from "./odspSnapshotParser";
import { parseCompactSnapshotResponse } from "./compactSnapshotParser";
import { ReadBuffer } from "./ReadBufferUtils";

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
    snapshotDownloader: (url: string, fetchOptions: {[index: string]: any}) => Promise<IOdspResponse<unknown>>,
): Promise<ISnapshotContents> {
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
    const response = await PerformanceEvent.timedExecAsync(
        logger,
        {
            eventName: "fetchSnapshot",
            headers: Object.keys(headers).length !== 0 ? true : undefined,
        },
        async () => snapshotDownloader(url, { headers }),
    ) as IOdspResponse<IOdspSnapshot>;
    return convertOdspSnapshotToSnapsohtTreeAndBlobs(response.content);
}

export async function fetchSnapshotWithRedeem(
    odspResolvedUrl: IOdspResolvedUrl,
    storageTokenFetcher: (options: TokenFetchOptions, name: string) => Promise<string | null>,
    snapshotOptions: ISnapshotOptions | undefined,
    logger: ITelemetryLogger,
    snapshotDownloader: (url: string, fetchOptions: {[index: string]: any}) => Promise<IOdspResponse<unknown>>,
    putInCache: (valueWithEpoch: IVersionedValueWithEpoch) => Promise<void>,
    removeEntries: () => Promise<void>,
    enableRedeemFallback?: boolean,
    fetchBinarySnapshotFormat?: boolean,
): Promise<ISnapshotContents> {
    return fetchLatestSnapshotCore(
        odspResolvedUrl,
        storageTokenFetcher,
        snapshotOptions,
        logger,
        snapshotDownloader,
        putInCache,
        fetchBinarySnapshotFormat,
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
                fetchBinarySnapshotFormat,
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
    snapshotDownloader: (url: string, fetchOptions: {[index: string]: any}) => Promise<IOdspResponse<unknown>>,
    putInCache: (valueWithEpoch: IVersionedValueWithEpoch) => Promise<void>,
    fetchBinarySnapshotFormat?: boolean,
): Promise<ISnapshotContents> {
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
        const storageToken = await storageTokenFetcher(tokenFetchOptions, "TreesLatest");
        assert(storageToken !== null, 0x1e5 /* "Storage token should not be null" */);

        let controller: AbortController | undefined;
        if (snapshotOptions?.timeout !== undefined) {
            controller = new AbortController();
            setTimeout(
                () => controller!.abort(),
                snapshotOptions.timeout,
            );
        }
        const logOptions = {};
        if (snapshotOptions !== undefined) {
            Object.entries(snapshotOptions).forEach(([key, value]) => {
                if (value !== undefined) {
                    logOptions[`snapshotOption_${key}`] = value;
                }
            });
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
                const response = fetchBinarySnapshotFormat ? await fetchSnapshotContentsCoreV2(
                    odspResolvedUrl,
                    storageToken,
                    snapshotOptions,
                    snapshotDownloader,
                    controller,
                ) : await fetchSnapshotContentsCoreV1(
                    odspResolvedUrl,
                    storageToken,
                    snapshotOptions,
                    snapshotDownloader,
                    controller,
                );
                const endTime = performance.now();
                const overallTime = endTime - startTime;
                const snapshot = response.response.content;
                let dnstime: number | undefined; // domainLookupEnd - domainLookupStart
                let redirectTime: number | undefined; // redirectEnd -redirectStart
                let tcpHandshakeTime: number | undefined; // connectEnd  - connectStart
                let secureConntime: number | undefined; // connectEnd  - secureConnectionStart
                let responseTime: number | undefined; // responsEnd - responseStart
                let fetchStToRespEndTime: number | undefined; // responseEnd  - fetchStart
                let reqStToRespEndTime: number | undefined; // responseEnd - requestStart
                let networkTime: number | undefined; // responseEnd - startTime
                const spReqDuration = response.response.headers.get("sprequestduration");

                // getEntriesByType is only available in browser performance object
                const resources1 = performance.getEntriesByType?.("resource") ?? [];
                // Usually the latest fetch call is to the end of resources, so we start from the end.
                for (let i = resources1.length - 1; i > 0; i--) {
                    const indResTime = resources1[i] as PerformanceResourceTiming;
                    const resource_name = indResTime.name;
                    const resource_initiatortype = indResTime.initiatorType;
                    if ((resource_initiatortype.localeCompare("fetch") === 0)
                        && (resource_name.localeCompare(response.requestUrl) === 0)) {
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

                const { numTrees, numBlobs, encodedBlobsSize } =
                    validateAndEvalBlobsAndTrees(response.response.content);
                const clientTime = networkTime ? overallTime - networkTime : undefined;

                // There are some scenarios in ODSP where we cannot cache, trees/latest will explicitly tell us when we
                // cannot cache using an HTTP response header.
                const canCache = response.response.headers.get("disablebrowsercachingofusercontent") !== "true";
                const sequenceNumber: number = snapshot.sequenceNumber ?? 0;
                const seqNumberFromOps = snapshot.ops && snapshot.ops.length > 0 ?
                    snapshot.ops[0].sequenceNumber - 1 :
                    undefined;

                if (!Number.isInteger(sequenceNumber)
                    || seqNumberFromOps !== undefined && seqNumberFromOps !== sequenceNumber) {
                    logger.sendErrorEvent({ eventName: "fetchSnapshotError", sequenceNumber, seqNumberFromOps });
                    snapshot.sequenceNumber = undefined;
                } else if (canCache) {
                    const fluidEpoch = response.response.headers.get("x-fluid-epoch");
                    assert(fluidEpoch !== undefined, 0x1e6 /* "Epoch  should be present in response" */);
                    const valueWithEpoch: IVersionedValueWithEpoch = {
                        value: snapshot,
                        fluidEpoch,
                        version: persistedCacheValueVersion,
                    };
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    putInCache(valueWithEpoch);
                }
                event.end({
                    trees: numTrees,
                    blobs: snapshot.blobs?.size ?? 0,
                    leafNodes: numBlobs,
                    encodedBlobsSize,
                    sequenceNumber,
                    ops: snapshot.ops?.length ?? 0,
                    headers: Object.keys(response.requestHeaders).length !== 0 ? true : undefined,
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
                    sltelemetry: response.response.headers.get("x-fluid-sltelemetry"),
                    attempts: tokenFetchOptions.refresh ? 2 : 1,
                    ...response.response.commonSpoHeaders,
                });
                return snapshot;
            },
        ).catch((error) => {
            // We hit these errors in stress tests, under load
            // It's useful to try one more time in such case.
            // We might want to add DriverErrorType.offlineError in the future if we see evidence it happens
            // (not in "real" offline) and it actually helps.
            if (typeof error === "object" && error !== null && (error.errorType === DriverErrorType.fetchFailure ||
                error.errorType === OdspErrorType.fetchTimeout)) {
                error[getWithRetryForTokenRefreshRepeat] = true;
            }
            throw error;
        });
    });
}

interface ISnapshotRequestAndResponseOptions {
    response: IOdspResponse<ISnapshotContents>,
    requestUrl: string,
    requestHeaders: {[index: string]: any},
}

async function fetchSnapshotContentsCoreV1(
    odspResolvedUrl: IOdspResolvedUrl,
    storageToken: string,
    snapshotOptions: ISnapshotOptions | undefined,
    snapshotDownloader: (url: string, fetchOptions: {[index: string]: any}) => Promise<IOdspResponse<unknown>>,
    controller?: AbortController,
): Promise<ISnapshotRequestAndResponseOptions> {
    const snapshotUrl = odspResolvedUrl.endpoints.snapshotStorageUrl;
    const url = `${snapshotUrl}/trees/latest?ump=1`;
    const formBoundary = uuid();
    const formParams: string[] = [];
    formParams.push(`--${formBoundary}`);
    formParams.push(`Authorization: Bearer ${storageToken}`);
    formParams.push(`X-HTTP-Method-Override: GET`);
    if (snapshotOptions !== undefined) {
        Object.entries(snapshotOptions).forEach(([key, value]) => {
            if (value !== undefined) {
                formParams.push(`${key}: ${value}`);
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

    const response = await snapshotDownloader(
        url,
        {
            body: postBody,
            headers,
            signal: controller?.signal,
            method: "POST",
        },
    ) as IOdspResponse<IOdspSnapshot>;
    const snapshotContents: ISnapshotContents = convertOdspSnapshotToSnapsohtTreeAndBlobs(response.content);
    const finalSnapshotContents: IOdspResponse<ISnapshotContents> = { ...response, content: snapshotContents };
    return  {
        response: finalSnapshotContents,
        requestHeaders: headers,
        requestUrl: url,
    };
}

async function fetchSnapshotContentsCoreV2(
    odspResolvedUrl: IOdspResolvedUrl,
    storageToken: string,
    snapshotOptions: ISnapshotOptions | undefined,
    snapshotDownloader: (url: string, fetchOptions: {[index: string]: any}) => Promise<IOdspResponse<unknown>>,
    controller?: AbortController,
): Promise<ISnapshotRequestAndResponseOptions> {
    const fullUrl = `${odspResolvedUrl.siteUrl}/_api/v2.1/drives/${odspResolvedUrl.driveId}/items/${
        odspResolvedUrl.itemId}/opStream/attachments/latest/content`;
    const queryParams = { ...snapshotOptions };
    if (odspResolvedUrl.sharingLinkToRedeem) {
        // eslint-disable-next-line @typescript-eslint/dot-notation
        queryParams["sl"] = odspResolvedUrl.sharingLinkToRedeem;
    }
    const queryString = getQueryString(queryParams);
    const { url, headers } = getUrlAndHeadersWithAuth(`${fullUrl}${queryString}`, storageToken);
    const response = await snapshotDownloader(
        url,
        {
            headers,
            signal: controller?.signal,
        },
    ) as IOdspResponse<ArrayBuffer>;
    const snapshotContents: ISnapshotContents = parseCompactSnapshotResponse(
        new ReadBuffer(new Uint8Array(response.content)));
    const finalSnapshotContents: IOdspResponse<ISnapshotContents> = { ...response, content: snapshotContents };
    return  {
        response: finalSnapshotContents,
        requestHeaders: headers,
        requestUrl: url,
    };
}

function validateAndEvalBlobsAndTrees(snapshot: ISnapshotContents) {
    assert(snapshot.snapshotTree !== undefined,
        0x200 /* "Returned odsp snapshot is malformed. No trees!" */);
    assert(snapshot.blobs !== undefined,
        0x201 /* "Returned odsp snapshot is malformed. No blobs!" */);
    const numTrees = countTreesInSnapshotTree(snapshot.snapshotTree);
    const numBlobs = snapshot.blobs.size;
    let encodedBlobsSize = 0;
    for (const [_, blobContent] of snapshot.blobs) {
        encodedBlobsSize += blobContent.byteLength;
    }
    return { numTrees, numBlobs, encodedBlobsSize };
}

function countTreesInSnapshotTree(snapshotTree: ISnapshotTree): number {
    let numTrees = 0;
    for (const [_, tree] of Object.entries(snapshotTree.trees)) {
        numTrees += 1;
        numTrees += countTreesInSnapshotTree(tree);
    }
    return numTrees;
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
