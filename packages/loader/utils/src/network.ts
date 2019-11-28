/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ErrorOrWarningType, IConnectionError, IThrottlingError } from "@microsoft/fluid-protocol-definitions";

/**
 * Network error error class - used to communicate all  network errors
 */
export class NetworkError extends Error implements IConnectionError {

    constructor(
            errorMessage: string,
            readonly type: ErrorOrWarningType.connectionError,
            readonly statusCode?: number,
            readonly canRetry?: boolean,
            readonly online = OnlineStatus[isOnline()]) {
        super(errorMessage);
    }

    // return all enumerable properties (i.e. exclude stack, message)
    public getCustomProperties(): object {
        return this;
    }
}

/**
 * Throttling error class - used to communicate all throttling errors
 */
export class ThrottlingError extends Error implements IThrottlingError {

    constructor(
            errorMessage: string,
            readonly type: ErrorOrWarningType.throttling,
            readonly retryAfterSeconds: number) {
        super(errorMessage);
    }

    public getCustomProperties() {
        const prop = {};
        for (const key of Object.getOwnPropertyNames(this)) {
            if (this[key]) {
                prop[key] = this[key];
            }
        }
        return prop;
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
    if (typeof navigator === "object" && navigator !== null && typeof navigator.onLine === "boolean") {
        return navigator.onLine ? OnlineStatus.Online : OnlineStatus.Offline;
    }
    return OnlineStatus.Unknown;
}
