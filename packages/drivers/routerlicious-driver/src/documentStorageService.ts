/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    assert,
    stringToBuffer,
    Uint8ArrayToString,
} from "@fluidframework/common-utils";
import {
    IDocumentStorageService,
    ISummaryContext,
    IDocumentStorageServicePolicies,
    LoaderCachingPolicy,
 } from "@fluidframework/driver-definitions";
import { buildHierarchy } from "@fluidframework/protocol-base";
import {
    ICreateBlobResponse,
    ISnapshotTree,
    ISnapshotTreeEx,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import {
    convertWholeFlatSummaryToSnapshotTreeAndBlobs,
    GitManager,
    ISummaryUploadManager,
    SummaryTreeUploadManager,
    WholeSummaryUploadManager,
} from "@fluidframework/server-services-client";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { DocumentStorageServiceProxy, PrefetchDocumentStorageService } from "@fluidframework/driver-utils";
import { RetriableGitManager } from "./retriableGitManager";
import { IRouterliciousDriverPolicies } from "./policies";
import { ICache, InMemoryCache } from "./cache";

/**
 * Document access to underlying storage for routerlicious driver.
 * Uploads summaries piece-by-piece traversing the tree recursively.
 * Downloads summaries
 */
class ShreddedSummaryDocumentStorageService implements IDocumentStorageService {
    // The values of this cache is useless. We only need the keys. So we are always putting
    // empty strings as values.
    protected readonly blobsShaCache = new Map<string, string>();
    private readonly summaryUploadManager: ISummaryUploadManager;

    public get repositoryUrl(): string {
        return "";
    }

    constructor(
        protected readonly id: string,
        protected readonly manager: GitManager,
        protected readonly logger: ITelemetryLogger,
        public readonly policies: IDocumentStorageServicePolicies = {}) {
        this.summaryUploadManager = new SummaryTreeUploadManager(
                new RetriableGitManager(manager, logger),
                this.blobsShaCache,
                this.getPreviousFullSnapshot.bind(this),
            );
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        const id = versionId ? versionId : this.id;
        const commits = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "getVersions",
                versionId: id,
                count,
            },
            async () =>  this.manager.getCommits(id, count),
        );
        return commits.map((commit) => ({
            date: commit.commit.author.date,
            id: commit.sha,
            treeId: commit.commit.tree.sha,
        }));
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTreeEx | null> {
        let requestVersion = version;
        if (!requestVersion) {
            const versions = await this.getVersions(this.id, 1);
            if (versions.length === 0) {
                return null;
            }

            requestVersion = versions[0];
        }

        const rawTree = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "getSnapshotTree",
                treeId: requestVersion.treeId,
            },
            async (event) => {
                const response = await this.manager.getTree(requestVersion!.treeId);
                event.end({
                    size: response.tree.length,
                });
                return response;
            },
        );
        const tree = buildHierarchy(rawTree, this.blobsShaCache, true);
        return tree;
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        const value = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "readBlob",
                blobId,
            },
            async (event) => {
                const response = await this.manager.getBlob(blobId);
                event.end({
                    size: response.size,
                });
                return response;
            },
        );
        this.blobsShaCache.set(value.sha, "");
        return stringToBuffer(value.content, value.encoding);
    }

    public async write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        const branch = ref ? `datastores/${this.id}/${ref}` : this.id;
        const commit = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "write",
                id: branch,
            },
            async () => this.manager.write(branch, tree, parents, message),
        );
        return { date: commit.committer.date, id: commit.sha, treeId: commit.tree.sha };
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        const summaryHandle = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "uploadSummaryWithContext",
            },
            async () => this.summaryUploadManager.writeSummaryTree(summary, context.ackHandle ?? "", "channel"),
        );
        return summaryHandle;
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        throw new Error("NOT IMPLEMENTED!");
    }

    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        const uint8ArrayFile = new Uint8Array(file);
        return PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "createBlob",
                size: uint8ArrayFile.length,
            },
            async (event) => {
                const response = await this.manager.createBlob(
                    Uint8ArrayToString(
                        uint8ArrayFile, "base64"),
                    "base64").then((r) => ({ id: r.sha, url: r.url }));
                event.end({
                    blobId: response.id,
                });
                return response;
            },
        );
    }

    private async getPreviousFullSnapshot(parentHandle: string): Promise<ISnapshotTreeEx | null | undefined> {
        return parentHandle
            ? this.getVersions(parentHandle, 1)
                .then(async (versions) => {
                    // Clear the cache as the getSnapshotTree call will fill the cache.
                    this.blobsShaCache.clear();
                    return this.getSnapshotTree(versions[0]);
                })
            : undefined;
    }
}

