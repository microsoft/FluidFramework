/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DriverError, IDriverErrorBase } from "@fluidframework/driver-definitions";
import {
	NonRetryableError,
	GenericNetworkError,
	createGenericNetworkError,
	AuthorizationError,
} from "@fluidframework/driver-utils";
import { IFluidErrorBase } from "@fluidframework/telemetry-utils";
import { pkgVersion as driverVersion } from "./packageVersion";

/**
 * Routerlicious Error types
 * Different error types that may be thrown by the routerlicious driver
 */
export enum RouterliciousErrorType {
	/**
	 * File not found, or file deleted during session
	 */
	fileNotFoundOrAccessDeniedError = "fileNotFoundOrAccessDeniedError",

	sslCertError = "sslCertError",
}

/**
 * Interface for error responses for the WebSocket connection
 * Intended to be compatible with output from {@link NetworkError.toJSON}
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
	readonly errorType: RouterliciousErrorType;
}

export type R11sError = DriverError | IR11sError;

export function createR11sNetworkError(
	errorMessage: string,
	statusCode?: number,
	retryAfterMs?: number,
	endpointReachable?: boolean,
): IFluidErrorBase & R11sError {
	let error: IFluidErrorBase & R11sError;
	const props = { statusCode, driverVersion };
	switch (statusCode) {
		case undefined:
			// If a service is temporarily down or a browser resource limit is reached, RestWrapper will throw
			// a network error with no status code (e.g. err:ERR_CONN_REFUSED or err:ERR_FAILED) and
			// the error message will start with NetworkError as defined in restWrapper.ts
			// If there exists a self-signed SSL certificates error, throw a NonRetryableError
			// TODO: instead of relying on string matching, filter error based on the error code like we do for websocket connections
			error = errorMessage.includes("failed, reason: self signed certificate")
				? new NonRetryableError(errorMessage, RouterliciousErrorType.sslCertError, props)
				: new GenericNetworkError(
						errorMessage,
						errorMessage.startsWith("NetworkError"),
						props,
				  );
			break;
		case 401:
		// The first 401 is manually retried in RouterliciousRestWrapper with a refreshed token,
		// so we treat repeat 401s the same as 403.
		case 403:
			error = new AuthorizationError(errorMessage, undefined, undefined, props);
			break;
		case 404:
			const errorType = RouterliciousErrorType.fileNotFoundOrAccessDeniedError;
			error = new NonRetryableError(errorMessage, errorType, props);
			break;
		case 429:
			error = createGenericNetworkError(
				errorMessage,
				{ canRetry: true, retryAfterMs },
				props,
			);
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
	error.addTelemetryProperties({ endpointReachable });
	return error;
}

export function throwR11sNetworkError(
	errorMessage: string,
	statusCode?: number,
	retryAfterMs?: number,
	endpointReachable?: boolean,
): never {
	const networkError = createR11sNetworkError(
		errorMessage,
		statusCode,
		retryAfterMs,
		endpointReachable,
	);

	// eslint-disable-next-line @typescript-eslint/no-throw-literal
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
	return createR11sNetworkError(
		message,
		socketError.code,
		socketError.retryAfterMs,
		true /* endpointReachable */,
	);
}
