/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
// eslint-disable-next-line import/no-deprecated
import { FluidObject, IFluidRouter, IRequest, IResponse } from "@fluidframework/core-interfaces";
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
 * @deprecated Will be removed in future major release. Migrate all usage of IFluidRouter to the "entryPoint" pattern. Refer to Removing-IFluidRouter.md
 */
export async function requestFluidObject<T = FluidObject>(
	// eslint-disable-next-line import/no-deprecated
	router: IFluidRouter,
	url: string | IRequest,
): Promise<T> {
	const request = typeof url === "string" ? { url } : url;
	const response = await router.request(request);

	if (response.status !== 200 || response.mimeType !== "fluid/object") {
		throw responseToException(response, request);
	}

	assert(response.value, 0x19a /* "Invalid response value for Fluid object request" */);
	return response.value as T;
}

export const create404Response = (request: IRequest) =>
	createResponseError(404, "not found", request);

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

export type Factory = IFluidDataStoreFactory & Partial<IProvideFluidDataStoreRegistry>;

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
