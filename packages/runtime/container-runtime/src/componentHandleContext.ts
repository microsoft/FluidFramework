/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle, IComponentHandleContext, IRequest, IResponse } from "@prague/component-core-interfaces";
import { IRuntime } from "@prague/container-definitions";

export class ComponentHandleContext implements IComponentHandleContext {
    public get IComponentRouter() { return this; }
    public get IComponentHandleContext() { return this; }
    public readonly isAttached = true;

    constructor(
        public readonly path: string,
        private readonly runtime: IRuntime,
        public readonly routeContext?: IComponentHandleContext,
    ) {
    }

    public attach(): void {
        return;
    }

    public bind(handle: IComponentHandle): void {
        throw new Error("Cannot bind to an attached handle");
    }

    public async request(request: IRequest): Promise<IResponse> {
        return this.runtime.request(request);
    }
}
