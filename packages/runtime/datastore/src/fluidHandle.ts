/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidObject,
    IFluidHandle,
    IFluidHandleContext,
    FluidObject,
} from "@fluidframework/core-interfaces";
import { AttachState } from "@fluidframework/container-definitions";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";

export class FluidObjectHandle<T extends FluidObject = IFluidObject> implements IFluidHandle {
    // Tracks whether this object is locally attached to the root object graph.
    private localAttachState: AttachState = AttachState.Detached;
    // A list of handles that are bound to this handle. The graph for these will be attached when this handle's graph
    // is attached.
    private boundHandles: Set<IFluidHandle> | undefined;
    public readonly absolutePath: string;

    public get IFluidHandle(): IFluidHandle { return this; }

    public get isAttached(): boolean {
        return this.routeContext.isAttached;
    }

    /**
     * Creates a new FluidObjectHandle.
     * @param value - The FluidObject object this handle is for.
     * @param path - The path to this handle relative to the routeContext.
     * @param routeContext - The parent IFluidHandleContext that has a route to this handle.
     */
    constructor(
        protected readonly value: T,
        public readonly path: string,
        public readonly routeContext: IFluidHandleContext,
    ) {
        this.absolutePath = generateHandleContextPath(path, this.routeContext);
        if (this.isAttached) {
            this.localAttachState = AttachState.Attached;
        }
    }

    public async get(): Promise<any> {
        return this.value;
    }

    public attachGraph(): void {
        if (this.localAttachState === AttachState.Attached) {
            return;
        }
        this.localAttachState = AttachState.Attached;
        if (this.boundHandles !== undefined) {
            for (const handle of this.boundHandles) {
                handle.attachGraph();
            }
            this.boundHandles = undefined;
        }
        this.routeContext.attachGraph();
    }

    public bind(handle: IFluidHandle) {
        // If locally attached, attach the incoming handle locally as well. Otherwise, store it and it will be attached
        // when this object is locally attached.
        if (this.localAttachState === AttachState.Attached) {
            handle.attachGraph();
            return;
        }
        if (this.boundHandles === undefined) {
            this.boundHandles = new Set<IFluidHandle>();
        }
        this.boundHandles.add(handle);
    }
}
