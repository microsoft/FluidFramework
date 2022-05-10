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
    if (typeof navigator === "object" && navigator !== null && typeof navigator.onLine === "boolean") {
        return navigator.onLine ? OnlineStatus.Online : OnlineStatus.Offline;
    }
    return OnlineStatus.Unknown;
}

/**
 * Interface describing errors and warnings raised by any driver code.
 * Not expected to be implemented by a class or an object literal, but rather used in place of
 * any or unknown in various function signatures that pass errors around.
 *
 * "Any" in the interface name is a nod to the fact that errorType has lost its type constraint.
 * It will be either DriverErrorType or the specific driver's specialized error type enum,
 * but we can't reference a specific driver's error type enum in this code.
 */
 export interface IAnyDriverError extends Omit<IDriverErrorBase, "errorType"> {
    readonly errorType: string;
}

/** Telemetry props with driver-specific required properties */
export type DriverErrorTelemetryProps = ITelemetryProperties & { driverVersion: string | undefined; };

/**
 * Generic network error class.
 */
export class GenericNetworkError extends LoggingError implements IDriverErrorBase, IFluidErrorBase {
    readonly errorType = DriverErrorType.genericNetworkError;

    constructor(
        message: string,
        readonly canRetry: boolean,
        props: DriverErrorTelemetryProps,
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

    constructor(message: string, props: DriverErrorTelemetryProps) {
        super(message, { ...props, statusCode: 400 });
    }
}

export class AuthorizationError extends LoggingError implements IAuthorizationError, IFluidErrorBase {
    readonly errorType = DriverErrorType.authorizationError;
    readonly canRetry = false;

    constructor(
        message: string,
        readonly claims: string | undefined,
        readonly tenantId: string | undefined,
        props: DriverErrorTelemetryProps,
    ) {
        // don't log claims or tenantId
        super(message, props, new Set(["claims", "tenantId"]));
    }
}

export class NetworkErrorBasic<T extends string> extends LoggingError implements IFluidErrorBase {
    constructor(
        message: string,
        readonly errorType: T,
        readonly canRetry: boolean,
        props: DriverErrorTelemetryProps,
    ) {
        super(message, props);
    }
}

export class NonRetryableError<T extends string> extends NetworkErrorBasic<T> {
    constructor(
        message: string,
        readonly errorType: T,
        props: DriverErrorTelemetryProps,
    ) {
        super(message, errorType, false, props);
    }
}

export class RetryableError<T extends string> extends NetworkErrorBasic<T> {
    constructor(
        message: string,
        readonly errorType: T,
        props: DriverErrorTelemetryProps,
    ) {
        super(message, errorType, true, props);
    }
}

/**
 * Throttling error class - used to communicate all throttling errors
 */
export class ThrottlingError extends LoggingError implements IThrottlingWarning, IFluidErrorBase {
    readonly errorType = DriverErrorType.throttlingError;
    readonly canRetry = true;

    constructor(
        message: string,
        readonly retryAfterSeconds: number,
        props: DriverErrorTelemetryProps,
    ) {
        super(message, props);
    }
}

export const createWriteError = (message: string, props: DriverErrorTelemetryProps) =>
    new NonRetryableError(message, DriverErrorType.writeError, props);

export function createGenericNetworkError(
    message: string,
    retryInfo: { canRetry: boolean; retryAfterMs?: number; },
    props: DriverErrorTelemetryProps,
): ThrottlingError | GenericNetworkError {
    if (retryInfo.retryAfterMs !== undefined && retryInfo.canRetry) {
        return new ThrottlingError(
            message, retryInfo.retryAfterMs / 1000, props);
    }
    return new GenericNetworkError(message, retryInfo.canRetry, props);
}

/**
 * Check if a connection error can be retried.  Unless explicitly allowed, retry is disallowed.
 * I.e. asserts or unexpected exceptions in our code result in container failure.
 * @param error - The error to inspect for ability to retry
 */
export const canRetryOnError = (error: any): boolean => error?.canRetry === true;

/** Check retryAfterSeconds property on error */
export const getRetryDelaySecondsFromError = (error: any): number | undefined =>
    error?.retryAfterSeconds as number | undefined;

/** Check retryAfterSeconds property on error and convert to ms */
export const getRetryDelayFromError = (error: any): number | undefined => error?.retryAfterSeconds !== undefined ?
    error.retryAfterSeconds * 1000 : undefined;
