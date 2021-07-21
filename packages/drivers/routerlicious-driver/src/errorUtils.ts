/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverError } from "@fluidframework/driver-definitions";
import {
    NonRetryableError,
    GenericNetworkError,
    createGenericNetworkError,
    AuthorizationError,
} from "@fluidframework/driver-utils";

export enum R11sErrorType {
    fileNotFoundOrAccessDeniedError = "fileNotFoundOrAccessDeniedError",
}

/**
 * Interface for error responses for the WebSocket connection
 */
export interface IR11sSocketError {
    /**
     * An error code number for the error that occurred.
     * It will be a valid HTTP status code.
     */
    code: number;

    /**
     * A message about the error that occurred for debugging / logging purposes.
     * This should not be displayed to the user directly.
     */
    message: string;

    /**
     * Optional Retry-After time in seconds.
     * The client should wait this many seconds before retrying its request.
     */
    retryAfterMs?: number;
}

export interface IR11sError {
    readonly errorType: R11sErrorType;
    readonly message: string;
    canRetry: boolean;
}

export type R11sError = DriverError | IR11sError;

export function createR11sNetworkError(
    errorMessage: string,
    statusCode?: number,
    retryAfterMs?: number,
): R11sError {
    switch (statusCode) {
        case undefined:
            // If a service is temporarily down or a browser resource limit is reached, Axios will throw
            // a network error with no status code (e.g. err:ERR_CONN_REFUSED or err:ERR_FAILED) and
            // error message, "Network Error".
            return new GenericNetworkError(errorMessage, errorMessage === "Network Error", { statusCode });
        case 401:
        case 403:
            return new AuthorizationError(errorMessage, undefined, undefined, { statusCode });
        case 404:
            return new NonRetryableError(
                errorMessage, R11sErrorType.fileNotFoundOrAccessDeniedError, { statusCode });
        case 429:
            return createGenericNetworkError(
                errorMessage, true, retryAfterMs, { statusCode });
        case 500:
            return new GenericNetworkError(errorMessage, true, { statusCode });
        default:
            return createGenericNetworkError(
                errorMessage, retryAfterMs !== undefined, retryAfterMs, { statusCode });
    }
}

export function throwR11sNetworkError(
    errorMessage: string,
    statusCode?: number,
    retryAfterMs?: number,
): never {
    const networkError = createR11sNetworkError(
        errorMessage,
        statusCode,
        retryAfterMs);

    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw networkError;
}

/**
 * Returns network error based on error object from R11s socket (IR11sSocketError)
 */
export function errorObjectFromSocketError(socketError: IR11sSocketError, handler: string): R11sError {
    const message = `socket.io: ${handler}: ${socketError.message}`;
    return createR11sNetworkError(
        message,
        socketError.code,
        socketError.retryAfterMs,
    );
}
