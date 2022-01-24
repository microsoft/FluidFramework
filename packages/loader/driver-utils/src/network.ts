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

/** Base class for driver errors that standardizes adding driverVersion for logging */
export abstract class DriverErrorWithVersion extends LoggingError {
    protected constructor(
        message: string,
        props: ITelemetryProperties,
        driverVersion: string,
        omitPropsFromLogging?: Set<string>,
    ) {
        super(message, props, omitPropsFromLogging)
        this.addTelemetryProperties({ driverVersion });
    }
}

/**
 * Generic network error class.
 */
export class GenericNetworkError extends DriverErrorWithVersion implements IDriverErrorBase, IFluidErrorBase {
    readonly errorType = DriverErrorType.genericNetworkError;

    constructor(
        readonly fluidErrorCode: string,
        message: string,
        readonly canRetry: boolean,
        driverVersion: string,
        props: ITelemetryProperties = {},
    ) {
        super(message, props, driverVersion);
    }
}

// Todo GH #6214: Remove after next drive def bump. This is necessary as there is no
// compatible way to augment an enum, as it can't be optional. So for now
// we need to duplicate the value here. We likely need to rethink our
// DriverErrorType strategy so that it supports extension with optional
// value.
const deltaStreamConnectionForbiddenStr = "deltaStreamConnectionForbidden";
export class DeltaStreamConnectionForbiddenError extends DriverErrorWithVersion implements IFluidErrorBase {
    static readonly errorType: string =
        DriverErrorType[deltaStreamConnectionForbiddenStr] ?? deltaStreamConnectionForbiddenStr;
    readonly errorType: string = DeltaStreamConnectionForbiddenError.errorType;
    readonly canRetry = false;

    constructor(readonly fluidErrorCode: string, driverVersion: string) {
        super(fluidErrorCode, { statusCode: 400 }, driverVersion);
    }
}

export class AuthorizationError extends DriverErrorWithVersion implements IAuthorizationError, IFluidErrorBase {
    readonly errorType = DriverErrorType.authorizationError;
    readonly canRetry = false;

    constructor(
        readonly fluidErrorCode: string,
        message: string,
        readonly claims: string | undefined,
        readonly tenantId: string | undefined,
        driverVersion: string,
        props: ITelemetryProperties = {},
    ) {
        // don't log claims or tenantId
        super(message, props, driverVersion, new Set(["claims", "tenantId"]));
    }
}

export class NetworkErrorBasic<T extends string> extends DriverErrorWithVersion implements IFluidErrorBase {
    constructor(
        readonly fluidErrorCode: string,
        message: string,
        readonly errorType: T,
        readonly canRetry: boolean,
        driverVersion: string,
        props: ITelemetryProperties = {},
    ) {
        super(message, props, driverVersion);
    }
}

export class NonRetryableError<T extends string> extends NetworkErrorBasic<T> {
    constructor(
        fluidErrorCode: string,
        message: string | undefined,
        readonly errorType: T,
        driverVersion: string,
        props?: ITelemetryProperties,
    ) {
        super(fluidErrorCode, message ?? fluidErrorCode, errorType, false, driverVersion, props);
    }
}

export class RetryableError<T extends string> extends NetworkErrorBasic<T> {
    constructor(
        fluidErrorCode: string,
        message: string | undefined,
        readonly errorType: T,
        driverVersion: string,
        props?: ITelemetryProperties,
    ) {
        super(fluidErrorCode, message ?? fluidErrorCode, errorType, true, driverVersion, props);
    }
}

//* Check
/**
 * Throttling error class - used to communicate all throttling errors
 */
export class ThrottlingError extends DriverErrorWithVersion implements IThrottlingWarning, IFluidErrorBase {
    readonly errorType = DriverErrorType.throttlingError;
    readonly canRetry = true;

    constructor(
        readonly fluidErrorCode: string,
        message: string,
        readonly retryAfterSeconds: number,
        driverVersion: string,
        props: ITelemetryProperties = {},
    ) {
        super(message, props, driverVersion);
    }
}

export const createWriteError = (fluidErrorCode: string, driverVersion: string) =>
    new NonRetryableError(fluidErrorCode, undefined, DriverErrorType.writeError, driverVersion);

export function createGenericNetworkError(
    fluidErrorCode: string,
    message: string | undefined,
    retryInfo: {canRetry: boolean, retryAfterMs?: number },
    driverVersion: string,
    props?: ITelemetryProperties,
): ThrottlingError | GenericNetworkError {
    if (retryInfo.retryAfterMs !== undefined && retryInfo.canRetry) {
        return new ThrottlingError(
            fluidErrorCode, message ?? fluidErrorCode, retryInfo.retryAfterMs / 1000, driverVersion, props);
    }
    return new GenericNetworkError(fluidErrorCode, message ?? fluidErrorCode, retryInfo.canRetry, driverVersion, props);
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
