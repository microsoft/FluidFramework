/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverError } from "@fluidframework/driver-definitions";
import {
    NetworkErrorBasic,
    GenericNetworkError,
    createGenericNetworkError,
} from "@fluidframework/driver-utils";

export enum R11sErrorType {
    authorizationError = "authorizationError",
    fileNotFoundOrAccessDeniedError = "fileNotFoundOrAccessDeniedError",
}

export interface IR11sError {
    readonly errorType: R11sErrorType;
    readonly message: string;
    canRetry: boolean;
}

export type R11sError =
    | DriverError
    | IR11sError;

export function createR11sNetworkError(
    errorMessage: string,
    statusCode?: number,
    canRetry?: boolean,
    retryAfterSeconds?: number,
): R11sError {
    switch (statusCode) {
        case 401:
        case 403:
            return new NetworkErrorBasic(
                errorMessage,
                R11sErrorType.authorizationError,
                canRetry ?? isStatusRetriable(statusCode, retryAfterSeconds),
                statusCode);
        case 404:
            return new NetworkErrorBasic(
                errorMessage,
                R11sErrorType.fileNotFoundOrAccessDeniedError,
                canRetry ?? isStatusRetriable(statusCode, retryAfterSeconds),
                statusCode);
        case 500:
            return new GenericNetworkError(
                errorMessage,
                canRetry ?? isStatusRetriable(statusCode, retryAfterSeconds),
                statusCode);
        default:
            return createGenericNetworkError(
                errorMessage,
                canRetry ?? isStatusRetriable(statusCode, retryAfterSeconds),
                retryAfterSeconds,
                statusCode);
    }
}

export function throwR11sNetworkError(
    errorMessage: string,
    statusCode?: number,
    canRetry?: boolean,
    retryAfterSeconds?: number,
): never {
    const networkError = createR11sNetworkError(
        errorMessage,
        statusCode,
        canRetry,
        retryAfterSeconds);

    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw networkError;
}

/**
 * Assumes that 401 errors have already been retried with a new token, so further 401 retries will not succeed.
 */
export function isStatusRetriable(statusCode: number | undefined, retryAfterSeconds?: number) {
    if (statusCode === undefined) {
        return true;
    }
    if (statusCode === 429) {
        return retryAfterSeconds !== undefined;
    }
    return ![401, 403, 404].includes(statusCode);
}
