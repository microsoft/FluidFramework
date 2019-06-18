/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { RestWrapper } from "@prague/services-client";
import { IDocumentStorageGetVersionsResponse } from "./contracts";
import { TokenProvider } from "./token";

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
    getTree(version?: api.IVersion): Promise<resources.ITree | null>;

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
}

export class StandardDocumentStorageManager implements IDocumentStorageManager {
    private readonly restWrapper: RestWrapper;

    constructor(
        private readonly documentId: string,
        private readonly snapshotUrl: string,
        tokenProvider: api.ITokenProvider) {
        const standardTokenProvider = tokenProvider as TokenProvider;

        this.restWrapper = new RestWrapper(
            snapshotUrl,
            standardTokenProvider.getStorageHeaders(),
            standardTokenProvider.getStorageQueryParams());
    }

    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        // TODO: Implement, Issue #2269 [https://github.com/microsoft/Prague/issues/2269]
        return Promise.reject(new Error("StandardDocumentStorageManager.createBlob() not implemented"));
    }

    public async getTree(version?: api.IVersion): Promise<resources.ITree | null> {
        // header-id is the id (or version) of the snapshot. To retrieve the latest version of the snapshot header, use the keyword "latest" as the header-id.
        const id = (version && version.id) ? version.id : "latest";

        try {
            return await this.restWrapper.get<resources.ITree>(`/trees/${id}`);
        } catch (error) {
            return error === 400 || error === 404 ? null : Promise.reject(error);
        }
    }

    public async getBlob(blobid: string): Promise<resources.IBlob> {
        return this.restWrapper.get<resources.IBlob>(`/blobs/${blobid}`);
    }

    // tslint:disable: no-non-null-assertion
    public async getVersions(blobid: string, count: number): Promise<api.IVersion[]> {
        if (blobid && blobid !== this.documentId) {
            // each commit calls getVersions but odsp doesn't have a history for each version
            // return the blobid as is

            return [
                {
                    id: blobid,
                    treeId: undefined!,
                },
            ];
        }

        // fetch the latest snapshot versions for the document
        const versionsResponse = await this.restWrapper
            .get<IDocumentStorageGetVersionsResponse>("/versions", { count })
            .catch<IDocumentStorageGetVersionsResponse>((error) => (error === 400 || error === 404) ? error : Promise.reject(error));
        if (versionsResponse && Array.isArray(versionsResponse.value)) {
            return versionsResponse.value.map((version) => {
                return {
                    id: version.sha,
                    treeId: undefined!,
                };
            });
        }

        return [];
    }

    public async getContent(version: api.IVersion, path: string): Promise<resources.IBlob> {
        return this.restWrapper.get<resources.IBlob>("/contents", { ref: version.id, path });
    }

    public async write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        // TODO: Implement, Issue #2269 [https://github.com/microsoft/Prague/issues/2269]
        return Promise.reject("Not implemented");
    }

    public getRawUrl(blobid: string): string {
        return `${this.snapshotUrl}/blobs/${blobid}`;
    }
}
