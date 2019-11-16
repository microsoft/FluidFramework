/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandle,
    IComponentHandleContext,
    IComponentSerializer,
} from "@microsoft/fluid-component-core-interfaces";

/**
 * Given a mostly-plain object that may have handle objects embedded within, return a string representation of an object
 * where the handle objects have been replaced with a serializable form.
 * @param value - The mostly-plain object
 * @param serializer - The serializer that knows how to convert handles into serializable format
 * @param context - The handle context for the container
 * @param bind - Bind any other handles we find in the object against this given handle.
 * @returns Result of strigifying an object
 */
export function serializeHandles(
    value: any,
    serializer: IComponentSerializer,
    context: IComponentHandleContext,
    bind: IComponentHandle,
): string | undefined {
    return value !== undefined
        ? serializer.stringify(
            value,
            context,
            bind)
        : value;
}

/**
 * Given a mostly-plain object that may have handle objects embedded within, will return a fully-plain object
 * where the handle objects have been replaced with a serializable form.
 * @param value - The mostly-plain object
 * @param serializer - The serializer that knows how to convert handles into serializable format
 * @param context - The handle context for the container
 * @param bind - Bind any other handles we find in the object against this given handle.
 * @returns The fully-plain object
 */
export function makeHandlesSerializable(
    value: any,
    serializer: IComponentSerializer,
    context: IComponentHandleContext,
    bind: IComponentHandle,
): object | undefined {
    const serialized = serializeHandles(
        value,
        serializer,
        context,
        bind);
    return serialized !== undefined ? JSON.parse(serialized) : undefined;
}

/**
 * Given a fully-plain object that may have serializable-form handles within, will return the mostly-plain object
 * with handle objects created instead.
 * @param value - The fully-plain object
 * @param serializer - The serializer that knows how to convert serializable-form handles into handle objects
 * @param context - The handle context for the container
 * @returns The mostly-plain object with handle objects within
 */
export function parseHandles(
    value: any,
    serializer: IComponentSerializer,
    context: IComponentHandleContext,
) {
    return value !== undefined ? serializer.parse(JSON.stringify(value), context) : value;
}
