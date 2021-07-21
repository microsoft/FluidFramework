/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidHandle,
    IFluidSerializer,
} from "@fluidframework/core-interfaces";

/**
 * Given a mostly-plain object that may have handle objects embedded within, return a string representation of an object
 * where the handle objects have been replaced with a serializable form.
 * @param value - The mostly-plain object
 * @param serializer - The serializer that knows how to convert handles into serializable format
 * @param context - The handle context for the container
 * @param bind - Bind any other handles we find in the object against this given handle.
 * @returns Result of strigifying an object
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function serializeHandles(
    value: any,
    serializer: IFluidSerializer,
    bind: IFluidHandle,
): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return value !== undefined
        ? serializer.stringify(
            value,
            bind)
        : value;
}

/**
 * Given a mostly-plain object that may have handle objects embedded within, will return a fully-plain object
 * where any embedded IFluidHandles have been replaced with a serializable form.
 *
 * The original `input` object is not mutated.  This method will shallowly clones all objects in the path from
 * the root to any replaced handles.  (If no handles are found, returns the original object.)
 *
 * @param input - The mostly-plain object
 * @param context - The handle context for the container
 * @param bind - Bind any other handles we find in the object against this given handle.
 * @returns The fully-plain object
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function makeHandlesSerializable(
    value: any,
    serializer: IFluidSerializer,
    bind: IFluidHandle,
) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return serializer.replaceHandles(
        value,
        bind);
}

/**
 * Given a fully-plain object that may have serializable-form handles within, will return the mostly-plain object
 * with handle objects created instead.
 * @param value - The fully-plain object
 * @param serializer - The serializer that knows how to convert serializable-form handles into handle objects
 * @param context - The handle context for the container
 * @returns The mostly-plain object with handle objects within
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function parseHandles(
    value: any,
    serializer: IFluidSerializer,
) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return value !== undefined ? serializer.parse(JSON.stringify(value)) : value;
}
