/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponentHandle,
    IComponentHandleContext,
    IComponentRouter,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";
import { ISharedDirectory } from "@fluidframework/map";

/**
 * This class represents blob (long string)
 * This object is used only when creating (writing) new blob and serialization purposes.
 * De-serialization process goes through ComponentHandle and request flow:
 * PrimedComponent.request() recognizes requests in the form of `/blobs/<id>`
 * and loads blob.
 */
export class BlobHandle implements IComponentHandle {
    public get IComponentRouter(): IComponentRouter { return this; }
    public get IComponentHandleContext(): IComponentHandleContext { return this; }
    public get IComponentHandle(): IComponentHandle { return this; }

    public get isAttached(): boolean {
        return true;
    }

    constructor(
        public readonly id: string,
        private readonly directory: ISharedDirectory,
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
     * Returns the absolute path for this ComponentHandle.
     */
    public get absolutePath(): string {
        return generateHandleContextPath(this);
    }

    public async get(): Promise<any> {
        return this.directory.get<string>(this.id);
    }

    public attachGraph(): void {
        return;
    }

    public bind(handle: IComponentHandle) {
        throw new Error("Cannot bind to blob handle");
    }

    public async request(request: IRequest): Promise<IResponse> {
        return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }
}
