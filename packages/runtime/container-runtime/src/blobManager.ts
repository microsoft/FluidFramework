/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { generateHandleContextPath, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, Deferred } from "@fluidframework/common-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { AttachState } from "@fluidframework/container-definitions";
import { IGarbageCollectionData, ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";

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
    ids?: string[];
    redirectTable?: [string, string][];
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
        // To be called when a blob node is requested. blobPath is the path of the blob's node in GC's graph. It's
        // of the format `/<BlobManager.basePath>/<blobId>`.
        private readonly gcNodeUpdated: (blobPath: string) => void,
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

    /**
     * For a blobId, returns its path in GC's graph. The node path is of the format `/<BlobManager.basePath>/<blobId>`
     * This path must match the path of the blob handle returned by the createBlob API because blobs are marked
     * referenced by storing these handles in a referenced DDS.
     */
    private getBlobGCNodePath(blobId: string) {
        return `/${BlobManager.basePath}/${blobId}`;
    }

    public async getBlob(blobId: string): Promise<IFluidHandle<ArrayBufferLike>> {
        const storageId = this.redirectTable?.get(blobId) ?? blobId;
        assert(this.hasBlob(storageId), 0x11f /* "requesting unknown blobs" */);

        // When this blob is retrieved, let the container runtime know that the corresponding GC node got updated.
        this.gcNodeUpdated(this.getBlobGCNodePath(blobId));

        return new BlobHandle(
            `${BlobManager.basePath}/${storageId}`,
            this.routeContext,
            async () => {
                return this.getStorage().readBlob(storageId).catch((error) => {
                    this.logger.sendErrorEvent(
                        {
                            eventName: "AttachmentReadBlobError",
                            id: storageId,
                        },
                        error,
                    );
                    throw error;
                });
            },
        );
    }

    public async createBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        if (this.runtime.attachState === AttachState.Attaching) {
            // blob upload is not supported in "Attaching" state
            this.logger.sendTelemetryEvent({ eventName: "CreateBlobWhileAttaching" });
            await new Promise<void>((resolve) => this.runtime.once("attached", resolve));
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
        if (local) {
            const pendingBlobP = this.pendingBlobIds.get(blobId);
            assert(pendingBlobP !== undefined, 0x1f8 /* "local BlobAttach op with no pending blob" */);
            pendingBlobP.resolve();
            this.pendingBlobIds.delete(blobId);
        }
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

    /**
     * Generates data used for garbage collection. Each blob uploaded represents a node in the GC graph as it can be
     * individually referenced by storing its handle in a referenced DDS. Returns the list of blob ids as GC nodes.
     * @param fullGC - true to bypass optimizations and force full generation of GC data. BlobManager doesn't care
     * about this for now because the data is a simple list of blob ids.
     */
    public getGCData(fullGC: boolean = false): IGarbageCollectionData {
        const gcData: IGarbageCollectionData = { gcNodes: {} };

        this.blobIds.forEach((blobId: string) => {
            gcData.gcNodes[this.getBlobGCNodePath(blobId)] = [];
        });

        /**
         * For all blobs in the redirect table, the handle returned on creation is based off of the localId. So, these
         * nodes can be referenced by storing the localId handle. When that happens, the corresponding storageId node
         * must also be marked referenced. So, we add a route from the localId node to the storageId node.
         * Note that because of de-duping, there can be multiple localIds that all redirect to the same storageId or
         * a blob may be referenced via its storageId handle.
         */
        if (this.redirectTable !== undefined) {
            for (const [localId, storageId] of this.redirectTable) {
                // Add node for the localId and add a route to the storageId node. The storageId node will have been
                // added above when adding nodes for this.blobIds.
                gcData.gcNodes[this.getBlobGCNodePath(localId)] = [this.getBlobGCNodePath(storageId)];
            }
        }

        return gcData;
    }

    /**
     * When running GC in test mode, this is called to delete blobs that are unused.
     * @param unusedRoutes - These are the blob node ids that are unused and should be deleted.
     */
    public deleteUnusedRoutes(unusedRoutes: string[]): void {
        // The routes or blob node paths are in the same format as returned in getGCData -
        // `/<BlobManager.basePath>/<blobId>`.
        for (const route of unusedRoutes) {
            const pathParts = route.split("/");
            assert(
                pathParts.length === 3 && pathParts[1] === BlobManager.basePath,
                0x2d5 /* "Invalid blob node id in unused routes." */,
            );
            const blobId = pathParts[2];

            // The unused blobId could be a localId. If so, remove it from the redirect table and continue. The
            // corresponding storageId may still be used either directly or via other localIds.
            if (this.redirectTable?.has(blobId)) {
                this.redirectTable.delete(blobId);
                continue;
            }
            this.blobIds.delete(blobId);
        }
    }

    public summarize(): ISummaryTreeWithStats {
        // If we have a redirect table it means the container is about to transition to "Attaching" state, so we need
        // to return an actual snapshot containing all the real storage IDs we know about.
        const attachingOrAttached = !!this.redirectTable || this.runtime.attachState !== AttachState.Detached;
        const blobIds = attachingOrAttached ? this.blobIds : this.detachedBlobIds;
        const builder = new SummaryTreeBuilder();
        blobIds.forEach((blobId) => {
            builder.addAttachment(blobId);
        });

        if (this.redirectTable && this.redirectTable.size > 0) {
            builder.addBlob(
                BlobManager.redirectTableBlobName,
                JSON.stringify(Array.from(this.redirectTable.entries())),
            );
        }

        return builder.getSummaryTree();
    }

    public setRedirectTable(table: Map<string, string>) {
        assert(this.runtime.attachState === AttachState.Detached,
            0x252 /* "redirect table can only be set in detached container" */);
        assert(!this.redirectTable, 0x253 /* "redirect table already exists" */);
        for (const [localId, storageId] of table) {
            assert(this.detachedBlobIds.delete(localId), 0x254 /* "unrecognized id in redirect table" */);
            this.blobIds.add(storageId);
        }
        assert(this.detachedBlobIds.size === 0, 0x255 /* "detached blob id absent in redirect table" */);
        this.redirectTable = table;
    }
}
