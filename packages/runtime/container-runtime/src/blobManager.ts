/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidHandle,
    IFluidHandleContext,
} from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";

/**
 * This class represents blob (long string)
 * This object is used only when creating (writing) new blob and serialization purposes.
 * De-serialization process goes through FluidObjectHandle and request flow:
 * DataObject.request() recognizes requests in the form of `/blobs/<id>`
 * and loads blob.
 */
export class BlobHandle implements IFluidHandle {
    public get IFluidHandle(): IFluidHandle { return this; }

    public get isAttached(): boolean {
        return true;
    }

    public readonly absolutePath: string;

    constructor(
        public readonly path: string,
        public readonly routeContext: IFluidHandleContext,
        public get: () => Promise<any>,
        public attachGraph: () => void,
    ) {
        this.absolutePath = generateHandleContextPath(path, this.routeContext);
    }

    public bind(handle: IFluidHandle) {
        throw new Error("Cannot bind to blob handle");
    }
}

export class BlobManager {
    public readonly basePath = "_blobs";

    constructor(
        private readonly routeContext: IFluidHandleContext,
        private readonly getStorage: () => IDocumentStorageService,
        private readonly sendBlobAttachOp: (blobId: string) => void,
    ) { }

    public async getBlob(blobId: string): Promise<BlobHandle> {
        return new BlobHandle(
            `${this.basePath}/${blobId}`,
            this.routeContext,
            async () => this.getStorage().readBlob(blobId),
            () => null,
        );
    }

    public async createBlob(blob: Buffer): Promise<BlobHandle> {
        const response = await this.getStorage().createBlob(blob);

        const handle = new BlobHandle(
            `${this.basePath}/${response.id}`,
            this.routeContext,
            async () => this.getStorage().readBlob(response.id),
            () => this.sendBlobAttachOp(response.id),
        );

        return handle;
    }
}
