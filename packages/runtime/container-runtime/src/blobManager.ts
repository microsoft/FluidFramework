/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { AttachmentTreeEntry } from "@fluidframework/protocol-base";
import { IAttachment, ITree, TreeEntry } from "@fluidframework/protocol-definitions";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";

/**
 * This class represents blob (long string)
 * This object is used only when creating (writing) new blob and serialization purposes.
 * De-serialization process goes through FluidObjectHandle and request flow:
 * DataObject.request() recognizes requests in the form of `/blobs/<id>`
 * and loads blob.
 */
export class BlobHandle implements IFluidHandle<ArrayBufferLike> {
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
    private readonly blobIds: Set<string> = new Set();

    constructor(
        private readonly routeContext: IFluidHandleContext,
        private readonly getStorage: () => IDocumentStorageService,
        private readonly sendBlobAttachOp: (blobId: string) => void,
    ) { }

    public async getBlob(blobId: string): Promise<IFluidHandle<ArrayBufferLike>> {
        return new BlobHandle(
            `${this.basePath}/${blobId}`,
            this.routeContext,
            async () => this.getStorage().readBlob(blobId),
            () => null,
        );
    }

    public async createBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        const response = await this.getStorage().createBlob(blob);

        const handle = new BlobHandle(
            `${this.basePath}/${response.id}`,
            this.routeContext,
            async () => this.getStorage().readBlob(response.id),
            () => this.sendBlobAttachOp(response.id),
        );

        return handle;
    }

    public addBlobId(blobId: string) {
        this.blobIds.add(blobId);
    }

    public load(blobsBlob?: string) {
        if (blobsBlob) {
            const decoded = Buffer.from(blobsBlob, "base64").toString();
            const tree = JSON.parse(decoded) as ITree;
            if (Array.isArray(tree)) {
                return; // this is an old snapshot
            }
            tree.entries.map((entry) => {
                assert.strictEqual(entry.type, TreeEntry.Attachment);
                this.addBlobId((entry.value as IAttachment).id);
            });
        }
    }

    public snapshot(): ITree {
        const entries = [...this.blobIds].map((id) => new AttachmentTreeEntry(id, id));
        return { entries, id: null };
    }
}
