/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { INetworkError } from "@prague/fluid-protocol-definitions";
import { default as fetch } from "node-fetch";

/** Determines how long to wait before retrying
 * retriesAttempted n where the last retry done was the n-th retry, initial request not included.
 * first retry is 0, second is 1 etc.
 */
export type BackoffFunction = (retriesAttempted: number) => number;

/**
 * returns a promise that resolves after timeMs
 * @param timeMs - time for delay
 */
export async function delay(timeMs: number): Promise<void> {
    // tslint:disable-next-line: no-string-based-set-timeout
    return new Promise((resolve) => setTimeout(resolve, timeMs));
}

/**
 * returns true when the request should/can be retried
 */
export type RetryFilter = (response: Response) => boolean;

export function noRetry(): RetryFilter {
    return () => false;
}

/**
 * Network error error class - used to communicate all  network errors
 */
export class NetworkError extends Error implements INetworkError {
    constructor(
            readonly statusCode: number,
            errorMessage: string,
            readonly canRetry: boolean,
            readonly retryAfterSeconds?: number) {
      super(errorMessage);
    }
}

export function throwNetworkError(statusCode: number, errorMessage: string, canRetry: boolean = false, response?: Response) {
    let message = errorMessage;
    if (response) {
        message = `${message}, msg = ${response.statusText}, type = ${response.type}`;
    }
    throw new NetworkError(statusCode, message, canRetry);
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
    filter: RetryFilter = whitelist([408, 409, 429, 500, 503]),
    tries: Response[] = [],
): Promise<any> {
    return fetch(requestInfo, requestInit).then((response: Response) => {
        // Let's assume we can retry.
        if (!response) {
            throwNetworkError(400, `No response from the server`, true, response);
        }
        if (!response.ok || response.status < 200 || response.status >= 300) {
            throwNetworkError(response.status, `Error ${response.status} from the server`, filter(response), response);
        }
        return response.json() as any;
    },
    (error) => {
        throwNetworkError(709, "fetch error, likely due to networking / DNS error or no server", true); // can retry?
    });
}

/**
 * Creates a filter that will allow retries for the whitelisted status codes
 * @param retriableCodes - Cannot be null/undefined
 */
export function whitelist(retriableCodes: number[]): RetryFilter {
    return (response: Response) => retriableCodes.includes(response.status);
}

export function getWithRetryForTokenRefresh<T>(get: (refresh: boolean) => Promise<T>) {
    return get(false).catch(async (e: NetworkError) => {
        // if the error is 401 or 403 refresh the token and try once more.
        if (e instanceof NetworkError && (e.statusCode === 401 || e.statusCode === 403)) {
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
