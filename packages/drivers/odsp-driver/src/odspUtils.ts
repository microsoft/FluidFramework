/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    NetworkErrorBasic,
    GenericNetworkError,
    NonRetryableError,
    isOnline,
    createGenericNetworkError,
    OnlineStatus,
} from "@fluidframework/driver-utils";
import { CriticalContainerError, ErrorType } from "@fluidframework/container-definitions";
import {
    default as fetch,
    RequestInfo as FetchRequestInfo,
    RequestInit as FetchRequestInit,
    Headers as FetchHeaders,
} from "node-fetch";
import sha from "sha.js";
import { IOdspSocketError } from "./contracts";
import { debug } from "./debug";

export const offlineFetchFailureStatusCode: number = 709;
export const fetchFailureStatusCode: number = 710;
// Status code for invalid file name error in odsp driver.
export const invalidFileNameStatusCode: number = 711;
// no response, or can't parse response
export const fetchIncorrectResponse = 712;

export function createOdspNetworkError(
    errorMessage: string,
    statusCode?: number,
    retryAfterSeconds?: number,
): CriticalContainerError {
    let error: CriticalContainerError;

    switch (statusCode) {
        case 400:
            error = new GenericNetworkError(errorMessage, false, statusCode);
            break;
        case 401:
        case 403:
            error = new NetworkErrorBasic(errorMessage, ErrorType.authorizationError, false);
            break;
        case 404:
            error = new NetworkErrorBasic(errorMessage, ErrorType.fileNotFoundOrAccessDeniedError, false);
            break;
        case 406:
            error = new NetworkErrorBasic(errorMessage, ErrorType.unsupportedClientProtocolVersion, false);
            break;
        case 413:
            error = new NonRetryableError(errorMessage, ErrorType.snapshotTooBig, false);
            break;
        case 414:
        case invalidFileNameStatusCode:
            error = new NonRetryableError(errorMessage, ErrorType.invalidFileNameError, false);
            break;
        case 500:
            error = new GenericNetworkError(errorMessage, true);
            break;
        case 501:
            error = new NonRetryableError(errorMessage, ErrorType.fluidNotEnabled, false);
            break;
        case 507:
            error = new NonRetryableError(errorMessage, ErrorType.outOfStorageError, false);
            break;
        case offlineFetchFailureStatusCode:
            error = new NetworkErrorBasic(errorMessage, ErrorType.offlineError, true);
            break;
        case fetchFailureStatusCode:
        default:
            error = createGenericNetworkError(errorMessage, true, retryAfterSeconds, statusCode);
    }

    error.online = OnlineStatus[isOnline()];
    return error;
}

/**
 * Throws network error - an object with a bunch of network related properties
 */
export function throwOdspNetworkError(
    errorMessage: string,
    statusCode: number,
    response?: Response,
) {
    let message = errorMessage;
    let sprequestguid;
    if (response) {
        message = `${message}, msg = ${response.statusText}, type = ${response.type}`;
        sprequestguid = response.headers ? `${response.headers.get("sprequestguid")}` : undefined;
    }

    const networkError = createOdspNetworkError(
        message,
        statusCode,
        undefined /* retryAfterSeconds */);
    (networkError as any).sprequestguid = sprequestguid;
    throw networkError;
}

/**
 * Returns network error based on error object from ODSP socket (IOdspSocketError)
 */
export function errorObjectFromSocketError(socketError: IOdspSocketError) {
    return createOdspNetworkError(
        socketError.message,
        socketError.code,
        socketError.retryAfter);
}

/** Parse the given url and return the origin (host name) */
export const getOrigin = (url: string) => new URL(url).origin;

export interface IOdspResponse<T> {
    content: T;
    headers: Map<string, string>;
}

export function getHashedDocumentId(driveId: string, itemId: string): string {
    return encodeURIComponent(new sha.sha256().update(`${driveId}_${itemId}`).digest("base64"));
}

