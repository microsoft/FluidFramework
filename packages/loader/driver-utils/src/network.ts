/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import {
    CriticalContainerError,
    IAuthorizationError,
    IFileNotFoundOrAccessDeniedError,
    IGenericNetworkError,
    IOfflineError,
    IOutOfStorageError,
    IInvalidFileNameError,
    IThrottlingWarning,
    IWriteError,
    ErrorType,
} from "@fluidframework/container-definitions";
import {
    ErrorWithProps,
} from "./error";

export enum OnlineStatus {
    Offline,
    Online,
    Unknown,
}

// It tells if we have local connection only - we might not have connection to web.
// No solution for node.js (other than resolve dns names / ping specific sites)
// Can also use window.addEventListener("online" / "offline")
export function isOnline(): OnlineStatus {
    // eslint-disable-next-line no-null/no-null
    if (typeof navigator === "object" && navigator !== null && typeof navigator.onLine === "boolean") {
        return navigator.onLine ? OnlineStatus.Online : OnlineStatus.Offline;
    }
    return OnlineStatus.Unknown;
}

/**
 * Generic network error class.
 */
export class GenericNetworkError extends ErrorWithProps implements IGenericNetworkError {
    readonly errorType = ErrorType.genericNetworkError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
        readonly statusCode?: number,
    ) {
        super(errorMessage);
    }
}

/**
 * AuthorizationError error class - used to communicate Unauthorized/Forbidden error responses
 * (maybe due to expired token) from the server. Almost all of these cases is because user does
 * not have permissions.
 */
export class AuthorizationError extends ErrorWithProps implements IAuthorizationError {
    readonly errorType = ErrorType.authorizationError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
    ) {
        super(errorMessage);
    }
}

/**
 * FileNotFoundOrAccessDeniedError error class -
 * used to communicate File Not Found errors or access denied errors(due to current user not
 * having access to the file) from the server
 */
export class FileNotFoundOrAccessDeniedError extends ErrorWithProps implements IFileNotFoundOrAccessDeniedError {
    readonly errorType = ErrorType.fileNotFoundOrAccessDeniedError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
    ) {
        super(errorMessage);
    }
}

/**
 * OutOfStorageError error class -
 * Used to communicate error that occur when we create a file and there is no storage on server/account.
 */
export class OutOfStorageError extends ErrorWithProps implements IOutOfStorageError {
    readonly errorType = ErrorType.outOfStorageError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
    ) {
        super(errorMessage);
        assert(!canRetry);
    }
}

/**
 * InvalidFileNameError error class -
 * Used to communicate error that occur when we create a file with invalid file name.
 */
export class InvalidFileNameError extends ErrorWithProps implements IInvalidFileNameError {
    readonly errorType = ErrorType.invalidFileNameError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
    ) {
        super(errorMessage);
        assert(!canRetry);
    }
}

/**
 * Throttling error class - used to communicate all throttling errors
 */
class ThrottlingError extends ErrorWithProps implements IThrottlingWarning {
    readonly errorType = ErrorType.throttlingError;
    readonly canRetry = true;

    constructor(
        errorMessage: string,
        readonly retryAfterSeconds: number,
        readonly statusCode?: number,
    ) {
        super(errorMessage);
    }
}

/**
 * Write error class - When attempting to write, without proper permissions
 */
class WriteError extends ErrorWithProps implements IWriteError {
    readonly errorType = ErrorType.writeError;
    public readonly canRetry = false;

    constructor(errorMessage: string) {
        super(errorMessage);
    }
}

/**
 * Fatal error class - when the server encountered a fatal error
 */
export class OfflineError extends ErrorWithProps implements IOfflineError {
    readonly errorType = ErrorType.offlineError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
    ) {
        super(errorMessage);
    }
}

export const createWriteError =
    (errorMessage: string) => new WriteError(errorMessage) as CriticalContainerError;

export function createGenericNetworkError(
    errorMessage: string,
    canRetry: boolean,
    retryAfterSeconds?: number,
    statusCode?: number)
{
    let error: CriticalContainerError;
    if (retryAfterSeconds !== undefined && canRetry) {
        error = new ThrottlingError(errorMessage, retryAfterSeconds, statusCode);
    }
    else {
        error = new GenericNetworkError(errorMessage, canRetry, statusCode);
    }
    return error;
}
