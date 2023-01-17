/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ICreateBlobResponse, ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    createResponseError,
    generateHandleContextPath,
    responseToException,
    SummaryTreeBuilder,
} from "@fluidframework/runtime-utils";
import { assert, bufferToString, Deferred, stringToBuffer, TypedEventEmitter } from "@fluidframework/common-utils";
import { IContainerRuntime, IContainerRuntimeEvents } from "@fluidframework/container-runtime-definitions";
import { AttachState } from "@fluidframework/container-definitions";
import { ChildLogger, loggerToMonitoringContext, MonitoringContext, PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IGarbageCollectionData,
    ISummaryTreeWithStats,
    ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { Throttler, formExponentialFn, IThrottler } from "./throttler";
import { summarizerClientType } from "./summarizerClientElection";
import { throwOnTombstoneUsageKey } from "./garbageCollectionConstants";
import { sendGCTombstoneEvent } from "./garbageCollectionTombstoneUtils";

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
    Pick<IContainerRuntime, "attachState" | "connected" | "logger" | "clientDetails"> & TypedEventEmitter<IContainerRuntimeEvents>;

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

export interface IBlobManagerEvents {
    (event: "noPendingBlobs", listener: () => void);
}

export class BlobManager extends TypedEventEmitter<IBlobManagerEvents> {
    public static readonly basePath = "_blobs";
    private static readonly redirectTableBlobName = ".redirectTable";
    private readonly mc: MonitoringContext;

    /**
     * Map of local IDs to storage IDs. Contains identity entries (id → id) for storage IDs. All requested IDs should
     * be a key in this map. Blobs created while the container is detached are stored in IDetachedBlobStorage which
     * gives local IDs; the storage IDs are filled in at attach time.
     * Note: It contains mappings from all clients, i.e., from remote clients as well. local ID comes from the client
     * that uploaded the blob but its mapping to storage ID is needed in all clients in order to retrieve the blob.
     */
    private readonly redirectTable: Map<string, string | undefined>;

    /**
     * Blobs which have not been uploaded or for which we have not yet seen a BlobAttach op round-trip.
     * Until we see the op round-trip, there is a possibility we may need to re-upload the blob, so
     * we must save it. This is true for both the online and offline flow.
     */
    private readonly pendingBlobs: Map<string, PendingBlob> = new Map();

    /**
     * Track ops in flight for online flow. This is used for optimizations where if we receive an ack for a storage ID,
     * we can resolve all pending blobs with the same storage ID even though they may have different local IDs. That's
     * because we know that the server will not delete the blob corresponding to that storage ID.
     */
    private readonly opsInFlight: Map<string, string[]> = new Map();

    private readonly retryThrottler = new CancellableThrottler(new Throttler(
        60 * 1000, // 60 sec delay window
        30 * 1000, // 30 sec max delay
        // throttling function increases exponentially (0ms, 40ms, 80ms, 160ms, etc)
        formExponentialFn({ coefficient: 20, initialDelay: 0 }),
    ));

    /** If true, throw an error when a tombstone attachment blob is retrieved. */
    private readonly throwOnTombstoneUsage: boolean;
    /**
     * This stores IDs of tombstoned blobs.
     * Tombstone is a temporary feature that imitates a blob getting swept by garbage collection.
     */
    private readonly tombstonedBlobs: Set<string> = new Set();

    constructor(
        private readonly routeContext: IFluidHandleContext,
        snapshot: IBlobManagerLoadInfo,
        private readonly getStorage: () => IDocumentStorageService,
        /**
         * Submit a BlobAttach op. When a blob is uploaded, there is a short grace period before which the blob is
         * deleted. The BlobAttach op notifies the server that blob is in use. The server will then not delete the
         * the blob as long as it is listed as referenced in future summaries. The summarizing client will know to
         * include the storage ID in the summary when it sees the op.
         *
         * The op will also include a local ID to inform all clients of the relation to the storage ID, without
         * knowledge of which they cannot request the blob from storage. It's important that this op is sequenced
         * before any ops that reference the local ID, otherwise, an invalid handle could be added to the document.
         */
        private readonly sendBlobAttachOp: (localId: string, storageId?: string) => void,
        // To be called when a blob node is requested. blobPath is the path of the blob's node in GC's graph. It's
        // of the format `/<BlobManager.basePath>/<blobId>`.
        private readonly blobRequested: (blobPath: string) => void,
        private readonly addedBlobReference: (fromNodePath: string, toNodePath: string) => void,
        private readonly runtime: IBlobManagerRuntime,
        stashedBlobs: IPendingBlobs = {},
    ) {
        super();
        this.mc = loggerToMonitoringContext(ChildLogger.create(this.runtime.logger, "BlobManager"));
        // Read the feature flag that tells whether to throw when a tombstone blob is requested.
        this.throwOnTombstoneUsage =
            this.mc.config.getBoolean(throwOnTombstoneUsageKey) === true &&
            this.runtime.clientDetails.type !== summarizerClientType;

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

    public get hasPendingBlobs(): boolean {
        return (this.runtime.attachState !== AttachState.Attached && this.redirectTable.size > 0)
        || this.pendingBlobs.size > 0;
    }

    /**
     * Upload blobs added while offline. This must be completed before connecting and resubmitting ops.
     */
    public async onConnected() {
        this.retryThrottler.cancel();
        const pendingUploads = this.pendingOfflineUploads.map(async (e) => e.uploadP);
        await PerformanceEvent.timedExecAsync(this.mc.logger, {
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
        const request = { url: blobId };
        if (this.tombstonedBlobs.has(blobId) ) {
            const error = responseToException(createResponseError(404, "Blob removed by gc", request), request);
            const event = {
                eventName: "GC_Tombstone_Blob_Requested",
                url: request.url,
            };
            sendGCTombstoneEvent(this.mc, event, this.runtime.clientDetails.type === summarizerClientType, [BlobManager.basePath], error);
            if (this.throwOnTombstoneUsage) {
                throw error;
            }
        }

        const pending = this.pendingBlobs.get(blobId);
        if (pending) {
            return pending.blob;
        }
        let storageId: string;
        if (this.runtime.attachState === AttachState.Detached) {
            assert(this.redirectTable.has(blobId), 0x383 /* requesting unknown blobs */);

            // Blobs created while the container is detached are stored in IDetachedBlobStorage.
            // The 'IDocumentStorageService.readBlob()' call below will retrieve these via localId.
            storageId = blobId;
        } else {
            const attachedStorageId = this.redirectTable.get(blobId);
            assert(!!attachedStorageId, 0x11f /* "requesting unknown blobs" */);
            storageId = attachedStorageId;
        }

        // Let runtime know that the corresponding GC node was requested.
        this.blobRequested(this.getBlobGCNodePath(blobId));

        return PerformanceEvent.timedExecAsync(
            this.mc.logger,
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
        this.setRedirection(response.id, undefined);
        return this.getBlobHandle(response.id);
    }

    public async createBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        if (this.runtime.attachState === AttachState.Detached) {
            return this.createBlobDetached(blob);
        }
        if (this.runtime.attachState === AttachState.Attaching) {
            // blob upload is not supported in "Attaching" state
            this.mc.logger.sendTelemetryEvent({ eventName: "CreateBlobWhileAttaching" });
            await new Promise<void>((resolve) => this.runtime.once("attached", resolve));
        }
        assert(this.runtime.attachState === AttachState.Attached,
            0x385 /* For clarity and paranoid defense against adding future attachment states */);

        // Create a local ID for the blob. After uploading it to storage and before returning it, a local ID to
        // storage ID mapping is created.
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
            this.mc.logger,
            { eventName: "createBlob" },
            async () => this.getStorage().createBlob(blob),
            { end: true, cancel: this.runtime.connected ? "error" : "generic" },
        ).then(
            (response) => this.onUploadResolve(localId, response),
            async (err) => this.onUploadReject(localId, err),
        );
    }

    /**
     * Set up a mapping in the redirect table from fromId to toId. Also, notify the runtime that a reference is added
     * which is required for GC.
     */
    private setRedirection(fromId: string, toId: string | undefined) {
        this.redirectTable.set(fromId, toId);
        // Notify runtime of a reference added if toId is not undefined. It can be undefined when a blob is uploaded in
        // detached mode. In this case, the entry will be updated when the blob is updated.
        if (toId !== undefined) {
            this.addedBlobReference(this.getBlobGCNodePath(fromId), this.getBlobGCNodePath(toId));
        }
    }

    private deleteAndEmitsIfEmpty(id: string) {
        if (this.pendingBlobs.has(id)) {
            this.pendingBlobs.delete(id);
            if (!this.hasPendingBlobs) {
                this.emit("noPendingBlobs");
            }
        }
    }

    private onUploadResolve(localId: string, response: ICreateBlobResponse) {
        const entry = this.pendingBlobs.get(localId);
        assert(entry?.status === PendingBlobStatus.OnlinePendingUpload ||
            entry?.status === PendingBlobStatus.OfflinePendingUpload,
            0x386 /* Must have pending blob entry for uploaded blob */);
        entry.storageId = response.id;
        if (this.runtime.connected) {
            if (entry.status === PendingBlobStatus.OnlinePendingUpload) {
                // Send a blob attach op. This serves two purposes:
                // 1. If its a new blob, i.e., it isn't de-duped, the server will keep the blob alive if it sees this op
                //    until its storage ID is added to the next summary.
                // 2. It will create a local ID to storage ID mapping in all clients which is needed to retrieve the
                //    blob from the server via the storage ID.
                this.sendBlobAttachOp(localId, response.id);
                if (this.storageIds.has(response.id)) {
                    // The blob is de-duped. Set up a local ID to storage ID mapping and return the blob. Since this is
                    // an existing blob, we don't have to wait for the op to be ack'd since this step has already
                    // happened before and so, the server won't delete it.
                    this.setRedirection(localId, response.id);
                    entry.handleP.resolve(this.getBlobHandle(localId));
                    this.deleteAndEmitsIfEmpty(localId);
                } else {
                    // If there is already an op for this storage ID, append the local ID to the list. Once any op for
                    // this storage ID is ack'd, all pending blobs for it can be resolved since the op will keep the
                    // blob alive in storage.
                    this.opsInFlight.set(response.id, (this.opsInFlight.get(response.id) ?? []).concat(localId));
                    entry.status = PendingBlobStatus.OnlinePendingOp;
                }
            } else if (entry.status === PendingBlobStatus.OfflinePendingUpload) {
                // We already submitted a BlobAttach op for this blob when it was transitioned to offline flow
                entry.status = PendingBlobStatus.OfflinePendingOp;
            }
        } else {
            // connected to storage but not ordering service?
            this.mc.logger.sendTelemetryEvent({ eventName: "BlobUploadSuccessWhileDisconnected" });
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

        /**
         * If we haven't already submitted a BlobAttach op for this entry, send it before returning the blob handle.
         * This will make sure that the BlobAttach op is sequenced prior to any ops referencing the handle. Otherwise,
         * an invalid handle could be added to the document.
         * storageId may be undefined but since we are not connected we will have a chance to add it when reSubmit()
         * is called on reconnection.
         */
        if (entry.status !== PendingBlobStatus.OnlinePendingOp) {
            this.sendBlobAttachOp(localId, entry.storageId);
        }

        entry.status = entry.status === PendingBlobStatus.OnlinePendingUpload
            ? PendingBlobStatus.OfflinePendingUpload
            : PendingBlobStatus.OfflinePendingOp;

        entry.handleP.resolve(this.getBlobHandle(localId));
    }

    /**
     * Resubmit a BlobAttach op. Used to add storage IDs to ops that were
     * submitted to runtime while disconnected.
     * @param metadata - op metadata containing storage and/or local IDs
     */
    public reSubmit(metadata: Record<string, unknown> | undefined) {
        assert(!!metadata, 0x38b /* Resubmitted ops must have metadata */);
        const { localId, blobId }: { localId?: string; blobId?: string } = metadata;
        assert(localId !== undefined, 0x50d /* local ID not available on reSubmit */);
        if (!blobId) {
            // We submitted this op while offline. The blob should have been uploaded by now.
            const pendingEntry = this.pendingBlobs.get(localId);
            assert(pendingEntry?.status === PendingBlobStatus.OfflinePendingOp &&
                !!pendingEntry?.storageId, 0x38d /* blob must be uploaded before resubmitting BlobAttach op */);
            return this.sendBlobAttachOp(localId, pendingEntry.storageId);
        }
        return this.sendBlobAttachOp(localId, blobId);
    }

    public processBlobAttachOp(message: ISequencedDocumentMessage, local: boolean) {
        const localId = message.metadata?.localId;
        const blobId = message.metadata?.blobId;
        assert(blobId !== undefined, 0x12a /* "Missing blob id on metadata" */);

        // Set up a mapping from local ID to storage ID. This is crucial since without this the blob cannot be
        // requested from the server.
        // Note: The check for undefined is needed for back-compat when localId was not part of the BlobAttach op that
        // was sent when online.
        if (localId !== undefined) {
            this.setRedirection(localId, blobId);
        }
        // set identity (id -> id) entry
        this.setRedirection(blobId, blobId);

        if (local) {
            assert(localId !== undefined, 0x50e /* local ID not present in blob attach message */);
            const waitingBlobs = this.opsInFlight.get(blobId);
            if (waitingBlobs !== undefined) {
                // For each op corresponding to this storage ID that we are waiting for, resolve the pending blob.
                // This is safe because the server will keep the blob alive and the op containing the local ID to
                // storage ID is already in flight and any op containing this local ID will be sequenced after that.
                waitingBlobs.forEach((pendingLocalId) => {
                    const pendingBlobEntry = this.pendingBlobs.get(pendingLocalId);
                    assert(
                        pendingBlobEntry !== undefined,
                        0x38f, /* local online BlobAttach op with no pending blob entry */
                    );

                    // It's possible we transitioned to offline flow while waiting for this op.
                    if (pendingBlobEntry.status === PendingBlobStatus.OnlinePendingOp) {
                        this.setRedirection(pendingLocalId, blobId);
                        pendingBlobEntry.handleP.resolve(this.getBlobHandle(pendingLocalId));
                        this.deleteAndEmitsIfEmpty(pendingLocalId);
                    }
                });
                this.opsInFlight.delete(blobId);
            }
            // For blobs that were transitioned to offline flow while waiting for this op, the entry should be deleted.
            this.deleteAndEmitsIfEmpty(localId);
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
        this.mc.logger.sendTelemetryEvent({
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
        for (const [localId, storageId] of this.redirectTable) {
            assert(!!storageId, 0x390 /* Must be attached to get GC data */);
            gcData.gcNodes[this.getBlobGCNodePath(localId)] = [this.getBlobGCNodePath(storageId)];
        }
        return gcData;
    }

    /**
     * This is called to update blobs whose routes are unused. The unused blobs are deleted.
     * @param unusedRoutes - The routes of the blob nodes that are unused.
     */
    public updateUnusedRoutes(unusedRoutes: string[]): void {
        // The routes or blob node paths are in the same format as returned in getGCData -
        // `/<BlobManager.basePath>/<blobId>`.
        for (const route of unusedRoutes) {
            const pathParts = route.split("/");
            assert(
                pathParts.length === 3 && pathParts[1] === BlobManager.basePath,
                0x2d5 /* "Invalid blob node id in unused routes." */,
            );
            const blobId = pathParts[2];
            this.redirectTable.delete(blobId);
        }
    }

    /**
     * This is called to update blobs whose routes are tombstones. Tombstoned blobs enable testing scenarios with
     * accessing deleted content without actually deleting content from summaries.
     * @param tombstonedRoutes - The routes of blob nodes that are tombstones.
     */
    public updateTombstonedRoutes(tombstonedRoutes: string[]) {
        const tombstonedBlobsSet: Set<string> = new Set();
        // The routes or blob node paths are in the same format as returned in getGCData -
        // `/<BlobManager.basePath>/<blobId>`.
        for (const route of tombstonedRoutes) {
            const pathParts = route.split("/");
            assert(
                pathParts.length === 3 && pathParts[1] === BlobManager.basePath,
                0x50f /* Invalid blob node id in tombstoned routes. */,
            );
            tombstonedBlobsSet.add(pathParts[2]);
        }

        // Remove blobs from the tombstone list that were tombstoned but aren't anymore as per the tombstoneRoutes.
        for (const blobId of this.tombstonedBlobs) {
            if (!tombstonedBlobsSet.has(blobId)) {
                this.tombstonedBlobs.delete(blobId);
            }
        }

        // Mark blobs that are now tombstoned by adding them to the tombstone list.
        for (const blobId of tombstonedBlobsSet) {
            this.tombstonedBlobs.add(blobId);
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
            this.setRedirection(localId, storageId);
            // set identity (id -> id) entry
            this.setRedirection(storageId, storageId);
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