/**
 * This API should be used with pretty much all network calls (fetch, webSocket connection) in order
 * to correctly handle expired tokens. It relies on callback fetching token, and be able to refetch
 * token on failure. Only specific cases get retry call with refresh = true, all other / unknonw errors
 * simply propagate to caller
 */
export async function getWithRetryForTokenRefresh<T>(get: (refresh: boolean) => Promise<T>) {
    return get(false).catch(async (e) => {
        // If the error is 401 or 403 refresh the token and try once more.
        // fetchIncorrectResponse indicates some error on the wire, retry once.
        if (e.errorType === ErrorType.authorizationError || e.statusCode === fetchIncorrectResponse) {
            return get(true);
        }

        // All code paths (deltas, blobs, trees) already throw exceptions.
        // Throwing is better than returning null as most code paths do not return nullable-objects,
        // and error reporting is better (for example, getDeltas() will log error to telemetry)
        // getTree() path is the only potential exception where returning null might result in
        // document being opened, though there maybe really bad user experience (consuming thousands of ops)
        throw e;
    });
}

/**
 * A utility function to do fetch with support for retries
 * @param url - fetch requestInfo, can be a string
 * @param requestInit - fetch requestInit
 * @param retryPolicy - how to do retries
 */
export async function fetchHelper<T>(
    requestInfo: RequestInfo,
    requestInit: RequestInit | undefined,
): Promise<IOdspResponse<T>> {
    // Node-fetch and dom have conflicting typing, force them to work by casting for now
    return fetch(requestInfo as FetchRequestInfo, requestInit as FetchRequestInit).then(async (fetchResponse) => {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const response = fetchResponse as any as Response;
        // Let's assume we can retry.
        if (!response) {
            throwOdspNetworkError(`No response from the server`, fetchIncorrectResponse, response);
        }
        if (!response.ok || response.status < 200 || response.status >= 300) {
            throwOdspNetworkError(
                `Error ${response.status} from the server`, response.status, response);
        }

        // JSON.parse() can fail and message (that goes into telemetry) would container full request URI, including
        // tokens... It fails for me with "Unexpected end of JSON input" quite often - an attempt to download big file
        // (many ops) almost always ends up with this error - I'd guess 1% of op request end up here... It always
        // succeeds on retry.
        try {
            const text = await response.text();

            const newHeaders = new FetchHeaders({ "body-size": text.length.toString() });
            for (const [key, value] of response.headers.entries()) {
                newHeaders.set(key, value);
            }
            const res = {
                headers: newHeaders,
                content: JSON.parse(text),
            };
            return res;
        } catch (e) {
            throwOdspNetworkError(`Error while parsing fetch response: ${e}`, fetchIncorrectResponse, response);
        }
    }, (error) => {
        // While we do not know for sure whether computer is offline, this error is not actionable and
        // is pretty good indicator we are offline. Treating it as offline scenario will make it
        // easier to see other errors in telemetry.
        let online = OnlineStatus.Unknown;
        if (error && typeof error === "object" && error.message === "TypeError: Failed to fetch") {
            online = OnlineStatus.Offline;
        }
        throwOdspNetworkError(
            `Fetch error: ${error}`,
            online === OnlineStatus.Offline ? offlineFetchFailureStatusCode : fetchFailureStatusCode,
            undefined, // response
        );
    });
}

/**
 * Tests if localStorage is usable.
 * Should we move this outside to a library?
 */
export function isLocalStorageAvailable(): boolean {
    const localStorageTestKey = "LocalStorageTestKey";
    try {
        localStorage.setItem(localStorageTestKey, "v");
        localStorage.removeItem(localStorageTestKey);
        return true;
    } catch (e) {
        debug(`LocalStorage not available due to ${e}`);
        return false;
    }
}

export interface INewFileInfo {
    siteUrl: string;
    driveId: string;
    filename: string;
    filePath: string;
    callback?(itemId: string, filename: string): void;
}

export interface INewFileInfoHeader {
    newFileInfoPromise: Promise<INewFileInfo>,
}

declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IRequestHeader extends Partial<INewFileInfoHeader> { }
}
