/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
 import {
    IFluidObject,
    IFluidRouter,
} from "@fluidframework/component-core-interfaces";

export async function requestFluidObject<T extends IFluidObject = IFluidObject>(
    router: IFluidRouter, url: string): Promise<T>
{
    const request = await router.request({ url });

    if (request.status !== 200 || request.mimeType !== "fluid/object") {
        return Promise.reject("Not found");
    }

    assert(request.value);
    return request.value as T;
}
