/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export enum NetworkErrorType {
    GenericNetworkError = "GenericNetworkError",
    AuthorizationError = "AuthorizationError",
    ThrottlingError = "ThrottlingError",
    NonRetryableError = "NonRetryableError",
    FatalError = "FatalError",
}

export class NetworkError extends Error { // Do we need other classes as well, or just using the canRetry and
    constructor(                          // isFatal is enough? -> LETS CREATE OTHER CLASSES
        /**
         * HTTP status code that describes the error.
         */
        public readonly code: number,
        public readonly errorType: NetworkErrorType,
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
            return new NetworkError(
                -1,
                NetworkErrorType.GenericNetworkError,
                canRetry,
                false,
                errorMessage,
                canRetry ? retryAfterMs : undefined);
        }
        case 401:
        case 403:
            return new NetworkError(statusCode, NetworkErrorType.AuthorizationError, false, false, errorMessage);
        case 404:
            return new NetworkError(statusCode, NetworkErrorType.NonRetryableError, false, false, errorMessage);
        case 429:
            return new NetworkError(
                statusCode,
                NetworkErrorType.ThrottlingError,
                true,
                false,
                errorMessage,
                retryAfterMs);
        case 422:
            return new NetworkError(
                statusCode,
                NetworkErrorType.NonRetryableError,
                false,
                false,
                errorMessage,
                retryAfterMs);
        case 500:
            return new NetworkError(
                statusCode,
                NetworkErrorType.FatalError,
                false,
                true,
                errorMessage,
                retryAfterMs);
        case 502:
        case 503:
            return new NetworkError(statusCode, NetworkErrorType.GenericNetworkError, true, false, errorMessage);
        default:
            return new NetworkError(statusCode, NetworkErrorType.FatalError, false, true, errorMessage);
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
