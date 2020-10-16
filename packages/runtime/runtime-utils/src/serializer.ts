/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidHandle,
    IFluidHandleContext,
    IFluidSerializer,
} from "@fluidframework/core-interfaces";
import { RemoteFluidObjectHandle } from "./remoteFluidObjectHandle";
import { isSerializedHandle } from "./utils";

/**
 * Data Store serializer implementation
 */
export class FluidSerializer implements IFluidSerializer {
    private readonly root: IFluidHandleContext;

    public constructor(private readonly context: IFluidHandleContext) {
        this.root = this.context;
        while (this.root.routeContext !== undefined) {
            this.root = this.root.routeContext;
        }
    }

    public get IFluidSerializer() { return this; }

    public replaceHandles(
        input: any,
        bind: IFluidHandle,
    ) {
        // If the given 'input' cannot contain handles, return it immediately.  Otherwise,
        // return the result of 'recursivelyReplaceHandles()'.
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions,@typescript-eslint/no-unsafe-return
        return !!input && typeof input === "object"
            ? this.recursivelyReplaceHandles(input, bind)
            : input;
    }

    public stringify(input: any, bind: IFluidHandle) {
        return JSON.stringify(input, (key, value) => {
            // If the current 'value' is not a handle, return it unmodified.  Otherwise,
            // return the result of 'serializeHandle'.
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            const handle = !!value && value.IFluidHandle;
            // TODO - understand why handle === false in some of our tests
            // eslint-disable-next-line max-len
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions,@typescript-eslint/no-unsafe-return
            return handle
                ? this.serializeHandle(handle, bind)
                : value;
        });
    }

    // Parses the serialized data - context must match the context with which the JSON was stringified
    public parse(input: string) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(
            input,
            (key, value) => {
                if (!isSerializedHandle(value)) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    return value;
                }

                // 0.21 back-compat
                // 0.22 onwards, we always use the routeContext of the root to create the RemoteFluidObjectHandle.
                // We won't need to check for the if condition below once we remove the back-compat code.
                const absoluteUrl = value.url.startsWith("/");
                const handle = new RemoteFluidObjectHandle(value.url, absoluteUrl ? this.root : this.context);

                return handle;
            });
    }

    // Invoked by `replaceHandles()` for non-null objects to recursively replace IFluidHandle references
    // with serialized handles (cloning as-needed to avoid mutating the original `input` object.)
    private recursivelyReplaceHandles(
        input: any,
        bind: IFluidHandle,
    ) {
        // If the current input is an IFluidHandle instance, replace this leaf in the object graph with
        // the handle's serialized from.

        // Note: Caller is responsible for ensuring that `input` is a non-null object.
        const handle = input.IFluidHandle;
        if (handle !== undefined) {
            return this.serializeHandle(handle, bind);
        }

        // eslint-disable-next-line @typescript-eslint/ban-types
        let clone: object | undefined;
        for (const key of Object.keys(input)) {
            const value = input[key];
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!!value && typeof value === "object") {
                // Note: Except for IFluidHandle, `input` must not contain circular references (as object must
                //       be JSON serializable.)  Therefore, guarding against infinite recursion here would only
                //       lead to a later error when attempting to stringify().
                const replaced = this.recursivelyReplaceHandles(value, bind);

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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return clone ?? input;
    }

    private serializeHandle(handle: IFluidHandle, bind: IFluidHandle) {
        bind.bind(handle);
        return {
            type: "__fluid_handle__",
            url: handle.absolutePath,
        };
    }
}
