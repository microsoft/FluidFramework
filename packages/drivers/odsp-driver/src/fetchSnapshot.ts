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
    OdspErrorType,
    InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IOdspSnapshot, ISnapshotCachedEntry, IVersionedValueWithEpoch, persistedCacheValueVersion } from "./contracts";
import { getQueryString } from "./getQueryString";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import {
    fetchAndParseAsJSONHelper,
    fetchArray,
    getWithRetryForTokenRefresh,
    getWithRetryForTokenRefreshRepeat,
    IOdspResponse,
    ISnapshotContents,
} from "./odspUtils";
import { convertOdspSnapshotToSnapsohtTreeAndBlobs } from "./odspSnapshotParser";
import { parseCompactSnapshotResponse } from "./compactSnapshotParser";
import { ReadBuffer } from "./ReadBufferUtils";
import { EpochTracker } from "./epochTracker";

/**
 * Fetches a snapshot from the server with a given version id.
 * @param snapshotUrl - snapshot url from where the odsp snapshot will be fetched
 * @param token - token used for authorization in the request
 * @param storageFetchWrapper - Implementation of the get/post methods used to fetch the snapshot
 * @param versionId - id of specific snapshot to be fetched
 * @param fetchFullSnapshot - whether we want to fetch full snapshot(with blobs)
 * @param forceAccessTokenViaAuthorizationHeader - whether to force passing given token via authorization header
 * @returns A promise of the snapshot and the status code of the response
 */
