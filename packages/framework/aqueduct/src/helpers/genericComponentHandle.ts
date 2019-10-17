/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandle,
    IComponentHandleContext,
    IComponentLoadable,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";

/**
 * In order for Components to be stored directly on SharedObjects they need to support handles. GenericComponentHandle is
 * written to be extensible for any IComponentLoadable object.
 *
 * GenericComponentHandle can be used for Collection Instances by the instance creating a new GenericComponentHandle and providing
 * the IComponentRuntime from the Collection Component.
 *
 * GenericComponentHandle will only work correctly if the IComponentLoadable component passed to the constructor correctly defines
 * the url to their component.
 */
export class GenericComponentHandle<T extends IComponentLoadable> implements IComponentHandle {
    public get IComponentRouter(): IComponentRouter { return this.handleContext; }
    public get IComponentHandleContext(): IComponentHandleContext { return this.handleContext; }
    public get IComponentHandle(): IComponentHandle { return this; }

    public get routeContext(): IComponentHandleContext | undefined {
        return this.handleContext.routeContext;
    }

    public get isAttached(): boolean {
        return this.handleContext.isAttached;
    }

    public get path(): string {
        return this.component.url;
    }

    public constructor(
        private readonly handleContext: IComponentHandleContext,
        private readonly component: T) {
    }

    public async get(): Promise<any> {
        return this.component;
    }

    public attach(): void {
        this.handleContext.attach();
    }
    public bind(handle: IComponentHandle): void {
        this.handleContext.bind(handle);
    }
    public async request(request: IRequest): Promise<IResponse> {
        return this.handleContext.request(request);
    }
}
