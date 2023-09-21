/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IThrottlingWarning,
	IDriverErrorBase,
	IAuthorizationError,
	// eslint-disable-next-line import/no-deprecated
	DriverErrorType,
	ILocationRedirectionError,
	IResolvedUrl,
	DriverErrorTypes,
} from "@fluidframework/driver-definitions";
import { ITelemetryProperties } from "@fluidframework/core-interfaces";
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
	if (
		typeof navigator === "object" &&
		navigator !== null &&
		typeof navigator.onLine === "boolean"
	) {
		return navigator.onLine ? OnlineStatus.Online : OnlineStatus.Offline;
	}
	return OnlineStatus.Unknown;
}

/** Telemetry props with driver-specific required properties */
export type DriverErrorTelemetryProps = ITelemetryProperties & {
	driverVersion: string | undefined;
};

/**
 * Generic network error class.
 */
export class GenericNetworkError extends LoggingError implements IDriverErrorBase, IFluidErrorBase {
	// eslint-disable-next-line import/no-deprecated
	readonly errorType = DriverErrorType.genericNetworkError;

	constructor(message: string, readonly canRetry: boolean, props: DriverErrorTelemetryProps) {
		super(message, props);
	}
}

/**
 * FluidInvalidSchema error class.
 */
export class FluidInvalidSchemaError
	extends LoggingError
	implements IDriverErrorBase, IFluidErrorBase
{
	// eslint-disable-next-line import/no-deprecated
	readonly errorType = DriverErrorType.fluidInvalidSchema;
	readonly canRetry = false;

	constructor(message: string, props: DriverErrorTelemetryProps) {
		super(message, props);
	}
}

export class DeltaStreamConnectionForbiddenError
	extends LoggingError
	implements IDriverErrorBase, IFluidErrorBase
{
	// eslint-disable-next-line import/no-deprecated
	static readonly errorType = DriverErrorType.deltaStreamConnectionForbidden;
	readonly errorType = DeltaStreamConnectionForbiddenError.errorType;
	readonly canRetry = false;
	readonly storageOnlyReason: string | undefined;

	constructor(message: string, props: DriverErrorTelemetryProps, storageOnlyReason?: string) {
		super(message, { ...props, statusCode: 400 });
		this.storageOnlyReason = storageOnlyReason;
	}
}

export class AuthorizationError
	extends LoggingError
	implements IAuthorizationError, IFluidErrorBase
{
	// eslint-disable-next-line import/no-deprecated
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

export class LocationRedirectionError
	extends LoggingError
	implements ILocationRedirectionError, IFluidErrorBase
{
	// eslint-disable-next-line import/no-deprecated
	readonly errorType = DriverErrorType.locationRedirection;
	readonly canRetry = false;

	constructor(
		message: string,
		readonly redirectUrl: IResolvedUrl,
		props: DriverErrorTelemetryProps,
	) {
		// do not log redirectURL
		super(message, props, new Set(["redirectUrl"]));
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
	constructor(message: string, readonly errorType: T, props: DriverErrorTelemetryProps) {
		super(message, errorType, false, props);
	}
}

export class RetryableError<T extends string> extends NetworkErrorBasic<T> {
	constructor(message: string, readonly errorType: T, props: DriverErrorTelemetryProps) {
		super(message, errorType, true, props);
	}
}

/**
 * Throttling error class - used to communicate all throttling errors
 */
export class ThrottlingError extends LoggingError implements IThrottlingWarning, IFluidErrorBase {
	// eslint-disable-next-line import/no-deprecated
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
	new NonRetryableError(message, DriverErrorTypes.writeError, props);

export function createGenericNetworkError(
	message: string,
	retryInfo: { canRetry: boolean; retryAfterMs?: number },
	props: DriverErrorTelemetryProps,
): ThrottlingError | GenericNetworkError {
	if (retryInfo.retryAfterMs !== undefined && retryInfo.canRetry) {
		return new ThrottlingError(message, retryInfo.retryAfterMs / 1000, props);
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
export const getRetryDelayFromError = (error: any): number | undefined =>
	error?.retryAfterSeconds !== undefined ? error.retryAfterSeconds * 1000 : undefined;
