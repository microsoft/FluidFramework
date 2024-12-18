/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { DriverErrorTypes } from "@fluidframework/driver-definitions/internal";
import {
	AuthorizationError,
	DriverErrorTelemetryProps,
	FluidInvalidSchemaError,
	NonRetryableError,
	OnlineStatus,
	RetryableError,
	createGenericNetworkError,
	isOnline,
} from "@fluidframework/driver-utils/internal";
import {
	IOdspErrorAugmentations,
	OdspError,
	OdspErrorTypes,
} from "@fluidframework/odsp-driver-definitions/internal";
import {
	IFluidErrorBase,
	LoggingError,
	numberFromString,
} from "@fluidframework/telemetry-utils/internal";

// odsp-doclib-utils and odsp-driver will always release together and share the same pkgVersion
import { pkgVersion as driverVersion } from "./packageVersion.js";
import { parseAuthErrorClaims } from "./parseAuthErrorClaims.js";
import { parseAuthErrorTenant } from "./parseAuthErrorTenant.js";

// no response, or can't parse response
/**
 * @internal
 */
export const fetchIncorrectResponse = 712;
// Error code for when the server state is read only and client tries to write. This code is set by the server
// and is not likely to change.
/**
 * @internal
 */
export const OdspServiceReadOnlyErrorCode = "serviceReadOnly";

/**
 * @internal
 */
export function getSPOAndGraphRequestIdsFromResponse(headers: {
	get: (id: string) => string | undefined | null;
}) {
	interface LoggingHeader {
		headerName: string;
		logName: string;
	}

	// We rename headers so that otel doesn't scrub them away. Otel doesn't allow
	// certain characters in headers including '-'
	const headersToLog: LoggingHeader[] = [
		{ headerName: "sprequestguid", logName: "sprequestguid" },
		{ headerName: "request-id", logName: "requestId" },
		{ headerName: "client-request-id", logName: "clientRequestId" },
		{ headerName: "x-msedge-ref", logName: "xMsedgeRef" },
		{ headerName: "X-Fluid-Retries", logName: "serverRetries" },
		{ headerName: "content-encoding", logName: "contentEncoding" },
		{ headerName: "content-type", logName: "contentType" },
	];
	const additionalProps: ITelemetryBaseProperties = {
		sprequestduration: numberFromString(headers.get("sprequestduration")),
		contentsize: numberFromString(headers.get("content-length")),
	};
	headersToLog.forEach((header) => {
		const headerValue = headers.get(header.headerName);
		if (headerValue !== undefined && headerValue !== null) {
			additionalProps[header.logName] = headerValue;
		}
	});

	// x-fluid-telemetry contains a key value pair in the following format:
	// x-fluid-telemetry:key1=value1,key2,key3=value3,
	// Ex. x-fluid-telemetry:Origin=c
	const fluidTelemetry = headers.get("x-fluid-telemetry");
	if (fluidTelemetry !== undefined && fluidTelemetry !== null) {
		additionalProps.xFluidTelemetry = fluidTelemetry;
		const keyValueMap = fluidTelemetry
			.split(",")
			.map((keyValuePair) => keyValuePair.split("="));
		for (const [key, value] of keyValueMap) {
			if ("Origin" === key.trim()) {
				let fieldValue: string;
				switch (value?.trim()) {
					case "c":
						fieldValue = "cache";
						break;
					case "g":
						fieldValue = "graph";
						break;
					default:
						fieldValue = value?.trim();
				}
				const logName = "responseOrigin";
				additionalProps[logName] = fieldValue;
				break;
			}
		}
	}
	return additionalProps;
}

/**
 * Empirically-based model of error response inner error from ODSP
 *
 * @internal
 */
export interface OdspErrorResponseInnerError {
	code?: string;
	innerError?: OdspErrorResponseInnerError;
}

/**
 * Empirically-based model of error responses from ODSP
 *
 * @internal
 */
export interface OdspErrorResponse {
	error: OdspErrorResponseInnerError & {
		message: string;
	};
}

/**
 * Error encapsulating the error response from ODSP containing the redirect location when a resource has moved
 *
 * @internal
 */
export class OdspRedirectError extends LoggingError implements IFluidErrorBase {
	readonly errorType = DriverErrorTypes.fileNotFoundOrAccessDeniedError;
	readonly canRetry = false;

	constructor(
		message: string,
		readonly redirectLocation: string | undefined,
		props: DriverErrorTelemetryProps,
	) {
		// do not log redirectLocation (URL can contain sensitive info)
		super(message, props, new Set(["redirectLocation"]));
	}
}

