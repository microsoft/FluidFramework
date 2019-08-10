/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHandle,
    IComponentHandleContext,
    IComponentSerializer,
    ISerializedHandle,
} from "@prague/component-core-interfaces";
import { isSerializedHandle } from "@prague/utils";
import { ComponentHandle } from "./componentHandle";
import { debug } from "./debug";

/**
 * Retrieves the absolute URL for a handle
 */
function toAbsoluteUrl(handle: IComponentHandle): string {
    let result = "";
    let context: IComponentHandleContext = handle;

    while (context) {
        if (context.path) {
            result = `/${context.path}${result}`;
        }

        context = context.routeContext;
    }

    return result;
}

export class ComponentSerializer implements IComponentSerializer {
    public stringify(input: any, context: IComponentHandleContext, bind: IComponentHandle): string {
        const contextAttached = bind.isAttached;

        const result = JSON.stringify(
            input,
            (key, value: IComponent) => {
                // directly return the value unless it's a handle
                const handle = value.IComponentHandle;
                if (!handle) {
                    return value;
                }

                // If the context that is now referencing the component is already attached then we immediately
                // attach the component. If it is not yet attached then we bind the reference to mark the dependency.
                if (contextAttached) {
                    handle.attach();
                } else {
                    bind.bind(handle);
                }

                // URL is provided relative to the given context
                const url = context === handle.routeContext
                    ? handle.path
                    : toAbsoluteUrl(handle);

                const serializedHandle: ISerializedHandle = {
                    type: "__fluid_handle__",
                    url,
                };

                return serializedHandle;
            });

        return result;
    }

    // parses the serialized data - context must match the context with which the JSON was stringified
    public parse(input: string, context: IComponentHandleContext) {
        return JSON.parse(
            input,
            (key, value) => {
                debug(`${key} => ${JSON.stringify(value)}`);
                if (!isSerializedHandle(value)) {
                    return value;
                }

                const handle = new ComponentHandle(value.url, context);

                return handle;
            });
    }
}