const latestSnapshotId: string = "latest";

class WholeSummaryDocumentStorageService implements IDocumentStorageService {
    private readonly summaryUploadManager: ISummaryUploadManager;
    private firstVersionsCall: boolean = true;

    public get repositoryUrl(): string {
        return "";
    }

    constructor(
        protected readonly id: string,
        protected readonly manager: GitManager,
        protected readonly logger: ITelemetryLogger,
        public readonly policies: IDocumentStorageServicePolicies = {},
        private readonly blobCache: ICache<ArrayBufferLike> = new InMemoryCache(),
        private readonly snapshotTreeCache: ICache<ISnapshotTree> = new InMemoryCache()) {
        this.summaryUploadManager = new WholeSummaryUploadManager(manager);
    }

    public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
        if (versionId !== this.id && versionId !== null) {
            // Blobs in this scenario will never have multiple versions, so return blobId as is
            return [{
                id: versionId,
                treeId: undefined!,
            }];
        }
        // If this is the first versions call for the document, we know we will want the latest summary.
        // Fetch latest summary, cache it, and return its id.
        if (this.firstVersionsCall && count === 1) {
            this.firstVersionsCall = false;
            return [{
                id: (await this.fetchAndCacheSnapshotTree(latestSnapshotId)).id,
                treeId: undefined!,
            }];
        }

        // Otherwise, get the latest version of the document as normal.
        const id = versionId ? versionId : this.id;
        const commits = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "getVersions",
                versionId: id,
                count,
            },
            async () =>  this.manager.getCommits(id, count),
        );
        return commits.map((commit) => ({
            date: commit.commit.author.date,
            id: commit.sha,
            treeId: undefined!,
        }));
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        let requestVersion = version;
        if (!requestVersion) {
            const versions = await this.getVersions(this.id, 1);
            if (versions.length === 0) {
                return null;
            }

            requestVersion = versions[0];
        }

        return (await this.fetchAndCacheSnapshotTree(requestVersion.id)).snapshotTree;
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        const cachedBlob = await this.blobCache.get(blobId);
        if (cachedBlob !== undefined) {
            return cachedBlob;
        }

        const blob = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "readBlob",
                blobId,
            },
            async (event) => {
                const response = await this.manager.getBlob(blobId);
                event.end({
                    size: response.size,
                });
                return response;
            },
        );
        const bufferValue = stringToBuffer(blob.content, blob.encoding);

        await this.blobCache.put(blob.sha, bufferValue);

        return bufferValue;
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        const summaryHandle = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "uploadSummaryWithContext",
            },
            async () => this.summaryUploadManager.writeSummaryTree(summary, context.ackHandle ?? "", "channel"),
        );
        return summaryHandle;
    }

    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        throw new Error("NOT IMPLEMENTED!");
    }

    public async write(tree: ITree, parents: string[], message: string, ref: string): Promise<IVersion> {
        throw new Error("NOT IMPLEMENTED!");
    }

    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        const uint8ArrayFile = new Uint8Array(file);
        return PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "createBlob",
                size: uint8ArrayFile.length,
            },
            async (event) => {
                const response = await this.manager.createBlob(
                    Uint8ArrayToString(
                        uint8ArrayFile, "base64"),
                    "base64").then((r) => ({ id: r.sha, url: r.url }));
                event.end({
                    blobId: response.id,
                });
                return response;
            },
        );
    }

    private async fetchAndCacheSnapshotTree(versionId: string): Promise<{ id: string, snapshotTree: ISnapshotTree }> {
        const cachedSnapshotTree = await this.snapshotTreeCache.get(versionId);
        if (cachedSnapshotTree !== undefined) {
            return { id: versionId, snapshotTree: cachedSnapshotTree };
        }

        const wholeFlatSummary = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "getWholeFlatSummary",
                treeId: versionId,
            },
            async (event) => {
                const response = await this.manager.getSummary(versionId);
                event.end({
                    size: response.trees[0]?.entries.length,
                });
                return response;
            },
        );
        const normalizedWholeSummary = convertWholeFlatSummaryToSnapshotTreeAndBlobs(wholeFlatSummary);
        const snapshotId = normalizedWholeSummary.snapshotTree.id;
        assert(snapshotId !== undefined, "Root tree should contain the id");

        const cachePs: Promise<any>[] = [
            this.snapshotTreeCache.put(
                snapshotId,
                normalizedWholeSummary.snapshotTree,
            ),
            this.initBlobCache(normalizedWholeSummary.blobs),
        ];
        if (snapshotId !== versionId) {
            // versionId could be "latest". When summarizer checks cache for "latest", we want it to be available.
            // TODO: For in-memory cache, <latest,snapshotTree> will be a shared pointer with <snapshotId,snapshotTree>,
            // However, for something like Redis, this will cache the same value twice. Alternatively, could we simply
            // cache with versionId?
            cachePs.push(this.snapshotTreeCache.put(
                versionId,
                normalizedWholeSummary.snapshotTree,
            ));
        }

        await Promise.all([
            this.snapshotTreeCache.put(
                snapshotId,
                normalizedWholeSummary.snapshotTree,
            ),
            this.initBlobCache(normalizedWholeSummary.blobs),
        ]);

        return { id: snapshotId, snapshotTree: normalizedWholeSummary.snapshotTree};
    }

    private async initBlobCache(blobs: Map<string, ArrayBuffer>): Promise<void> {
        const blobCachePutPs: Promise<void>[] = [];
        blobs.forEach((value, id) => {
            blobCachePutPs.push(this.blobCache.put(id, value));
        });
        await Promise.all(blobCachePutPs);
    }
}

