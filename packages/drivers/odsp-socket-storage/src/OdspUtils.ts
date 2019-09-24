/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError, throwNetworkError } from "@microsoft/fluid-core-utils";
import { default as fetch } from "node-fetch";

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
export const defaultRetryFilter = blockList([400, 404]);

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
    return fetch(requestInfo, requestInit).then((response: Response) => {
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
            return response.json() as any;
        } catch (e) {
            throwNetworkError(400, `Error while parsing fetch response`, true, response);
        }
    },
    (error) => {
        throwNetworkError(`fetch error, likely due to networking / DNS error or no server: ${error}`, 709, true); // can retry?
    });
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
