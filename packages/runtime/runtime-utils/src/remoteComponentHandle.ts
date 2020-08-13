/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidObject,
    IFluidHandle,
    IFluidHandleContext,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";

/**
 * Handle to dynamically load a component on a remote client and is created on parsing a serialized FluidObjectHandle.
 * This class is used to generate an IFluidHandle when de-serializing Fluid Component and SharedObject handles
 * that are stored in SharedObjects. The Component or SharedObject corresponding to the IFluidHandle can be
 * retrieved by calling `get` on it.
 */
export class RemoteFluidObjectHandle implements IFluidHandle {
    public get IFluidRouter() { return this; }
    public get IFluidHandleContext() { return this; }
    public get IFluidHandle() { return this; }

    public readonly isAttached = true;
    private componentP: Promise<IFluidObject> | undefined;

    /**
     * Creates a new RemoteFluidObjectHandle when parsing an IFluidHandle.
     * @param absolutePath - The absolute path to the handle from the container runtime.
     * @param routeContext - The root IFluidHandleContext that has a route to this handle.
     */
    constructor(
        public readonly absolutePath: string,
        public readonly routeContext: IFluidHandleContext,
    ) {
    }

    /**
     * @deprecated - This returns the absolute path.
     */
    public get path() {
        return this.absolutePath;
    }

    public async get(): Promise<any> {
        if (this.componentP === undefined) {
            this.componentP = this.routeContext.resolveHandle({ url: this.absolutePath })
                .then<IFluidObject>((response) =>
                    response.mimeType === "fluid/object"
                        ? response.value as IFluidObject
                        : Promise.reject("Not found"));
        }

        return this.componentP;
    }

    public attachGraph(): void {
        return;
    }

    public bind(handle: IFluidHandle): void {
        handle.attachGraph();
    }

    public async request(request: IRequest): Promise<IResponse> {
        const component = await this.get() as IFluidObject;
        const router = component.IFluidRouter;

        return router !== undefined
            ? router.request(request)
            : { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }
}
