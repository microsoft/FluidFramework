/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { AttachmentTreeEntry } from "@fluidframework/protocol-base";
import { ISnapshotTree, ITree } from "@fluidframework/protocol-definitions";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, Deferred } from "@fluidframework/common-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { AttachState } from "@fluidframework/container-definitions";

/**
 * This class represents blob (long string)
 * This object is used only when creating (writing) new blob and serialization purposes.
 * De-serialization process goes through FluidObjectHandle and request flow:
 * DataObject.request() recognizes requests in the form of `/blobs/<id>`
 * and loads blob.
 */
export class BlobHandle implements IFluidHandle<ArrayBufferLike> {
    private attached: boolean = false;

    public get IFluidHandle(): IFluidHandle { return this; }

    public get isAttached(): boolean {
        return this.attached;
    }

    public readonly absolutePath: string;

    constructor(
        public readonly path: string,
        public readonly routeContext: IFluidHandleContext,
        public get: () => Promise<any>,
    ) {
        this.absolutePath = generateHandleContextPath(path, this.routeContext);
    }

    public attachGraph() {
        this.attached = true;
    }

    public bind(handle: IFluidHandle) {
        throw new Error("Cannot bind to blob handle");
    }
}

export class BlobManager {
    public static readonly basePath = "_blobs";
    private readonly pendingBlobIds: Map<string, Deferred<void>> = new Map();
    private readonly blobIds: Set<string> = new Set();
    private readonly detachedBlobIds: Set<string> = new Set();

    constructor(
        private readonly routeContext: IFluidHandleContext,
        private readonly getStorage: () => IDocumentStorageService,
        private readonly attachBlobCallback: (blobId: string) => void,
        private readonly runtime: IContainerRuntime,
        private readonly logger: ITelemetryLogger,
    ) {
        this.runtime.once("dispose", () => {
            for (const promise of this.pendingBlobIds.values()) {
                promise.reject(new Error("runtime disposed while blobAttach op in flight"));
            }
        });
    }

    private hasBlob(id: string): boolean {
        return this.blobIds.has(id) || this.detachedBlobIds.has(id);
    }

    public async getBlob(blobId: string): Promise<IFluidHandle<ArrayBufferLike>> {
        assert(this.hasBlob(blobId), 0x11f /* "requesting unknown blobs" */);
        return new BlobHandle(
            `${BlobManager.basePath}/${blobId}`,
            this.routeContext,
            async () => this.getStorage().readBlob(blobId),
        );
    }

    public async createBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        assert(
            this.runtime.attachState !== AttachState.Attaching,
            0x1f9 /* "createBlob() while attaching not supported" */,
        );
        const response = await this.getStorage().createBlob(blob);

        const handle = new BlobHandle(
            `${BlobManager.basePath}/${response.id}`,
            this.routeContext,
            async () => this.getStorage().readBlob(response.id),
        );

        if (this.runtime.attachState === AttachState.Detached) {
            this.detachedBlobIds.add(response.id);
            return handle;
        }

        // Note - server will de-dup blobs, so we might get existing blobId!
        if (this.pendingBlobIds.has(response.id)) {
            await this.pendingBlobIds.get(response.id)?.promise;
        } else if (!this.blobIds.has(response.id)) {
            this.pendingBlobIds.set(response.id, new Deferred<void>());

            // send blob attach op and wait until we see it to return the handle
            this.attachBlobCallback(response.id);
            await this.pendingBlobIds.get(response.id)?.promise;
        }

        return handle;
    }

    public processBlobAttachOp(blobId: string, local: boolean) {
        assert(!local || this.pendingBlobIds.has(blobId), 0x1f8 /* "local BlobAttach op with no pending blob" */);
        this.pendingBlobIds.get(blobId)?.resolve();
        this.pendingBlobIds.delete(blobId);
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
        const detached = this.runtime.attachState === AttachState.Detached;
        let count = 0;
        if (blobsTree) {
            const values = Object.values(blobsTree.blobs);
            count = values.length;
            values.map((entry) => detached ? this.detachedBlobIds.add(entry) : this.blobIds.add(entry));
        }
        this.logger.sendTelemetryEvent({ eventName: "ExternalBlobsInSnapshot", count });
    }

    public snapshot(): ITree {
        const blobIds = this.runtime.attachState === AttachState.Detached ? this.detachedBlobIds : this.blobIds;
        const entries = [...blobIds].map((id) => new AttachmentTreeEntry(id, id));
        return { entries };
    }
}
