/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { FluidObject } from "@fluidframework/core-interfaces";
import { IContainer } from "@fluidframework/container-definitions";

/**
 * Helper function for getting the default Fluid Object from a Container. This function only works for
 * Containers that support "/" request.
 *
 * @typeParam T - Defines the type you expect to be returned.
 *
 * @param container - Container you're attempting to get the object from
 */
export async function getDefaultObjectFromContainer<T = FluidObject>(container: IContainer): Promise<T> {
    const url = "/";
    const response = await container.request({ url });

    // Verify the response
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Unable to retrieve Fluid object at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return response.value;
}

/**
 * Helper function for getting as Fluid Object from a Container given a Unique Id. This function only works for
 * Containers that support getting FluidObjects via request.
 *
 * @typeParam T - Defines the type you expect to be returned.
 *
 * @param id - Unique id of the FluidObject
 * @param container - Container you're attempting to get the object from
 */
export async function getObjectWithIdFromContainer<T = FluidObject>(
    id: string, container: IContainer): Promise<T> {
    const url = `/${id}`;
    const response = await container.request({ url });

    // Verify the response
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Unable to retrieve Fluid object with ID: "${id}" from URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response for ID: "${id}" from URL: "${url}"`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return response.value;
}

/**
 * Helper function for getting a Fluid Object from a Container given a path/url. This function only works for
 * Containers that support getting FluidObjects via request.
 *
 * @typeParam T - Defines the type you expect to be returned.
 *
 * @param path - Unique path/url of the FluidObject
 * @param container - Container you're attempting to get the object from
 */
export async function getObjectFromContainer<T = FluidObject>(
    path: string, container: IContainer): Promise<T> {
    const response = await container.request({ url: path });

    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Unable to retrieve Fluid object with from URL: "${path}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response for from URL: "${path}"`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return response.value;
}
