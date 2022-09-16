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
} from "@fluidframework/driver-definitions";
import { buildHierarchy } from "@fluidframework/protocol-base";
import {
    ICreateBlobResponse,
    ISnapshotTreeEx,
    ISummaryHandle,
    ISummaryTree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import {
    GitManager,
    ISummaryUploadManager,
    SummaryTreeUploadManager,
} from "@fluidframework/server-services-client";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { IRouterliciousDriverPolicies } from "./policies";
import { ICache, InMemoryCache } from "./cache";
import { RetriableGitManager } from "./retriableGitManager";
import { ISnapshotTreeVersion } from "./definitions";

const isNode = typeof window === "undefined";

/**
 * Document access to underlying storage for routerlicious driver.
 * Uploads summaries piece-by-piece traversing the tree recursively.
 * Downloads summaries piece-by-piece on-demand, or up-front when prefetch is enabled.
 */
export class ShreddedSummaryDocumentStorageService implements IDocumentStorageService {
    // The values of this cache is useless. We only need the keys. So we are always putting
    // empty strings as values.
    protected readonly blobsShaCache = new Map<string, string>();
    private readonly blobCache: ICache<ArrayBufferLike> | undefined;
    private readonly snapshotTreeCache: ICache<ISnapshotTreeVersion> | undefined;

    public get repositoryUrl(): string {
        return "";
    }

    private async getSummaryUploadManager(): Promise<ISummaryUploadManager> {
        const manager = await this.getStorageManager();
        return new SummaryTreeUploadManager(
            new RetriableGitManager(manager, this.logger),
            this.blobsShaCache,
            this.getPreviousFullSnapshot.bind(this),
        );
    }

    constructor(
        protected readonly id: string,
        protected readonly manager: GitManager,
        protected readonly logger: ITelemetryLogger,
        public readonly policies: IDocumentStorageServicePolicies = {},
        driverPolicies?: IRouterliciousDriverPolicies,
        blobCache?: ICache<ArrayBufferLike>,
        snapshotTreeCache?: ICache<ISnapshotTreeVersion>,
        private readonly getStorageManager: (disableCache?: boolean) => Promise<GitManager> = async () => this.manager,
    ) {
        if (driverPolicies?.enableRestLess === true || isNode) {
            this.blobCache = blobCache ?? new InMemoryCache();
            this.snapshotTreeCache = snapshotTreeCache ?? new InMemoryCache();
        }
    }

    public async getVersions(versionId: string | null, count: number): Promise<IVersion[]> {
        const id = versionId ? versionId : this.id;
        const commits = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "getVersions",
                versionId: id,
                count,
            },
            async () => {
                const manager = await this.getStorageManager();
                return manager.getCommits(id, count);
            },
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

        const cachedSnapshotTree = await this.snapshotTreeCache?.get(requestVersion.treeId);
        if (cachedSnapshotTree) {
            return cachedSnapshotTree.snapshotTree as ISnapshotTreeEx;
        }

        const rawTree = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "getSnapshotTree",
                treeId: requestVersion.treeId,
            },
            async (event) => {
                const manager = await this.getStorageManager();
                const response = await manager.getTree(requestVersion!.treeId);
                event.end({
                    size: response.tree.length,
                });
                return response;
            },
        );
        const tree = buildHierarchy(rawTree, this.blobsShaCache, true);
        await this.snapshotTreeCache?.put(tree.id, { id: requestVersion.id, snapshotTree: tree });
        return tree;
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        const cachedBlob = await this.blobCache?.get(blobId);
        if (cachedBlob) {
            return cachedBlob;
        }

        const value = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "readBlob",
                blobId,
            },
            async (event) => {
                const manager = await this.getStorageManager();
                const response = await manager.getBlob(blobId);
                event.end({
                    size: response.size,
                });
                return response;
            },
        );
        this.blobsShaCache.set(value.sha, "");
        const bufferContent = stringToBuffer(value.content, value.encoding);
        await this.blobCache?.put(value.sha, bufferContent);
        return bufferContent;
    }

    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        const summaryHandle = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "uploadSummaryWithContext",
                proposalHandle: context.proposalHandle,
                ackHandle: context.ackHandle,
                referenceSequenceNumber: context.referenceSequenceNumber,
            },
            async () => {
                const summaryUploadManager = await this.getSummaryUploadManager();
                return summaryUploadManager.writeSummaryTree(summary, context.ackHandle ?? "", "channel");
            },
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
                const manager = await this.getStorageManager();
                const response = await manager.createBlob(
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
