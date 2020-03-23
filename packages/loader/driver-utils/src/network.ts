/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IGenericNetworkError,
    IAccessDeniedError,
    IFileNotFoundError,
    IFatalError,
    IThrottlingError,
    IWriteError,
    ErrorType,
} from "@microsoft/fluid-driver-definitions";

class ErrorWithProps extends Error {
    // Return all properties
    public getCustomProperties(): object {
        const prop = {};
        // Could not use {...this} because it does not return properties of base class.
        for (const key of Object.getOwnPropertyNames(this)) {
            prop[key] = this[key];
        }
        return prop;
    }
}

export function createNetworkError(
    errorMessage: string,
    canRetry: boolean,
    statusCode?: number,
    retryAfterSeconds?: number,
    online: string = OnlineStatus[isOnline()],
) {
    if (statusCode === 401 || statusCode === 403) {
        return new AccessDeniedError(errorMessage, statusCode, canRetry, online);
    }
    if (statusCode === 404) {
        return new FileNotFoundError(errorMessage, statusCode, canRetry, online);
    }
    if (statusCode === 500) {
        return new FatalError(errorMessage);
    }
    if (retryAfterSeconds) {
        return new ThrottlingError(errorMessage, retryAfterSeconds);
    }
    return new GenericNetworkError(errorMessage, statusCode, canRetry, online);
}

/**
 * Network error error class - used to communicate general network errors
 */
class GenericNetworkError extends ErrorWithProps implements IGenericNetworkError {
    readonly errorType: ErrorType.generalConnectionError = ErrorType.generalConnectionError;

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
 * AccessDenied error class -
 * used to communicate Unauthorized/Forbidden error responses from the server
 */
class AccessDeniedError extends ErrorWithProps implements IAccessDeniedError {
    readonly errorType: ErrorType.accessDeniedError = ErrorType.accessDeniedError;

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
 * FileNotFound error class -
 * used to communicate File Not Found errors from the server
 */
class FileNotFoundError extends ErrorWithProps implements IFileNotFoundError {
    readonly errorType: ErrorType.fileNotFoundError = ErrorType.fileNotFoundError;

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

/**
 * Write error class - When attempting to write, without proper permissions
 */
export class WriteError extends ErrorWithProps implements IWriteError {
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
