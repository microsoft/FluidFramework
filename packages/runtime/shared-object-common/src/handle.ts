/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandle,
    IComponentHandleContext,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { ISharedObject } from "./types";

/**
 * Component handle for shared object
 * This object is used for already loaded (in-memory) shared object
 * and is used only for serialization purposes.
 * De-serialization process goes through ComponentHandle and request flow:
 * ComponentRuntime.request() recognizes requests in the form of '/<shared object id>'
 * and loads shared object.
 */
export class SharedObjectComponentHandle implements IComponentHandle {
    /**
     * The set of handles to other shared objects that should be registered before this one.
     */
    private bound: Set<IComponentHandle> | undefined;

    public get IComponentHandle() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHandleContext() { return this; }

    /**
     * Whether services have been attached for the associated shared object.
     */
    public get isAttached(): boolean {
        // Attached tells if the shared object is attached to parent component. Parent component should also be
        // attached. It does not matter if the container is live or local.
        // If the dds was registered to attached component, it should have get attached and isAttached should
        // be true in that case.
        return this.value.isAttached();
    }

    /**
     * @param value - The shared object this handle is for
     * @param path - An id for the shared object
     * @param routeContext - Component handle context for the container, used to provide request services
     */
    constructor(
        private readonly value: ISharedObject,
        public readonly path: string,
        public readonly routeContext: IComponentHandleContext,
    ) {
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
    public attach(): void {
        if (this.bound !== undefined) {
            for (const handle of this.bound) {
                handle.attach();
            }

            this.bound = undefined;
        }

        this.value.register();
    }

    /**
     * Add a handle to the list of handles to attach before this one when attach is called.
     * @param handle - The handle to bind
     */
    public bind(handle: IComponentHandle): void {
        if (this.bound === undefined) {
            this.bound = new Set<IComponentHandle>();
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
