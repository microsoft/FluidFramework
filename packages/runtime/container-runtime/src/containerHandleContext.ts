/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
    // Stores handles in this context that are decoded. Basically, handles that are parsed to get the underlying
    // objects. It helps in keeping track of all remote objects that are received and loaded by this container.
    public decodedHandles: string[] = [];

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
        throw new Error("can't attach container runtime form within container!");
    }

    public get isAttached() {
        return this.runtime.attachState !== AttachState.Detached;
    }

    public async resolveHandle(request: IRequest): Promise<IResponse> {
        return this.runtime.resolveHandle(request);
    }

    public handleDecoded(url: string): void {
        this.decodedHandles.push(url);
    }
}
