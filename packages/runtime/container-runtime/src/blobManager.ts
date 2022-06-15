/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ICreateBlobResponse, ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { generateHandleContextPath, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, Deferred, TypedEventEmitter } from "@fluidframework/common-utils";
import { IContainerRuntime, IContainerRuntimeEvents } from "@fluidframework/container-runtime-definitions";
import { AttachState } from "@fluidframework/container-definitions";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IGarbageCollectionData,
    ISummaryTreeWithStats,
    ITelemetryContext,
} from "@fluidframework/runtime-definitions";

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

export type IBlobManagerRuntime =
    Pick<IContainerRuntime, "attachState" | "connected" | "logger"> & TypedEventEmitter<IContainerRuntimeEvents>;

// Note that while offline we "submit" an op before uploading the blob, but we always
// expect blobs to be uploaded before we actually see the op round-trip
enum PendingBlobStatus {
    OnlinePendingUpload,
    OnlinePendingOp,
    OfflinePendingUpload,
    OfflinePendingOp,
}

interface PendingBlob {
    blob: ArrayBufferLike;
    status: PendingBlobStatus;
    storageId?: string;
    // resolved when the online flow is complete (i.e. BlobAttach op round-tripped) or when we
    // disonnect and transition everything to offline flow
    deferred: Deferred<string>;
}

export class BlobManager {
    public static readonly basePath = "_blobs";
    private static readonly redirectTableBlobName = ".redirectTable";
    private readonly logger: ITelemetryLogger;

    // Map of local (offline/detached) IDs to storage IDs. Contains identity entries
    // (id -> id) for storage IDs, so all requested IDs should be a key in this map.
    private readonly redirectTable: Map<string, string | undefined>;

    // Blobs which have not been uploaded or for which we have not yet seen a BlobAttach op round-trip
    private readonly pendingBlobs: Map<string, PendingBlob> = new Map();

    // Map of storage IDs to list of local IDs waiting for the BlobAttach op with that storage ID.
    // Note this doesn't include "offline" BlobAttach ops since they will be 1:1 with "offline" blobs.
    private readonly opsInFlight: Map<string, string[]> = new Map();

    constructor(
        private readonly routeContext: IFluidHandleContext,
        snapshot: IBlobManagerLoadInfo,
        private readonly getStorage: () => IDocumentStorageService,
        private readonly sendBlobAttachOp: (blobId?: string, localId?: string) => void,
        // To be called when a blob node is requested. blobPath is the path of the blob's node in GC's graph. It's
        // of the format `/<BlobManager.basePath>/<blobId>`.
        private readonly gcNodeUpdated: (blobPath: string) => void,
        private readonly runtime: IBlobManagerRuntime,
    ) {
        this.logger = ChildLogger.create(this.runtime.logger, "BlobManager");
        this.runtime.on("disconnected", () => this.onDisconnected());
        this.redirectTable = this.load(snapshot);
    }

