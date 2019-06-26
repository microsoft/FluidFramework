/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { RestWrapper } from "@prague/services-client";
import { IDocumentStorageGetVersionsResponse } from "./contracts";
import { getQueryString } from "./getQueryString";
import { IGetter } from "./Getter";
import { TokenProvider } from "./token";
import { BackoffFunction, delay, exponentialBackoff, getWithRetryForTokenRefresh } from "./utils";

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

/**
 * This class has the following functionality
 * 1. If a snapshotUrl is not provided or if latestSha is an empty string, all functions are disabled and an empty list is returned from getVersions
 * 2. A latestSha, trees and blobs can be supplied which will then be used as cache for getVersions, getTree and getBlob
 */
export class SharepointDocumentStorageManager implements IDocumentStorageManager {
    private static readonly errorMessage = "Method not supported because no snapshotUrl was provided";
    private readonly blobCache: Map<string, resources.IBlob> = new Map();
    private readonly treesCache: Map<string, resources.ITree> = new Map();
    private readonly queryString: string;
    private readonly maxRetries = 4;
    private readonly backoffFn: BackoffFunction;
    private restWrapper: RestWrapper;

    constructor(
        queryParams: { [key: string]: string },
        private readonly documentId: string,
        private readonly snapshotUrl: string | undefined,
        private readonly latestSha: string | undefined,
        trees: resources.ITree[] | undefined,
        blobs: resources.IBlob[] | undefined,
        private readonly getter: IGetter | undefined,
        initialTokenProvider: api.ITokenProvider,
        private readonly getTokenProvider: (refresh: boolean) => Promise<api.ITokenProvider>,
    ) {
        const standardTokenProvider = initialTokenProvider as TokenProvider;
        this.restWrapper = new RestWrapper(
            snapshotUrl,
            standardTokenProvider.getStorageHeaders(),
            standardTokenProvider.getStorageQueryParams());
        if (trees) {
            this.initTreesCache(trees);
        }
        if (blobs) {
            this.initBlobsCache(blobs);
        }
        this.queryString = getQueryString(queryParams);
        this.backoffFn = exponentialBackoff(500);
    }

