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
import { assert, bufferToString, Deferred, stringToBuffer, TypedEventEmitter } from "@fluidframework/common-utils";
import { IContainerRuntime, IContainerRuntimeEvents } from "@fluidframework/container-runtime-definitions";
import { AttachState } from "@fluidframework/container-definitions";
import { ChildLogger, PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IGarbageCollectionData,
    ISummaryTreeWithStats,
    ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { Throttler, formExponentialFn, IThrottler } from "./throttler";

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

class CancellableThrottler {
    constructor(private readonly throttler: IThrottler) { }
    private cancelP = new Deferred<void>();

    public async getDelay(): Promise<void> {
        return Promise.race([
            this.cancelP.promise,
            new Promise<void>((resolve) => setTimeout(resolve, this.throttler.getDelay())),
        ]);
    }

    public cancel() {
        this.cancelP.resolve();
        this.cancelP = new Deferred<void>();
    }
}

/**
 * Information from a snapshot needed to load BlobManager
 */
export interface IBlobManagerLoadInfo {
    ids?: string[];
    redirectTable?: [string, string][];
}

// Restrict the IContainerRuntime interface to the subset required by BlobManager.  This helps to make
// the contract explicit and reduces the amount of mocking required for tests.
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
    handleP: Deferred<IFluidHandle<ArrayBufferLike>>;
    uploadP: Promise<ICreateBlobResponse>;
}

export interface IPendingBlobs { [id: string]: { blob: string; }; }

export class BlobManager {
    public static readonly basePath = "_blobs";
    private static readonly redirectTableBlobName = ".redirectTable";
    private readonly logger: ITelemetryLogger;

    /**
     * Map of local (offline/detached) IDs to storage IDs. Contains identity entries
     * (id → id) for storage IDs, so all requested IDs should be a key in this map.
     * Blobs created while the container is detached are stored in IDetachedBlobStorage
     * which gives local IDs; the storage IDs are filled in at attach time.
     */
    private readonly redirectTable: Map<string, string | undefined>;

    /**
     * Blobs which have not been uploaded or for which we have not yet seen a BlobAttach op round-trip.
     * Until we see the op round-trip, there is a possibility we may need to re-upload the blob, so
     * we must save it. This is true for both the online and offline flow.
     */
    private readonly pendingBlobs: Map<string, PendingBlob> = new Map();

    /**
     * Track ops in flight for online flow. Used to avoid searching pendingBlobs since BlobAttach ops
     * don't include local ID in online flow.
     */
    private readonly opsInFlight: Map<string, string[]> = new Map();

    private readonly retryThrottler = new CancellableThrottler(new Throttler(
        60 * 1000, // 60 sec delay window
        30 * 1000, // 30 sec max delay
        // throttling function increases exponentially (0ms, 40ms, 80ms, 160ms, etc)
        formExponentialFn({ coefficient: 20, initialDelay: 0 }),
    ));

    constructor(
        private readonly routeContext: IFluidHandleContext,
        snapshot: IBlobManagerLoadInfo,
        private readonly getStorage: () => IDocumentStorageService,
        /**
         * Submit a BlobAttach op. When a blob is uploaded, there is a short grace period before which
         * the blob is deleted. The BlobAttach op notifies the server that blob is in use. The server
         * will then not delete the blob as long as it is listed as referenced in future summaries.
         * The summarizing client will know to include the storage ID in the summary when it sees the op.
         *
         * The op may also include a local ID to inform all clients of the relation to the storage
         * ID, without knowledge of which they cannot request the blob from storage. This is also
         * included in the redirect table in the summary.
         */
        private readonly sendBlobAttachOp: (storageId?: string, localId?: string) => void,
        // To be called when a blob node is requested. blobPath is the path of the blob's node in GC's graph. It's
        // of the format `/<BlobManager.basePath>/<blobId>`.
        private readonly gcNodeUpdated: (blobPath: string) => void,
        private readonly runtime: IBlobManagerRuntime,
        stashedBlobs: IPendingBlobs = {},
    ) {
        this.logger = ChildLogger.create(this.runtime.logger, "BlobManager");
        this.runtime.on("disconnected", () => this.onDisconnected());
        this.redirectTable = this.load(snapshot);

        // Begin uploading stashed blobs from previous container instance
        Object.entries(stashedBlobs).forEach(([localId, entry]) => {
            const blob = stringToBuffer(entry.blob, "base64");
            this.pendingBlobs.set(localId, {
                blob,
                status: PendingBlobStatus.OfflinePendingUpload,
                handleP: new Deferred(),
                uploadP: this.uploadBlob(localId, blob),
            });
        });
    }

