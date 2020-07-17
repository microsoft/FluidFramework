/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle, IComponentHandleContext } from "@fluidframework/component-core-interfaces";
import { RemoteComponentHandle } from "../remoteComponentHandle";

export const mockHandleContext: IComponentHandleContext = {
    path: "",
    absolutePath: "",
    isAttached: false,
    IComponentRouter: undefined as any,
    IComponentHandleContext: undefined as any,

    attachGraph: () => {
        throw new Error("Method not implemented.");
    },
    bind: () => {
        throw new Error("Method not implemented.");
    },
    request: () => {
        throw new Error("Method not implemented.");
    },
};

export const handle: IComponentHandle = new RemoteComponentHandle("", mockHandleContext);

/**
 * Creates a Jsonable object graph of a specified breadth/depth.  The 'createLeaf' callback
 * is a factory that is invoked to create the leaves of the graph.
 */
export function makeJson(breadth: number, depth: number, createLeaf: () => any) {
    // eslint-disable-next-line no-param-reassign
    if (--depth === 0) {
        return createLeaf();
    }

    const o = {};
    for (let i = 0; i < breadth; i++) {
        o[`o${i}`] = makeJson(breadth, depth, createLeaf);
    }
    return o;
}
