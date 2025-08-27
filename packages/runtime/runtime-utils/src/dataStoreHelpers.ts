/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRequest, IResponse } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { generateErrorWithStack } from "@fluidframework/telemetry-utils/internal";

interface IResponseException extends Error {
	errorFromRequestFluidObject: true;
	message: string;
	code: number;
	stack?: string;
	underlyingResponseHeaders?: Record<string, unknown>;
}

/**
 * Type guard for determining if an error is an {@link IResponseException}.
 * @internal
 */
function isResponseException(err: unknown): err is IResponseException {
	return (
		err !== null &&
		typeof err === "object" &&
		"errorFromRequestFluidObject" in err &&
		(err as { errorFromRequestFluidObject: unknown }).errorFromRequestFluidObject === true
	);
}

/**
 * Converts an error object into an {@link @fluidframework/core-interfaces#IResponse}.
 * @internal
 */
export function exceptionToResponse(error: unknown): IResponse {
	const status = 500;
	if (isResponseException(error)) {
		return {
			mimeType: "text/plain",
			status: error.code,
			value: error.message,
			get stack() {
				return error.stack;
			},
			headers: error.underlyingResponseHeaders,
		};
	}

	// Capture error objects, not stack itself, as stack retrieval is very expensive operation
	const errWithStack = generateErrorWithStack();

	return {
		mimeType: "text/plain",
		status,
		value: `${error}`,
		get stack() {
			// Use type assertion after checking if error is an object with stack
			return (
				(typeof error === "object" && error !== null && "stack" in error
					? (error.stack as string | undefined)
					: undefined) ?? errWithStack.stack
			);
		},
	};
}

/**
 * Converts an {@link @fluidframework/core-interfaces#IResponse} back into an Error object that can be thrown.
 * @param response - The {@link @fluidframework/core-interfaces#IResponse} to convert.
 * @param request - The original {@link @fluidframework/core-interfaces#IRequest}.
 * @returns An Error object with additional properties from the response
 * @internal
 */
export function responseToException(response: IResponse, request: IRequest): Error {
	// As of 2025-08-20 the code seems to assume `response.value` is always a string.
	// This type assertion just encodes that assumption as we move to stricter linting rules, but it might need to be revisited.
	const message = response.value as string;
	const errWithStack = generateErrorWithStack();
	const responseErr: Error & IResponseException = {
		errorFromRequestFluidObject: true,
		message,
		name: "Error",
		code: response.status,
		get stack() {
			return response.stack ?? errWithStack.stack;
		},
		underlyingResponseHeaders: response.headers,
	};

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

	// Capture error objects, not stack itself, as stack retrieval is very expensive operation, so we delay it
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
