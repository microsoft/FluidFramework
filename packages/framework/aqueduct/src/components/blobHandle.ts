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
} from "@microsoft/fluid-component-core-interfaces";
import { ISharedDirectory } from "@microsoft/fluid-map";

/**
 * This class represents blob (long string)
 * This object is used only when creating (writing) new blob and serialization purposes.
 * De-serialization process goes through ComponentHandle and request flow:
 * PrimedComponent.request() recognizes requests in the form of `/blobs/<id>`
 * and loads blob.
 */
export class BlobHandle implements IComponentHandle {
    public get [IComponentRouter](): IComponentRouter { return this; }
    public get [IComponentHandleContext](): IComponentHandleContext { return this; }
    public get [IComponentHandle](): IComponentHandle { return this; }

    public get isAttached(): boolean {
        return true;
    }

    constructor(
        public readonly path: string,
        private readonly directory: ISharedDirectory,
        public readonly routeContext: IComponentHandleContext,
    ) {
    }

    public async get(): Promise<any> {
        return this.directory.get<string>(this.path);
    }

    public attach(): void {
    }

    public bind(handle: IComponentHandle) {
        throw new Error("Cannot bind to blob handle");
    }

    public async request(request: IRequest): Promise<IResponse> {
        return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }
}