export class DocumentStorageService extends DocumentStorageServiceProxy {
    private _logTailSha: string | undefined = undefined;

    public get logTailSha(): string | undefined {
        return this._logTailSha;
    }

    private static loadInternalDocumentStorageService(
        id: string,
        manager: GitManager,
        logger: ITelemetryLogger,
        policies: IDocumentStorageServicePolicies,
        driverPolicies?: IRouterliciousDriverPolicies,
        blobCache?: ICache<ArrayBufferLike>,
        snapshotTreeCache?: ICache<ISnapshotTree>): IDocumentStorageService {
        const storageService = driverPolicies?.enableWholeSummaryUpload ?
            new WholeSummaryDocumentStorageService(id, manager, logger, policies, blobCache, snapshotTreeCache) :
            new ShreddedSummaryDocumentStorageService(id, manager, logger, policies);
        // TODO: worth prefetching latest summary making version + snapshot call with WholeSummary storage?
        if (!driverPolicies?.enableWholeSummaryUpload && policies.caching === LoaderCachingPolicy.Prefetch) {
            return new PrefetchDocumentStorageService(storageService);
        }
        return storageService;
    }

    constructor(
        public readonly id: string,
        public manager: GitManager,
        logger: ITelemetryLogger,
        policies: IDocumentStorageServicePolicies = {},
        driverPolicies?: IRouterliciousDriverPolicies,
        blobCache?: ICache<ArrayBufferLike>,
        snapshotTreeCache?: ICache<ISnapshotTree>) {
        super(DocumentStorageService.loadInternalDocumentStorageService(
            id,
            manager,
            logger,
            policies,
            driverPolicies,
            blobCache,
            snapshotTreeCache,
        ));
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        const tree = await this.internalStorageService.getSnapshotTree(version);
        if (tree !== null) {
            this._logTailSha = ".logTail" in tree.trees ? tree.trees[".logTail"].blobs.logTail : undefined;
        }
        return tree;
    }
}
