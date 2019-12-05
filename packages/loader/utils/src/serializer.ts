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
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentHandle } from "./componentHandle";
import { isSerializedHandle } from "./utils";

/**
 * Retrieves the absolute URL for a handle
 */
function toAbsoluteUrl(handle: IComponentHandle): string {
    let result = "";
    let context: IComponentHandleContext | undefined = handle;

    while (context) {
        if (context.path) {
            result = `/${context.path}${result}`;
        }

        context = context.routeContext;
    }

    return result;
}

/**
 * Component serializer implementation
 */
export class ComponentSerializer implements IComponentSerializer {
    public get IComponentSerializer() { return this; }

    public stringify(input: any, context: IComponentHandleContext, bind: IComponentHandle): string {
        const contextAttached = bind.isAttached;

        const result = JSON.stringify(
            input,
            (key, value: IComponent) => {
                // directly return the value unless it's a handle
                const handle = value ? value.IComponentHandle : value;
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

                // If the handle contexts match then we can store a relative path. Otherwise we convert to an
                // absolute path.
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
        let root: IComponentHandleContext;

        return JSON.parse(
            input,
            (key, value) => {
                if (!isSerializedHandle(value)) {
                    return value;
                }

                // If the stored URL is absolute then we need to adjust the context from which we load. For
                // absolute URLs we load from the root context. Given this is not always needed we delay looking
                // up the root component until needed.
                const absoluteUrl = value.url.startsWith("/");
                if (absoluteUrl && !root) {
                    // Find the root context to use for absolute requests
                    root = context;
                    while (root.routeContext) {
                        root = root.routeContext;
                    }
                }

                const handle = new ComponentHandle(
                    absoluteUrl ? value.url.substr(1) : value.url,
                    absoluteUrl ? root : context);

                return handle;
            });
    }
}
