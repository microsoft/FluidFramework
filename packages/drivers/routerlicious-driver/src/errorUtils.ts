/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	DriverError,
	DriverErrorTypes,
	IDriverErrorBase,
} from "@fluidframework/driver-definitions/internal";
import {
	AuthorizationError,
	GenericNetworkError,
	NonRetryableError,
	createGenericNetworkError,
} from "@fluidframework/driver-utils/internal";
import { IFluidErrorBase } from "@fluidframework/telemetry-utils/internal";

import { pkgVersion as driverVersion } from "./packageVersion.js";

/**
 * Routerlicious Error types
 * Different error types that may be thrown by the routerlicious driver
 * @internal
 */
export const RouterliciousErrorTypes = {
	// Inherit base driver error types
	...DriverErrorTypes,

	/**
	 * SSL Certificate Error.
	 */
	sslCertError: "sslCertError",
} as const;
/**
 * @internal
 */
export type RouterliciousErrorTypes =
	(typeof RouterliciousErrorTypes)[keyof typeof RouterliciousErrorTypes];

/**
 * Interface for error responses for the WebSocket connection
 * Intended to be compatible with output from `NetworkError.toJSON`.
 */
export interface IR11sSocketError {
	/**
	 * An error code number for the error that occurred.
	 * It will be a valid HTTP status code.
	 */
	code: number;

	/**
	 * A message about the error that occurred for debugging / logging purposes.
	 * This should not be displayed to the user directly.
	 */
	message: string;

	/**
	 * Optional Retry-After time in seconds.
	 * The client should wait this many seconds before retrying its request.
	 */
	retryAfter?: number;

	/**
	 * Optional Retry-After time in milliseconds.
	 * The client should wait this many milliseconds before retrying its request.
	 */
	retryAfterMs?: number;
}

export interface IR11sError extends Omit<IDriverErrorBase, "errorType"> {
	readonly errorType: RouterliciousErrorTypes;
}

export type R11sError = DriverError | IR11sError;

export function createR11sNetworkError(
	errorMessage: string,
	statusCode: number,
	retryAfterMs?: number,
): IFluidErrorBase & R11sError {
	let error: IFluidErrorBase & R11sError;
	const props = { statusCode, driverVersion };
	switch (statusCode) {
		case 401:
		// The first 401 is manually retried in RouterliciousRestWrapper with a refreshed token,
		// so we treat repeat 401s the same as 403.
		case 403:
			error = new AuthorizationError(errorMessage, undefined, undefined, props);
			break;
		case 404:
			const errorType = RouterliciousErrorTypes.fileNotFoundOrAccessDeniedError;
			error = new NonRetryableError(errorMessage, errorType, props);
			break;
		case 429:
			error = createGenericNetworkError(errorMessage, { canRetry: true, retryAfterMs }, props);
			break;
		case 500:
		case 502:
			error = new GenericNetworkError(errorMessage, true, props);
			break;
		default:
			const retryInfo = { canRetry: retryAfterMs !== undefined, retryAfterMs };
			error = createGenericNetworkError(errorMessage, retryInfo, props);
			break;
	}
	error.addTelemetryProperties({ endpointReached: true });
	return error;
}

export function throwR11sNetworkError(
	errorMessage: string,
	statusCode: number,
	retryAfterMs?: number,
): never {
	const networkError = createR11sNetworkError(errorMessage, statusCode, retryAfterMs);

	throw networkError;
}

/**
 * Returns network error based on error object from R11s socket (IR11sSocketError)
 */
export function errorObjectFromSocketError(
	socketError: IR11sSocketError,
	handler: string,
): R11sError {
	// pre-0.58 error message prefix: R11sSocketError
	const message = `R11s socket error (${handler}): ${socketError.message}`;
	return createR11sNetworkError(message, socketError.code, socketError.retryAfterMs);
}
