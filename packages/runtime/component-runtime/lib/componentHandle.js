/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AttachState } from "@fluidframework/container-definitions";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";
export class FluidOjectHandle {
    /**
     * Creates a new FluidOjectHandle.
     * @param value - The IFluidObject object this handle is for.
     * @param path - The path to this handle relative to the routeContext.
     * @param routeContext - The parent IFluidHandleContext that has a route to this handle.
     */
    constructor(value, path, routeContext) {
        this.value = value;
        this.path = path;
        this.routeContext = routeContext;
        // This is used to break the recursion while attaching the graph. Also tells the attach state of the graph.
        this.graphAttachState = AttachState.Detached;
        this.absolutePath = generateHandleContextPath(path, this.routeContext);
    }
    get IFluidRouter() { return this; }
    get IFluidHandleContext() { return this; }
    get IFluidHandle() { return this; }
    get isAttached() {
        return this.routeContext.isAttached;
    }
    async get() {
        return this.value;
    }
    attachGraph() {
        // If this handle is already in attaching state in the graph or attached, no need to attach again.
        if (this.graphAttachState !== AttachState.Detached) {
            return;
        }
        this.graphAttachState = AttachState.Attaching;
        if (this.bound !== undefined) {
            for (const handle of this.bound) {
                handle.attachGraph();
            }
            this.bound = undefined;
        }
        this.routeContext.attachGraph();
        this.graphAttachState = AttachState.Attached;
    }
    bind(handle) {
        // If the dds is already attached or its graph is already in attaching or attached state,
        // then attach the incoming handle too.
        if (this.isAttached || this.graphAttachState !== AttachState.Detached) {
            handle.attachGraph();
            return;
        }
        if (this.bound === undefined) {
            this.bound = new Set();
        }
        this.bound.add(handle);
    }
    async request(request) {
        if (this.value.IFluidRouter !== undefined) {
            return this.value.IFluidRouter.request(request);
        }
        else {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        }
    }
}
//# sourceMappingURL=componentHandle.js.map