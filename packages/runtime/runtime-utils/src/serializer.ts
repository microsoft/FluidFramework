/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// RATIONALE: Many methods consume and return 'any' by necessity.
/* eslint-disable @typescript-eslint/no-unsafe-return */

import {
    IFluidHandle,
    IFluidHandleContext,
    IFluidSerializer,
} from "@fluidframework/core-interfaces";
import { RemoteFluidObjectHandle } from "./remoteObjectHandle";
import { generateHandleContextPath } from "./dataStoreHandleContextUtils";
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

    /**
     * Given a mostly-jsonable object tree that may have handle objects embedded within, will return a
     * fully-jsonable object tree where any embedded IFluidHandles have been replaced with a serializable form.
     *
     * The original `input` object is not mutated.  This method will shallowly clones all objects in the path from
     * the root to any replaced handles.  (If no handles are found, returns the original object.)
     *
     * Any unbound handles encountered are bound to the provided IFluidHandle.
     */
     public replaceHandles(
        input: any,
        bind: IFluidHandle,
    ) {
        // If the given 'input' cannot contain handles, return it immediately.  Otherwise,
        // return the result of 'recursivelyReplace()'.
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        return !!input && typeof input === "object"
            ? this.recursivelyReplace(input, this.encodeValue, bind)
            : input;
    }

    /**
     * Given a fully-jsonable object tree that may have encoded handle objects embedded within, will return an
     * equivalent object tree where any encoded IFluidHandles have been replaced with thier decoded form.
     *
     * The original `input` object is not mutated.  This method will shallowly clones all objects in the path from
     * the root to any replaced handles.  (If no handles are found, returns the original object.)
     *
     * The decoded handles are implicitly bound to the handle context of this serializer.
     */
     public decode(input: any) {
        // If the given 'input' cannot contain handles, return it immediately.  Otherwise,
        // return the result of 'recursivelyReplace()'.
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        return !!input && typeof input === "object"
            ? this.recursivelyReplace(input, this.decodeValue)
            : input;
    }

    public stringify(input: any, bind: IFluidHandle) {
        return JSON.stringify(input, (key, value) => this.encodeValue(value, bind));
    }

    // Parses the serialized data - context must match the context with which the JSON was stringified
    public parse(input: string) {
        return JSON.parse(input, (key, value) => this.decodeValue(value));
    }

    // If the given 'value' is an IFluidHandle, returns the encoded IFluidHandle.
    // Otherwise returns the original 'value'.  Used by 'replaceHandles()' and 'stringify()'.
    private readonly encodeValue = (value: any, bind: IFluidHandle) => {
        // Detect if 'value' is an IFluidHandle.
        const handle = value?.IFluidHandle;

        // If 'value' is an IFluidHandle return its encoded form.
        return handle !== undefined
            ? this.serializeHandle(handle, bind)
            : value;
    };

    // If the given 'value' is an encoded IFluidHandle, returns the decoded IFluidHandle.
    // Otherwise returns the original 'value'.  Used by 'decode()' and 'parse()'.
    private readonly decodeValue = (value: any) => {
        // If 'value' is a serialized IFluidHandle return the deserialized result.
        if (isSerializedHandle(value)) {
            // Old documents may have handles with relative path in their summaries. Convert these to absolute
            // paths. This will ensure that future summaries will have absolute paths for these handles.
            const absolutePath = value.url.startsWith("/")
                ? value.url
                : generateHandleContextPath(value.url, this.context);

            return new RemoteFluidObjectHandle(absolutePath, this.root);
        } else {
            return value;
        }
    };

    // Invoked for non-null objects to recursively replace references to IFluidHandles.
    // Clones as-needed to avoid mutating the `input` object.  If no IFluidHandes are present,
    // returns the original `input`.
    private recursivelyReplace(
        input: any,
        replacer: (input: any, context: any) => any,
        context?: any,
    ) {
        // Note: Caller is responsible for ensuring that `input` is defined / non-null.
        //       (Required for Object.keys() below.)

        // Execute the `replace` on the current input.  Note that Caller is responsible for ensuring that `input`
        // is a non-null object.
        const maybeReplaced = replacer(input, context);

        // If the replacer made a substitution there is no need to decscend further. IFluidHandles are always
        // leaves in the object graph.
        if (maybeReplaced !== input) {
            return maybeReplaced;
        }

        // Otherwise descend into the object graph looking for IFluidHandle instances.
        // eslint-disable-next-line @typescript-eslint/ban-types
        let clone: object | undefined;
        for (const key of Object.keys(input)) {
            const value = input[key];
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!!value && typeof value === "object") {
                // Note: Except for IFluidHandle, `input` must not contain circular references (as object must
                //       be JSON serializable.)  Therefore, guarding against infinite recursion here would only
                //       lead to a later error when attempting to stringify().
                const replaced = this.recursivelyReplace(value, replacer, context);

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

    protected serializeHandle(handle: IFluidHandle, bind: IFluidHandle) {
        bind.bind(handle);
        return {
            type: "__fluid_handle__",
            url: handle.absolutePath,
        };
    }
}