    /**
     * Upload blobs added while offline. This must be completed before connecting and resubmitting ops.
     */
    public async onConnected() {
        await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "BlobUploadOnConnected",
                count: Array.from(this.pendingBlobs.values())
                    .filter((entry) => entry.status === PendingBlobStatus.OfflinePendingUpload).length,
            },
            async () => {
                // if blobs are added while uploading, upload them too
                while (this.hasPendingUploads) {
                    const uploadPs: Promise<void>[] = [];
                    for (const entry of this.pendingBlobs.values()) {
                        assert(entry.status !== PendingBlobStatus.OnlinePendingUpload,
                            "Must submit BlobAttach op before uploading offline blob");
                        if (entry.status === PendingBlobStatus.OfflinePendingUpload) {
                            uploadPs.push(this.getStorage().createBlob(entry.blob).then((response) => {
                                entry.status = PendingBlobStatus.OfflinePendingOp;
                                entry.storageId = response.id;
                            }));
                        }
                    }
                    await Promise.all(uploadPs);
                }
            },
            { start: true, end: true },
        );
    }

    private onDisconnected() {
        // switch all blobs that haven't been uploaded yet to offline (local ID) flow
        for (const [id, entry] of this.pendingBlobs) {
            if (entry.status === PendingBlobStatus.OnlinePendingUpload ||
                entry.status === PendingBlobStatus.OnlinePendingOp) {
                this.transitionToOffline(id);
            }
        }
        this.opsInFlight.clear();
    }

    /**
     * Resubmit a BlobAttach op. Used to add storage IDs to ops that were
     * submitted to runtime while disconnected.
     * @param metadata - op metadata containing storage and/or local IDs
     */
    public reSubmit(metadata) {
        assert(metadata.blobId || metadata.localId, "Submitted BlobAttach ops must have a blobId or localId");
        if (!metadata.blobId) {
            // We submitted this op while offline. The blob should have been uploaded by now.
            const pendingEntry = this.pendingBlobs.get(metadata.localId);
            assert(!!pendingEntry && pendingEntry.status === PendingBlobStatus.OfflinePendingOp &&
                !!pendingEntry.storageId, "blob must be uploaded before resubmitting BlobAttach op");
            return this.sendBlobAttachOp(pendingEntry.storageId, metadata.localId);
        }
        return this.sendBlobAttachOp(metadata.blobId, metadata.localId);
    }

    /**
     * For a blobId, returns its path in GC's graph. The node path is of the format `/<BlobManager.basePath>/<blobId>`
     * This path must match the path of the blob handle returned by the createBlob API because blobs are marked
     * referenced by storing these handles in a referenced DDS.
     */
    private getBlobGCNodePath(blobId: string) {
        return `/${BlobManager.basePath}/${blobId}`;
    }

    /**
     * Returns true if there are blobs that need to be uploaded before runtime
     * transitions to "connected" state.
     */
    public get hasPendingUploads(): boolean {
        return Array.from(this.pendingBlobs.values())
            .filter((e) => e.status === PendingBlobStatus.OfflinePendingUpload).length > 0;
    }

    private get storageIds(): Set<string> {
        const s = new Set(this.redirectTable.values());
        assert(!s.delete(undefined) || this.runtime.attachState === AttachState.Detached && s.size === 0,
            "redirect table must not have an undefined value while attached");
        return s as Set<string>;
    }

    public async getBlob(blobId: string): Promise<ArrayBufferLike> {
        const pending = this.pendingBlobs.get(blobId);
        if (pending) {
            return pending.blob;
        }
        let storageId;
        if (this.runtime.attachState === AttachState.Detached) {
            assert(this.redirectTable.has(blobId), "requesting unknown blobs");
            storageId = blobId;
        } else {
            storageId = this.redirectTable.get(blobId);
            assert(!!storageId, 0x11f /* "requesting unknown blobs" */);
        }

        // When this blob is retrieved, let the container runtime know that the corresponding GC node got updated.
        this.gcNodeUpdated(this.getBlobGCNodePath(blobId));

        return PerformanceEvent.timedExecAsync(
            this.logger,
            { eventName: "AttachmentReadBlob", id: storageId },
            async () => {
                return this.getStorage().readBlob(storageId);
            },
            { end: true, cancel: "error" },
        );
    }

    private getBlobHandle(id: string): IFluidHandle<ArrayBufferLike> {
        assert(this.redirectTable.has(id) || this.pendingBlobs.has(id) || this.opsInFlight.has(id),
            "requesting handle for unknown blob");
        return new BlobHandle(
            `${BlobManager.basePath}/${id}`,
            this.routeContext,
            async () => this.getBlob(id),
        );
    }

    /**
     * Transition a blob added while online to the offline flow due to disconnect.
     * @param id - Local blob ID
     */
    private transitionToOffline(id: string) {
        const pendingEntry = this.pendingBlobs.get(id);
        assert(pendingEntry?.status === PendingBlobStatus.OnlinePendingUpload ||
            pendingEntry?.status === PendingBlobStatus.OnlinePendingOp,
            "Blob must not have already transitioned to offline flow");
        pendingEntry.status = pendingEntry.status === PendingBlobStatus.OnlinePendingUpload ?
            PendingBlobStatus.OfflinePendingUpload : PendingBlobStatus.OfflinePendingUpload;

        assert(this.runtime.connected === false, "Must not transition to offline when connected");
        // since we are offline, we will have a chance to add the storage ID when reSubmit() is called
        this.sendBlobAttachOp(undefined, id);
        pendingEntry.deferred.resolve(id);
        return this.getBlobHandle(id);
    }

    private async createBlobDetached(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        const response = await this.getStorage().createBlob(blob);
        // while detached we get local IDs
        this.redirectTable.set(response.id, undefined);
        return this.getBlobHandle(response.id);
    }

    public async createBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        if (this.runtime.attachState === AttachState.Detached) {
            return this.createBlobDetached(blob);
        }
        if (this.runtime.attachState === AttachState.Attaching) {
            // blob upload is not supported in "Attaching" state
            this.logger.sendTelemetryEvent({ eventName: "CreateBlobWhileAttaching" });
            await new Promise<void>((resolve) => this.runtime.once("attached", resolve));
        }

        const localId = uuid();
        const pendingEntry: PendingBlob = {
            blob,
            deferred: new Deferred<string>(),
            status: PendingBlobStatus.OnlinePendingUpload,
        };
        this.pendingBlobs.set(localId, pendingEntry);

        if (!this.runtime.connected) {
            // not connected; return local ID handle
            return this.transitionToOffline(localId);
        }

        const responseP = PerformanceEvent.timedExecAsync(
            this.logger,
            { eventName: "createBlob" },
            async () => this.getStorage().createBlob(blob),
            { end: true, cancel: "error" },
        );
        const maybeResponse: string | ICreateBlobResponse = await Promise.race([
            pendingEntry.deferred.promise,
            responseP,
        ]);
        // Note: we check the status here because it's possible that createBlob() won the race, but
        // the disconnect logic is executed (synchronously) before our async code here runs
        if (typeof maybeResponse === "string" || pendingEntry.status !== PendingBlobStatus.OnlinePendingUpload) {
            // disconnected while uploading; return local ID handle
            assert(pendingEntry.status === PendingBlobStatus.OfflinePendingUpload, "Unexpected pending blob status");
            return this.getBlobHandle(localId);
        }

        const storageId = maybeResponse.id;
        if (this.storageIds.has(storageId)) {
            // This blob was already uploaded; don't send a BlobAttach op
            this.pendingBlobs.delete(localId);
            return this.getBlobHandle(storageId);
        }
        pendingEntry.storageId = storageId;
        pendingEntry.status = PendingBlobStatus.OnlinePendingOp;

        // storage may dedupe blobs; check for a BlobAttach op in flight with the same storageId
        if (!this.opsInFlight.has(storageId)) {
            this.sendBlobAttachOp(storageId);
        }
        this.opsInFlight.set(storageId, (this.opsInFlight.get(storageId) ?? []).concat(localId));

        return this.getBlobHandle(await pendingEntry.deferred.promise);
    }

    public processBlobAttachOp(message: ISequencedDocumentMessage, local: boolean) {
        assert(message?.metadata?.blobId, 0x12a /* "Missing blob id on metadata" */);
        if (local) {
            if (message.metadata.localId === undefined) {
                const waitingIds = this.opsInFlight.get(message.metadata.blobId) ?? [];
                for (const localId of waitingIds) {
                    const entry = this.pendingBlobs.get(localId);
                    assert(!!entry && entry.status === PendingBlobStatus.OnlinePendingOp,
                        "Unexpected pending blob status");
                    entry.deferred.resolve(message.metadata.blobId);
                    this.pendingBlobs.delete(localId);
                }
                this.opsInFlight.delete(message.metadata.blobId);
            } else {
                const pendingBlobEntry = this.pendingBlobs.get(message.metadata.localId);
                assert(pendingBlobEntry !== undefined, 0x1f8 /* "local BlobAttach op with no pending blob" */);
                assert(pendingBlobEntry.status === PendingBlobStatus.OfflinePendingOp,
                    "Unexpected pending blob status");
                this.pendingBlobs.delete(message.metadata.blobId);
            }
        }
        if (message.metadata.localId !== undefined) {
            this.redirectTable.set(message.metadata.localId, message.metadata.blobId);
        }
        // set id. entry
        this.redirectTable.set(message.metadata.blobId, message.metadata.blobId);
    }

    /**
     * Reads blobs needed to load BlobManager from storage.
     * @param blobsTree - Tree containing IDs of previously attached blobs. We
     * look for the IDs in the blob entries of the tree since the both the r11s
     * and SPO drivers replace the attachment types returned in snapshot() with blobs.
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
     * Load a set of previously attached blob IDs and redirect table from a previous snapshot.
     */
    private load(snapshot: IBlobManagerLoadInfo): Map<string, string | undefined> {
        this.logger.sendTelemetryEvent({
            eventName: "AttachmentBlobsLoaded",
            count: snapshot.ids?.length ?? 0,
            redirectTable: snapshot.redirectTable?.length,
        });
        const table = new Map<string, string | undefined>(snapshot.redirectTable);
        if (snapshot.ids) {
            const detached = this.runtime.attachState === AttachState.Detached;
            // if we are detached, these are local IDs
            snapshot.ids.map((entry) => table.set(entry, detached ? undefined : entry));
        }
        return table;
    }

    /**
     * Generates data used for garbage collection. Each blob uploaded represents a node in the GC graph as it can be
     * individually referenced by storing its handle in a referenced DDS. Returns the list of blob ids as GC nodes.
     * @param fullGC - true to bypass optimizations and force full generation of GC data. BlobManager doesn't care
     * about this for now because the data is a simple list of blob ids.
     */
    public getGCData(fullGC: boolean = false): IGarbageCollectionData {
        const gcData: IGarbageCollectionData = { gcNodes: {} };
        /**
          * The node path is of the format `/_blobs/blobId`. This path must match the path of the blob handle returned
          * by the createBlob API because blobs are marked referenced by storing these handles in a referenced DDS.
          */
        this.storageIds.forEach((blobId: string) => {
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
                assert(!!storageId, "Must be attached to get GC data");
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
        }
    }

    public summarize(telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
        // if storageIds is empty, it means we are detached and have only local IDs, or that there are no blobs attached
        const blobIds = this.storageIds.size > 0 ? Array.from(this.storageIds) : Array.from(this.redirectTable.keys());
        const builder = new SummaryTreeBuilder();
        blobIds.forEach((blobId) => {
            builder.addAttachment(blobId);
        });

        if (this.redirectTable.size > blobIds.length) {
            builder.addBlob(
                BlobManager.redirectTableBlobName,
                // filter out identity entries
                JSON.stringify(Array.from(this.redirectTable.entries()).filter(([k, v]) => k !== v)),
            );
        }

        return builder.getSummaryTree();
    }

    public setRedirectTable(table: Map<string, string>) {
        assert(this.runtime.attachState === AttachState.Detached,
            0x252 /* "redirect table can only be set in detached container" */);
        assert(this.redirectTable.size === table.size, "Redirect table size must match BlobManager's local ID count");
        for (const [localId, storageId] of table) {
            assert(this.redirectTable.has(localId), 0x254 /* "unrecognized id in redirect table" */);
            this.redirectTable.set(localId, storageId);
            // set id. entry
            this.redirectTable.set(storageId, storageId);
        }
    }
}
