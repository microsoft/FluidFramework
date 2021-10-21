/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
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
import { waitForOpCatchUp } from "./waitForOpsCatchUp";

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
            status: responseErr.code,
            value: responseErr.message,
            stack: responseErr.stack ?? getStack(),
        };
    }
    return {
        mimeType: "text/plain",
        status,
        value: `${err}`,
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

    assert(response.value, 0x19a /* "Invalid response value for Fluid object request" */);
    return response.value as T;
}

export const create404Response = (request: IRequest) => createResponseError(404, "not found", request);

export function createResponseError(status: number, value: string, request: IRequest): IResponse {
    assert(status !== 200, 0x19b /* "Cannot not create response error on 200 status" */);
    // Omit query string which could contain personal data (aka "PII")
    const urlNoQuery = request.url?.split("?")[0];
    return {
        mimeType: "text/plain",
        status,
        value: urlNoQuery === undefined ? value : `${value}: ${urlNoQuery}`,
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
        instantiateDataStore: async (context, existing) => (await factory).instantiateDataStore(context, existing),
        get: async (name: string) => (await factory).IFluidDataStoreRegistry?.get(name),
    };
}

export async function waitAndCreateRootDataStore(
    runtime: IContainerRuntime,
    pkg: string | string[],
    rootDataStoreId: string,
): Promise<IFluidRouter> {
    await waitForOpCatchUp(runtime);

    try {
        return await runtime.getRootDataStore(rootDataStoreId, false /* wait */);
    } catch (error) {
        if (error.code !== 404) {
            throw error;
        }

        return runtime.createRootDataStore(pkg, rootDataStoreId);
        /*
        [TODO:aiacob] remove the above and enable the code below
        after the alias function is added to the IContainerRuntime interface

        const newDataStore = await runtime.createRootDataStore(pkg, rootDataStoreId)
            as unknown as IFluidDataStoreChannel;
        const aliasResult = await runtime.trySetDataStoreAlias(newDataStore, rootDataStoreId);
        return aliasResult ? newDataStore : await runtime.getRootDataStore(rootDataStoreId);
        */
    }
}
