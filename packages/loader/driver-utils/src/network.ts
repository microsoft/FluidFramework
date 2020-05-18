/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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
        readonly statusCode?: number,
        readonly canRetry?: boolean,
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
        readonly statusCode?: number,
        readonly canRetry?: boolean,
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
    readonly errorType: ErrorType.fileNotFoundOrAccessDeniedError = ErrorType.fileNotFoundOrAccessDeniedError;

    constructor(
        errorMessage: string,
        readonly statusCode?: number,
        readonly canRetry?: boolean,
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
    readonly errorType: ErrorType.outOfStorageError = ErrorType.outOfStorageError;

    constructor(
        errorMessage: string,
        readonly statusCode?: number,
        readonly canRetry?: boolean,
        readonly online: string = OnlineStatus[isOnline()],
    ) {
        super(errorMessage);
    }
}

/**
 * InvalidFileNameError error class -
 * Used to communicate error that occur when we create a file with invalid file name.
 */
class InvalidFileNameError extends ErrorWithProps implements IInvalidFileNameError {
    readonly errorType: ErrorType.invalidFileNameError = ErrorType.invalidFileNameError;

    constructor(
        errorMessage: string,
        readonly statusCode?: number,
        readonly canRetry?: boolean,
        readonly online: string = OnlineStatus[isOnline()],
    ) {
        super(errorMessage);
    }
}

/**
 * Throttling error class - used to communicate all throttling errors
 */
class ThrottlingError extends ErrorWithProps implements IThrottlingError {
    readonly errorType: ErrorType.throttlingError = ErrorType.throttlingError;

    constructor(errorMessage: string, readonly retryAfterSeconds: number) {
        super(errorMessage);
    }
}

class SummarizingError extends ErrorWithProps implements ISummarizingError {
    readonly errorType: ErrorType.summarizingError = ErrorType.summarizingError;

    constructor(readonly description: string, readonly logged: boolean = false) {
        super(description);
    }
}

/**
 * Write error class - When attempting to write, without proper permissions
 */
class WriteError extends ErrorWithProps implements IWriteError {
    readonly errorType: ErrorType.writeError = ErrorType.writeError;
    public readonly critical = true;

    constructor(errorMessage: string) {
        super(errorMessage);
    }
}

/**
 * Fatal error class - when the server encountered a fatal error
 */
class FatalError extends ErrorWithProps implements IFatalError {
    readonly errorType: ErrorType.fatalError = ErrorType.fatalError;
    public readonly critical = true;

    constructor(errorMessage: string) {
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
    if (statusCode === 401 || statusCode === 403) {
        return new AuthorizationError(errorMessage, statusCode, canRetry, online);
    }
    if (statusCode === 404) {
        return new FileNotFoundOrAccessDeniedError(errorMessage, statusCode, canRetry, online);
    }
    if (statusCode === 500) {
        return new FatalError(errorMessage);
    }
    if (statusCode === 507) {
        return new OutOfStorageError(errorMessage, statusCode, canRetry, online);
    }
    if (statusCode === 414 || statusCode === invalidFileNameErrorCode) {
        return new InvalidFileNameError(errorMessage, statusCode, canRetry, online);
    }
    if (retryAfterSeconds !== undefined) {
        return new ThrottlingError(errorMessage, retryAfterSeconds);
    }
    return new GenericNetworkError(errorMessage, statusCode, canRetry, online);
}

export const createWriteError = (errorMessage: string) => (new WriteError(errorMessage) as IError);
export const createFatalError = (errorMessage: string) => (new FatalError(errorMessage) as IError);

export const createSummarizingError =
    (details: string, logged?: boolean) => (new SummarizingError(details, logged) as IError);