/** Empirically-based type guard for error responses from ODSP */
function isOdspErrorResponse(x: any): x is OdspErrorResponse {
	const error = x?.error;
	return (
		typeof error?.message === "string" &&
		(error?.code === undefined || typeof error?.code === "string")
	);
}

/**
 * @internal
 */
export function tryParseErrorResponse(
	response: string | undefined,
): { success: true; errorResponse: OdspErrorResponse } | { success: false } {
	try {
		if (response !== undefined) {
			const parsed = JSON.parse(response);
			if (isOdspErrorResponse(parsed)) {
				return { success: true, errorResponse: parsed };
			}
		}
	} catch (e) {}
	return { success: false };
}

/**
 * @internal
 */
export function parseFacetCodes(errorResponse: OdspErrorResponse): string[] {
	const stack: string[] = [];
	let error: OdspErrorResponseInnerError | undefined = errorResponse.error;
	while (typeof error === "object" && error !== null) {
		if (error.code !== undefined) {
			stack.unshift(error.code);
		}
		error = error.innerError;
	}
	return stack;
}

/**
 * @internal
 */
export function createOdspNetworkError(
	errorMessage: string,
	statusCode: number,
	retryAfterSeconds?: number,
	response?: Response,
	responseText?: string,
	props: ITelemetryBaseProperties = {},
): IFluidErrorBase & OdspError {
	let error: IFluidErrorBase & OdspError;
	const parseResult = tryParseErrorResponse(responseText);
	let facetCodes: string[] | undefined;
	let innerMostErrorCode: string | undefined;
	if (parseResult.success) {
		const errorResponse = parseResult.errorResponse;
		// logging the error response message
		props.responseMessage = errorResponse.error.message;
		facetCodes = parseFacetCodes(errorResponse);
		if (facetCodes !== undefined) {
			innerMostErrorCode = facetCodes[0];
			props.innerMostErrorCode = innerMostErrorCode;
		}
	}

	let redirectLocation: string | undefined;
	const driverProps = { driverVersion, statusCode, ...props };

	switch (statusCode) {
		// The location of file can move on Spo. If the redirect:manual header is added to network call
		// it causes browser to not handle the redirects. Location header in such cases will contain the new location.
		// Refer: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/308
		case 301:
		case 302:
		case 303:
		case 307:
		case 308:
			redirectLocation = response?.headers.get("Location") ?? undefined;
			if (redirectLocation !== undefined) {
				error = new OdspRedirectError(errorMessage, redirectLocation, driverProps);
				break;
			}
		// Don't break here. Let it be a generic network error if redirectLocation is not there.
		case 400:
			if (innerMostErrorCode === "fluidInvalidSchema") {
				error = new FluidInvalidSchemaError(errorMessage, driverProps);
				break;
			}
			error = new NonRetryableError(
				errorMessage,
				DriverErrorTypes.genericNetworkError,
				driverProps,
			);
			break;
		case 401:
		case 403:
			// The server throws 403 status code with innerMostError code as "serviceReadOnly" for cases where the
			// database on server becomes readonly. The driver retries for such cases with exponential backup logic.
			if (innerMostErrorCode === OdspServiceReadOnlyErrorCode) {
				error = new RetryableError(errorMessage, OdspErrorTypes.serviceReadOnly, driverProps);
			} else if (
				innerMostErrorCode === "blockedIPAddress" ||
				innerMostErrorCode === "conditionalAccessPolicyEnforced"
			) {
				error = new NonRetryableError(
					"IP Address is blocked",
					OdspErrorTypes.blockedIPAddress,
					driverProps,
				);
			} else {
				const claims = response?.headers ? parseAuthErrorClaims(response.headers) : undefined;
				const tenantId = response?.headers
					? parseAuthErrorTenant(response.headers)
					: undefined;
				error = new AuthorizationError(errorMessage, claims, tenantId, driverProps);
			}
			break;
		case 404:
			if (parseResult.success) {
				// The location of file can move on Spo. If the manual redirect prefer header is added to network call
				// it returns 404 error instead of 308. Error thrown by server will contain the new redirect location.
				// For reference we can look here: \packages\drivers\odsp-driver\src\fetchSnapshot.ts
				const responseError = parseResult?.errorResponse?.error;
				redirectLocation = responseError?.["@error.redirectLocation"];
				if (redirectLocation !== undefined) {
					error = new OdspRedirectError(errorMessage, redirectLocation, driverProps);
					break;
				}
			}
			error = new NonRetryableError(
				errorMessage,
				DriverErrorTypes.fileNotFoundOrAccessDeniedError,
				driverProps,
			);
			break;
		case 406:
			error = new NonRetryableError(
				errorMessage,
				DriverErrorTypes.unsupportedClientProtocolVersion,
				driverProps,
			);
			break;
		case 410:
			error = new NonRetryableError(errorMessage, OdspErrorTypes.cannotCatchUp, driverProps);
			break;
		case 409:
			// This status code is sent by the server when the client and server epoch mismatches.
			// The client sets its epoch version in the calls it makes to the server and if that mismatches
			// with the server epoch version, the server throws this error code.
			// This indicates that the file/container has been modified externally.
			error = new NonRetryableError(
				errorMessage,
				DriverErrorTypes.fileOverwrittenInStorage,
				driverProps,
			);
			break;
		case 412:
			// "Precondition Failed" error - happens when uploadSummaryWithContext uses wrong parent.
			// Resubmitting same payload is not going to help, so this is non-recoverable failure!
			error = new NonRetryableError(
				errorMessage,
				DriverErrorTypes.genericNetworkError,
				driverProps,
			);
			break;
		case 413:
			error = new NonRetryableError(errorMessage, OdspErrorTypes.snapshotTooBig, driverProps);
			break;
		case 414:
			error = new NonRetryableError(
				errorMessage,
				OdspErrorTypes.invalidFileNameError,
				driverProps,
			);
			break;
		case 423: // File locked
			if (
				innerMostErrorCode === "resourceLocked" ||
				innerMostErrorCode === "resourceCheckedOut"
			) {
				error = new NonRetryableError(
					errorMessage,
					DriverErrorTypes.fileIsLocked,
					driverProps,
				);
				break;
			}
		case 500:
			error = new RetryableError(
				errorMessage,
				DriverErrorTypes.genericNetworkError,
				driverProps,
			);
			break;
		case 501:
			error = new NonRetryableError(errorMessage, OdspErrorTypes.fluidNotEnabled, driverProps);
			break;
		case 507:
			error = new NonRetryableError(
				errorMessage,
				DriverErrorTypes.outOfStorageError,
				driverProps,
			);
			break;
		case fetchIncorrectResponse:
			// Note that getWithRetryForTokenRefresh will retry it once, then it becomes non-retryable error
			error = new NonRetryableError(
				errorMessage,
				DriverErrorTypes.incorrectServerResponse,
				driverProps,
			);
			break;
		default:
			const retryAfterMs =
				retryAfterSeconds !== undefined ? retryAfterSeconds * 1000 : undefined;
			error = createGenericNetworkError(
				errorMessage,
				{ canRetry: true, retryAfterMs },
				driverProps,
			);
			break;
	}

	// Set this to true as createOdspNetworkError is called to handle error response from service.
	error.addTelemetryProperties({ endpointReached: true });
	enrichOdspError(error, response, facetCodes, undefined);
	return error;
}

