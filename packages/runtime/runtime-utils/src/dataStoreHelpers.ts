/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRequest, IResponse } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type {
	IFluidDataStoreRuntime,
	IFluidDataStoreRuntimeAlpha,
} from "@fluidframework/datastore-definitions/internal";
import type {
	ContainerRuntimeBaseAlpha,
	IContainerRuntimeBase,
} from "@fluidframework/runtime-definitions/internal";
import {
	generateErrorWithStack,
	LoggingError,
	tagCodeArtifacts,
	type ITelemetryPropertiesExt,
} from "@fluidframework/telemetry-utils/internal";

/**
 * Internal metadata preserved on errors that roundtrip through an {@link IResponse}.
 * @internal
 */
export interface IResponseExceptionMetadata {
	code: number;
	underlyingResponseHeaders?: Record<string, unknown>;
}

interface IResponseWithOriginalError extends IResponse {
	originalError?: unknown;
}

/**
 * Symbol used to store internal response exception metadata on an Error object.
 * @internal
 */
export const responseExceptionMetadataSym = Symbol("responseExceptionMetadata");

/**
 * Error shape carrying internal response exception metadata via a symbol-indexed property.
 * @internal
 */
export type IErrorWithResponseExceptionMetadata = Error & {
	[responseExceptionMetadataSym]: IResponseExceptionMetadata;
};

type ResponseExceptionCompatibilityPropertyName =
	| "errorFromRequestFluidObject"
	| "code"
	| "underlyingResponseHeaders";

function mergeResponseExceptionMetadata<T extends Error>(
	error: T,
	response: IResponse,
): T & IErrorWithResponseExceptionMetadata {
	const responseExceptionMetadata: IResponseExceptionMetadata = {
		code: response.status,
		underlyingResponseHeaders: response.headers,
	};

	// This type accounts for the properties defined below
	const mergedErrorWithMetadata = error as T & IErrorWithResponseExceptionMetadata;

	// Attach the metadata to the error object itself
	Object.defineProperty(mergedErrorWithMetadata, responseExceptionMetadataSym, {
		value: responseExceptionMetadata,
		writable: true,
		configurable: true,
	});
	// Add getters for the IResponseException properties that pull from the metadata, for back-compat
	Object.defineProperties(mergedErrorWithMetadata, {
		errorFromRequestFluidObject: {
			get() {
				return true;
			},
			configurable: true,
		},
		code: {
			get() {
				return mergedErrorWithMetadata[responseExceptionMetadataSym].code;
			},
			configurable: true,
		},
		underlyingResponseHeaders: {
			get() {
				return mergedErrorWithMetadata[responseExceptionMetadataSym].underlyingResponseHeaders;
			},
			configurable: true,
		},
	} satisfies Partial<Record<ResponseExceptionCompatibilityPropertyName, unknown>>);

	return mergedErrorWithMetadata;
}

/**
 * Type guard for determining if an error carries response exception metadata.
 * @internal
 */
function hasResponseExceptionMetadata(
	err: unknown,
): err is IErrorWithResponseExceptionMetadata {
	return err !== null && typeof err === "object" && responseExceptionMetadataSym in err;
}

/**
 * Converts an error object into an {@link @fluidframework/core-interfaces#IResponse}.
 * @internal
 */
export function exceptionToResponse(error: unknown): IResponse {
	const status = 500;
	if (hasResponseExceptionMetadata(error)) {
		const responseExceptionMetadata = error[responseExceptionMetadataSym];
		return {
			mimeType: "text/plain",
			status: responseExceptionMetadata.code,
			value: error.message,
			get stack() {
				return error.stack;
			},
			headers: responseExceptionMetadata.underlyingResponseHeaders,
		};
	}

	// Both error generation, and accessing the stack value are expensive operations, so we only create an error if necessary, and then defer accessing the stack value until it is needed.
	const errWithStack =
		typeof error === "object" && error !== null && "stack" in error
			? (error as { stack: string })
			: generateErrorWithStack();

	return {
		mimeType: "text/plain",
		status,
		value: `${error}`,
		originalError: LoggingError.typeCheck(error) ? error : undefined,
		get stack() {
			return errWithStack.stack;
		},
	} satisfies IResponseWithOriginalError as IResponse;
}

