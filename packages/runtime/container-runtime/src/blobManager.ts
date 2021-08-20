/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { AttachmentTreeEntry, BlobTreeEntry } from "@fluidframework/protocol-base";
import { ISnapshotTree, ITree, ITreeEntry } from "@fluidframework/protocol-definitions";
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

/**
 * Information from a snapshot needed to load BlobManager
 */
export interface IBlobManagerLoadInfo {
    ids?: string[],
    redirectTable?: [string, string][],
}

export class BlobManager {
    public static readonly basePath = "_blobs";
    private static readonly redirectTableBlobName = ".redirectTable";
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
        snapshot: IBlobManagerLoadInfo,
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
        this.load(snapshot);
    }

    private hasBlob(id: string): boolean {
        return this.blobIds.has(id) || this.detachedBlobIds.has(id);
    }

    public async getBlob(blobId: string): Promise<IFluidHandle<ArrayBufferLike>> {
        const storageId = this.redirectTable?.get(blobId) ?? blobId;
        assert(this.hasBlob(storageId), 0x11f /* "requesting unknown blobs" */);

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
     * Reads blobs needed to load BlobManager from storage.
     */
    public static async load(
        blobsTree: ISnapshotTree | undefined,
        tryFetchBlob: (id: string) => Promise<[string, string][]>,
    ): Promise<IBlobManagerLoadInfo> {
        if (!blobsTree) {
            return {};
        }
        let redirectTable;
        const tableId = blobsTree.blobs[this.redirectTableBlobName];
        if (tableId) {
            redirectTable = await tryFetchBlob(tableId);
        }
        const ids = Object.entries(blobsTree.blobs)
            .filter(([k, _]) => k !== this.redirectTableBlobName).map(([_, v]) => v);
        return { ids, redirectTable };
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
    private load(snapshot: IBlobManagerLoadInfo): void {
        if (snapshot.ids) {
            const detached = this.runtime.attachState === AttachState.Detached;
            snapshot.ids.map((entry) => detached ? this.detachedBlobIds.add(entry) : this.blobIds.add(entry));
        }
        if (snapshot.redirectTable) {
            this.redirectTable = new Map(snapshot.redirectTable);
        }
        this.logger.sendTelemetryEvent({
            eventName: "AttachmentBlobsLoaded",
            count: snapshot.ids?.length ?? 0,
            redirectTable: snapshot.redirectTable?.length,
        });
    }

    public snapshot(): ITree {
        // If we have a redirect table it means the container is about to transition to "Attaching" state, so we need
        // to return an actual snapshot containing all the real storage IDs we know about.
        const attachingOrAttached = !!this.redirectTable || this.runtime.attachState !== AttachState.Detached;
        const blobIds = attachingOrAttached ? this.blobIds : this.detachedBlobIds;
        const entries: ITreeEntry[] = [...blobIds].map((id) => new AttachmentTreeEntry(id, id));
        if (this.redirectTable && this.redirectTable.size > 0) {
            entries.push(new BlobTreeEntry(
                BlobManager.redirectTableBlobName,
                JSON.stringify(Array.from(this.redirectTable.entries()))),
            );
        }
        return { entries };
    }

    public setRedirectTable(table: Map<string, string>) {
        assert(this.runtime.attachState === AttachState.Detached,
            "redirect table can only be set in detached container");
        assert(!this.redirectTable, "redirect table already exists");
        for (const [localId, storageId] of table) {
            assert(this.detachedBlobIds.delete(localId), "unrecognized id in redirect table");
            this.blobIds.add(storageId);
        }
        assert(this.detachedBlobIds.size === 0, "detached blob id absent in redirect table");
        this.redirectTable = table;
    }
}
