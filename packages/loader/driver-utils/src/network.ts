/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IThrottlingWarning,
    IDriverErrorBase,
    DriverErrorType,
} from "@fluidframework/driver-definitions";
import { CustomErrorWithProps } from "@fluidframework/telemetry-utils";

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
export class GenericNetworkError extends CustomErrorWithProps implements IDriverErrorBase {
    readonly errorType = DriverErrorType.genericNetworkError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
        readonly statusCode?: number,
    ) {
        super(errorMessage);
    }
}

export class NetworkErrorBasic<T> extends CustomErrorWithProps {
    constructor(
        errorMessage: string,
        readonly errorType: T,
        readonly canRetry: boolean,
    ) {
        super(errorMessage);
    }
}

export class NonRetryableError<T> extends NetworkErrorBasic<T> {
    constructor(
        errorMessage: string,
        readonly errorType: T,
    ) {
        super(errorMessage, errorType, false);
    }
}

/**
 * Throttling error class - used to communicate all throttling errors
 */
export class ThrottlingError extends CustomErrorWithProps implements IThrottlingWarning {
    readonly errorType = DriverErrorType.throttlingError;
    readonly canRetry = true;

    constructor(
        errorMessage: string,
        readonly retryAfterSeconds: number,
        readonly statusCode?: number,
    ) {
        super(errorMessage);
    }
}

export const createWriteError = (errorMessage: string) =>
    new NonRetryableError(errorMessage, DriverErrorType.writeError);

export function createGenericNetworkError(
    errorMessage: string,
    canRetry: boolean,
    retryAfterSeconds?: number,
    statusCode?: number) {
    if (retryAfterSeconds !== undefined && canRetry) {
        return new ThrottlingError(errorMessage, retryAfterSeconds, statusCode);
    }
    return new GenericNetworkError(errorMessage, canRetry, statusCode);
}