/**
 * Converts an {@link @fluidframework/core-interfaces#IResponse} back into an Error object that can be thrown.
 * @param response - The {@link @fluidframework/core-interfaces#IResponse} to convert.
 * @param request - The original {@link @fluidframework/core-interfaces#IRequest}.
 * @returns An Error object with additional properties from the response
 * @internal
 */
export function responseToException(response: IResponse, request: IRequest): Error {
	const originalError = (response as IResponseWithOriginalError).originalError;
	if (LoggingError.typeCheck(originalError)) {
		return mergeResponseExceptionMetadata(originalError, response);
	}

	// As of 2025-08-20 the code seems to assume `response.value` is always a string.
	// This type assertion just encodes that assumption as we move to stricter linting rules, but it might need to be revisited.
	const message = response.value as string;
	// Both error generation, and accessing the stack value are expensive operations, so we only create an error if necessary, and then defer accessing the stack value until it is needed.
	const errWithStack = "stack" in response ? response : generateErrorWithStack();
	const responseErr = mergeResponseExceptionMetadata(new Error(message), response);
	Object.defineProperty(responseErr, "stack", {
		get() {
			return errWithStack.stack;
		},
		configurable: true,
	});

	return responseErr;
}

/**
 * Creates a 404 "not found" response for the given request
 * @param request - The request that resulted in the 404 response
 * @returns An {@link @fluidframework/core-interfaces#IResponse} with 404 status code.
 * @legacy
 * @beta
 */
export const create404Response = (request: IRequest): IResponse =>
	createResponseError(404, "not found", request);

/**
 * Creates an error response with the specified status code and message
 * @param status - HTTP status code for the error (must not be 200)
 * @param value - Error message or description
 * @param request - The request that resulted in this error
 * @param headers - Optional headers to include in the response
 * @returns An {@link @fluidframework/core-interfaces#IResponse} representing the error
 * @internal
 */
export function createResponseError(
	status: number,
	value: string,
	request: IRequest,
	headers?: Record<string, unknown>,
): IResponse {
	assert(status !== 200, 0x19b /* "Cannot not create response error on 200 status" */);
	// Omit query string which could contain personal data unfit for logging
	const urlNoQuery = request.url?.split("?")[0];

	// Both error generation, and accessing the stack value are expensive operations, so we only create an error if necessary, and then defer accessing the stack value until it is needed.
	const errWithStack = generateErrorWithStack();

	return {
		mimeType: "text/plain",
		status,
		value: urlNoQuery === undefined ? value : `${value}: ${urlNoQuery}`,
		get stack() {
			return errWithStack.stack;
		},
		headers,
	};
}

/**
 * Returns the canonical set of code-artifact-tagged telemetry properties identifying a data store.
 * Use this anywhere a data store identity needs to appear in telemetry, so all such logs use
 * consistent property names.
 * @internal
 */
export function dataStoreLoadTelemetryProps(props: {
	id: string;
	packagePath: readonly string[];
}): ITelemetryPropertiesExt {
	const { id, packagePath } = props;
	const dataStorePackagePath = packagePath.length > 0 ? packagePath.join("/") : undefined;
	return tagCodeArtifacts({
		dataStorePackagePath, // aka fullPackageName, before 2.103.0
		dataStoreId: id, // aka fluidDataStoreId, before 2.103.0
	});
}

/**
 * Converts types to their alpha counterparts to expose alpha functionality.
 * @legacy @alpha
 */
export function asLegacyAlpha(runtime: IContainerRuntimeBase): ContainerRuntimeBaseAlpha;
/**
 * Converts types to their alpha counterparts to expose alpha functionality.
 * @legacy @alpha
 */
export function asLegacyAlpha(runtime: IFluidDataStoreRuntime): IFluidDataStoreRuntimeAlpha;
/**
 * Converts types to their alpha counterparts to expose alpha functionality.
 * @legacy @alpha
 */
export function asLegacyAlpha(
	runtime: IFluidDataStoreRuntime | IContainerRuntimeBase,
): unknown {
	return runtime;
}