    public createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        if (!this.snapshotUrl) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }
        return this.standardDocumentStorageManagerCallWithRetry(() => {
            // TODO: Implement, Issue #2269 [https://github.com/microsoft/Prague/issues/2269]
            return Promise.reject(new Error("StandardDocumentStorageManager.createBlob() not implemented"));
        });
    }

    public async getBlob(blobid: string): Promise<resources.IBlob> {
        const blob = this.blobCache.get(blobid);
        if (blob) {
            return blob;
        }

        if (this.getter) {
            return getWithRetryForTokenRefresh(async (refresh: boolean) => {
                // TODO use querystring not header for token
                const tokenProvider = await this.getTokenProvider(refresh);
                return this.getter!.get<resources.IBlob>(`${this.snapshotUrl}/blobs/${blobid}${this.queryString}`, blobid, {
                    Authorization: `Bearer ${(tokenProvider as TokenProvider).storageToken}`,
                });
            });
        }

        // TODO remove this
        if (!this.snapshotUrl) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }

        return this.standardDocumentStorageManagerCallWithRetry(() => {
            return this.restWrapper.get<resources.IBlob>(`/blobs/${blobid}`);
        });
    }

    public getContent(version: api.IVersion, path: string): Promise<resources.IBlob> {
        if (!this.snapshotUrl) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }
        return this.standardDocumentStorageManagerCallWithRetry(() => {
            return this.restWrapper.get<resources.IBlob>("/contents", { ref: version.id, path });
        });
    }

    public getRawUrl(blobid: string): string {
        if (!this.snapshotUrl) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }
        return `${this.snapshotUrl}/blobs/${blobid}`;
    }

    public async getTree(version?: api.IVersion): Promise<resources.ITree | null> {
        if (!this.snapshotUrl || version === null) {
            return (null as any) as resources.ITree;
        }

        // header-id is the id (or version) of the snapshot. To retrieve the latest version of the snapshot header, use the keyword "latest" as the header-id.
        let id = version && version.id ? version.id : "latest";

        if (id === "latest" && this.latestSha) {
            id = this.latestSha;
        }
        const cachedTree = this.treesCache.get(id);
        if (cachedTree) {
            return cachedTree;
        }

        if (this.getter && id) {
            return getWithRetryForTokenRefresh(async (refresh: boolean) =>
                this.getTokenProvider(refresh).then((tokenProvider) =>
                    this.getter!
                        // TODO use querystring not header for token
                        .get<resources.ITree>(`${this.snapshotUrl}/trees/${id}${this.queryString}`, id, {
                            Authorization: `Bearer ${(tokenProvider as TokenProvider).storageToken}`,
                        })
                        .then((response) => {
                            // FIX SPO
                            return response && response.tree !== undefined && response.tree !== null
                                ? response
                                : ((undefined as any) as resources.ITree);
                        }),
                ),
            );
        }

        // TODO remove this
        if (!this.snapshotUrl) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }

        return this.standardDocumentStorageManagerCallWithRetry(async () => {
            try {
                return await this.restWrapper.get<resources.ITree>(`/trees/${id}`);
            } catch (error) {
                return error === 400 || error === 404 ? null : Promise.reject(error);
            }
        });
    }

    public async getVersions(blobid: string | null, count: number): Promise<api.IVersion[]> {
        if (!blobid || !this.snapshotUrl || this.latestSha === "") {
            return [];
        }
        const treeSha = blobid === this.documentId && this.latestSha ? this.latestSha : blobid;
        const cachedTree = this.treesCache.get(treeSha);
        if (cachedTree && count === 1) {
            return [{ id: cachedTree.sha, treeId: undefined! }];
        }
        if (!this.snapshotUrl) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }
        return this.standardDocumentStorageManagerCallWithRetry(async () => {
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
        });
    }

    public write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        if (!this.snapshotUrl) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }
        return this.standardDocumentStorageManagerCallWithRetry(() => {
            // TODO: Implement, Issue #2269 [https://github.com/microsoft/Prague/issues/2269]
            return Promise.reject("Not implemented");
        });
    }

    private initTreesCache(trees: resources.ITree[]) {
        trees.forEach((tree) => {
            // A WHOLE BUNCH OF FIXING SPO
            if (!tree.sha) {
                throw new Error("Tree must have a sha");
            }
            if (!tree.tree) {
                tree.tree = (tree as any).entries;
            }

            this.treesCache.set(tree.sha, tree);
        });
    }

    private initBlobsCache(blobs: resources.IBlob[]) {
        blobs.forEach((blob) => this.blobCache.set(blob.sha, blob));
    }

    /**
     * Allows retries for calls that go through the DocumentStorageManager
     * TODO remove this code
     */
    private standardDocumentStorageManagerCallWithRetry<T>(fn: () => Promise<T>, retryCount = 0): Promise<T> {
        return fn().catch(async (error) => {
            if (retryCount > this.maxRetries) {
                // To keep behavior the same we will just pass rejections back up
                // tslint:disable-next-line: no-floating-promises
                Promise.reject(error);
            }

            if (error === 401 || error === 403) {
                const tokenProvider = await this.getTokenProvider(true);
                const standardTokenProvider = tokenProvider as TokenProvider;
                this.restWrapper = new RestWrapper(
                    this.snapshotUrl,
                    standardTokenProvider.getStorageHeaders(),
                    standardTokenProvider.getStorageQueryParams(),
                );
            }

            return delay(this.backoffFn(retryCount)).then(() =>
                this.standardDocumentStorageManagerCallWithRetry(fn, retryCount + 1),
            );
        });
    }
}
