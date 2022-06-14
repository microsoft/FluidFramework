/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties, ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { IResolvedUrl, DriverErrorType } from "@fluidframework/driver-definitions";
import {
    isOnline,
    OnlineStatus,
    RetryableError,
    NonRetryableError,
    NetworkErrorBasic,
} from "@fluidframework/driver-utils";
import { assert, performance } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { ChildLogger, PerformanceEvent, wrapError } from "@fluidframework/telemetry-utils";
import {
    fetchIncorrectResponse,
    throwOdspNetworkError,
    getSPOAndGraphRequestIdsFromResponse,
} from "@fluidframework/odsp-doclib-utils";
import {
    IOdspResolvedUrl,
    TokenFetchOptions,
    OdspErrorType,
    tokenFromResponse,
    isTokenFromCache,
    OdspResourceTokenFetchOptions,
    ShareLinkTypes,
    TokenFetcher,
    ICacheEntry,
    snapshotKey,
    InstrumentedStorageTokenFetcher,
    IOdspUrlParts,
} from "@fluidframework/odsp-driver-definitions";
import { fetch } from "./fetch";
import { pkgVersion as driverVersion } from "./packageVersion";
import { IOdspSnapshot } from "./contracts";

export const getWithRetryForTokenRefreshRepeat = "getWithRetryForTokenRefreshRepeat";

/** Parse the given url and return the origin (host name) */
export const getOrigin = (url: string) => new URL(url).origin;

export interface ISnapshotContents {
    snapshotTree: ISnapshotTree;
    blobs: Map<string, ArrayBuffer>;
    ops: ISequencedDocumentMessage[];
    sequenceNumber: number | undefined;
}

export interface IOdspResponse<T> {
    content: T;
    headers: Map<string, string>;
    propsToLog: ITelemetryProperties;
    duration: number;
}

