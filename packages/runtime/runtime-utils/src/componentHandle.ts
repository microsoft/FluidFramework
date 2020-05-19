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
} from "@microsoft/fluid-component-core-interfaces";

/**
 * Handle to a dynamically loaded component
 * This class is used to represent generic IComponent (through request handler on ComponentRuntime),
 * as well as shared objects (see ComponentRuntime.request for details)
 */
export class ComponentHandle implements IComponentHandle {
    public get IComponentRouter() { return this; }
    public get IComponentHandleContext() { return this; }
    public get IComponentHandle() { return this; }

    public readonly isAttached = true;
    private componentP: Promise<IComponent> | undefined;

    constructor(
        public readonly path: string,
        public readonly routeContext: IComponentHandleContext,
    ) {
    }

    public async get(): Promise<any> {
        if (this.componentP === undefined) {
            /* eslint-disable @typescript-eslint/indent */
            this.componentP = this.routeContext.request({ url: this.path })
                .then<IComponent>((response) =>
                    response.mimeType === "fluid/component"
                        ? response.value as IComponent
                        : Promise.reject("Not found"));
            /* eslint-enable @typescript-eslint/indent */
        }

        return this.componentP;
    }

    public attach(): void {
        return;
    }

    public bind(handle: IComponentHandle): void {
        if (this.isAttached) {
            handle.attach();
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
