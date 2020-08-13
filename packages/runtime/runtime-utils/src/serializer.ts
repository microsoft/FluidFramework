/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidHandle,
    IFluidHandleContext,
    IFluidSerializer,
} from "@fluidframework/core-interfaces";
import { RemoteFluidObjectHandle } from "./remoteDataStoreHandle";
import { isSerializedHandle } from "./utils";

/**
 * Data Store serializer implementation
 */
export class FluidSerializer implements IFluidSerializer {
    public get IFluidSerializer() { return this; }

    public replaceHandles(
        input: any,
        context: IFluidHandleContext,
        bind: IFluidHandle,
    ) {
        // If the given 'input' cannot contain handles, return it immediately.  Otherwise,
        // return the result of 'recursivelyReplaceHandles()'.
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        return !!input && typeof input === "object"
            ? this.recursivelyReplaceHandles(input, context, bind)
            : input;
    }

    public stringify(input: any, context: IFluidHandleContext, bind: IFluidHandle) {
        return JSON.stringify(input, (key, value) => {
            // If the current 'value' is not a handle, return it unmodified.  Otherwise,
            // return the result of 'serializeHandle'.
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            const handle = !!value && value.IFluidHandle;
            // TODO - understand why handle === false in some of our tests
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            return handle
                ? this.serializeHandle(handle, context, bind)
                : value;
        });
    }

    // Parses the serialized data - context must match the context with which the JSON was stringified
    public parse(input: string, context: IFluidHandleContext) {
        let root: IFluidHandleContext;

        return JSON.parse(
            input,
            (key, value) => {
                if (!isSerializedHandle(value)) {
                    return value;
                }

                // 0.21 back-compat
                // 0.22 onwards, we always use the routeContext of the root to create the RemoteFluidObjectHandle.
                // We won't need to check for the if condition below once we remove the back-compat code.
                const absoluteUrl = value.url.startsWith("/");
                if (absoluteUrl && root === undefined) {
                    // Find the root context to use for absolute requests
                    root = context;
                    while (root.routeContext !== undefined) {
                        root = root.routeContext;
                    }
                }

                const handle = new RemoteFluidObjectHandle(value.url, absoluteUrl ? root : context);

                return handle;
            });
    }

    // Invoked by `replaceHandles()` for non-null objects to recursively replace IFluidHandle references
    // with serialized handles (cloning as-needed to avoid mutating the original `input` object.)
    private recursivelyReplaceHandles(
        input: any,
        context: IFluidHandleContext,
        bind: IFluidHandle,
    ) {
        // If the current input is an IFluidHandle instance, replace this leaf in the object graph with
        // the handle's serialized from.

        // Note: Caller is responsible for ensuring that `input` is a non-null object.
        const handle = input.IFluidHandle;
        if (handle !== undefined) {
            return this.serializeHandle(handle, context, bind);
        }

        let clone: object | undefined;
        for (const key of Object.keys(input)) {
            const value = input[key];
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!!value && typeof value === "object") {
                // Note: Except for IFluidHandle, `input` must not contain circular references (as object must
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

    private serializeHandle(handle: IFluidHandle, context: IFluidHandleContext, bind: IFluidHandle) {
        bind.bind(handle);
        return {
            type: "__fluid_handle__",
            url: handle.absolutePath,
        };
    }
}
