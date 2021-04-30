/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IThrottlingWarning,
    IDriverErrorBase,
    IAuthorizationError,
    DriverErrorType,
} from "@fluidframework/driver-definitions";
import { LoggingError, ITaggableTelemetryProperties } from "@fluidframework/telemetry-utils";

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
export class GenericNetworkError extends LoggingError implements IDriverErrorBase {
    readonly errorType = DriverErrorType.genericNetworkError;

    constructor(
        errorMessage: string,
        readonly canRetry: boolean,
        statusCode: number | undefined,
    ) {
        super(errorMessage, { statusCode });
    }
}

export class SessionForbiddenError extends LoggingError implements IDriverErrorBase {
    readonly errorType = DriverErrorType.sessionForbidden;
    readonly canRetry = false;

    constructor(errorMessage: string) {
        super(errorMessage, { statusCode: 400 });
    }
}

export class AuthorizationError extends LoggingError implements IAuthorizationError {
    readonly errorType = DriverErrorType.authorizationError;
    readonly canRetry = false;

    constructor(
        errorMessage: string,
        readonly claims: string | undefined,
        readonly tenantId: string | undefined,
        statusCode: number,
    ) {
        super(errorMessage, { statusCode });
    }
}

export class NetworkErrorBasic<T> extends LoggingError {
    constructor(
        errorMessage: string,
        readonly errorType: T,
        readonly canRetry: boolean,
        props?: ITaggableTelemetryProperties,
    ) {
        super(errorMessage, props);
    }
}

export class NonRetryableError<T> extends NetworkErrorBasic<T> {
    constructor(
        errorMessage: string,
        readonly errorType: T,
        props?: ITaggableTelemetryProperties,
    ) {
        super(errorMessage, errorType, false, props);
    }
}

export class RetryableError<T> extends NetworkErrorBasic<T> {
    constructor(
        errorMessage: string,
        readonly errorType: T,
        props?: ITaggableTelemetryProperties,
    ) {
        super(errorMessage, errorType, true, props);
    }
}

/**
 * Throttling error class - used to communicate all throttling errors
 */
export class ThrottlingError extends LoggingError implements IThrottlingWarning {
    readonly errorType = DriverErrorType.throttlingError;
    readonly canRetry = true;

    constructor(
        errorMessage: string,
        readonly retryAfterSeconds: number,
        statusCode?: number,
    ) {
        super(errorMessage, { statusCode });
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

/**
 * Check if a connection error can be retried.  Unless explicitly allowed, retry is disallowed.
 * I.e. asserts or unexpected exceptions in our code result in container failure.
 * @param error - The error to inspect for ability to retry
 */
export const canRetryOnError = (error: any): boolean => error?.canRetry === true;

// eslint-disable-next-line @typescript-eslint/no-unsafe-return
export const getRetryDelayFromError = (error: any): number | undefined => error?.retryAfterSeconds;
