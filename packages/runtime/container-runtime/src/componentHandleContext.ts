/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandle,
    IComponentHandleContext,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { IRuntime } from "@fluidframework/container-definitions";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";

export class ComponentHandleContext implements IComponentHandleContext {
    public get IComponentRouter() { return this; }
    public get IComponentHandleContext() { return this; }
    public readonly isAttached = true;

    constructor(
        public readonly id: string,
        private readonly runtime: IRuntime,
        public readonly routeContext?: IComponentHandleContext,
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
     * Returns the absolute path for this ComponentHandle.
     */
    public get absolutePath(): string {
        return generateHandleContextPath(this);
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
        return this.runtime.request(request);
    }
}
