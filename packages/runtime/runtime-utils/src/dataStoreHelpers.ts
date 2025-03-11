/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest, IResponse } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IFluidDataStoreFactory,
	IFluidDataStoreRegistry,
	IProvideFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions/internal";
import { generateErrorWithStack } from "@fluidframework/telemetry-utils/internal";

interface IResponseException extends Error {
	errorFromRequestFluidObject: true;
	message: string;
	code: number;
	stack?: string;
	underlyingResponseHeaders?: { [key: string]: unknown };
}

/**
 * Type guard for determining if an error is an IResponseException
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
 * Converts an error object into an {@link @fluidframework/core-interfaces#IResponse}
 * @internal
 */
export function exceptionToResponse(err: unknown): IResponse {
	const status = 500;
	if (isResponseException(err)) {
		return {
			mimeType: "text/plain",
			status: err.code,
			value: err.message,
			get stack() {
				return err.stack;
			},
			headers: err.underlyingResponseHeaders,
		};
	}

	// Capture error objects, not stack itself, as stack retrieval is very expensive operation
	const errWithStack = generateErrorWithStack();

	return {
		mimeType: "text/plain",
		status,
		value: `${err}`,
		get stack() {
			// Use type assertion after checking if err is an object with stack
			return (
				(typeof err === "object" && err !== null && "stack" in err
					? (err.stack as string | undefined)
					: undefined) ?? errWithStack.stack
			);
		},
	};
}

/**
 * Converts an IResponse object back into an Error object that can be thrown
 * @param response - The IResponse object to convert
 * @param request - The original IRequest object
 * @returns An Error object with additional properties from the response
 * @internal
 */
export function responseToException(response: IResponse, request: IRequest): Error {
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
 * @returns An {@link @fluidframework/core-interfaces#IResponse } object with 404 status code
 * @legacy
 * @alpha
 */
export const create404Response = (request: IRequest): IResponse =>
	createResponseError(404, "not found", request);

/**
 * Creates an error response with the specified status code and message
 * @param status - HTTP status code for the error (must not be 200)
 * @param value - Error message or description
 * @param request - The request that resulted in this error
 * @param headers - Optional headers to include in the response
 * @returns An {@link @fluidframework/core-interfaces#IResponse } object representing the error
 * @internal
 */
export function createResponseError(
	status: number,
	value: string,
	request: IRequest,
	headers?: { [key: string]: unknown },
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

/**
 * @internal
 */
export type Factory = IFluidDataStoreFactory & Partial<IProvideFluidDataStoreRegistry>;

/**
 * Creates a combined IFluidDataStoreFactory and IFluidDataStoreRegistry implementation
 * from a factory type and implementation
 * @param type - The unique identifier for this data store factory
 * @param factory - The factory implementation or promise that resolves to one
 * @returns A combined factory and registry implementation
 * @internal
 */
export function createDataStoreFactory(
	type: string,
	factory: Factory | Promise<Factory>,
): IFluidDataStoreFactory & IFluidDataStoreRegistry {
	return {
		type,
		get IFluidDataStoreFactory() {
			return this;
		},
		get IFluidDataStoreRegistry() {
			return this;
		},
		instantiateDataStore: async (context, existing) => {
			const resolvedFactory = await factory;
			return resolvedFactory.instantiateDataStore(context, existing);
		},
		get: async (name: string) => {
			const resolvedFactory = await factory;
			return resolvedFactory.IFluidDataStoreRegistry?.get(name);
		},
	};
}
