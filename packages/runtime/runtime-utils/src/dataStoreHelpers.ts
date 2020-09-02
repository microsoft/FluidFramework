/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import assert from "assert";
import {
    IFluidObject,
    IFluidRouter,
    IRequest,
} from "@fluidframework/core-interfaces";

export async function requestFluidObject<T = IFluidObject>(
    router: IFluidRouter, url: string | IRequest): Promise<T> {
    const request = typeof url === "string" ? { url } : url;
    const response = await router.request(request);

    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error("Not Found");
    }

    assert(response.value);
    return response.value as T;
}
