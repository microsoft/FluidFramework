/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverError } from "@fluidframework/driver-definitions";
import {
    NetworkErrorBasic,
    GenericNetworkError,
    createGenericNetworkError,
    AuthorizationError,
} from "@fluidframework/driver-utils";

export enum R11sErrorType {
    fileNotFoundOrAccessDeniedError = "fileNotFoundOrAccessDeniedError",
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
    retryAfterSeconds?: number,
): R11sError {
    switch (statusCode) {
        case 401:
        case 403:
            return new AuthorizationError(errorMessage, undefined, undefined, statusCode);
        case 404:
            return new NetworkErrorBasic(
                errorMessage, R11sErrorType.fileNotFoundOrAccessDeniedError, false, statusCode);
        case 429:
            return createGenericNetworkError(
                errorMessage, true, retryAfterSeconds, statusCode);
        case 500:
            return new GenericNetworkError(errorMessage, true, statusCode);
        default:
            return createGenericNetworkError(
                errorMessage, false, retryAfterSeconds, statusCode);
    }
}

export function throwR11sNetworkError(
    errorMessage: string,
    statusCode?: number,
    retryAfterSeconds?: number,
): never {
    const networkError = createR11sNetworkError(
        errorMessage,
        statusCode,
        retryAfterSeconds);

    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw networkError;
}
