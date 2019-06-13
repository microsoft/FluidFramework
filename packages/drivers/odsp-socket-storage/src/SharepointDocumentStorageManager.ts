import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import { getQueryString } from "./getQueryString";
import { IGetter } from "./Getter";
import { IDocumentStorageManager, StandardDocumentStorageManager } from "./standardDocumentStorageManager";
import { TokenProvider } from "./token";
import { BackoffFunction, delay, exponentialBackoff, getWithRetryForTokenRefresh } from "./utils";

/**
 * This class has the following functionality
 * 1. If a snapshotUrl is not provided or if latestSha is an empty string, all functions are disabled and an empty list is returned from getVersions
 * 2. A latestSha, trees and blobs can be supplied which will then be used as cache for getVersions, getTree and getBlob
 */
export class SharepointDocumentStorageManager implements IDocumentStorageManager {
    private static readonly errorMessage = "Method not supported because no snapshotUrl was provided";
    private standardDocumentStorageManager: StandardDocumentStorageManager | null;
    private readonly blobCache: Map<string, resources.IBlob> = new Map();
    private readonly treesCache: Map<string, resources.ITree> = new Map();
    private readonly queryString: string;
    private readonly maxRetries = 4;
    private readonly backoffFn: BackoffFunction;
    constructor(
        queryParams: { [key: string]: string },
        private readonly documentId: string,
        private readonly snapshotUrl: string | undefined,
        private readonly latestSha: string | undefined,
        trees: resources.ITree[] | undefined,
        blobs: resources.IBlob[] | undefined,
        private readonly getter: IGetter,
        initialTokenProvider: api.ITokenProvider,
        private readonly getTokenProvider: (refresh: boolean) => Promise<api.ITokenProvider>,
    ) {
        if (snapshotUrl) {
            this.standardDocumentStorageManager = new StandardDocumentStorageManager(
                documentId,
                snapshotUrl,
                initialTokenProvider,
            );
        } else {
            this.standardDocumentStorageManager = null;
        }
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
        if (!this.standardDocumentStorageManager) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }
        return this.standardDocumentStorageManagerCallWithRetry(() =>
            this.standardDocumentStorageManager!.createBlob(file),
        );
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
                return this.getter.get<resources.IBlob>(`${this.snapshotUrl}/blobs/${blobid}${this.queryString}`, blobid, {
                    Authorization: `Bearer ${(tokenProvider as TokenProvider).storageToken}`,
                });
            });
        }

        // TODO remove this
        if (!this.standardDocumentStorageManager) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }

        return this.standardDocumentStorageManagerCallWithRetry(() => this.standardDocumentStorageManager!.getBlob(blobid));
    }

    public getContent(version: api.IVersion, path: string): Promise<resources.IBlob> {
        if (!this.standardDocumentStorageManager) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }
        return this.standardDocumentStorageManagerCallWithRetry(() =>
            this.standardDocumentStorageManager!.getContent(version, path),
        );
    }

    public getRawUrl(blobid: string): string {
        if (!this.standardDocumentStorageManager) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }
        return this.standardDocumentStorageManager!.getRawUrl(blobid);
    }

    public async getTree(version?: api.IVersion): Promise<resources.ITree | null> {
        if (!this.snapshotUrl) {
            return (null as any) as resources.ITree;
        }

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
                    this.getter
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
        if (!this.standardDocumentStorageManager) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }

        return this.standardDocumentStorageManagerCallWithRetry(() =>
            this.standardDocumentStorageManager!.getTree(version),
        );
    }

    public async getVersions(commitId: string | null, count: number): Promise<api.IVersion[]> {
        if (!commitId || !this.snapshotUrl || this.latestSha === "") {
            return [];
        }
        const treeSha = commitId === this.documentId && this.latestSha ? this.latestSha : commitId;
        const cachedTree = this.treesCache.get(treeSha);
        if (cachedTree && count === 1) {
            return [{ id: cachedTree.sha, treeId: undefined! }];
        }
        if (!this.standardDocumentStorageManager) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }
        return this.standardDocumentStorageManagerCallWithRetry(() =>
            this.standardDocumentStorageManager!.getVersions(commitId, count),
        );
    }

    public write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        if (!this.standardDocumentStorageManager) {
            throw new Error(SharepointDocumentStorageManager.errorMessage);
        }
        return this.standardDocumentStorageManagerCallWithRetry(() =>
            this.standardDocumentStorageManager!.write(tree, parents, message),
        );
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
     * Allows retries for calls that go through the standardDocumentStorageManager
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
                this.standardDocumentStorageManager = new StandardDocumentStorageManager(
                    this.documentId,
                    this.snapshotUrl!,
                    tokenProvider,
                );
            }

            return delay(this.backoffFn(retryCount)).then(() =>
                this.standardDocumentStorageManagerCallWithRetry(fn, retryCount + 1),
            );
        });
    }
}
