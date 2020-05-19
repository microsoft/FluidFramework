/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHandle,
    IComponentHandleContext,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";

export class ComponentHandle implements IComponentHandle {
    private isHandleAttached: boolean = false;
    private bound: Set<IComponentHandle> | undefined;

    public get IComponentRouter(): IComponentRouter { return this; }
    public get IComponentHandleContext(): IComponentHandleContext { return this; }
    public get IComponentHandle(): IComponentHandle { return this; }

    public get isAttached(): boolean {
        return this.routeContext.isAttached;
    }

    constructor(
        private readonly value: IComponent,
        public readonly path: string,
        public readonly routeContext: IComponentHandleContext,
    ) {
    }

    public async get(): Promise<any> {
        return this.value;
    }

    public attach(): void {
        // If this handle is already in attaching state in the graph or marked as attached, no need to attach again.
        if (this.isHandleAttached) {
            return;
        }
        this.isHandleAttached = true;
        if (this.bound !== undefined) {
            for (const handle of this.bound) {
                handle.attach();
            }

            this.bound = undefined;
        }
        this.routeContext.attach();
    }

    public bind(handle: IComponentHandle) {
        if (this.isAttached) {
            handle.attach();
            return;
        }
        if (this.bound === undefined) {
            this.bound = new Set<IComponentHandle>();
        }

        this.bound.add(handle);
    }

    public async request(request: IRequest): Promise<IResponse> {
        if (this.value.IComponentRouter !== undefined) {
            return this.value.IComponentRouter.request(request);
        } else {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        }
    }
}
