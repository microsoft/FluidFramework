/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHandle,
    IComponentHandleContext,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";

/**
 * Handle to dynamically load a component on a remote client and is created on parsing a seralized ComponentHandle.
 * This class is used to generate an IComponentHandle when de-serializing Fluid Component and SharedObject handles
 * that are stored in SharedObjects. The Component or SharedObject corresponding to the IComponentHandle can be
 * retrieved by calling `get` on it.
 */
export class RemoteComponentHandle implements IComponentHandle {
    public get IComponentRouter() { return this; }
    public get IComponentHandleContext() { return this; }
    public get IComponentHandle() { return this; }

    public readonly isAttached = true;
    private componentP: Promise<IComponent> | undefined;

    /**
     * Creates a new RemoteComponentHandle when parsing an IComponentHandle.
     * @param absolutePath - The absolute path to the handle from the container runtime.
     * @param routeContext - The root IComponentHandleContext that has a route to this handle.
     */
    constructor(
        public readonly absolutePath: string,
        public readonly routeContext: IComponentHandleContext,
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
            this.componentP = this.routeContext.request({ url: this.absolutePath })
                .then<IComponent>((response) =>
                    response.mimeType === "fluid/component"
                        ? response.value as IComponent
                        : Promise.reject("Not found"));
        }

        return this.componentP;
    }

    public attachGraph(): void {
        return;
    }

    public bind(handle: IComponentHandle): void {
        if (this.isAttached) {
            handle.attachGraph();
            return;
        }
        throw new Error("Cannot bind to an attached handle");
    }

    public async request(request: IRequest): Promise<IResponse> {
        const component = await this.get() as IComponent;
        const router = component.IComponentRouter;

        return router !== undefined
            ? router.request(request)
            : { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }
}
