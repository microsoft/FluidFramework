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
import { ITelemetryProperties } from "@fluidframework/common-definitions";
import { IFluidErrorBase, LoggingError } from "@fluidframework/telemetry-utils";

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
export class GenericNetworkError extends LoggingError implements IDriverErrorBase, IFluidErrorBase {
    readonly errorType = DriverErrorType.genericNetworkError;

    constructor(
        readonly fluidErrorCode: string,
        message: string,
        readonly canRetry: boolean,
        props?: ITelemetryProperties,
    ) {
        super(message, props);
    }
}

// Todo GH #6214: Remove after next drive def bump. This is necessary as there is no
// compatible way to augment an enum, as it can't be optional. So for now
// we need to duplicate the value here. We likely need to rethink our
// DriverErrorType strategy so that it supports extension with optional
// value.
const deltaStreamConnectionForbiddenStr = "deltaStreamConnectionForbidden";
export class DeltaStreamConnectionForbiddenError extends LoggingError implements IFluidErrorBase {
    static readonly errorType: string =
        DriverErrorType[deltaStreamConnectionForbiddenStr] ?? deltaStreamConnectionForbiddenStr;
    readonly errorType: string = DeltaStreamConnectionForbiddenError.errorType;
    readonly canRetry = false;

    constructor(readonly fluidErrorCode: string) {
        super(fluidErrorCode, { statusCode: 400 });
    }
}

export class AuthorizationError extends LoggingError implements IAuthorizationError, IFluidErrorBase {
    readonly errorType = DriverErrorType.authorizationError;
    readonly canRetry = false;

    constructor(
        readonly fluidErrorCode: string,
        message: string,
        readonly claims: string | undefined,
        readonly tenantId: string | undefined,
        props?: ITelemetryProperties,
    ) {
        // don't log claims or tenantId
        super(message, props, new Set(["claims", "tenantId"]));
    }
}

export class NetworkErrorBasic<T extends string> extends LoggingError implements IFluidErrorBase {
    constructor(
        readonly fluidErrorCode: string,
        message: string,
        readonly errorType: T,
        readonly canRetry: boolean,
        props?: ITelemetryProperties,
    ) {
        super(message, props);
    }
}

export class NonRetryableError<T extends string> extends NetworkErrorBasic<T> {
    constructor(
        fluidErrorCode: string,
        message: string | undefined,
        readonly errorType: T,
        props?: ITelemetryProperties,
    ) {
        super(fluidErrorCode, message ?? fluidErrorCode, errorType, false, props);
    }
}

export class RetryableError<T extends string> extends NetworkErrorBasic<T> {
    constructor(
        fluidErrorCode: string,
        message: string | undefined,
        readonly errorType: T,
        props?: ITelemetryProperties,
    ) {
        super(fluidErrorCode, message ?? fluidErrorCode, errorType, true, props);
    }
}

//* Check
/**
 * Throttling error class - used to communicate all throttling errors
 */
export class ThrottlingError extends LoggingError implements IThrottlingWarning, IFluidErrorBase {
    readonly errorType = DriverErrorType.throttlingError;
    readonly canRetry = true;

    constructor(
        readonly fluidErrorCode: string,
        message: string,
        readonly retryAfterSeconds: number,
        props?: ITelemetryProperties,
    ) {
        super(message, props);
    }
}

export const createWriteError = (fluidErrorCode: string) =>
    new NonRetryableError(fluidErrorCode, fluidErrorCode, DriverErrorType.writeError);

export function createGenericNetworkError(
    fluidErrorCode: string,
    message: string | undefined,
    canRetry: boolean,
    retryAfterMs?: number,
    props?: ITelemetryProperties,
): ThrottlingError | GenericNetworkError {
    if (retryAfterMs !== undefined && canRetry) {
        return new ThrottlingError(fluidErrorCode, message ?? fluidErrorCode, retryAfterMs / 1000, props);
    }
    return new GenericNetworkError(fluidErrorCode, message ?? fluidErrorCode, canRetry, props);
}

/**
 * Check if a connection error can be retried.  Unless explicitly allowed, retry is disallowed.
 * I.e. asserts or unexpected exceptions in our code result in container failure.
 * @param error - The error to inspect for ability to retry
 */
export const canRetryOnError = (error: any): boolean => error?.canRetry === true;

export const getRetryDelaySecondsFromError = (error: any): number | undefined =>
    error?.retryAfterSeconds as number | undefined;

export const getRetryDelayFromError = (error: any): number | undefined => error?.retryAfterSeconds !== undefined ?
    error.retryAfterSeconds * 1000 : undefined;
