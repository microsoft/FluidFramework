/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle, IComponentHandleContext, IComponentSerializer } from "@microsoft/fluid-component-core-interfaces";

export function serializeHandles(
    value: any,
    serializer: IComponentSerializer,
    context: IComponentHandleContext,
    bind: IComponentHandle,
) {
    return value !== undefined
        ? JSON.parse(serializer.stringify(
            value,
            context,
            bind))
        : value;
}

export function parseHandles(
    value: any,
    serializer: IComponentSerializer,
    context: IComponentHandleContext,
) {
    return value !== undefined ? serializer.parse(JSON.stringify(value), context) : value;
}
