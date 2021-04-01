/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidHandle } from "./handles";

export const IFluidHandleEncoder: keyof IProvideFluidHandleEncoder = "IFluidHandleEncoder";

export interface IProvideFluidHandleEncoder {
    readonly IFluidHandleEncoder: IFluidHandleEncoder;
}

/**
 * Encoder used to encode/decode IFluidHandles to/from their jsonable form.
 *
 * Typical usage includes:
 *  - Preparing ops for serialization prior to calling `submitLocalMessage`.
 *  - Retrieving handles from ops inside `processCore`.
 *
 * Also used internally by IFluidSerializer stringify()/parse() to preserve handle
 * references within summary nodes.
 */
export interface IFluidHandleEncoder extends IProvideFluidHandleEncoder {
    /**
     * Encodes any 'IFluidHandle' instances embedded within the given value, shallowly cloning objects in the
     * path from the root to the encoded handles.  (If no handles are found, returns the original object.)
     */
    encode(value: any, bind: IFluidHandle): any;

    /**
     * Decodes any encoded handles embedded within the given value, shallowly cloning objects in the
     * path from the root to the decoded `IFluidHandle` instances.  (If no handles are found, returns the
     * original object.)
     */
    decode(value: any): any;
}
