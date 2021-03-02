/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IFluidObject,
    IFluidRouter,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import {
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    IProvideFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions";

interface IResponseException extends Error {
    errorFromRequestFluidObject: true;
    message: string;
    code: number;
    stack: string;
}

export function getStack() {
    const err = new Error();
    if (err.stack !== undefined) {
        return err.stack;
    }
    try {
        throw err;
    } catch (err2) {
        return (err2 as Error).stack;
    }
}

export function exceptionToResponse(err: any): IResponse {
    const status = 500;
    // eslint-disable-next-line no-null/no-null
    if (err !== null && typeof err === "object" && err.errorFromRequestFluidObject === true) {
        const responseErr: IResponseException = err;
        return {
            mimeType: "text/plain",
            status,
            value: responseErr.message,
            stack: responseErr.stack ?? getStack(),
        };
    }
    return {
        mimeType: "text/plain",
        status,
        value : `${err}`,
        stack: getStack(),
    };
}

export function responseToException(response: IResponse, request: IRequest) {
    const message = response.value;
    const err = new Error(message);
    const responseErr = err as any as IResponseException;
    responseErr.errorFromRequestFluidObject = true;
    responseErr.message = message;
    responseErr.code = response.status;
    if (response.stack !== undefined) {
        try {
            // not clear if all browsers allow overwriting stack
            responseErr.stack = response.stack;
        } catch (err2) {}
    }
    return err;
}

export async function requestFluidObject<T = IFluidObject>(
    router: IFluidRouter, url: string | IRequest): Promise<T> {
    const request = typeof url === "string" ? { url } : url;
    const response = await router.request(request);

    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw responseToException(response, request);
    }

    assert(response.value);
    return response.value as T;
}

export const create404Response = (request: IRequest) => createResponseError(404, "not found", request);

export function createResponseError(status: number, value: string, request: IRequest): IResponse {
    assert(status !== 200);
    return {
        mimeType: "text/plain",
        status,
        value : request.url === undefined ? value : `${value}: ${request.url}`,
        stack: getStack(),
    };
}

export type Factory = IFluidDataStoreFactory & Partial<IProvideFluidDataStoreRegistry>;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function createDataStoreFactory(
    type: string,
    factory: Factory | Promise<Factory>,
    ): IFluidDataStoreFactory & IFluidDataStoreRegistry
{
    return {
        type,
        get IFluidDataStoreFactory() { return this; },
        get IFluidDataStoreRegistry() { return this; },
        instantiateDataStore: async (context) => (await factory).instantiateDataStore(context),
        get: async (name: string) => (await factory).IFluidDataStoreRegistry?.get(name),
    };
}
