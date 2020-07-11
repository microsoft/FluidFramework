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
import { AttachState } from "@fluidframework/container-definitions";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";
import { ISharedObject } from "./types";

/**
 * Component handle for shared object
 * This object is used for already loaded (in-memory) shared object
 * and is used only for serialization purposes.
 * De-serialization process goes through ComponentHandle and request flow:
 * ComponentRuntime.request() recognizes requests in the form of '/<shared object id>'
 * and loads shared object.
 */
export class SharedObjectComponentHandle implements IFluidHandle {
    // This is used to break the recursion while attaching the graph. Also tells the attach state of the graph.
    private graphAttachState: AttachState = AttachState.Detached;
    /**
     * The set of handles to other shared objects that should be registered before this one.
     */
    private bound: Set<IFluidHandle> | undefined;
    public readonly absolutePath: string;

    public get IFluidHandle() { return this; }
    public get IFluidRouter() { return this; }
    public get IFluidHandleContext() { return this; }

    /**
     * Whether services have been attached for the associated shared object.
     */
    public get isAttached(): boolean {
        return this.value.isAttached();
    }

    /**
     * Creates a new SharedObjectComponentHandle.
     * @param value - The shared object this handle is for.
     * @param path - The id of the shared object. It is also the path to this object relative to the routeContext.
     * @param routeContext - The parent IFluidHandleContext that has a route to this handle.
     */
    constructor(
        private readonly value: ISharedObject,
        public readonly path: string,
        public readonly routeContext: IFluidHandleContext,
    ) {
        this.absolutePath = generateHandleContextPath(path, this.routeContext);
    }

    /**
     * Gets the shared object for this handle.
     */
    public async get(): Promise<any> {
        return this.value;
    }

    /**
     * Attaches all bound handles first (which may in turn attach further handles), then attaches this handle.
     * When attaching the handle, it registers the associated shared object.
     */
    public attachGraph(): void {
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
        this.value.bindToContext();
        this.graphAttachState = AttachState.Attached;
    }

    /**
     * Add a handle to the list of handles to attach before this one when attach is called.
     * @param handle - The handle to bind
     */
    public bind(handle: IFluidHandle): void {
        // If the dds is already attached or its graph is already in attaching or attached state,
        // then attach the incoming handle too.
        if (this.isAttached || this.graphAttachState !== AttachState.Detached) {
            handle.attachGraph();
            return;
        }
        if (this.bound === undefined) {
            this.bound = new Set<IFluidHandle>();
        }

        this.bound.add(handle);
    }

    /**
     * Returns 404.
     * @param request - The request to make
     * @returns A 404 error
     */
    public async request(request: IRequest): Promise<IResponse> {
        return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }
}
