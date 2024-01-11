/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IRequest, IResponse } from "@fluidframework/core-interfaces";
import {
	IFluidDataStoreFactory,
	IFluidDataStoreRegistry,
	IProvideFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions";
import { generateErrorWithStack } from "@fluidframework/telemetry-utils";

interface IResponseException extends Error {
	errorFromRequestFluidObject: true;
	message: string;
	code: number;
	stack?: string;
	underlyingResponseHeaders?: { [key: string]: any };
}

/**
 * @internal
 */
export function exceptionToResponse(err: any): IResponse {
	const status = 500;
	if (err !== null && typeof err === "object" && err.errorFromRequestFluidObject === true) {
		const responseErr: IResponseException = err;
		return {
			mimeType: "text/plain",
			status: responseErr.code,
			value: responseErr.message,
			get stack() {
				return responseErr.stack;
			},
			headers: responseErr.underlyingResponseHeaders,
		};
	}

	// Capture error objects, not stack itself, as stack retrieval is very expensive operation, so we delay it
	const errWithStack = generateErrorWithStack();

	return {
		mimeType: "text/plain",
		status,
		value: `${err}`,
		get stack() {
			return (err?.stack as string | undefined) ?? errWithStack.stack;
		},
	};
}

/**
 * @internal
 */
export function responseToException(response: IResponse, request: IRequest): Error {
	const message = response.value;
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
 * @internal
 */
export const create404Response = (request: IRequest) =>
	createResponseError(404, "not found", request);

/**
 * @internal
 */
export function createResponseError(
	status: number,
	value: string,
	request: IRequest,
	headers?: { [key: string]: any },
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
		instantiateDataStore: async (context, existing) =>
			(await factory).instantiateDataStore(context, existing),
		get: async (name: string) => (await factory).IFluidDataStoreRegistry?.get(name),
	};
}
