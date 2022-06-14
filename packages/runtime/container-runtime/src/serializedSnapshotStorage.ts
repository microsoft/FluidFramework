/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import {
    ICreateBlobResponse,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import { ISnapshotTreeWithBlobContents } from "@fluidframework/container-definitions";

/**
 * Serialized blobs from a snapshot. Used to load offline.
 */
export interface ISerializedBaseSnapshotBlobs {
    [id: string]: string;
}

/**
 * A storage wrapper that can serialize blobs from a snapshot tree and then use them to rehydrate.
 * Used in offline load/attached dehydration to save snapshot blobs that are still needed but may have been deleted.
 */
export class SerializedSnapshotStorage implements IDocumentStorageService {
    constructor(
        private readonly storageGetter: () => IDocumentStorageService,
        private readonly blobs: ISerializedBaseSnapshotBlobs,
    ) { }

    public static async serializeTree(
        snapshot: ISnapshotTree,
        storage: IDocumentStorageService,
    ): Promise<ISerializedBaseSnapshotBlobs> {
        const blobs = {};
        await this.serializeTreeCore(snapshot, blobs, storage);
        return blobs;
    }

    private static async serializeTreeCore(
        tree: ISnapshotTree,
        blobs: ISerializedBaseSnapshotBlobs,
        storage: IDocumentStorageService,
    ) {
        const treePs: Promise<any>[] = [];
        for (const subTree of Object.values(tree.trees)) {
            treePs.push(this.serializeTreeCore(subTree, blobs, storage));
        }
        for (const id of Object.values(tree.blobs)) {
            const blob = await storage.readBlob(id);
            // ArrayBufferLike will not survive JSON.stringify()
            blobs[id] = bufferToString(blob, "utf8");
        }
        return Promise.all(treePs);
    }

    public static serializeTreeWithBlobContents(
        snapshot: ISnapshotTreeWithBlobContents,
    ): ISerializedBaseSnapshotBlobs {
        const blobs = {};
        this.serializeTreeWithBlobContentsCore(snapshot, blobs);
        return blobs;
    }

    private static serializeTreeWithBlobContentsCore(
        tree: ISnapshotTreeWithBlobContents,
        blobs: ISerializedBaseSnapshotBlobs,
    ) {
        for (const subTree of Object.values(tree.trees)) {
            this.serializeTreeWithBlobContentsCore(subTree, blobs);
        }
        for (const id of Object.values(tree.blobs)) {
            const blob = tree.blobsContents[id];
            assert(!!blob, 0x2ec /* "Blob must be present in blobsContents" */);
            // ArrayBufferLike will not survive JSON.stringify()
            blobs[id] = bufferToString(blob, "utf8");
        }
    }

    private _storage?: IDocumentStorageService;
    private get storage(): IDocumentStorageService {
        // avoid calling it until we need it since it will be undefined if we're not connected
        // and we shouldn't need it in this case anyway
        if (this._storage) {
            return this._storage;
        }
        this._storage = this.storageGetter();
        return this._storage;
    }

    public get repositoryUrl(): string { return this.storage.repositoryUrl; }

    /**
     * Reads the object with the given ID, returns content in arrayBufferLike
     */
    public async readBlob(id: string): Promise<ArrayBufferLike> {
        if (this.blobs[id] !== undefined) {
            return stringToBuffer(this.blobs[id], "utf8");
        }
        return this.storage.readBlob(id);
    }

    /**
     * Returns the snapshot tree.
     */
    // eslint-disable-next-line @rushstack/no-new-null
    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return this.storage.getSnapshotTree(version);
    }

    /**
     * Retrieves all versions of the document starting at the specified versionId - or null if from the head
     */
    // eslint-disable-next-line @rushstack/no-new-null
    public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
        return this.storage.getVersions(versionId, count);
    }

    /**
     * Creates a blob out of the given buffer
     */
    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        return this.storage.createBlob(file);
    }

    /**
     * Uploads a summary tree to storage using the given context for reference of previous summary handle.
     * The ISummaryHandles in the uploaded tree should have paths to indicate which summary object they are
     * referencing from the previously acked summary.
     * Returns the uploaded summary handle.
     */
    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        return this.storage.uploadSummaryWithContext(summary, context);
    }

    /**
     * Retrieves the commit that matches the packfile handle. If the packfile has already been committed and the
     * server has deleted it this call may result in a broken promise.
     */
    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return this.storage.downloadSummary(handle);
    }
}