/**
 * @internal
 */
export function enrichOdspError(
	error: IFluidErrorBase & OdspError,
	response?: Response,
	facetCodes?: string[],
	props: ITelemetryBaseProperties = {},
) {
	error.online = OnlineStatus[isOnline()];
	if (facetCodes !== undefined) {
		error.facetCodes = facetCodes;
	}

	if (response) {
		props.responseType = response.type;
		if (response.headers) {
			const headers = getSPOAndGraphRequestIdsFromResponse(response.headers);
			for (const key of Object.keys(headers)) {
				props[key] = headers[key];
			}
			error.serverEpoch = response.headers.get("x-fluid-epoch") ?? undefined;
		}
	}
	error.addTelemetryProperties(props);
	return error;
}

/**
 * Throws network error - an object with a bunch of network related properties
 * @internal
 */
export function throwOdspNetworkError(
	errorMessage: string,
	statusCode: number,
	response: Response,
	responseText?: string,
	props?: ITelemetryBaseProperties,
): never {
	const networkError = createOdspNetworkError(
		errorMessage,
		statusCode,
		numberFromHeader(response.headers.get("retry-after")) /* retryAfterSeconds */,
		response,
		responseText,
		props,
	);

	networkError.addTelemetryProperties({ odspError: true, storageServiceError: true });

	// eslint-disable-next-line @typescript-eslint/no-throw-literal
	throw networkError;
}

function numberFromHeader(header: string | null): number | undefined {
	if (header === null) {
		return undefined;
	}
	const n = Number(header);
	if (Number.isNaN(n)) {
		return undefined;
	}
	return n;
}

/**
 * @internal
 */
export function hasFacetCodes(x: any): x is Pick<IOdspErrorAugmentations, "facetCodes"> {
	return Array.isArray(x?.facetCodes);
}

/**
 * @internal
 */
export function hasRedirectionLocation(
	x: unknown,
): x is Pick<IOdspErrorAugmentations, "redirectLocation"> {
	return (
		x !== null &&
		typeof x === "object" &&
		"redirectLocation" in x &&
		typeof x?.redirectLocation === "string"
	);
}
