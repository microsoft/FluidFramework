/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandleContext, IRequest } from "@fluidframework/core-interfaces";

export class MockHandleContext implements IFluidHandleContext {
    public isAttached = false;
    public get IFluidHandleContext() {
        return this;
    }

    constructor(public readonly absolutePath = "", public readonly routeContext?: IFluidHandleContext) {}

    public attachGraph() {
        throw new Error("Method not implemented.");
    }

    public async resolveHandle(request: IRequest) {
        return { status: 404, mimeType: "text/plain", value: `Method not implemented.` };
    }
}

/**
 * Creates a Jsonable object graph of a specified breadth/depth.  The 'createLeaf' callback
 * is a factory that is invoked to create the leaves of the graph.
 */
export function makeJson(breadth: number, depth: number, createLeaf: () => any) {
    let depthInternal = depth;
    if (--depthInternal === 0) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return createLeaf();
    }

    const o = {};
    for (let i = 0; i < breadth; i++) {
        o[`o${i}`] = makeJson(breadth, depthInternal, createLeaf);
    }
    return o;
}
