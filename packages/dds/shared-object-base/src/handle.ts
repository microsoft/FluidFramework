/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandleContext,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { ComponentHandle } from "@fluidframework/component-runtime";
import { ISharedObject } from "./types";

/**
 * Component handle for shared object
 * This object is used for already loaded (in-memory) shared object
 * and is used only for serialization purposes.
 * De-serialization process goes through ComponentHandle and request flow:
 * FluidDataStoreRuntime.request() recognizes requests in the form of '/<shared object id>'
 * and loads shared object.
 */
export class SharedObjectComponentHandle extends ComponentHandle<ISharedObject> {
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
     * @param routeContext - The parent IComponentHandleContext that has a route to this handle.
     */
    constructor(
        value: ISharedObject,
        path: string,
        routeContext: IComponentHandleContext,
    ) {
        super(value, path, routeContext);
    }

    /**
     * Attaches all bound handles first (which may in turn attach further handles), then attaches this handle.
     * When attaching the handle, it registers the associated shared object.
     */
    public attachGraph(): void {
        this.value.bindToContext();
        super.attachGraph();
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
