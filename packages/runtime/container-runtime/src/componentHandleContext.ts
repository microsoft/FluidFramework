/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidHandle,
    IFluidHandleContext,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { IRuntime } from "@fluidframework/container-definitions";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";

export class FluidObjectHandleContext implements IFluidHandleContext {
    public get IFluidRouter() { return this; }
    public get IComponentRouter() { return this; }
    public get IFluidHandleContext() { return this; }
    public get IComponentHandleContext() { return this; }
    public readonly isAttached = true;
    public readonly absolutePath: string;

    /**
     * Creates a new FluidObjectHandleContext.
     * @param path - The path to this handle relative to the routeContext.
     * @param runtime - The IRuntime object this context represents.
     * @param routeContext - The parent IFluidHandleContext that has a route to this handle.
     */
    constructor(
        public readonly path: string,
        private readonly runtime: IRuntime,
        public readonly routeContext?: IFluidHandleContext,
    ) {
        this.absolutePath = generateHandleContextPath(path, this.routeContext);
    }

    public attachGraph(): void {
        return;
    }

    public bind(handle: IFluidHandle): void {
        if (this.isAttached) {
            handle.attachGraph();
            return;
        }
        throw new Error("Cannot bind to an attached handle");
    }

    public async request(request: IRequest): Promise<IResponse> {
        return this.runtime.request(request);
    }
}
