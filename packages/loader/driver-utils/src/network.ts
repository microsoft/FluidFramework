/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import {
    IError,
    IGenericNetworkError,
    IAuthorizationError,
    IFileNotFoundOrAccessDeniedError,
    IFatalError,
    IOutOfStorageError,
    IInvalidFileNameError,
    IThrottlingError,
    IWriteError,
    ErrorType,
    ISummarizingError,
} from "@microsoft/fluid-driver-definitions";

class ErrorWithProps extends Error {
    // Return all properties
    public getCustomProperties(): object {
        const props = {};
        // Could not use {...this} because it does not return properties of base class.
        for (const key of Object.getOwnPropertyNames(this)) {
            props[key] = this[key];
        }
        return props;
    }
}

export enum OnlineStatus {
    Offline,
    Online,
    Unknown,
}

// Status code for invalid file name error in odsp driver.
export const invalidFileNameErrorCode: number = 710;

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
 * Network error error class - used to communicate general network errors
 */
class GenericNetworkError extends ErrorWithProps implements IGenericNetworkError {
    readonly errorType: ErrorType.genericNetworkError = ErrorType.genericNetworkError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
        readonly statusCode?: number,
        readonly online: string = OnlineStatus[isOnline()],
    ) {
        super(errorMessage);
    }
}

/**
 * AuthorizationError error class - used to communicate Unauthorized/Forbidden error responses
 * (maybe due to expired token) from the server. Almost all of these cases is because user does
 * not have permissions.
 */
class AuthorizationError extends ErrorWithProps implements IAuthorizationError {
    readonly errorType: ErrorType.authorizationError = ErrorType.authorizationError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
        readonly online: string = OnlineStatus[isOnline()],
    ) {
        super(errorMessage);
    }
}

/**
 * FileNotFoundOrAccessDeniedError error class -
 * used to communicate File Not Found errors or access denied errors(due to current user not
 * having access to the file) from the server
 */
class FileNotFoundOrAccessDeniedError extends ErrorWithProps implements IFileNotFoundOrAccessDeniedError {
    readonly errorType = ErrorType.fileNotFoundOrAccessDeniedError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
        readonly online: string = OnlineStatus[isOnline()],
    ) {
        super(errorMessage);
    }
}

/**
 * OutOfStorageError error class -
 * Used to communicate error that occur when we create a file and there is no storage on server/account.
 */
class OutOfStorageError extends ErrorWithProps implements IOutOfStorageError {
    readonly errorType = ErrorType.outOfStorageError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
        readonly online: string = OnlineStatus[isOnline()],
    ) {
        super(errorMessage);
        assert(!canRetry);
    }
}

/**
 * InvalidFileNameError error class -
 * Used to communicate error that occur when we create a file with invalid file name.
 */
class InvalidFileNameError extends ErrorWithProps implements IInvalidFileNameError {
    readonly errorType = ErrorType.invalidFileNameError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
        readonly online: string = OnlineStatus[isOnline()],
    ) {
        super(errorMessage);
        assert(!canRetry);
    }
}

/**
 * Throttling error class - used to communicate all throttling errors
 */
class ThrottlingError extends ErrorWithProps implements IThrottlingError {
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

class SummarizingError extends ErrorWithProps implements ISummarizingError {
    readonly errorType = ErrorType.summarizingError;
    readonly canRetry = true;

    constructor(readonly errorMessage: string, readonly logged: boolean = false) {
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
class FatalError extends ErrorWithProps implements IFatalError {
    readonly errorType = ErrorType.fatalError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
    ) {
        super(errorMessage);
    }
}

export function createNetworkError(
    errorMessage: string,
    canRetry: boolean,
    statusCode?: number,
    retryAfterSeconds?: number,
    online: string = OnlineStatus[isOnline()],
): IError {
    let error: IError;

    switch (statusCode) {
        case 401:
        case 403:
            error = new AuthorizationError(errorMessage, canRetry, online);
            break;
        case 404:
            error = new FileNotFoundOrAccessDeniedError(errorMessage, canRetry, online);
            break;
        case 500:
            error = new FatalError(errorMessage, canRetry);
            break;
        case 507:
            error = new OutOfStorageError(errorMessage, canRetry, online);
            break;
        case 414:
        case invalidFileNameErrorCode:
            error = new InvalidFileNameError(errorMessage, canRetry, online);
            break;
        default:
            if (retryAfterSeconds !== undefined && canRetry) {
                error = new ThrottlingError(errorMessage, retryAfterSeconds, statusCode);
            } else {
                error = new GenericNetworkError(errorMessage, canRetry, statusCode, online);
            }
    }

    return error;
}

export const createWriteError =
    (errorMessage: string) => new WriteError(errorMessage) as IError;
export const createFatalError =
    (errorMessage: string, canRetry: boolean) => new FatalError(errorMessage, canRetry) as IError;

export const createSummarizingError =
    (details: string, logged?: boolean) => (new SummarizingError(details, logged) as IError);
