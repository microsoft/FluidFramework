/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export class NetworkError extends Error { // Do we need other classes as well, or just using the canRetry and
    constructor(                          // isFatal is enough?
        /**
         * HTTP status code that describes the error.
         */
        public readonly code: number,
        public readonly canRetry: boolean,
        public readonly isFatal: boolean,
        message: string,
        public readonly retryAfterMs?: number,
    ) {
        super(message);
        this.name = "NetworkError";
    }
}

export function createR11sServiceNetworkError(
    errorMessage: string,
    statusCode?: number,
    retryAfterMs?: number,
): NetworkError {
    switch (statusCode) {
        case undefined: {
            // If a service is temporarily down or a browser resource limit is reached, Axios will throw
            // a network error with no status code (e.g. err:ERR_CONN_REFUSED or err:ERR_FAILED) and
            // error message, "Network Error". "Network Error" can be retried, and is not fatal.
            const canRetry = errorMessage === "Network Error";
            return new NetworkError(-1, canRetry, false, errorMessage, canRetry ? retryAfterMs : undefined);
        }
        case 401:
        case 403:
            return new NetworkError(statusCode, false, false, errorMessage); // Should this be fatal?
        case 404:
            return new NetworkError(statusCode, false, true, errorMessage);
        case 429:
        case 500: // Why is 500 retryable in the driver errorUtils? Should it be retriable here too?
            return new NetworkError(statusCode, true, false, errorMessage, retryAfterMs);
        case 700:
            // Represents failures that happen across Fluid server microservices that cannot be retried,
            // but that do not represent a fatal failure from the point of view of the document/session.
            return new NetworkError(statusCode, false, false, errorMessage);
        default:
            return new NetworkError(statusCode, false, true, errorMessage);
    }
}

export function throwR11sServiceNetworkError(
    errorMessage: string,
    statusCode?: number,
    retryAfterMs?: number,
): never {
    const networkError = createR11sServiceNetworkError(
        errorMessage,
        statusCode,
        retryAfterMs);

    throw networkError;
}
