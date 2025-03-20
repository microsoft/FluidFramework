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
	type DriverErrorTelemetryProps,
} from "@fluidframework/driver-utils/internal";
import { IFluidErrorBase, LoggingError } from "@fluidframework/telemetry-utils/internal";

import { R11sServiceClusterDrainingErrorCode } from "./contracts.js";
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

	/**
	 * Error for when the service drains a cluster to which the socket connection is connected to and it disconnects
	 * all the clients in that cluster.
	 */
	clusterDrainingError: "clusterDrainingError",
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

	/**
	 * Optional internalErrorCode to specify the specific error code for the error within the main code above.
	 */
	internalErrorCode?: string | number;
}

export class ClusterDrainingError extends LoggingError implements IFluidErrorBase {
	readonly errorType = RouterliciousErrorTypes.clusterDrainingError;
	readonly canRetry = true;

	constructor(
		message: string,
		readonly retryAfterSeconds: number,
		props: DriverErrorTelemetryProps,
	) {
		super(message, props);
	}
}

export interface IR11sError extends Omit<IDriverErrorBase, "errorType"> {
	readonly errorType: RouterliciousErrorTypes;
}

export type R11sError = DriverError | IR11sError;

export function createR11sNetworkError(
	errorMessage: string,
	statusCode: number,
	retryAfterMs?: number,
	additionalProps?: DriverErrorTelemetryProps,
	internalErrorCode?: string | number,
): IFluidErrorBase & R11sError {
	let error: IFluidErrorBase & R11sError;
	const props = { ...additionalProps, statusCode, driverVersion };
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
		case 503:
			if (internalErrorCode === R11sServiceClusterDrainingErrorCode) {
				error = new ClusterDrainingError(
					errorMessage,
					retryAfterMs !== undefined ? retryAfterMs / 1000 : 660,
					props,
				);
				break;
			}
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
	additionalProps?: DriverErrorTelemetryProps,
): never {
	throw createR11sNetworkError(errorMessage, statusCode, retryAfterMs, additionalProps);
}

/**
 * Returns network error based on error object from R11s socket (IR11sSocketError)
 */
export function errorObjectFromSocketError(
	socketError: IR11sSocketError,
	handler: string,
	additionalProps?: DriverErrorTelemetryProps,
): R11sError {
	// pre-0.58 error message prefix: R11sSocketError
	const message = `R11s socket error (${handler}): ${socketError.message}`;
	const error = createR11sNetworkError(
		message,
		socketError.code,
		socketError.retryAfterMs,
		additionalProps,
		socketError.internalErrorCode,
	);
	error.addTelemetryProperties({
		relayServiceError: true,
		scenarioName: handler,
		internalErrorCode: socketError.internalErrorCode,
	});
	return error;
}

/** Simulate the pathname for socket connection */
export const socketIoPath = "socket.io";

/**
 * Get a stripped version of a URL safe for r11s telemetry
 * @returns undefined if no appropriate hostName is provided
 */
export function getUrlForTelemetry(hostName: string, path: string = ""): string | undefined {
	// Strip off "http://" or "https://"
	const hostNameMatch = hostName.match(/^(?:https?:\/\/)?([^/]+)/);
	if (!hostNameMatch) {
		return undefined;
	}
	const strippedHostName = hostNameMatch[1];

	let extractedPath = "";
	// Extract portions of the path and explicitly match them to known path names
	for (const portion of path.split("/")) {
		if (portion !== "") {
			// eslint-disable-next-line unicorn/prefer-ternary
			if (
				[
					socketIoPath,
					"repos",
					"deltas",
					"documents",
					"session",
					"git",
					"summaries",
					"latest",
					"document",
					"commits",
					"blobs",
					"refs",
					"revokeToken",
					"accesstoken",
				].includes(portion)
			) {
				extractedPath += `/${portion}`;
			} else {
				extractedPath += "/REDACTED";
			}
		}
	}

	return `${strippedHostName}${extractedPath}`;
}
