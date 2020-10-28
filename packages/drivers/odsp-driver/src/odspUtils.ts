/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverErrorType } from "@fluidframework/driver-definitions";
import { isOnline, OnlineStatus } from "@fluidframework/driver-utils";
import {
    fetchIncorrectResponse,
    offlineFetchFailureStatusCode,
    fetchFailureStatusCode,
    fetchTimeoutStatusCode,
} from "@fluidframework/odsp-doclib-utils";
import {
    default as fetch,
    RequestInfo as FetchRequestInfo,
    RequestInit as FetchRequestInit,
    Headers as FetchHeaders,
} from "node-fetch";
import sha from "sha.js";
import { debug } from "./debug";
import { throwOdspNetworkError } from "./odspError";
import { TokenFetchOptions } from "./tokenFetch";

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
 * token on failure. Only specific cases get retry call with refresh = true, all other / unknown errors
 * simply propagate to caller
 */
export async function getWithRetryForTokenRefresh<T>(get: (options: TokenFetchOptions) => Promise<T>) {
    return get({ refresh: false }).catch(async (e) => {
        switch (e.errorType) {
            // If the error is 401 or 403 refresh the token and try once more.
            case DriverErrorType.authorizationError:
                return get({ refresh: true, claims: e.claims });
            // fetchIncorrectResponse indicates some error on the wire, retry once.
            case DriverErrorType.incorrectServerResponse:
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
): Promise<Response> {
    // Node-fetch and dom have conflicting typing, force them to work by casting for now
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
        return response;
    }, (error) => {
        // While we do not know for sure whether computer is offline, this error is not actionable and
        // is pretty good indicator we are offline. Treating it as offline scenario will make it
        // easier to see other errors in telemetry.
        let online = isOnline();
        if (`${error}` === "TypeError: Failed to fetch") {
            online = OnlineStatus.Offline;
        }
        if (error.name === "AbortError") {
            throwOdspNetworkError("Timeout during fetch", fetchTimeoutStatusCode);
        }
        throwOdspNetworkError(
            `Fetch error: ${error}`,
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
export async function fetchAndParseHelper<T>(
    requestInfo: RequestInfo,
    requestInit: RequestInit | undefined,
): Promise<IOdspResponse<T>> {
    const response = await fetchHelper(requestInfo, requestInit);
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
}