export interface TokenFetchOptionsEx extends TokenFetchOptions {
    /** previous error we hit in getWithRetryForTokenRefresh */
    previousError?: any;
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
export async function getWithRetryForTokenRefresh<T>(get: (options: TokenFetchOptionsEx) => Promise<T>) {
    return get({ refresh: false }).catch(async (e) => {
        const options: TokenFetchOptionsEx = { refresh: true, previousError: e };
        switch (e.errorType) {
            // If the error is 401 or 403 refresh the token and try once more.
            case DriverErrorType.authorizationError:
                return get({ ...options, claims: e.claims, tenantId: e.tenantId });

            case DriverErrorType.incorrectServerResponse: // some error on the wire, retry once
            case OdspErrorType.fetchTokenError: // If the token was null, then retry once.
                return get(options);

            default:
                // Caller may determine that it wants one retry
                if (e[getWithRetryForTokenRefreshRepeat] === true) {
                    return get(options);
                }
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
            throw new NonRetryableError(
                // pre-0.58 error message: No response from fetch call
                "No response from ODSP fetch call",
                DriverErrorType.incorrectServerResponse,
                { driverVersion });
        }
        if (!response.ok || response.status < 200 || response.status >= 300) {
            throwOdspNetworkError(
                // pre-0.58 error message prefix: odspFetchError
                `ODSP fetch error [${response.status}]`, response.status, response, await response.text());
        }

        const headers = headersToMap(response.headers);
        return {
            content: response,
            headers,
            propsToLog: getSPOAndGraphRequestIdsFromResponse(headers),
            duration: performance.now() - start,
        };
    }, (error) => {
        const online = isOnline();
        const errorText = `${error}`;

        // This error is thrown by fetch() when AbortSignal is provided and it gets cancelled
        if (error.name === "AbortError") {
            throw new RetryableError(
                "Fetch Timeout (AbortError)", OdspErrorType.fetchTimeout, { driverVersion });
        }
        // TCP/IP timeout
        if (errorText.includes("ETIMEDOUT")) {
            throw new RetryableError(
                "Fetch Timeout (ETIMEDOUT)", OdspErrorType.fetchTimeout, { driverVersion });
        }

        //
        // WARNING: Do not log error object itself or any of its properties!
        // It could contain PII, like URI in message itself, or token in properties.
        // It is also non-serializable object due to circular references.
        //
        if (online === OnlineStatus.Offline) {
            throw new RetryableError(
                // pre-0.58 error message prefix: Offline
                `ODSP fetch failure (Offline): ${errorText}`, DriverErrorType.offlineError, { driverVersion });
        } else {
            // It is perhaps still possible that this is due to being offline, the error does not reveal enough
            // information to conclude.  Could also be DNS errors, malformed fetch request, CSP violation, etc.
            throw new RetryableError(
                // pre-0.58 error message prefix: Fetch error
                `ODSP fetch failure: ${errorText}`, DriverErrorType.fetchFailure, { driverVersion });
        }
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
): Promise<IOdspResponse<ArrayBuffer>> {
    const { content, headers, propsToLog, duration } = await fetchHelper(requestInfo, requestInit);

    const arrayBuffer = await content.arrayBuffer();
    propsToLog.bodySize = arrayBuffer.byteLength;
    return {
        headers,
        content: arrayBuffer,
        propsToLog,
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
    const { content, headers, propsToLog, duration } = await fetchHelper(requestInfo, requestInit);
    let text: string | undefined;
    try {
        text = await content.text();
    } catch (e) {
        // JSON.parse() can fail and message would container full request URI, including
        // tokens... It fails for me with "Unexpected end of JSON input" quite often - an attempt to download big file
        // (many ops) almost always ends up with this error - I'd guess 1% of op request end up here... It always
        // succeeds on retry.
        // So do not log error object itself.
        throwOdspNetworkError(
            // pre-0.58 error message: errorWhileParsingFetchResponse
            "Error while parsing fetch response",
            fetchIncorrectResponse,
            content, // response
            text,
        );
    }

    propsToLog.bodySize = text.length;
    const res = {
        headers,
        content: JSON.parse(text),
        propsToLog,
        duration,
    };
    return res;
}

export interface INewFileInfo {
    siteUrl: string;
    driveId: string;
    filename: string;
    filePath: string;
    /**
     * application can request creation of a share link along with the creation of a new file
     * by passing in an optional param to specify the kind of sharing link
     * (at the time of adding this comment Sept/2021), odsp only supports csl
     */
    createLinkType?: ShareLinkTypes;
}

export function getOdspResolvedUrl(resolvedUrl: IResolvedUrl): IOdspResolvedUrl {
    assert((resolvedUrl as IOdspResolvedUrl).odspResolvedUrl === true, 0x1de /* "Not an ODSP resolved url" */);
    return resolvedUrl as IOdspResolvedUrl;
}

export const createOdspLogger = (logger?: ITelemetryBaseLogger) =>
    ChildLogger.create(
        logger,
        "OdspDriver",
        { all:
            {
                driverVersion,
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
    resolvedUrlParts: IOdspUrlParts,
    tokenFetcher: TokenFetcher<OdspResourceTokenFetchOptions>,
    throwOnNullToken: boolean,
): InstrumentedStorageTokenFetcher {
    return async (options: TokenFetchOptions, name: string, alwaysRecordTokenFetchTelemetry: boolean = false) => {
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
                ...resolvedUrlParts,
            }).then((tokenResponse) => {
                const token = tokenFromResponse(tokenResponse);
                // This event alone generates so many events that is materially impacts cost of telemetry
                // Thus do not report end event when it comes back quickly.
                // Note that most of the hosts do not report if result is comming from cache or not,
                // so we can't rely on that here. But always record if specified explicitly for cases such as
                // calling trees/latest during load.
                if (alwaysRecordTokenFetchTelemetry || event.duration >= 32) {
                    event.end({ fromCache: isTokenFromCache(tokenResponse), isNull: token === null });
                }
                if (token === null && throwOnNullToken) {
                    throw new NonRetryableError(
                        // pre-0.58 error message: Token is null for ${name} call
                        `The Host-provided token fetcher for ${name} call returned null`,
                        OdspErrorType.fetchTokenError,
                        { method: name, driverVersion });
                }
                return token;
            }, (error) => {
                // There is an important but unofficial contract here where token providers can set canRetry: true
                // to hook into the driver's retry logic (e.g. the retry loop when initiating a connection)
                const rawCanRetry = error?.canRetry;
                const tokenError = wrapError(
                    error,
                    (errorMessage) => new NetworkErrorBasic(
                        `The Host-provided token fetcher for ${name} call threw an error: ${errorMessage}`,
                        OdspErrorType.fetchTokenError,
                        typeof rawCanRetry === "boolean" ? rawCanRetry : false /* canRetry */,
                        { method: name, driverVersion }));
                throw tokenError;
            }),
            { cancel: "generic" });
    };
}

export function createCacheSnapshotKey(odspResolvedUrl: IOdspResolvedUrl): ICacheEntry {
    const cacheEntry: ICacheEntry = {
        type: snapshotKey,
        key: "",
        file: {
            resolvedUrl: odspResolvedUrl,
            docId: odspResolvedUrl.hashedDocumentId,
        },
    };
    return cacheEntry;
}

// 80KB is the max body size that we can put in ump post body for server to be able to accept it.
// Keeping it 78KB to be a little cautious. As per the telemetry 99p is less than 78KB.
export const maxUmpPostBodySize = 79872;
