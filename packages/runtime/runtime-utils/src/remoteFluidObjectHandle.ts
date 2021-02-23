/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    IFluidObject,
    IFluidHandle,
    IFluidRoutingContext,
} from "@fluidframework/core-interfaces";

/**
 * This handle is used to dynamically load a data store on a remote client and is created on parsing a serialized
 * FluidObjectHandle.
 * This class is used to generate an IFluidHandle when de-serializing Fluid Data Store and SharedObject handles
 * that are stored in SharedObjects. The Data Store or SharedObject corresponding to the IFluidHandle can be
 * retrieved by calling `get` on it.
 */
export class RemoteFluidObjectHandle implements IFluidHandle {
    public get IFluidHandle() { return this; }

    public readonly isAttached = true;
    private objectP: Promise<IFluidObject> | undefined;

    /**
     * Creates a new RemoteFluidObjectHandle when parsing an IFluidHandle.
     * @param absolutePath - The absolute path to the handle from the container runtime.
     * @param routeContext - The root IFluidRoutingContext that has a route to this handle.
     */
    constructor(
        public readonly absolutePath: string,
        public readonly routeContext: IFluidRoutingContext,
    ) {
        assert(absolutePath.startsWith("/"), "Handles should always have absolute paths");
    }

    public async get(): Promise<any> {
        if (this.objectP === undefined) {
            this.objectP = this.routeContext.resolveHandle({ url: this.absolutePath })
                .then<IFluidObject>((response) =>
                    response.mimeType === "fluid/object"
                        ? response.value as IFluidObject
                        : Promise.reject(new Error(`Can't resolve handle: ${this.absolutePath}: ${response.value}`)));
        }

        return this.objectP;
    }

    public attachGraph(): void {
        return;
    }

    public bind(handle: IFluidHandle): void {
        handle.attachGraph();
    }
}
