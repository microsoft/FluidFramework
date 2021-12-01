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
    ISnapshotTree,
    ISnapshotTreeEx,
    ISummaryHandle,
    ISummaryTree,
    ITree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import {
    GitManager,
    ISummaryUploadManager,
    SummaryTreeUploadManager,
} from "@fluidframework/server-services-client";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { IRouterliciousDriverPolicies, RouterliciousDriverPerformanceEventName } from "./policies";
import { ICache, InMemoryCache } from "./cache";
import { RetriableGitManager } from "./retriableGitManager";
import { AggregatePerformanceEvent } from "./telemetry";

// eslint-disable-next-line no-new-func,@typescript-eslint/no-implied-eval
const isNode = (new Function("try {return this===global;}catch(e){ return false;}"))();

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
    private readonly snapshotTreeCache: ICache<ISnapshotTreeEx> | undefined;
    private readonly summaryUploadManager: ISummaryUploadManager;

    // Aggregate events for reducing telemetry noise
    private readonly getVersionsAggregateEvent: AggregatePerformanceEvent | undefined;
    private readonly getSnapshotTreeAggregateEvent: AggregatePerformanceEvent | undefined;
    private readonly readBlobAggregateEvent: AggregatePerformanceEvent | undefined;

    private _disposed: boolean = false;

    public get repositoryUrl(): string {
        return "";
    }

    public get disposed() {
        return this._disposed;
    }

    constructor(
        protected readonly id: string,
        protected readonly manager: GitManager,
        protected readonly logger: ITelemetryLogger,
        public readonly policies: IDocumentStorageServicePolicies = {},
        driverPolicies?: IRouterliciousDriverPolicies,
        blobCache?: ICache<ArrayBufferLike>,
        snapshotTreeCache?: ICache<ISnapshotTree>,
        aggregatePerformanceEvents?:
            Partial<Record<RouterliciousDriverPerformanceEventName, AggregatePerformanceEvent>>) {
        this.summaryUploadManager = new SummaryTreeUploadManager(
                new RetriableGitManager(manager, logger),
                this.blobsShaCache,
                this.getPreviousFullSnapshot.bind(this),
            );
        if (driverPolicies?.enableRestLess === true || isNode) {
            this.blobCache = blobCache ?? new InMemoryCache();
            this.snapshotTreeCache = (snapshotTreeCache ?? new InMemoryCache()) as ICache<ISnapshotTreeEx>;
        }

        this.getVersionsAggregateEvent =
            aggregatePerformanceEvents?.[RouterliciousDriverPerformanceEventName.getVersions];
        this.getSnapshotTreeAggregateEvent =
            aggregatePerformanceEvents?.[RouterliciousDriverPerformanceEventName.getSnapshotTree];
        this.readBlobAggregateEvent =
            aggregatePerformanceEvents?.[RouterliciousDriverPerformanceEventName.readBlob];
    }

    public dispose() {
        this.getVersionsAggregateEvent?.flush(this.logger);
        this.getSnapshotTreeAggregateEvent?.flush(this.logger);
        this.readBlobAggregateEvent?.flush(this.logger);
        this._disposed = true;
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        const id = versionId ? versionId : this.id;
        const commits = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: RouterliciousDriverPerformanceEventName.getVersions,
                versionId: id,
                count,
            },
            async (event) =>  {
                const response = await this.manager.getCommits(id, count);
                this.getVersionsAggregateEvent?.push(this.logger, { duration: event.duration });
                return response;
            },
            {
                end: this.getVersionsAggregateEvent === undefined || undefined,
                cancel: "generic",
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
            return cachedSnapshotTree;
        }

        const rawTree = await PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: RouterliciousDriverPerformanceEventName.getSnapshotTree,
                treeId: requestVersion.treeId,
            },
            async (event) => {
                const response = await this.manager.getTree(requestVersion!.treeId);
                const extraProps = { size: response.tree.length };
                this.getSnapshotTreeAggregateEvent?.push(this.logger, { ...extraProps, duration: event.duration });
                event.end({
                    ...extraProps,
                });
                return response;
            },
            {
                end: this.getSnapshotTreeAggregateEvent === undefined || undefined,
                cancel: "generic",
            },
        );
        const tree = buildHierarchy(rawTree, this.blobsShaCache, true);
        await this.snapshotTreeCache?.put(tree.id, tree);
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
                eventName: RouterliciousDriverPerformanceEventName.readBlob,
                blobId,
            },
            async (event) => {
                const response = await this.manager.getBlob(blobId);
                const extraProps = { size: response.size };
                this.readBlobAggregateEvent?.push(this.logger, { ...extraProps, duration: event.duration });
                event.end({
                    ...extraProps,
                });
                return response;
            },
            {
                end: this.readBlobAggregateEvent === undefined || undefined,
                cancel: "generic",
            },
        );
        this.blobsShaCache.set(value.sha, "");
        const bufferContent = stringToBuffer(value.content, value.encoding);
        await this.blobCache?.put(value.sha, bufferContent);
        return bufferContent;
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
