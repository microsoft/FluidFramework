/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, IFluidHandleContext } from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { AttachmentTreeEntry, BlobTreeEntry } from "@fluidframework/protocol-base";
import {
    ICreateBlobResponse,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    ITreeEntry,
} from "@fluidframework/protocol-definitions";
import { generateHandleContextPath } from "@fluidframework/runtime-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, bufferToString, Deferred, stringToBuffer } from "@fluidframework/common-utils";
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

// todo: pipe real blob storage through from rehydrateContainer() (see #7721)
class MockDetachedBlobStorage {
    public readonly blobs = new Map<string, ArrayBufferLike>([
        ["0", stringToBuffer("test", "utf8")],
    ]);

    public get size() { return this.blobs.size; }
    public getBlobIds(): string[] { return Array.from(this.blobs.keys()); }

    public async createBlob(content: ArrayBufferLike): Promise<ICreateBlobResponse> {
        // fake deduping of pre-populated test data
        if (bufferToString(content, "utf8") === "test") {
            return { id: "0", url: "" };
        }

        const id = this.size.toString();
        this.blobs.set(id, content);
        return { id, url: "" };
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        const blob = this.blobs.get(blobId);
        assert(!!blob, "no blob");
        return blob;
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
    private readonly pendingBlobIds: Map<string, Deferred<void> | undefined> = new Map();
    // blob IDs assigned while detached; cleared upon attach
    private readonly detachedBlobIds: Set<string> = new Set();
    // map of local blob IDs to IDs used by storage. used to support blob handles given out while detached or offline
    private readonly redirectTable = new Map<string, string>();

    // contains local IDs assigned while offline
    private readonly offlineBlobs = new Set<string>();
    private readonly offlineBlobStorage = new MockDetachedBlobStorage();

    constructor(
        private readonly routeContext: IFluidHandleContext,
        snapshot: IBlobManagerLoadInfo,
        private readonly getStorage: () => IDocumentStorageService,
        private readonly sendBlobAttachOp: (blobId?: string, localId?: string) => void,
        private readonly runtime: IContainerRuntime,
        private readonly logger: ITelemetryLogger,
    ) {
        this.runtime.once("dispose", () => {
            for (const promise of this.pendingBlobIds.values()) {
                promise?.reject(new Error("runtime disposed while blobAttach op in flight"));
            }
        });
        this.load(snapshot);
    }

    private hasBlob(id: string): boolean {
        return this.blobIds.has(id) || this.detachedBlobIds.has(id) ||
            this.offlineBlobs.has(id) || this.redirectTable.has(id);
    }

    private async getBlob(blobId: string): Promise<ArrayBufferLike> {
        if (this.offlineBlobs.has(blobId)) {
            const blob = await this.offlineBlobStorage.readBlob(blobId);
            assert(!!blob, "no blob");
            return blob;
        }
        const storageId = this.redirectTable.get(blobId) ?? blobId;
        assert(this.blobIds.has(storageId) || this.detachedBlobIds.has(storageId), "requesting unknown blobs");
        return this.getStorage().readBlob(storageId);
    }

    public async getBlobHandle(blobId: string): Promise<IFluidHandle<ArrayBufferLike>> {
        assert(this.hasBlob(blobId), 0x11f /* "requesting unknown blobs" */);
        return new BlobHandle(
            `${BlobManager.basePath}/${blobId}`,
            this.routeContext,
            async () => this.getBlob(blobId),
        );
    }

    public async createBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        if (this.runtime.attachState === AttachState.Attaching) {
            // blob upload is not supported in "Attaching" state
            this.logger.sendTelemetryEvent({ eventName: "CreateBlobWhileAttaching" });
            await new Promise<void>((res) => this.runtime.once("attached", res));
        }

        if (this.runtime.connected === false &&
            this.offlineBlobStorage !== undefined &&
            this.runtime.attachState !== AttachState.Detached) {
            const res = await this.offlineBlobStorage.createBlob(blob);
            this.offlineBlobs.add(res.id);

            // since we're offline, this will just go into PendingStateManager's queue
            this.sendBlobAttachOp(undefined, res.id);

            return new BlobHandle(
                `${BlobManager.basePath}/${res.id}`,
                this.routeContext,
                async () => this.getBlob(res.id),
            );
        }

        const response = await this.getStorage().createBlob(blob);
        const handle = new BlobHandle(
            `${BlobManager.basePath}/${response.id}`,
            this.routeContext,
            async () => this.getBlob(response.id),
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
            this.sendBlobAttachOp(response.id);
            await this.pendingBlobIds.get(response.id)?.promise;
        }

        return handle;
    }

    public applyStashedBlobAttachOp(metadata: Record<string, unknown> | undefined) {
        assert(!!metadata?.localId && typeof metadata.localId === "string", "no local ID on stashed blobAttach op");
        this.offlineBlobs.add(metadata.localId);
    }

    public async reuploadBlob(metadata) {
        assert(!!metadata?.localId, "can't reupload blob with no local ID");
        if (this.redirectTable.has(metadata.localId)) {
            return { blobId: this.redirectTable.get(metadata.localId), localId: metadata.localId };
        }
        assert(this.offlineBlobs.has(metadata.localId), "unexpected blob reupload");
        const blob = await this.offlineBlobStorage.readBlob(metadata.localId);
        assert(!!blob, "blob not found in offline blob storage");
        const response = await this.getStorage().createBlob(blob);

        // we will rely on redirect table and not wait for the BlobAttach op to round-trip
        this.pendingBlobIds.set(response.id, undefined);

        return { blobId: response.id, localId: metadata.localId };
    }

    public processBlobAttachOp(message: ISequencedDocumentMessage, local: boolean) {
        assert(message?.metadata?.blobId, 0x12a /* "Missing blob id on metadata" */);
        assert(!local || this.pendingBlobIds.has(message.metadata.blobId),
            0x1f8 /* "local BlobAttach op with no pending blob" */);
        this.pendingBlobIds.get(message.metadata.blobId)?.resolve();
        this.pendingBlobIds.delete(message.metadata.blobId);
        this.blobIds.add(message.metadata.blobId);

        if (message.metadata.localId) {
            this.redirectTable.set(message.metadata.localId, message.metadata.blobId);
            this.offlineBlobs.delete(message.metadata.localId);
            // delete from offline storage here (not currently supported by API)
        }
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
            snapshot.redirectTable.map(([localId, storageId]) => this.redirectTable.set(localId, storageId));
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
        const attachingOrAttached = this.redirectTable.size > 0 || this.runtime.attachState !== AttachState.Detached;
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

    /**
     * Sets the redirect table at attach time
     */
    public setRedirectTable(table: Map<string, string>) {
        assert(this.runtime.attachState === AttachState.Detached,
            0x252 /* "redirect table can only be set in detached container" */);
        assert(this.redirectTable.size === 0, 0x253 /* "redirect table already exists" */);
        for (const [localId, storageId] of table) {
            assert(this.detachedBlobIds.delete(localId), 0x254 /* "unrecognized id in redirect table" */);
            this.blobIds.add(storageId);
            this.redirectTable.set(localId, storageId);
        }
        assert(this.detachedBlobIds.size === 0, 0x255 /* "detached blob id absent in redirect table" */);
    }
}
