/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import {
    ICreateBlobResponse,
    ISnapshotTree,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
} from "@fluidframework/protocol-definitions";

export interface ISerializedBaseSnapshotBlobs {
    [id: string]: string;
}

/**
 * A storage wrapper that can serialize blobs from a snapshot tree and then use them to rehydrate.
 * Used in offline load/attached dehydration to save snapshot blobs that are still needed but may have been deleted.
 */
export class SerializedSnapshotStorage implements IDocumentStorageService {
    constructor(
        private readonly actualStorage: IDocumentStorageService,
        private readonly blobs: ISerializedBaseSnapshotBlobs,
    ) { }

    public static async serialize(
        snapshot: ISnapshotTree,
        storage: IDocumentStorageService,
    ): Promise<ISerializedBaseSnapshotBlobs> {
        const blobs = {};
        await this.serializeCore(snapshot, blobs, storage);
        return blobs;
    }

    private static async serializeCore(
        tree: ISnapshotTree,
        blobs: ISerializedBaseSnapshotBlobs,
        storage: IDocumentStorageService,
    ) {
        const treePs: Promise<any>[] = [];
        for (const subTree of Object.values(tree.trees)) {
            treePs.push(this.serializeCore(subTree, blobs, storage));
        }
        for (const id of Object.values(tree.blobs)) {
            // ArrayBufferLike will not survive JSON.stringify()
            blobs[id] = bufferToString(await storage.readBlob(id), "utf8");
        }
        return Promise.all(treePs);
    }

    public repositoryUrl: string = this.actualStorage.repositoryUrl;

    /**
     * Reads the object with the given ID, returns content in arrayBufferLike
     */
    public async readBlob(id: string): Promise<ArrayBufferLike> {
        if (this.blobs[id] !== undefined) {
            return stringToBuffer(this.blobs[id], "utf8");
        }
        return this.actualStorage.readBlob(id);
    }

    /**
     * Returns the snapshot tree.
     */
    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        return this.actualStorage.getSnapshotTree(version);
    }

    /**
     * Retrieves all versions of the document starting at the specified versionId - or null if from the head
     */
    public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
        return this.actualStorage.getVersions(versionId, count);
    }

    /**
     * Writes to the object with the given ID
     */
    public async write(root: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        return this.actualStorage.write(root, parents, message, ref);
    }

    /**
     * Creates a blob out of the given buffer
     */
    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        return this.actualStorage.createBlob(file);
    }

    /**
     * Uploads a summary tree to storage using the given context for reference of previous summary handle.
     * The ISummaryHandles in the uploaded tree should have paths to indicate which summary object they are
     * referencing from the previously acked summary.
     * Returns the uploaded summary handle.
     */
    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        return this.actualStorage.uploadSummaryWithContext(summary, context);
    }

    /**
     * Retrieves the commit that matches the packfile handle. If the packfile has already been committed and the
     * server has deleted it this call may result in a broken promise.
     */
    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        return this.actualStorage.downloadSummary(handle);
    }
}
