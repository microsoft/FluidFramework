/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandle,
    IComponentHandleContext,
    IComponentRouter,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentHandle } from "../componentHandle";

export const mockHandleContext: IComponentHandleContext = {
    path: "",
    isAttached: false,
    [IComponentRouter]: undefined as any,
    [IComponentHandleContext]: undefined as any,

    attach: () => {
        throw new Error("Method not implemented.");
    },
    bind: () => {
        throw new Error("Method not implemented.");
    },
    request: () => {
        throw new Error("Method not implemented.");
    },
};

export const handle: IComponentHandle = new ComponentHandle("", mockHandleContext);

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
