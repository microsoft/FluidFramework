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
    // uploaded blob IDs
    private readonly blobIds: Set<string> = new Set();
    // blobs for which upload is pending. maps to a promise that will resolve once the blob has been uploaded and a
    // BlobAttach op has round-tripped.
    private readonly pendingBlobIds: Map<string, Deferred<void>> = new Map();
    // blobs uploaded while detached; cleared upon attach
    private readonly detachedBlobIds: Set<string> = new Set();
    // map of detached blob IDs to IDs used by storage. used to support blob handles given out while detached
    private redirectTable: Map<string, string> | undefined;

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

        const storageId = this.redirectTable?.get(blobId) ?? blobId;
        return new BlobHandle(
            `${BlobManager.basePath}/${storageId}`,
            this.routeContext,
            async () => this.getStorage().readBlob(storageId),
        );
    }

    public async createBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        if (this.runtime.attachState === AttachState.Attaching) {
            // blob upload is not supported in "Attaching" state
            this.logger.sendTelemetryEvent({ eventName: "CreateBlobWhileAttaching" });
            await new Promise<void>((res) => this.runtime.once("attached", res));
        }

        const response = await this.getStorage().createBlob(blob);
        const handle = new BlobHandle(
            `${BlobManager.basePath}/${response.id}`,
            this.routeContext,
            // get() should go through BlobManager.getBlob() so handles created while detached can be redirected
            // to the correct storage id after they are uploaded
            async () => this.getBlob(response.id).then(async (h) => h.get()),
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

    public setRedirectTable(table: Map<string, string>) {
        for (const [localId, storageId] of table) {
            assert(this.detachedBlobIds.delete(localId), "unrecognized id in redirect table");
            this.blobIds.add(storageId);
        }
        assert(this.detachedBlobIds.size === 0, "detached blob id absent in redirect table");
        this.redirectTable = table;
    }
}
