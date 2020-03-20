/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IConnectionError,
    IFatalError,
    IThrottlingError,
    IWriteError,
    ErrorType,
    ConnectionErrorType,
} from "@microsoft/fluid-driver-definitions";

/**
 * Network error error class - used to communicate all network errors
 */
export class NetworkError extends Error implements IConnectionError {
    readonly errorType: ErrorType.connectionError = ErrorType.connectionError;

    constructor(
        errorMessage: string,
        readonly statusCode?: number,
        readonly canRetry?: boolean,
        readonly online: string = OnlineStatus[isOnline()],
        readonly connectionErrorType: ConnectionErrorType = ConnectionErrorType.default,
    ) {
        super(errorMessage);
        if (statusCode === 401 || statusCode === 403) {
            this.connectionErrorType = ConnectionErrorType.accessDenied;
        }
        else if (statusCode === 404) {
            this.connectionErrorType = ConnectionErrorType.notFound;
        }
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