export async function fetchSnapshot(
    snapshotUrl: string,
    token: string | null,
    versionId: string,
    fetchFullSnapshot: boolean,
    forceAccessTokenViaAuthorizationHeader: boolean,
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
    const { url, headers } = getUrlAndHeadersWithAuth(
        `${snapshotUrl}${path}${queryString}`, token, forceAccessTokenViaAuthorizationHeader);
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
    storageTokenFetcher: InstrumentedStorageTokenFetcher,
    snapshotOptions: ISnapshotOptions | undefined,
    forceAccessTokenViaAuthorizationHeader: boolean,
    logger: ITelemetryLogger,
    snapshotDownloader: (
            finalOdspResolvedUrl: IOdspResolvedUrl,
            storageToken: string,
            snapshotOptions: ISnapshotOptions | undefined,
            controller?: AbortController,
        ) => Promise<ISnapshotRequestAndResponseOptions>,
    putInCache: (valueWithEpoch: IVersionedValueWithEpoch) => Promise<void>,
    removeEntries: () => Promise<void>,
    enableRedeemFallback?: boolean,
): Promise<ISnapshotContents> {
    // back-compat: This block to be removed with #8784 when we only consume/consider odsp resolvers that are >= 0.51
    const sharingLinkToRedeem = (odspResolvedUrl as any).sharingLinkToRedeem;
    if(sharingLinkToRedeem) {
        odspResolvedUrl.shareLinkInfo = { ...odspResolvedUrl.shareLinkInfo, sharingLinkToRedeem };
    }

    return fetchLatestSnapshotCore(
        odspResolvedUrl,
        storageTokenFetcher,
        snapshotOptions,
        logger,
        snapshotDownloader,
        putInCache,
        enableRedeemFallback,
    ).catch(async (error) => {
        if (enableRedeemFallback && isRedeemSharingLinkError(odspResolvedUrl, error)) {
            // Execute the redeem fallback
            logger.sendErrorEvent({
                eventName: "RedeemFallback",
                errorType: error.errorType,
            }, error);
            await redeemSharingLink(
                odspResolvedUrl, storageTokenFetcher, logger, forceAccessTokenViaAuthorizationHeader);
            const odspResolvedUrlWithoutShareLink: IOdspResolvedUrl =
                { ...odspResolvedUrl,
                    shareLinkInfo: {
                        ...odspResolvedUrl.shareLinkInfo,
                        sharingLinkToRedeem: undefined,
                    },
                };

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
    storageTokenFetcher: InstrumentedStorageTokenFetcher,
    logger: ITelemetryLogger,
    forceAccessTokenViaAuthorizationHeader: boolean,
) {
    return PerformanceEvent.timedExecAsync(
        logger,
        {
            eventName: "RedeemShareLink",
        },
        async () => getWithRetryForTokenRefresh(async (tokenFetchOptions) => {
                assert(!!odspResolvedUrl.shareLinkInfo?.sharingLinkToRedeem,
                    0x1ed /* "Share link should be present" */);
                const storageToken = await storageTokenFetcher(tokenFetchOptions, "RedeemShareLink");
                const encodedShareUrl = getEncodedShareUrl(odspResolvedUrl.shareLinkInfo?.sharingLinkToRedeem);
                const redeemUrl = `${odspResolvedUrl.siteUrl}/_api/v2.0/shares/${encodedShareUrl}`;
                const { url, headers } = getUrlAndHeadersWithAuth(
                    redeemUrl, storageToken, forceAccessTokenViaAuthorizationHeader);
                headers.prefer = "redeemSharingLink";
                return fetchAndParseAsJSONHelper(url, { headers });
        }),
    );
}

async function fetchLatestSnapshotCore(
    odspResolvedUrl: IOdspResolvedUrl,
    storageTokenFetcher: InstrumentedStorageTokenFetcher,
    snapshotOptions: ISnapshotOptions | undefined,
    logger: ITelemetryLogger,
    snapshotDownloader: (
            finalOdspResolvedUrl: IOdspResolvedUrl,
            storageToken: string,
            snapshotOptions: ISnapshotOptions | undefined,
            controller?: AbortController,
        ) => Promise<ISnapshotRequestAndResponseOptions>,
    putInCache: (valueWithEpoch: IVersionedValueWithEpoch) => Promise<void>,
    enableRedeemFallback?: boolean,
): Promise<ISnapshotContents> {
    return getWithRetryForTokenRefresh(async (tokenFetchOptions) => {
        const storageToken = await storageTokenFetcher(tokenFetchOptions, "TreesLatest", true);
        assert(storageToken !== null, 0x1e5 /* "Storage token should not be null" */);

        let controller: AbortController | undefined;
        if (snapshotOptions?.timeout !== undefined) {
            controller = new AbortController();
            setTimeout(
                () => controller!.abort(),
                snapshotOptions.timeout,
            );
        }
        const perfEvent = {
            eventName: "TreesLatest",
            attempts: tokenFetchOptions.refresh ? 2 : 1,
            shareLinkPresent: odspResolvedUrl.shareLinkInfo?.sharingLinkToRedeem !== undefined,
            isSummarizer: odspResolvedUrl.summarizer,
            redeemFallbackEnabled: enableRedeemFallback,
        };
        if (snapshotOptions !== undefined) {
            Object.entries(snapshotOptions).forEach(([key, value]) => {
                if (value !== undefined) {
                    perfEvent[`snapshotOption_${key}`] = value;
                }
            });
        }
        // This event measures only successful cases of getLatest call (no tokens, no retries).
        return PerformanceEvent.timedExecAsync(
            logger,
            perfEvent,
            async (event) => {
                const response = await snapshotDownloader(
                    odspResolvedUrl,
                    storageToken,
                    snapshotOptions,
                    controller,
                );
                const snapshot = response.odspSnapshotResponse.content;
                // From: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming
                // fetchStart: immediately before the browser starts to fetch the resource.
                // requestStart: immediately before the browser starts requesting the resource from the server
                // responseStart: immediately after the browser receives the first byte of the response from the server.
                // responseEnd: immediately after the browser receives the last byte of the resource
                //              or immediately before the transport connection is closed, whichever comes first.
                // secureConnectionStart: immediately before the browser starts the handshake process to secure the
                //              current connection. If a secure connection is not used, this property returns zero.
                // startTime: Time when the resource fetch started. This value is equivalent to fetchStart.
                // domainLookupStart: immediately before the browser starts the domain name lookup for the resource.
                // domainLookupEnd: immediately after the browser finishes the domain name lookup for the resource.
                // redirectStart: start time of the fetch which that initiates the redirect.
                // redirectEnd: immediately after receiving the last byte of the response of the last redirect.
                let dnsLookupTime: number | undefined; // domainLookupEnd - domainLookupStart
                let redirectTime: number | undefined; // redirectEnd - redirectStart
                let tcpHandshakeTime: number | undefined; // connectEnd  - connectStart
                let secureConnectionTime: number | undefined; // connectEnd  - secureConnectionStart
                let responseNetworkTime: number | undefined; // responsEnd - responseStart
                let fetchStartToResponseEndTime: number | undefined; // responseEnd  - fetchStart
                let reqStartToResponseEndTime: number | undefined; // responseEnd - requestStart
                let networkTime: number | undefined; // responseEnd - startTime
                const spReqDuration = response.odspSnapshotResponse.headers.get("sprequestduration");

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
                        dnsLookupTime = indResTime.domainLookupEnd - indResTime.domainLookupStart;
                        tcpHandshakeTime = indResTime.connectEnd - indResTime.connectStart;
                        secureConnectionTime = (indResTime.secureConnectionStart > 0) ?
                            (indResTime.connectEnd - indResTime.secureConnectionStart) : undefined;
                        responseNetworkTime = (indResTime.responseStart > 0) ?
                            (indResTime.responseEnd - indResTime.responseStart) : undefined;
                        fetchStartToResponseEndTime = (indResTime.fetchStart > 0) ?
                            (indResTime.responseEnd - indResTime.fetchStart) : undefined;
                        reqStartToResponseEndTime = (indResTime.requestStart > 0) ?
                            (indResTime.responseEnd - indResTime.requestStart) : undefined;
                        networkTime = (indResTime.startTime > 0) ?
                            (indResTime.responseEnd - indResTime.fetchStart) : undefined;
                        if (spReqDuration !== undefined && networkTime !== undefined) {
                            networkTime = networkTime - parseInt(spReqDuration, 10);
                        }
                        break;
                    }
                }

                const { numTrees, numBlobs, encodedBlobsSize } =
                    validateAndEvalBlobsAndTrees(response.odspSnapshotResponse.content);

                // There are some scenarios in ODSP where we cannot cache, trees/latest will explicitly tell us when we
                // cannot cache using an HTTP response header.
                const canCache =
                    response.odspSnapshotResponse.headers.get("disablebrowsercachingofusercontent") !== "true";
                const sequenceNumber: number = snapshot.sequenceNumber ?? 0;
                const seqNumberFromOps = snapshot.ops && snapshot.ops.length > 0 ?
                    snapshot.ops[0].sequenceNumber - 1 :
                    undefined;

                if (!Number.isInteger(sequenceNumber)
                    || seqNumberFromOps !== undefined && seqNumberFromOps !== sequenceNumber) {
                    logger.sendErrorEvent({ eventName: "fetchSnapshotError", sequenceNumber, seqNumberFromOps });
                    snapshot.sequenceNumber = undefined;
                } else if (canCache) {
                    const fluidEpoch = response.odspSnapshotResponse.headers.get("x-fluid-epoch");
                    assert(fluidEpoch !== undefined, 0x1e6 /* "Epoch  should be present in response" */);
                    const value: ISnapshotCachedEntry = {
                        ...snapshot,
                        cacheEntryTime: Date.now(),
                    };
                    const valueWithEpoch: IVersionedValueWithEpoch = {
                        value,
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
                    // Interval between the first fetch until the last byte of the last redirect.
                    redirectTime,
                    // Interval between start and finish of the domain name lookup for the resource.
                    dnsLookupTime,
                    // Interval to receive all (first to last) bytes form the server.
                    responseNetworkTime,
                    // Time to establish the connection to the server to retrieve the resource.
                    tcpHandshakeTime,
                    // Time from the end of the connection until the inital handshake process to secure the connection.
                    secureConnectionTime,
                    // Interval between the initial fetch until the last byte is received.
                    fetchStartToResponseEndTime,
                    // Interval between starting the request for the resource until receiving the last byte.
                    reqStartToResponseEndTime,
                    // Interval between starting the request for the resource until receiving the last byte but
                    // excluding the Snaphot request duration indicated on the snapshot response header.
                    networkTime,
                    // Sharing link telemetry regarding sharing link redeem status and performance. Ex: FRL; dur=100,
                    // Azure Fluid Relay service; desc=S, FRP; desc=False. Here, FRL is the duration taken for redeem,
                    // Azure Fluid Relay service is the redeem status (S means success), and FRP is a flag to indicate
                    // if the permission has changed.
                    sltelemetry: response.odspSnapshotResponse.headers.get("x-fluid-sltelemetry"),
                    ...response.odspSnapshotResponse.propsToLog,
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
    odspSnapshotResponse: IOdspResponse<ISnapshotContents>,
    requestUrl: string,
    requestHeaders: {[index: string]: any},
}

/**
 * This function fetches the older snapshot format which is the json format(IOdspSnapshot).
 * @param odspResolvedUrl - resolved odsp url.
 * @param storageToken - token to do the auth for network request.
 * @param snapshotOptions - Options used to specify how and what to fetch in the snapshot.
 * @param controller - abort controller if caller needs to abort the network call.
 * @param epochTracker - epoch tracker used to add/validate epoch in the network call.
 * @returns fetched snapshot.
 */
async function fetchSnapshotContentsCoreV1(
    odspResolvedUrl: IOdspResolvedUrl,
    storageToken: string,
    snapshotOptions: ISnapshotOptions | undefined,
    controller?: AbortController,
    epochTracker?: EpochTracker,
): Promise<ISnapshotRequestAndResponseOptions> {
    const snapshotUrl = odspResolvedUrl.endpoints.snapshotStorageUrl;
    const url = `${snapshotUrl}/trees/latest?ump=1`;
    // The location of file can move on Spo in which case server returns 308(Permanent Redirect) error.
    // Adding below header will make VROOM API return 404 instead of 308 and browser can intercept it.
    // This error thrown by server will contain the new redirect location. Look at the 404 error parsing
    // for futher reference here: \packages\utils\odsp-doclib-utils\src\odspErrorUtils.ts
    const header = { prefer: "manualredirect" };
    const { body, headers } = getFormBodyAndHeaders(
        odspResolvedUrl, storageToken, snapshotOptions, header);
    headers.accept = "application/json";
    const fetchOptions = {
        body,
        headers,
        signal: controller?.signal,
        method: "POST",
    };
    const response = await (epochTracker?.fetchAndParseAsJSON<IOdspSnapshot>(url, fetchOptions, "treesLatest", true) ??
        fetchAndParseAsJSONHelper<IOdspSnapshot>(url, fetchOptions));
    const snapshotContents: ISnapshotContents = convertOdspSnapshotToSnapsohtTreeAndBlobs(response.content);
    const finalSnapshotContents: IOdspResponse<ISnapshotContents> = { ...response, content: snapshotContents };
    return {
        odspSnapshotResponse: finalSnapshotContents,
        requestHeaders: headers,
        requestUrl: url,
    };
}

/**
 * This function fetches the binary compact snapshot format. This is an experimental feature
 * and is behind a feature flag.
 * @param odspResolvedUrl - resolved odsp url.
 * @param storageToken - token to do the auth for network request.
 * @param snapshotOptions - Options used to specify how and what to fetch in the snapshot.
 * @param controller - abort controller if caller needs to abort the network call.
 * @param epochTracker - epoch tracker used to add/validate epoch in the network call.
 * @returns fetched snapshot.
 */
async function fetchSnapshotContentsCoreV2(
    odspResolvedUrl: IOdspResolvedUrl,
    storageToken: string,
    snapshotOptions: ISnapshotOptions | undefined,
    controller?: AbortController,
    epochTracker?: EpochTracker,
): Promise<ISnapshotRequestAndResponseOptions> {
    const fullUrl = `${odspResolvedUrl.siteUrl}/_api/v2.1/drives/${odspResolvedUrl.driveId}/items/${
        odspResolvedUrl.itemId}/opStream/attachments/latest/content?ump=1`;

    const { body, headers } = getFormBodyAndHeaders(odspResolvedUrl, storageToken, snapshotOptions);
    const fetchOptions = {
        body,
        headers,
        signal: controller?.signal,
        method: "POST",
    };

    const response = await (epochTracker?.fetchArray(fullUrl, fetchOptions, "treesLatest", true) ??
        fetchArray(fullUrl, fetchOptions));
    const snapshotContents: ISnapshotContents = parseCompactSnapshotResponse(
        new ReadBuffer(new Uint8Array(response.content)));
    const finalSnapshotContents: IOdspResponse<ISnapshotContents> = { ...response, content: snapshotContents };
    return {
        odspSnapshotResponse: finalSnapshotContents,
        requestHeaders: headers,
        requestUrl: fullUrl,
    };
}

function getFormBodyAndHeaders(
    odspResolvedUrl: IOdspResolvedUrl,
    storageToken: string,
    snapshotOptions: ISnapshotOptions | undefined,
    headers?: {[index: string]: string},
) {
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
    if (headers !== undefined) {
        Object.entries(headers).forEach(([key, value]) => {
            if (value !== undefined) {
                formParams.push(`${key}: ${value}`);
            }
        });
    }
    if (odspResolvedUrl.shareLinkInfo?.sharingLinkToRedeem) {
        formParams.push(`sl: ${odspResolvedUrl.shareLinkInfo?.sharingLinkToRedeem}`);
    }
    formParams.push(`_post: 1`);
    formParams.push(`\r\n--${formBoundary}--`);
    const postBody = formParams.join("\r\n");
    const header: {[index: string]: any} = {
        "Content-Type": `multipart/form-data;boundary=${formBoundary}`,
    };
    return { body: postBody, headers: header };
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

export async function downloadSnapshot(
    odspResolvedUrl: IOdspResolvedUrl,
    storageToken: string,
    logger: ITelemetryLogger,
    snapshotOptions: ISnapshotOptions | undefined,
    fetchBinarySnapshotFormat?: boolean,
    controller?: AbortController,
    epochTracker?: EpochTracker,
): Promise<ISnapshotRequestAndResponseOptions> {
    // back-compat: This block to be removed with #8784 when we only consume/consider odsp resolvers that are >= 0.51
    const sharingLinkToRedeem = (odspResolvedUrl as any).sharingLinkToRedeem;
    if(sharingLinkToRedeem) {
        odspResolvedUrl.shareLinkInfo = { ...odspResolvedUrl.shareLinkInfo, sharingLinkToRedeem };
    }

    if (fetchBinarySnapshotFormat) {
        // Logging an event here as it is not supposed to be used in production yet and only in experimental mode.
        logger.sendTelemetryEvent({ eventName: "BinarySnapshotFetched" });
        return fetchSnapshotContentsCoreV2(odspResolvedUrl, storageToken, snapshotOptions, controller, epochTracker);
    } else {
        return fetchSnapshotContentsCoreV1(odspResolvedUrl, storageToken, snapshotOptions, controller, epochTracker);
    }
}

function isRedeemSharingLinkError(odspResolvedUrl: IOdspResolvedUrl, error: any) {
    if (odspResolvedUrl.shareLinkInfo?.sharingLinkToRedeem !== undefined
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
