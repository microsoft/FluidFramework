/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IGeneralConnectionError,
    IAccessDeniedError,
    IFileNotFoundError,
    IFatalError,
    IThrottlingError,
    IWriteError,
    ErrorType,
} from "@microsoft/fluid-driver-definitions";

export function createNetworkError(
    errorMessage: string,
    statusCode?: number,
    canRetry?: boolean,
    online: string = OnlineStatus[isOnline()],
) {
    if (statusCode === 401 || statusCode === 403) {
        return new AccessDeniedError(errorMessage, statusCode, canRetry, online);
    }
    if (statusCode === 404) {
        return new FileNotFoundError(errorMessage, statusCode, canRetry, online);
    }
    return new NetworkError(errorMessage, statusCode, canRetry, online);
}

/**
 * Network error error class - used to communicate general network errors
 */
export class NetworkError extends Error implements IGeneralConnectionError {
    readonly errorType: ErrorType.generalConnectionError = ErrorType.generalConnectionError;

    constructor(
        errorMessage: string,
        readonly statusCode?: number,
        readonly canRetry?: boolean,
        readonly online: string = OnlineStatus[isOnline()],
    ) {
        super(errorMessage);
    }

    // Return all properties
    public getCustomProperties(): object {
        return copyObjectProps(this);
    }
}

/**
 * AccessDenied error error class -
 * used to communicate Unauthorized/Forbidden error responses from the server
 */
export class AccessDeniedError extends Error implements IAccessDeniedError {
    readonly errorType: ErrorType.accessDeniedError = ErrorType.accessDeniedError;

    constructor(
        errorMessage: string,
        readonly statusCode?: number,
        readonly canRetry?: boolean,
        readonly online: string = OnlineStatus[isOnline()],
    ) {
        super(errorMessage);
    }

    // Return all properties
    public getCustomProperties(): object {
        return copyObjectProps(this);
    }
}

/**
 * FileNotFound error error class -
 * used to communicate File Not Found errors from the server
 */
export class FileNotFoundError extends Error implements IFileNotFoundError {
    readonly errorType: ErrorType.fileNotFoundError = ErrorType.fileNotFoundError;

    constructor(
        errorMessage: string,
        readonly statusCode?: number,
        readonly canRetry?: boolean,
        readonly online: string = OnlineStatus[isOnline()],
    ) {
        super(errorMessage);
    }

    // Return all properties
    public getCustomProperties(): object {
        return copyObjectProps(this);
    }
}

/**
 * Throttling error class - used to communicate all throttling errors
 */
export class ThrottlingError extends Error implements IThrottlingError {
    readonly errorType: ErrorType.throttlingError = ErrorType.throttlingError;

    constructor(errorMessage: string, readonly retryAfterSeconds: number) {
        super(errorMessage);
    }

    public getCustomProperties() {
        return copyObjectProps(this);
    }
}

export class WriteError extends Error implements IWriteError {
    readonly errorType: ErrorType.writeError = ErrorType.writeError;
    public readonly critical = true;

    constructor(errorMessage: string) {
        super(errorMessage);
    }

    public getCustomProperties() {
        return copyObjectProps(this);
    }
}

export class FatalError extends Error implements IFatalError {
    readonly errorType: ErrorType.fatalError = ErrorType.fatalError;
    public readonly critical = true;

    constructor(errorMessage: string) {
        super(errorMessage);
    }

    public getCustomProperties() {
        return copyObjectProps(this);
    }
}

export function copyObjectProps(obj: object) {
    const prop = {};
    // Could not use {...obj} because it does not return properties of base class.
    for (const key of Object.getOwnPropertyNames(obj)) {
        prop[key] = obj[key];
    }
    return prop;
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
