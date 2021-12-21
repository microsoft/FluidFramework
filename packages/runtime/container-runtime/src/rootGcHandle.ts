/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";

/**
 * Handle for root objects in the graph. These are used only for representing root nodes in the garbage collection
 * reference graph.
 */
export class RootGCHandle implements IFluidHandle {
    public readonly absolutePath: string;

    public get IFluidHandle(): IFluidHandle { return this; }

    public get isAttached(): boolean {
        return this.routeContext.isAttached;
    }

    public async get(): Promise<any> {
        throw Error("Do not try to get the object for root node GC handle. It is used only for GC.");
    }

    /**
     * @param path - The path to this handle relative to the routeContext.
     * @param routeContext - The parent IFluidHandleContext that has a route to this handle.
     */
    constructor(
        public readonly path: string,
        public readonly routeContext: IFluidHandleContext,
    ) {
        this.absolutePath = generateHandleContextPath(path, this.routeContext);
    }

    public attachGraph(): void {
        return;
    }

    public bind(handle: IFluidHandle) {
        handle.attachGraph();
    }
}
