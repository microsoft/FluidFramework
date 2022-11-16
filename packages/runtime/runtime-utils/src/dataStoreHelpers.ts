/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    FluidObject,
    IFluidRouter,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import {
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    IProvideFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions";
import { generateErrorWithStack, LoggingError, normalizeError } from "@fluidframework/telemetry-utils";

interface IResponseException extends Error {
    errorFromRequestFluidObject: true;
    message: string;
    code: number;
    stack?: string;
}

function isIResponseException(x: any): x is IResponseException {
    return (x as IResponseException | undefined)?.errorFromRequestFluidObject === true;
}

export function exceptionToResponse(err: any): IResponse {
    if (isIResponseException(err)) {
        const responseErr: IResponseException = err;
        return {
            mimeType: "text/plain",
            status: responseErr.code,
            value: responseErr.message,
            get stack() { return responseErr.stack; },
        };
    }

    const normalizedError = normalizeError(err);
    return {
        mimeType: "text/plain",
        status: 500,
        value: normalizedError.message,
        get stack() { return normalizedError.stack; },
    };
}

/**
 * Error class for error instances generated from an error IResponse
 */
class ResponseException extends LoggingError implements IResponseException {
    readonly errorFromRequestFluidObject: true = true;
    readonly code: number;
    constructor(response: IResponse) {
        const responseValue = response.value;
        const message = typeof responseValue === "string" ? responseValue : String(responseValue);
        super(message);

        this.code = response.status;
        if (response.stack !== undefined) {
            this.overwriteStack(response.stack);
        }
    }
}

export function responseToException(response: IResponse, request: IRequest): Error {
    return new ResponseException(response);
}

export async function requestFluidObject<T = FluidObject>(
    router: IFluidRouter, url: string | IRequest): Promise<T> {
    const request = typeof url === "string" ? { url } : url;
    const response = await router.request(request);

    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw responseToException(response, request);
    }

    assert(response.value, 0x19a /* "Invalid response value for Fluid object request" */);
    return response.value as T;
}

export const create404Response = (request: IRequest) => createResponseError(404, "not found", request);

export function createResponseError(status: number, value: string, request: IRequest): IResponse {
    assert(status !== 200, 0x19b /* "Cannot not create response error on 200 status" */);
    // Omit query string which could contain personal data (aka "PII")
    const urlNoQuery = request.url?.split("?")[0];

    // Capture error objects, not stack itself, as stack retrieval is very expensive operation, so we delay it
    const errWithStack = generateErrorWithStack();

    return {
        mimeType: "text/plain",
        status,
        value: urlNoQuery === undefined ? value : `${value}: ${urlNoQuery}`,
        get stack() { return errWithStack.stack; },
    };
}

export type Factory = IFluidDataStoreFactory & Partial<IProvideFluidDataStoreRegistry>;

export function createDataStoreFactory(
    type: string,
    factory: Factory | Promise<Factory>,
    ): IFluidDataStoreFactory & IFluidDataStoreRegistry {
    return {
        type,
        get IFluidDataStoreFactory() { return this; },
        get IFluidDataStoreRegistry() { return this; },
        instantiateDataStore: async (context, existing) => (await factory).instantiateDataStore(context, existing),
        get: async (name: string) => (await factory).IFluidDataStoreRegistry?.get(name),
    };
}
