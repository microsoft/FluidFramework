/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { RemoteFluidObjectHandle } from "../remoteFluidObjectHandle";

export const mockHandleContext: IFluidHandleContext = {
    absolutePath: "",
    isAttached: false,
    IFluidHandleContext: undefined as any,

    attachGraph: () => {
        throw new Error("Method not implemented.");
    },
    resolveHandle: () => {
        throw new Error("Method not implemented.");
    },
};

export const handle: IFluidHandle = new RemoteFluidObjectHandle("", mockHandleContext);

/**
 * Creates a Jsonable object graph of a specified breadth/depth.  The 'createLeaf' callback
 * is a factory that is invoked to create the leaves of the graph.
 */
export function makeJson(breadth: number, depth: number, createLeaf: () => any) {
    // eslint-disable-next-line no-param-reassign
    if (--depth === 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return createLeaf();
    }

    const o = {};
    for (let i = 0; i < breadth; i++) {
        o[`o${i}`] = makeJson(breadth, depth, createLeaf);
    }
    return o;
}
