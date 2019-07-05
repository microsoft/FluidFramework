/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";

/**
 * Interface for creating/getting/writing blobs to the underlying storage.
 */
export interface IDocumentStorageManager {
    /**
     * Create blob response containing url from a buffer.
     * @param file - Buffer to create a blob response from.
     * @returns A blob response.
     */
    createBlob(file: Buffer): Promise<api.ICreateBlobResponse>;

    /**
     * Get the blob for a particular blobid from storage.
     * @param blobid - Id for the blob.
     * @returns A blob.
     */
    getBlob(blobid: string): Promise<resources.IBlob>;

    /**
     * Get the content for a particular version id.
     * @param version - Version for which to get the content.
     * @param path - Path of the blob
     * @returns Blobs for the given version id.
     */
    getContent(version: api.IVersion, path: string): Promise<resources.IBlob>;

    /**
     * Get the url for the given blobid.
     * @param blobid - Id of the blob.
     */
    getRawUrl(blobid: string): string;

    /**
     * Get the snapshot tree for a given version id.
     * @param version - Id of the snapshot to be read.
     * @returns ITree for the snapshot.
     */
    getTree(version?: api.IVersion): Promise<api.ISnapshotTree | null>;

    /**
     * Gets a list of versions for the given blobid.
     * @param blobid - Id of the blob.
     * @param count - Number of versions requested.
     */
    getVersions(blobid: string, count: number): Promise<api.IVersion[]>;

    /**
     * Writes the snapshot to the underlying storage.
     * @param tree - Snapshot to write to storage.
     * @param parents - Parents of the given snapshot.
     * @param message - Message to be saved with the snapshot.
     */
    write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion>;

    /**
     * Generates and uploads a packfile that represents the given commit. A driver generated handle to the packfile
     * is returned as a result of this call.
     */
    uploadSummary(commit: api.ISummaryTree): Promise<api.ISummaryHandle>;

    /**
     * Retrieves the commit that matches the packfile handle. If the packfile has already been committed and the
     * server has deleted it this call may result in a broken promise.
     */
    downloadSummary(handle: api.ISummaryHandle): Promise<api.ISummaryTree>;
}

/**
 * Socket storage discovery api response
 */
export interface ISocketStorageDiscovery {
    id: string;
    tenantId: string;

    snapshotStorageUrl: string;
    deltaStorageUrl: string;
    storageToken: string;

    deltaStreamSocketUrl: string;
    socketToken: string;
}

/**
 * Interface for delta storage response.
 * Contains either SequencedDocumentMessages or SequencedDeltaOpMessage.
 */
export interface IDeltaStorageGetResponse {
    value: api.ISequencedDocumentMessage[] | ISequencedDeltaOpMessage[];
}

export interface ISequencedDeltaOpMessage {
    op: api.ISequencedDocumentMessage;
    sequenceNumber: number;
}

export interface IDocumentStorageGetVersionsResponse {
    value: IDocumentStorageVersion[];
}

export interface IDocumentStorageVersion {
    message: string;
    sha: string;
}

export enum SnapshotType {
    Container = "container",
    Channel = "channel",
}

export interface ISnapshotRequest {
    type: SnapshotType;
    message: string;
    sequenceNumber: number;
    entries: ISnapshotTreeEntry[];
    sha: string | null;
}

export interface ISnapshotResponse {
    sha: string;
}

export interface ISnapshotTreeEntry {
    path: string;
    type: string;
    value: SnapshotTreeValue;
    mode: string;
}

export type SnapshotTreeValue = ISnapshotBlob | ISnapshotTree | ISnapshotCommit | ISnapshotHandle;

export interface ISnapshotHandle {
    id: string;
}

export interface ISnapshotTree {
    id?: string;
    sha?: string;
    entries?: ISnapshotTreeEntry[];
}

export interface ISnapshotBlob {
    contents?: string;
    content?: string;
    encoding: string;
}

export interface ISnapshotCommit {
    content: string;
}
