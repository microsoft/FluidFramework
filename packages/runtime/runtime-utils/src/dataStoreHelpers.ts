/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { TelemetryDataTag, LoggingError } from "@fluidframework/telemetry-utils";
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

/** An error class modeling the exceptions arising from failed Fluid Object request routing */
class ResponseException extends LoggingError {
    public errorFromRequestFluidObject: true = true;
    public code: number;

    constructor(message: string, response: IResponse, url: string) {
        super(message);
        this.code = response.status;
        this.addTelemetryProperties({
            // Tag requestRoute as PackageData because it would contain DataStore/DDS ids
            requestRoute: { value: url.split("?")[0], tag: TelemetryDataTag.PackageData },
            responseValue: response.value,
            mimeType: response.mimeType,
        });
        if (response.stack !== undefined) {
            try {
                // not clear if all browsers allow overwriting stack
                this.stack = response.stack;
            } catch (_) {}
        }
    }

    public static is = (err: any): err is ResponseException => err?.errorFromRequestFluidObject === true;
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
    if (ResponseException.is(err)) {
        return {
            mimeType: "text/plain",
            status: err.code,
            value: err.message,
            stack: err.stack ?? getStack(),
        };
    }
    return {
        mimeType: "text/plain",
        status: 500,
        value: `${err}`,
        stack: getStack(),
    };
}

export const responseToException = (response: IResponse, request: IRequest): Error =>
    new ResponseException("Error routing FluidObject request", response, request.url);

export async function requestFluidObject<T = IFluidObject>(
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
    return {
        mimeType: "text/plain",
        status,
        value: request.url === undefined ? value : `${value}: ${request.url}`,
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
