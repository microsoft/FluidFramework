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
import { generateHandleContextPath } from "./componentHandleContextUtils";

/**
 * Handle to dynamically load a component. This is created on parsing a seralized ComponentHandle.
 * This class is used to represent generic IComponent (through request handler on ComponentRuntime),
 * as well as shared objects (see ComponentRuntime.request for details).
 */
export class DynamicComponentHandle implements IComponentHandle {
    public get IComponentRouter() { return this; }
    public get IComponentHandleContext() { return this; }
    public get IComponentHandle() { return this; }

    public readonly isAttached = true;
    private componentP: Promise<IComponent> | undefined;

    /**
     * Creates a new DynamicComponentHandle. The `id` can either be an absolutePath or relative to the
     * routeContext.
     * For example, when storing a handle to a DDS inside another DDS in the same ComponentRuntime, the
     * `id` is relative to the ComponentRuntime.
     * When storing a handle to a ComponentRuntime in a DDS of another ComponentRuntime, the `id` is the
     * absolute path.
     */
    constructor(
        public readonly id: string,
        public readonly routeContext: IComponentHandleContext,
    ) {
    }

    /**
     * Path to the handle context relative to the routeContext
     * @deprecated Use `id` instead for the path relative to the routeContext.
     * For absolute path from the Container use `absolutePath`.
     */
    public get path() {
        return this.id;
    }

    /**
     * Returns the absolute path for this ComponentHandle. The `id` itself could be the absolute path and
     * if so, return it. Else, generate the absolutePath from the routeContexts.
     */
    public get absolutePath(): string {
        return this.id.startsWith("/") ? this.id : generateHandleContextPath(this);
    }

    public async get(): Promise<any> {
        if (this.componentP === undefined) {
            this.componentP = this.routeContext.request({ url: this.id })
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
