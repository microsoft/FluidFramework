/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties, ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { IResolvedUrl, DriverErrorType } from "@fluidframework/driver-definitions";
import { isOnline, OnlineStatus } from "@fluidframework/driver-utils";
import { assert, performance } from "@fluidframework/common-utils";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    fetchIncorrectResponse,
    offlineFetchFailureStatusCode,
    fetchFailureStatusCode,
    fetchTimeoutStatusCode,
    throwOdspNetworkError,
    getSPOAndGraphRequestIdsFromResponse,
    fetchTokenErrorCode,
} from "@fluidframework/odsp-doclib-utils";
import {
    IOdspResolvedUrl,
    TokenFetchOptions,
    OdspErrorType,
    tokenFromResponse,
    isTokenFromCache,
    OdspResourceTokenFetchOptions,
    TokenFetcher,
} from "@fluidframework/odsp-driver-definitions";
import { fetch } from "./fetch";
import { RateLimiter } from "./rateLimiter";
import { pkgVersion } from "./packageVersion";
import { IOdspSnapshot } from "./contracts";

/** Parse the given url and return the origin (host name) */
export const getOrigin = (url: string) => new URL(url).origin;

export interface ISnapshotCacheValue {
    snapshot: IOdspSnapshot;
    sequenceNumber: number | undefined;
}

export interface IOdspResponse<T> {
    content: T;
    headers: Map<string, string>;
    commonSpoHeaders: ITelemetryProperties;
    duration: number,
}

function headersToMap(headers: Headers) {
    const newHeaders = new Map<string, string>();
    for (const [key, value] of headers.entries()) {
        newHeaders.set(key, value);
    }
    return newHeaders;
}

/**
 * This API should be used with pretty much all network calls (fetch, webSocket connection) in order
 * to correctly handle expired tokens. It relies on callback fetching token, and be able to refetch
 * token on failure. Only specific cases get retry call with refresh = true, all other / unknown errors
 * simply propagate to caller
 */
export async function getWithRetryForTokenRefresh<T>(get: (options: TokenFetchOptions) => Promise<T>) {
    return get({ refresh: false }).catch(async (e) => {
        switch (e.errorType) {
            // If the error is 401 or 403 refresh the token and try once more.
            case DriverErrorType.authorizationError:
                return get({ refresh: true, claims: e.claims, tenantId: e.tenantId });
            // fetchIncorrectResponse indicates some error on the wire, retry once.
            case DriverErrorType.incorrectServerResponse:
            // If the token was null, then retry once.
            case OdspErrorType.fetchTokenError:
                return get({ refresh: true });
            default:
                // All code paths (deltas, blobs, trees) already throw exceptions.
                // Throwing is better than returning null as most code paths do not return nullable-objects,
                // and error reporting is better (for example, getDeltas() will log error to telemetry)
                // getTree() path is the only potential exception where returning null might result in
                // document being opened, though there maybe really bad user experience (consuming thousands of ops)
                throw e;
        }
    });
}

export async function fetchHelper(
    requestInfo: RequestInfo,
    requestInit: RequestInit | undefined,
): Promise<IOdspResponse<Response>> {
    const start = performance.now();

    // Node-fetch and dom have conflicting typing, force them to work by casting for now
    return fetch(requestInfo, requestInit).then(async (fetchResponse) => {
        const response = fetchResponse as any as Response;
        // Let's assume we can retry.
        if (!response) {
            throwOdspNetworkError(`No response from the server`, fetchIncorrectResponse);
        }
        if (!response.ok || response.status < 200 || response.status >= 300) {
            throwOdspNetworkError(
                `Error ${response.status}`, response.status, response, await response.text());
        }

        const headers = headersToMap(response.headers);
        return {
            content: response,
            headers,
            commonSpoHeaders: getSPOAndGraphRequestIdsFromResponse(headers),
            duration: performance.now() - start,
        };
    }, (error) => {
        // While we do not know for sure whether computer is offline, this error is not actionable and
        // is pretty good indicator we are offline. Treating it as offline scenario will make it
        // easier to see other errors in telemetry.
        let online = isOnline();
        const errorText = `${error}`;
        if (errorText === "TypeError: Failed to fetch") {
            online = OnlineStatus.Offline;
        }
        if (error.name === "AbortError") {
            throwOdspNetworkError("Timeout during fetch", fetchTimeoutStatusCode);
        }
        if (errorText.indexOf("ETIMEDOUT") !== -1) {
            throwOdspNetworkError("Timeout during fetch (ETIMEDOUT)", fetchTimeoutStatusCode);
        }

        //
        // WARNING: Do not log error object itself or any of its properties!
        // It could container PII, like URI in message itself, or token in properties.
        // It is also non-serializable object due to circular references.
        //
        throwOdspNetworkError(
            `Fetch error`,
            online === OnlineStatus.Offline ? offlineFetchFailureStatusCode : fetchFailureStatusCode,
            undefined, // response
        );
    });
}

