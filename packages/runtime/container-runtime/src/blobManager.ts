/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidHandle,
    IFluidHandleContext,
    IFluidRouter,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";

/**
 * This class represents blob (long string)
 * This object is used only when creating (writing) new blob and serialization purposes.
 * De-serialization process goes through FluidOjectHandle and request flow:
 * DataObject.request() recognizes requests in the form of `/blobs/<id>`
 * and loads blob.
 */
export class BlobHandle implements IFluidHandle {
    public get IFluidRouter(): IFluidRouter { return this; }
    public get IFluidHandleContext(): IFluidHandleContext { return this; }
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

    public async request(request: IRequest): Promise<IResponse> {
        return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }

    public async resolveHandle(request: IRequest): Promise<IResponse> {
        return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
    }
}

export class BlobManager {
    private readonly attachedBlobs: Set<string>;

    constructor(
        private readonly routeContext: IFluidHandleContext,
        private readonly storage: IDocumentStorageService,
        private readonly sendBlobAttachOp: (blobId: string) => void,
    ) {
        this.attachedBlobs = new Set<string>();
    }

    public setAttached(...blobIds: string[]) {
        blobIds.map((blobId) => this.attachedBlobs.add(blobId));
    }

    public snapshot(): string {
        return JSON.stringify([...this.attachedBlobs]);
    }

    public async getBlob(blobId: string): Promise<BlobHandle> {
        return new BlobHandle(
            `blobs/${blobId}`,
            this.routeContext,
            async () => this.storage.read(blobId),
            () => null,
        );
    }

    public async createBlob(blob: Buffer): Promise<BlobHandle> {
        const response = await this.storage.createBlob(blob);

        const handle = new BlobHandle(
            `blobs/${response.id}`,
            this.routeContext,
            async () => this.storage.read(response.id),
            () => this.sendBlobAttachOp(response.id),
        );

        return handle;
    }
}
