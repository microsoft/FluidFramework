/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandle,
    IComponentHandleContext,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { IRuntime } from "@microsoft/fluid-container-definitions";

export class ComponentHandleContext implements IComponentHandleContext {
    public get IComponentRouter() { return this; }
    public get IComponentHandleContext() { return this; }

    constructor(
        public readonly path: string,
        private readonly runtime: IRuntime,
        private _isAttached: boolean,
        public readonly routeContext?: IComponentHandleContext,
    ) {
    }

    public get isAttached(): boolean {
        return this._isAttached;
    }

    public attach(): void {
        this._isAttached = true;
    }

    public bind(handle: IComponentHandle): void {
        throw new Error("Cannot bind to an attached handle");
    }

    public async request(request: IRequest): Promise<IResponse> {
        return this.runtime.request(request);
    }
}
