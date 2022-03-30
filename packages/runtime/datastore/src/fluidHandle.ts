/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidHandle,
    IFluidHandleContext,
    FluidObject,
} from "@fluidframework/core-interfaces";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";

export class FluidObjectHandle<T extends FluidObject = FluidObject> implements IFluidHandle {
    private readonly pendingHandlesToMakeVisible: Set<IFluidHandle> = new Set();
    public readonly absolutePath: string;

    public get IFluidHandle(): IFluidHandle { return this; }

    public get isAttached(): boolean {
        return this.routeContext.isAttached;
    }

    /**
     * Tells whether the object of this handle is visible in the container.
     */
    private get visible(): boolean {
        /**
         * If the object of this handle is attached, it is visible in the container. This is a work around the scenario
         * where the object becomes visible but the handle does not get this notification. For example, handles to a DDS
         * other than the default handle won't know if the DDS becomes visible after the handle was created.
         */
        if (this.isAttached) {
            this._visible = true;
        }
        return this._visible;
    }
    private _visible: boolean = false;

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
            this._visible = true;
        }
    }

    public async get(): Promise<any> {
        return this.value;
    }

    public attachGraph(): void {
        if (this.visible) {
            return;
        }

        this._visible = true;
        this.pendingHandlesToMakeVisible.forEach((handle) => {
            handle.attachGraph();
        });
        this.pendingHandlesToMakeVisible.clear();
        this.routeContext.attachGraph();
    }

    public bind(handle: IFluidHandle) {
        // If this handle is visible, attach the graph of the incoming handle as well.
        if (this.visible) {
            handle.attachGraph();
            return;
        }
        this.pendingHandlesToMakeVisible.add(handle);
    }
}
