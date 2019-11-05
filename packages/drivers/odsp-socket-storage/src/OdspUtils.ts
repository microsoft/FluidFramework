/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { INetworkErrorProperties, NetworkError, OnlineStatus } from "@microsoft/fluid-core-utils";
import { default as fetch, RequestInfo as FetchRequestInfo, RequestInit as FetchRequestInit } from "node-fetch";
import { IOdspSocketError } from "./contracts";
import { debug } from "./debug";

/**
 * Throws network error - an object with a bunch of network related properties
 */
export function throwNetworkError(
        errorMessage: string,
        statusCode: number,
        canRetry: boolean,
        response?: Response,
        online?: string) {
    let message = errorMessage;
    if (response) {
        message = `${message}, msg = ${response.statusText}, type = ${response.type}`;
    }
    throw new NetworkError(
        message,
        [
            [INetworkErrorProperties.statusCode , statusCode],
            [INetworkErrorProperties.canRetry, canRetry],
            [INetworkErrorProperties.sprequestguid, response && response.headers && `${response.headers.get("sprequestguid")}`],
        ],
        online,
    );
}

/**
 * Returns network error based on error object from ODSP socket (IOdspSocketError)
 */
export function errorObjectFromOdspError(socketError: IOdspSocketError) {
    return new NetworkError(
        socketError.message,
        [
            [INetworkErrorProperties.statusCode, socketError.code],
            [INetworkErrorProperties.canRetry, socketErrorRetryFilter(socketError.code)],
            [INetworkErrorProperties.retryAfterSeconds, socketError.retryAfter],
        ],
    );
}

/**
 * returns true when the request should/can be retried
 */
export type RetryFilter = (code: number) => boolean;

export function noRetry(): RetryFilter {
    return () => false;
}

/**
 * Creates a filter that will allow retries for the whitelisted status codes
 * @param retriableCodes - Cannot be null/undefined
 */
export function allowList(retriableCodes: number[]): RetryFilter {
    return (code: number) => retriableCodes.includes(code);
}

export function blockList(nonRetriableCodes: number[]): RetryFilter {
    return (code: number) => !nonRetriableCodes.includes(code);
}

// Going safe - only exclude specific codes
// export const defaultRetryFilter = allowList([408, 409, 429, 500, 503]);
export const defaultRetryFilter = blockList([400, 401, 403, 404]);

// socket error filter for socket erros where 400 is a special retryable error.
export const socketErrorRetryFilter = blockList([401, 403, 404, 406]);

export interface IOdspResponse<T> {
    content: T;
    headers: Map<string, string>;
}

/**
 * A utility function to do fetch with support for retries
 * @param url - fetch requestInfo, can be a string
 * @param requestInit - fetch requestInit
 * @param retryPolicy - how to do retries
 */
export function fetchHelper(
    requestInfo: RequestInfo,
    requestInit: RequestInit | undefined,
    retryFilter: RetryFilter = defaultRetryFilter,
): Promise<any> {
    // node-fetch and dom has conflicting typing, force them to work by casting for now
    return fetch(requestInfo as FetchRequestInfo, requestInit as FetchRequestInit).then(async (fetchResponse) => {
        const response = fetchResponse as any as Response;
        // Let's assume we can retry.
        if (!response) {
            throwNetworkError(`No response from the server`, 400, true, response);
        }
        if (!response.ok || response.status < 200 || response.status >= 300) {
            throwNetworkError(`Error ${response.status} from the server`, response.status, retryFilter(response.status), response);
        }

        // .json() can fail and message (that goes into telemetry) would container full request URI, including tokens...
        // It tails for me with "Unexpected end of JSON input" quite often - an attempt to download big file (many ops) almost
        // always ends up with this error - I'd guess 1% of op request end up here...
        // It always succeeds on retry.
        try {
            const res = {
                headers: response.headers,
                content: await response.json() as any,
            };
            return res;
        } catch (e) {
            throwNetworkError(`Error while parsing fetch response`, 400, true, response);
        }
    },
    (error) => {
        // While we do not know for sure whether computer is offline, this error is not actionable and
        // is pretty good indicator we are offline. Treating it as offline scenario will make it
        // easier to see other errors in telemetry.
        let online: string | undefined;
        if (error && typeof error === "object" && error.message === "TypeError: Failed to fetch") {
            online = OnlineStatus[OnlineStatus.Offline];
        }
        throwNetworkError(
            `Fetch error: ${error}`,
            709,
            true, // canRetry
            undefined, // response
            online,
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
