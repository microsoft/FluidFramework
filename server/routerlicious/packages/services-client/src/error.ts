/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface INetworkErrorDetails {
    canRetry: boolean;
    isFatal: boolean;
    message?: string;
    retryAfter?: number;
}

export class NetworkError extends Error { // Do we need other classes as well, or just using the canRetry and
    constructor(                          // isFatal is enough? -> LETS CREATE OTHER CLASSES
        /**
         * HTTP status code that describes the error.
         */
        public readonly code: number,
        message: string,
        public readonly canRetry?: boolean,
        public readonly isFatal?: boolean,
        public readonly retryAfterMs?: number,
    ) {
        super(message);
        this.name = "NetworkError";
    }

    public get details(): INetworkErrorDetails | string {
        if (this.canRetry === undefined && this.isFatal === undefined && this.retryAfterMs === undefined) {
            return this.message;
        }

        return {
            message: this.message,
            canRetry: this.canRetry,
            isFatal: this.isFatal,
            retryAfter: this.retryAfterMs,
        };
    }
}

export function createFluidServiceNetworkError(
    statusCode: number,
    errorData?: INetworkErrorDetails | string,
): NetworkError {
    let message: string;
    let canRetry: boolean | undefined;
    let isFatal: boolean | undefined;
    let retryAfter: number | undefined;

    if (errorData && typeof errorData === "object") {
        message = errorData.message;
        canRetry = errorData.canRetry;
        isFatal = errorData.isFatal;
        retryAfter = errorData.retryAfter;
    } else if (errorData && typeof errorData === "string") {
        message = errorData;
    } else {
        message = "Unknown Error";
    }

    switch (statusCode) {
        case 401:
        case 403:
        case 404:
            return new NetworkError(
                statusCode,
                message,
                false,
                false);
        case 422:
            return new NetworkError(
                statusCode,
                message,
                canRetry ?? false,
                isFatal ?? false,
                canRetry ? retryAfter : undefined);
        case 429:
            return new NetworkError(
                statusCode,
                message,
                true,
                false,
                retryAfter);
        case 500: {
            return new NetworkError(
                statusCode,
                message,
                canRetry ?? true,
                isFatal ?? false,
                canRetry ? retryAfter : undefined);
        }
        case 502:
        case 503:
        case 504:
            return new NetworkError(
                statusCode,
                message,
                true,
                false,
                retryAfter);
        default:
            return new NetworkError(
                statusCode,
                message,
                false,
                true);
    }
}

export function throwFluidServiceNetworkError(statusCode: number, errorData?: INetworkErrorDetails | string): never {
    const networkError = createFluidServiceNetworkError(statusCode, errorData);
    throw networkError;
}
