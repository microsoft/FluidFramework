/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
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
    ISnapshotTreeEx,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import { GitManager, ISummaryUploadManager, SummaryTreeUploadManager } from "@fluidframework/server-services-client";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { DocumentStorageServiceProxy, PrefetchDocumentStorageService } from "@fluidframework/driver-utils";
import { RetriableGitManager } from "./retriableGitManager";

/**
 * Document access to underlying storage for routerlicious driver.
 */
class DocumentStorageServiceCore implements IDocumentStorageService {
    // The values of this cache is useless. We only need the keys. So we are always putting
    // empty strings as values.
    private readonly blobsShaCache = new Map<string, string>();
    private readonly summaryUploadManager: ISummaryUploadManager;

    public get repositoryUrl(): string {
        return "";
    }

    constructor(
        private readonly id: string,
        private readonly manager: GitManager,
        private readonly logger: ITelemetryLogger,
        public readonly policies: IDocumentStorageServicePolicies = {}) {
        this.summaryUploadManager = new SummaryTreeUploadManager(
            new RetriableGitManager(this.manager, this.logger),
            this.blobsShaCache,
            this.getPreviousFullSnapshot.bind(this),
        );
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
        const tree = buildHierarchy(rawTree, this.blobsShaCache);
        return tree;
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
            async () => this.summaryUploadManager.writeSummaryTree(summary, context.ackHandle ?? ""),
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

export class DocumentStorageService extends DocumentStorageServiceProxy {
    private _logTailSha: string | undefined = undefined;

    public get logTailSha(): string | undefined {
        return this._logTailSha;
    }

    private static loadInternalDocumentStorageService(
        id: string,
        manager: GitManager,
        logger: ITelemetryLogger,
        policies: IDocumentStorageServicePolicies): IDocumentStorageService {
        const storageService = new DocumentStorageServiceCore(id, manager, logger, policies);
        if (policies.caching === LoaderCachingPolicy.Prefetch) {
            return new PrefetchDocumentStorageService(storageService);
        }
        return storageService;
    }

    constructor(
        public readonly id: string,
        public manager: GitManager,
        logger: ITelemetryLogger,
        policies: IDocumentStorageServicePolicies = {}) {
        super(DocumentStorageService.loadInternalDocumentStorageService(id, manager, logger, policies));
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTreeEx | null> {
        const tree = await this.internalStorageService.getSnapshotTree(version) as ISnapshotTreeEx | null;
        if (tree !== null) {
            this._logTailSha = ".logTail" in tree.trees ? tree.trees[".logTail"].blobs.logTail : undefined;
        }
        return tree;
    }
}
