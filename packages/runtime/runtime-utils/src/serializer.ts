/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandle,
    IComponentHandleContext,
    IComponentSerializer,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentHandle } from "./componentHandle";
import { isSerializedHandle } from "./utils";

/**
 * Retrieves the absolute URL for a handle
 */
function toAbsoluteUrl(handle: IComponentHandle): string {
    let result = "";
    let context: IComponentHandleContext | undefined = handle;

    while (context !== undefined) {
        if (context.path !== "") {
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

    public replaceHandles(
        input: any,
        context: IComponentHandleContext,
        bind: IComponentHandle,
    ) {
        // If the given 'input' cannot contain handles, return it immediately.  Otherwise,
        // return the result of 'recursivelyReplaceHandles()'.
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        return !!input && typeof input === "object"
            ? this.recursivelyReplaceHandles(input, context, bind)
            : input;
    }

    public stringify(input: any, context: IComponentHandleContext, bind: IComponentHandle) {
        return JSON.stringify(input, (key, value) => {
            // If the current 'value' is not a handle, return it unmodified.  Otherwise,
            // return the result of 'serializeHandle'.
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            const handle = !!value && value.IComponentHandle;
            return handle !== undefined
                ? this.serializeHandle(handle, context, bind)
                : value;
        });
    }

    // Parses the serialized data - context must match the context with which the JSON was stringified
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
                if (absoluteUrl && root === undefined) {
                    // Find the root context to use for absolute requests
                    root = context;
                    while (root.routeContext !== undefined) {
                        root = root.routeContext;
                    }
                }

                const handle = new ComponentHandle(
                    absoluteUrl ? value.url.substr(1) : value.url,
                    absoluteUrl ? root : context);

                return handle;
            });
    }

    // Invoked by `replaceHandles()` for non-null objects to recursively replace IComponentHandle references
    // with serialized handles (cloning as-needed to avoid mutating the original `input` object.)
    private recursivelyReplaceHandles(
        input: any,
        context: IComponentHandleContext,
        bind: IComponentHandle,
    ) {
        // If the current input is an IComponentHandle instance, replace this leaf in the object graph with
        // the handle's serialized from.

        // Note: Caller is responsible for ensuring that `input` is a non-null object.
        const handle = input.IComponentHandle;
        if (handle !== undefined) {
            return this.serializeHandle(handle, context, bind);
        }

        let clone: object | undefined;
        for (const key of Object.keys(input)) {
            const value = input[key];
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!!value && typeof value === "object") {
                // Note: Except for IComponentHandle, `input` must not contain circular references (as object must
                //       be JSON serializable.)  Therefore, guarding against infinite recursion here would only
                //       lead to a later error when attempting to stringify().
                const replaced = this.recursivelyReplaceHandles(value, context, bind);

                // If the `replaced` object is different than the original `value` then the subgraph contained one
                // or more handles.  If this happens, we need to return a clone of the `input` object where the
                // current property is replaced by the `replaced` value.
                if (replaced !== value) {
                    // Lazily create a shallow clone of the `input` object if we haven't done so already.
                    clone = clone ?? (Array.isArray(input)
                        ? [...input]
                        : { ...input });

                    // Overwrite the current property `key` in the clone with the `replaced` value.
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    clone![key] = replaced;
                }
            }
        }
        return clone ?? input;
    }

    private serializeHandle(handle: IComponentHandle, context: IComponentHandleContext, bind: IComponentHandle) {
        // If the context that is now referencing the component is already attached then we immediately
        // attach the component. If it is not yet attached then we bind the reference to mark the dependency.
        if (bind.isAttached) {
            handle.attach();
        } else {
            bind.bind(handle);
        }

        // If the handle contexts match then we can store a relative path. Otherwise we convert to an
        // absolute path.
        const url = context === handle.routeContext
            ? handle.path
            : toAbsoluteUrl(handle);

        return {
            type: "__fluid_handle__",
            url,
        };
    }
}
