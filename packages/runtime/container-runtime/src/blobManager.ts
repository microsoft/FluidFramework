/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    IFluidHandle,
    IFluidHandleContext,
    IFluidRouter,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import { IBlobManager } from "@fluidframework/container-definitions";
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
        public readonly blobId: string,
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
}

export class BlobManager implements IBlobManager {
    private readonly blobHandles: Map<string, BlobHandle>;
    private readonly attachedBlobs: Set<string>;

    constructor(
        private readonly routeContext: IFluidHandleContext,
        private readonly storage: IDocumentStorageService,
        private readonly sendBlobAttachOp: (blobId: string) => void,
    ) {
        this.blobHandles = new Map<string, BlobHandle>();
        this.attachedBlobs = new Set<string>();
    }

    public loadBlobHandles(blobIds: string[]) {
        for (const blobId of blobIds) {
            this.blobHandles.set(blobId, new BlobHandle(
                blobId,
                `blobs/${blobId}`,
                this.routeContext,
                async () => this.storage.read(blobId),
                () => null,
            ));
            this.attachedBlobs.add(blobId);
        }
    }

    public setAttached(blobId: string) {
        assert(!this.attachedBlobs.has(blobId));
        if (!this.blobHandles.has(blobId)) {
            this.blobHandles.set(blobId, new BlobHandle(
                blobId,
                `blobs/${blobId}`,
                this.routeContext,
                async () => this.storage.read(blobId),
                () => null,
            ));
        }
        this.attachedBlobs.add(blobId);
    }

    public getBlobIds(): string[] {
        return [...this.attachedBlobs];
    }

    public async getBlob(blobId: string): Promise<BlobHandle> {
        const handle = this.blobHandles.get(blobId);
        if (handle !== undefined) {
            return handle;
        }
        return Promise.reject("Blob does not exist");
    }

    public async createBlob(blob: Buffer): Promise<BlobHandle> {
        const response = await this.storage.createBlob(blob);

        const handle = new BlobHandle(
            response.id,
            `blobs/${response.id}`,
            this.routeContext,
            async () => this.storage.read(response.id),
            () => this.sendBlobAttachOp(response.id),
        );

        this.blobHandles.set(response.id, handle);
        return handle;
    }

    public async removeBlob(blobId: string): Promise<void> {
        return Promise.reject("not implemented");
    }
}
