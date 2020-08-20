/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    IFluidHandleContext,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { AttachState } from "@fluidframework/container-definitions";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";
import { ContainerRuntime } from "./containerRuntime";

export class ContainerFluidHandleContext implements IFluidHandleContext {
    public get IFluidRouter() { return this; }
    public get IFluidHandleContext() { return this; }
    public readonly absolutePath: string;

    /**
     * Creates a new ContainerFluidHandleContext.
     * @param path - The path to this handle relative to the routeContext.
     * @param runtime - The IRuntime object this context represents.
     * @param routeContext - The parent IFluidHandleContext that has a route to this handle.
     */
    constructor(
        public readonly path: string,
        private readonly runtime: ContainerRuntime,
        public readonly routeContext?: IFluidHandleContext,
    ) {
        this.absolutePath = generateHandleContextPath(path, this.routeContext);
    }

    public attachGraph(): void {
        assert(false, "can't attach container runtime form within container!");
        return;
    }

    public get isAttached() {
        return this.runtime.attachState !== AttachState.Detached;
    }

    public async resolveHandle(request: IRequest): Promise<IResponse> {
        return this.runtime.resolveHandle(request);
    }
}
