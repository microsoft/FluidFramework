/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidHandleContext,
} from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";
import { ISharedObject } from "./types";

/**
 * Handle for shared object
 * This object is used for already loaded (in-memory) shared object
 * and is used only for serialization purposes.
 * De-serialization process goes through FluidObjectHandle and request flow:
 * FluidDataStoreRuntime.request() recognizes requests in the form of '/<shared object id>'
 * and loads shared object.
 */
export class SharedObjectHandle extends FluidObjectHandle<ISharedObject> {
    /**
     * Whether services have been attached for the associated shared object.
     */
    public get isAttached(): boolean {
        return this.sharedObject.isAttached();
    }

    /**
     * Creates a new SharedObjectHandle.
     * @param sharedObject - The shared object this handle is for.
     * @param path - The id of the shared object. It is also the path to this object relative to the routeContext.
     * @param routeContext - The parent IFluidHandleContext that has a route to this handle.
     */
    constructor(
        private readonly sharedObject: ISharedObject,
        path: string,
        routeContext: IFluidHandleContext,
    ) {
        super(sharedObject, path, routeContext);
    }

    /**
     * Attaches all bound handles first (which may in turn attach further handles), then attaches this handle.
     * When attaching the handle, it registers the associated shared object.
     */
    public attachGraph(): void {
        this.sharedObject.bindToContext();
        super.attachGraph();
    }
}
