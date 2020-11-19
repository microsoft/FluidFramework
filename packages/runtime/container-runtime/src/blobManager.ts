/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { readWithRetry } from "@fluidframework/driver-utils";
import { AttachmentTreeEntry } from "@fluidframework/protocol-base";
import { ISnapshotTree, ITree } from "@fluidframework/protocol-definitions";
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
    public static readonly basePath = "_blobs";
    private readonly blobIds: Set<string> = new Set();

    constructor(
        private readonly routeContext: IFluidHandleContext,
        private readonly getStorage: () => IDocumentStorageService,
        private readonly sendBlobAttachOp: (blobId: string) => void,
    ) { }

    public async getBlob(blobId: string): Promise<IFluidHandle<ArrayBufferLike>> {
        return new BlobHandle(
            `${BlobManager.basePath}/${blobId}`,
            this.routeContext,
            async () => readWithRetry(async () => this.getStorage().readBlob(blobId)),
            () => null,
        );
    }

    public async createBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        const response = await this.getStorage().createBlob(blob);

        const handle = new BlobHandle(
            `${BlobManager.basePath}/${response.id}`,
            this.routeContext,
            async () => this.getStorage().readBlob(response.id),
            () => this.sendBlobAttachOp(response.id),
        );

        return handle;
    }

    public addBlobId(blobId: string) {
        this.blobIds.add(blobId);
    }

    /**
     * Load a set of previously attached blob IDs from a previous snapshot. Note
     * that BlobManager tracking and reporting attached blobs is a temporary
     * solution since storage expects attached blobs to be reported and any that
     * are not reported as attached may be GCed. In the future attached blob
     * IDs will be collected at summarization time, and runtime will not care
     * about the existence or specific formatting of this tree in returned
     * snapshots.
     *
     * @param blobsTree - Tree containing IDs of previously attached blobs. This
     * corresponds to snapshot() below. We look for the IDs in the blob entries
     * of the tree since the both the r11s and SPO drivers replace the
     * attachment types returned in snapshot() with blobs.
     */
    public load(blobsTree?: ISnapshotTree): void {
        if (blobsTree) {
            Object.values(blobsTree.blobs).map((entry) => this.addBlobId(entry));
        }
    }

    public snapshot(): ITree {
        const entries = [...this.blobIds].map((id) => new AttachmentTreeEntry(id, id));
        return { entries, id: null };
    }
}
