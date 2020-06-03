/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    CriticalContainerError,
    IGenericNetworkError,
    NetworkErrorBasicTypes,
    INetworkErrorBasic,
    IThrottlingWarning,
    ErrorType,
    IErrorBase,
} from "@fluidframework/container-definitions";
import { CustomErrorWithProps } from "@fluidframework/telemetry";

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
export class GenericNetworkError extends CustomErrorWithProps implements IGenericNetworkError {
    readonly errorType = ErrorType.genericNetworkError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
        readonly statusCode?: number,
    ) {
        super(errorMessage);
    }
}

export class NetworkErrorBasic extends CustomErrorWithProps implements INetworkErrorBasic {
    constructor(
        errorMessage: string,
        readonly errorType: NetworkErrorBasicTypes,
        readonly canRetry: boolean,
    ) {
        super(errorMessage);
    }
}

export class NonRetryableError extends NetworkErrorBasic implements IErrorBase {
    constructor(
        errorMessage: string,
        readonly errorType: NetworkErrorBasicTypes,
        readonly canRetry: boolean,
    ) {
        super(errorMessage, errorType, canRetry);
        assert(!canRetry);
    }
}

/**
 * Throttling error class - used to communicate all throttling errors
 */
class ThrottlingError extends CustomErrorWithProps implements IThrottlingWarning {
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

export const createWriteError = (errorMessage: string) =>
    new NonRetryableError(errorMessage, ErrorType.writeError, false) as INetworkErrorBasic;

export function createGenericNetworkError(
    errorMessage: string,
    canRetry: boolean,
    retryAfterSeconds?: number,
    statusCode?: number) {
    let error: CriticalContainerError;
    if (retryAfterSeconds !== undefined && canRetry) {
        error = new ThrottlingError(errorMessage, retryAfterSeconds, statusCode);
    }
    else {
        error = new GenericNetworkError(errorMessage, canRetry, statusCode);
    }
    return error;
}
