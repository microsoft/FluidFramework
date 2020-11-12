/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IFluidObject,
    IFluidRouter,
    IRequest,
} from "@fluidframework/core-interfaces";
import {
    IFluidDataStoreFactory,
    IFluidDataStoreRegistry,
    IProvideFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions";

export async function requestFluidObject<T = IFluidObject>(
    router: IFluidRouter, url: string | IRequest): Promise<T> {
    const request = typeof url === "string" ? { url } : url;
    const response = await router.request(request);

    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        return Promise.reject(new Error("Not found"));
    }

    assert(response.value);
    return response.value as T;
}

export type Factory = IFluidDataStoreFactory & Partial<IProvideFluidDataStoreRegistry>;

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