    private get pendingOfflineUploads() {
        return Array.from(this.pendingBlobs.values())
            .filter((e) => e.status === PendingBlobStatus.OfflinePendingUpload);
    }

    public get hasPendingOfflineUploads(): boolean {
        return this.pendingOfflineUploads.length > 0;
    }

    /**
     * Upload blobs added while offline. This must be completed before connecting and resubmitting ops.
     */
    public async onConnected() {
        this.retryThrottler.cancel();
        const pendingUploads = this.pendingOfflineUploads.map(async (e) => e.uploadP);
        await PerformanceEvent.timedExecAsync(this.logger, {
                eventName: "BlobUploadOnConnected",
                count: pendingUploads.length,
            }, async () => Promise.all(pendingUploads),
            { start: true, end: true },
        );
    }

    /**
     * Transition online blobs waiting for BlobAttach op round-trip since we will not see the op until we are connected
     * again
     */
    private onDisconnected() {
        for (const [localId, entry] of this.pendingBlobs) {
            if (entry.status === PendingBlobStatus.OnlinePendingOp) {
                // This will submit another BlobAttach op for this blob. This is necessary because the one we sent
                // already didn't have the local ID.
                this.transitionToOffline(localId);
            }
        }
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
     * Set of actual storage IDs (i.e., IDs that can be requested from storage). This will be empty if the container is
     * detached or there are no (non-pending) attachment blobs in the document
     */
    private get storageIds(): Set<string> {
        const ids = new Set<string | undefined>(this.redirectTable.values());

        // If we are detached, we will not have storage IDs, only undefined
        const undefinedValueInTable = ids.delete(undefined);

        // For a detached container, entries are inserted into the redirect table with an undefined storage ID.
        // For an attached container, entries are inserted w/storage ID after the BlobAttach op round-trips.
        assert(!undefinedValueInTable || this.runtime.attachState === AttachState.Detached && ids.size === 0,
            0x382 /* 'redirectTable' must contain only undefined while detached / defined values while attached */);

        return ids as Set<string>;
    }

    public async getBlob(blobId: string): Promise<ArrayBufferLike> {
        const pending = this.pendingBlobs.get(blobId);
        if (pending) {
            return pending.blob;
        }
        let storageId;
        if (this.runtime.attachState === AttachState.Detached) {
            assert(this.redirectTable.has(blobId), 0x383 /* requesting unknown blobs */);

            // Blobs created while the container is detached are stored in IDetachedBlobStorage.
            // The 'IDocumentStorageService.readBlob()' call below will retrieve these via localId.
            storageId = blobId;
        } else {
            storageId = this.redirectTable.get(blobId);
            assert(!!storageId, 0x11f /* "requesting unknown blobs" */);
        }

        // When a GC-able (not pending) blob is retrieved, let runtime know that the corresponding GC node got updated.
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
        assert(this.redirectTable.has(id) || this.pendingBlobs.has(id),
            0x384 /* requesting handle for unknown blob */);
        return new BlobHandle(
            `${BlobManager.basePath}/${id}`,
            this.routeContext,
            async () => this.getBlob(id),
        );
    }

    private async createBlobDetached(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        // Blobs created while the container is detached are stored in IDetachedBlobStorage.
        // The 'IDocumentStorageService.createBlob()' call below will respond with a localId.
        const response = await this.getStorage().createBlob(blob);
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
        assert(this.runtime.attachState === AttachState.Attached,
            0x385 /* For clarity and paranoid defense against adding future attachment states */);

        // Create a local ID for each blob. This is used to support blobs if/when the client goes
        // offline since we don't have the ID from storage yet. If online flow succeeds this won't be used.
        const localId = uuid();
        const pendingEntry: PendingBlob = {
            blob,
            status: PendingBlobStatus.OnlinePendingUpload,
            handleP: new Deferred(),
            uploadP: this.uploadBlob(localId, blob),
        };
        this.pendingBlobs.set(localId, pendingEntry);

        return pendingEntry.handleP.promise;
    }

    private async uploadBlob(localId: string, blob: ArrayBufferLike): Promise<ICreateBlobResponse> {
        return PerformanceEvent.timedExecAsync(
            this.logger,
            { eventName: "createBlob" },
            async () => this.getStorage().createBlob(blob),
            { end: true, cancel: this.runtime.connected ? "error" : "generic" },
        ).then(
            (response) => this.onUploadResolve(localId, response),
            async (err) => this.onUploadReject(localId, err),
        );
    }

    private onUploadResolve(localId: string, response: ICreateBlobResponse) {
        const entry = this.pendingBlobs.get(localId);
        assert(entry?.status === PendingBlobStatus.OnlinePendingUpload ||
            entry?.status === PendingBlobStatus.OfflinePendingUpload,
            0x386 /* Must have pending blob entry for uploaded blob */);
        entry.storageId = response.id;
        if (this.runtime.connected) {
            if (entry.status === PendingBlobStatus.OnlinePendingUpload) {
                if (this.storageIds.has(response.id)) {
                    // Storage may dedupe blobs and give us an ID we already know
                    // no need to submit BlobAttach op in this case
                    entry.handleP.resolve(this.getBlobHandle(response.id));
                    this.pendingBlobs.delete(localId);
                } else {
                    // Check for still-pending duplicates too; if an op is already in flight we can wait for that one
                    if (!this.opsInFlight.has(response.id)) {
                        this.sendBlobAttachOp(response.id);
                    }
                    this.opsInFlight.set(response.id, (this.opsInFlight.get(response.id) ?? []).concat(localId));
                    entry.status = PendingBlobStatus.OnlinePendingOp;
                }
            } else if (entry.status === PendingBlobStatus.OfflinePendingUpload) {
                // We already submitted a BlobAttach op for this blob when it was transitioned to offline flow
                entry.status = PendingBlobStatus.OfflinePendingOp;
            }
        } else {
            // connected to storage but not ordering service?
            this.logger.sendTelemetryEvent({ eventName: "BlobUploadSuccessWhileDisconnected" });
            if (entry.status === PendingBlobStatus.OnlinePendingUpload) {
                this.transitionToOffline(localId);
            }
            entry.status = PendingBlobStatus.OfflinePendingOp;
        }
        return response;
    }

    private async onUploadReject(localId: string, error) {
        const entry = this.pendingBlobs.get(localId);
        assert(!!entry, 0x387 /* Must have pending blob entry for blob which failed to upload */);
        if (!this.runtime.connected) {
            if (entry.status === PendingBlobStatus.OnlinePendingUpload) {
                this.transitionToOffline(localId);
            }
            // we are probably not connected to storage but start another upload request in case we are
            entry.uploadP = this.retryThrottler.getDelay().then(async () => this.uploadBlob(localId, entry.blob));
            return entry.uploadP;
        } else {
            entry.handleP.reject(error);
            throw error;
        }
    }

    private transitionToOffline(localId: string) {
        assert(!this.runtime.connected, 0x388 /* Must only transition to offline flow while runtime is disconnected */);
        const entry = this.pendingBlobs.get(localId);
        assert(!!entry, 0x389 /* No pending blob entry */);
        assert([PendingBlobStatus.OnlinePendingUpload, PendingBlobStatus.OnlinePendingOp].includes(entry.status),
            0x38a /* Blob must be in online flow to transition to offline flow */);

        entry.status = entry.status === PendingBlobStatus.OnlinePendingUpload
            ? PendingBlobStatus.OfflinePendingUpload
            : PendingBlobStatus.OfflinePendingOp;

        // Submit a BlobAttach op. It's important we submit this op now before returning the blob handle so the
        // BlobAttach op is sequenced prior to any ops referencing the handle. Otherwise an invalid handle could be
        // added to the document if the ops are not all successfully submitted upon reconnection.
        // storageId may be undefined but since we are not connected we will have a chance to add it when reSubmit()
        // is called
        this.sendBlobAttachOp(entry.storageId, localId);
        entry.handleP.resolve(this.getBlobHandle(localId));
    }

    /**
     * Resubmit a BlobAttach op. Used to add storage IDs to ops that were
     * submitted to runtime while disconnected.
     * @param metadata - op metadata containing storage and/or local IDs
     */
    public reSubmit(metadata: Record<string, unknown> | undefined) {
        assert(!!metadata, 0x38b /* Resubmitted ops must have metadata */);
        const { blobId, localId }: { blobId?: string; localId?: string; } = metadata;
        if (!blobId) {
            assert(!!localId, 0x38c /* Submitted BlobAttach ops must have a blobId or localId */);
            // We submitted this op while offline. The blob should have been uploaded by now.
            const pendingEntry = this.pendingBlobs.get(localId);
            assert(pendingEntry?.status === PendingBlobStatus.OfflinePendingOp &&
                !!pendingEntry?.storageId, 0x38d /* blob must be uploaded before resubmitting BlobAttach op */);
            return this.sendBlobAttachOp(pendingEntry.storageId, localId);
        }
        return this.sendBlobAttachOp(blobId, localId);
    }

    public processBlobAttachOp(message: ISequencedDocumentMessage, local: boolean) {
        assert(message?.metadata?.blobId, 0x12a /* "Missing blob id on metadata" */);
        if (message.metadata.localId !== undefined) {
            this.redirectTable.set(message.metadata.localId, message.metadata.blobId);
        }
        // set identity (id -> id) entry
        this.redirectTable.set(message.metadata.blobId, message.metadata.blobId);

        if (local) {
            if (message.metadata.localId === undefined) {
                // Since there is no local ID, we know this op was submitted while online.
                const waitingBlobs = this.opsInFlight.get(message.metadata.blobId);
                assert(!!waitingBlobs, 0x38e /* local online BlobAttach op with no pending blob */);
                waitingBlobs.forEach((localId) => {
                    const pendingBlobEntry = this.pendingBlobs.get(localId);
                    assert(
                        pendingBlobEntry !== undefined,
                        0x38f, /* local online BlobAttach op with no pending blob entry */
                    );

                    // It's possible we transitioned to offline flow while waiting for this op.
                    if (pendingBlobEntry.status === PendingBlobStatus.OnlinePendingOp) {
                        pendingBlobEntry.handleP.resolve(this.getBlobHandle(message.metadata.blobId));
                        this.pendingBlobs.delete(localId);
                    }
                });
            } else {
                // Each local ID is unique; get the pending blob entry and delete it
                assert(this.pendingBlobs.get(message.metadata.localId)?.status === PendingBlobStatus.OfflinePendingOp,
                    0x1f8 /* "local BlobAttach op with no pending blob" */);
                this.pendingBlobs.delete(message.metadata.localId);
            }
        }
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
            // If we are detached, we don't have storage IDs yet, so set to undefined
            // Otherwise, set identity (id -> id) entries
            snapshot.ids.forEach((entry) => table.set(entry, detached ? undefined : entry));
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

        // For some blobs, the handle returned on creation is based off of the localId. So, these
        // nodes can be referenced by storing the localId handle. When that happens, the corresponding storageId node
        // must also be marked referenced. So, we add a route from the localId node to the storageId node.
        // Note that because of de-duping, there can be multiple localIds that all redirect to the same storageId or
        // a blob may be referenced via its storageId handle.
        for (const [localId, storageId] of this.redirectTable) {
            assert(!!storageId, 0x390 /* Must be attached to get GC data */);
            // Add node for the localId and add a route to the storageId node. The storageId node will have been
            // added above when adding nodes for this.blobIds.
            gcData.gcNodes[this.getBlobGCNodePath(localId)] = [this.getBlobGCNodePath(storageId)];
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

        // Any non-identity entries in the table need to be saved in the summary
        if (this.redirectTable.size > blobIds.length) {
            builder.addBlob(
                BlobManager.redirectTableBlobName,
                // filter out identity entries
                JSON.stringify(Array.from(this.redirectTable.entries())
                    .filter(([localId, storageId]) => localId !== storageId)),
            );
        }

        return builder.getSummaryTree();
    }

    public setRedirectTable(table: Map<string, string>) {
        assert(this.runtime.attachState === AttachState.Detached,
            0x252 /* "redirect table can only be set in detached container" */);
        assert(this.redirectTable.size === table.size,
            0x391 /* Redirect table size must match BlobManager's local ID count */);
        for (const [localId, storageId] of table) {
            assert(this.redirectTable.has(localId), 0x254 /* "unrecognized id in redirect table" */);
            this.redirectTable.set(localId, storageId);
            // set identity (id -> id) entry
            this.redirectTable.set(storageId, storageId);
        }
    }

    public getPendingBlobs(): IPendingBlobs {
        const blobs = {};
        for (const [key, entry] of this.pendingBlobs) {
            blobs[key] = { blob: bufferToString(entry.blob, "base64") };
        }
        return blobs;
    }
}
