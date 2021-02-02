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
    canRetry?: boolean,
    statusCode?: number,
    retryAfterSeconds?: number,
): R11sError {
    switch (statusCode) {
        case 401:
        case 403:
            return new NetworkErrorBasic(
                errorMessage, R11sErrorType.authorizationError, canRetry ?? false, statusCode);
        case 404:
            return new NetworkErrorBasic(
                errorMessage, R11sErrorType.fileNotFoundOrAccessDeniedError, canRetry ?? false, statusCode);
        case 500:
            return new GenericNetworkError(errorMessage, canRetry ?? true, statusCode);
        default:
            return createGenericNetworkError(errorMessage, canRetry ?? true, retryAfterSeconds, statusCode);
    }
}

export function throwR11sNetworkError(
    errorMessage: string,
    canRetry?: boolean,
    statusCode?: number,
    retryAfterSeconds?: number,
): never {
    const networkError = createR11sNetworkError(
        errorMessage,
        canRetry,
        statusCode,
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
    if (statusCode === 429 && retryAfterSeconds !== undefined) {
        return true;
    }
    return ![401, 403].includes(statusCode);
}
