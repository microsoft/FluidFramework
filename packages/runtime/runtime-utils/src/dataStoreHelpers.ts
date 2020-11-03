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
    FluidDataStoreRegistryEntry,
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

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function createNamedDataStore<T extends FluidDataStoreRegistryEntry>(
    type: string,
    factory: T)
{
    return Object.create(factory, { type: { value: type, writable: false } }) as
        T & { type: string };
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function createNamedDelayedDataStore(
    type: string,
    factory: Promise<IFluidDataStoreFactory>): IFluidDataStoreFactory
{
    return {
        type,
        get IFluidDataStoreFactory() { return this; },
        instantiateDataStore: async (context) => {
            const f = await factory;
            assert(f.type === type, "Type mismatch");
            return f.instantiateDataStore(context);
        },
    };
}