/**
 * A utility function to fetch and parse as JSON with support for retries
 * @param requestInfo - fetch requestInfo, can be a string
 * @param requestInit - fetch requestInit
 */
export async function fetchArray(
    requestInfo: RequestInfo,
    requestInit: RequestInit | undefined,
    rateLimiter: RateLimiter,
): Promise<IOdspResponse<ArrayBuffer>> {
    const { content, headers, commonSpoHeaders, duration } = await rateLimiter.schedule(
        async () => fetchHelper(requestInfo, requestInit),
    );

    const arrayBuffer = await content.arrayBuffer();
    commonSpoHeaders.bodySize = arrayBuffer.byteLength;
    return {
        headers,
        content: arrayBuffer,
        commonSpoHeaders,
        duration,
    };
}

/**
 * A utility function to fetch and parse as JSON with support for retries
 * @param requestInfo - fetch requestInfo, can be a string
 * @param requestInit - fetch requestInit
 */
export async function fetchAndParseAsJSONHelper<T>(
    requestInfo: RequestInfo,
    requestInit: RequestInit | undefined,
): Promise<IOdspResponse<T>> {
    const { content, headers, commonSpoHeaders, duration } = await fetchHelper(requestInfo, requestInit);
    // JSON.parse() can fail and message (that goes into telemetry) would container full request URI, including
    // tokens... It fails for me with "Unexpected end of JSON input" quite often - an attempt to download big file
    // (many ops) almost always ends up with this error - I'd guess 1% of op request end up here... It always
    // succeeds on retry.
    try {
        const text = await content.text();

        commonSpoHeaders.bodySize = text.length;
        const res = {
            headers,
            content: JSON.parse(text),
            commonSpoHeaders,
            duration,
        };
        return res;
    } catch (e) {
        throwOdspNetworkError(`Error while parsing fetch response: ${e}`, fetchIncorrectResponse, content);
    }
}

export interface INewFileInfo {
    siteUrl: string;
    driveId: string;
    filename: string;
    filePath: string;
}

export function getOdspResolvedUrl(resolvedUrl: IResolvedUrl): IOdspResolvedUrl {
    assert((resolvedUrl as IOdspResolvedUrl).odspResolvedUrl === true, 0x1de /* "Not an ODSP resolved url" */);
    return resolvedUrl as IOdspResolvedUrl;
}

export const createOdspLogger = (logger?: ITelemetryBaseLogger) =>
    ChildLogger.create(
        logger,
        "OdspDriver",
        { all :
            {
                driverVersion: pkgVersion,
            },
        });

export function evalBlobsAndTrees(snapshot: IOdspSnapshot) {
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

export function toInstrumentedOdspTokenFetcher(
    logger: ITelemetryLogger,
    resolvedUrl: IOdspResolvedUrl,
    tokenFetcher: TokenFetcher<OdspResourceTokenFetchOptions>,
    throwOnNullToken: boolean,
): (options: TokenFetchOptions, name: string) => Promise<string | null> {
    return async (options: TokenFetchOptions, name: string) => {
        // Telemetry note: if options.refresh is true, there is a potential perf issue:
        // Host should optimize and provide non-expired tokens on all critical paths.
        // Exceptions: race conditions around expiration, revoked tokens, host that does not care
        // (fluid-fetcher)
        return PerformanceEvent.timedExecAsync(
            logger,
            {
                eventName: `${name}_GetToken`,
                attempts: options.refresh ? 2 : 1,
                hasClaims: !!options.claims,
                hasTenantId: !!options.tenantId,
            },
            async (event) => tokenFetcher({
                ...options,
                siteUrl: resolvedUrl.siteUrl,
                driveId: resolvedUrl.driveId,
                itemId: resolvedUrl.itemId,
            }).then((tokenResponse) => {
                const token = tokenFromResponse(tokenResponse);
                // This event alone generates so many events that is materially impacts cost of telemetry
                // Thus do not report end event when it comes back quickly.
                // Note that most of the hosts do not report if result is comming from cache or not,
                // so we can't rely on that here
                if (event.duration >= 32) {
                    event.end({ fromCache: isTokenFromCache(tokenResponse), isNull: token === null });
                }
                if (token === null && throwOnNullToken) {
                    throwOdspNetworkError(`${name} Token is null`, fetchTokenErrorCode);
                }
                return token;
            }),
            { cancel: "generic" });
    };
}
