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

    public readonly absolutePath: string;

    constructor(
        private readonly path: string,
        private readonly directory: ISharedDirectory,
        public readonly routeContext: IComponentHandleContext,
    ) {
        this.absolutePath = generateHandleContextPath(path, this.routeContext);
    }

    public async get(): Promise<any> {
        return this.directory.get<string>(this.path);
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
