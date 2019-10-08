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
import { ISharedObject } from "./types";

/**
 * Component handle for shared object
 */
export class SharedObjectComponentHandle implements IComponentHandle {
    private bound: Set<IComponentHandle> | undefined;

    public get IComponentHandle() { return this; }
    public get IComponentRouter() { return this; }
    public get IComponentHandleContext() { return this; }

    public get isAttached(): boolean {
        return !this.value.isLocal();
    }

    constructor(
        private readonly value: ISharedObject,
        public readonly path: string,
        public readonly routeContext: IComponentHandleContext,
    ) {
    }

    public async get(): Promise<any> {
        return this.value;
    }

    public attach(): void {
        if (this.bound) {
            for (const handle of this.bound) {
                handle.attach();
            }

            this.bound = undefined;
        }

        this.value.register();
    }

    public bind(handle: IComponentHandle): void {
        if (!this.bound) {
            this.bound = new Set<IComponentHandle>();
        }

        this.bound.add(handle);
    }

    public async request(request: IRequest): Promise<IResponse> {
        return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }
}
