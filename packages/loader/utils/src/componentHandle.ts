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
} from "@prague/component-core-interfaces";

/**
 * Handle to a dynamically loaded component
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
        if (!this.componentP) {
            this.componentP = this.routeContext.request({ url: this.path })
                .then<IComponent>((response) => {
                    return response.mimeType === "prague/component"
                        ? response.value as IComponent
                        : Promise.reject("Not found");
                });
        }

        return this.componentP;
    }

    public attach(): void {
        return;
    }

    public bind(handle: IComponentHandle): void {
        throw new Error("Cannot bind to an attached handle");
    }

    public async request(request: IRequest): Promise<IResponse> {
        const component = await this.get() as IComponent;
        const router = component.IComponentRouter;

        return router
            ? router.request(request)
            : { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }
}
