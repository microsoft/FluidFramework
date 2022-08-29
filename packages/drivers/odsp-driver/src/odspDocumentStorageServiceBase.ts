/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IDocumentStorageService, ISummaryContext, LoaderCachingPolicy } from "@fluidframework/driver-definitions";
import * as api from "@fluidframework/protocol-definitions";
import { defaultCacheExpiryTimeoutMs } from "./epochTracker";
import { ISnapshotContents } from "./odspPublicUtils";

/* eslint-disable max-len */

class BlobCache {
    // Save the timeout so we can cancel and reschedule it as needed
    private blobCacheTimeout: ReturnType<typeof setTimeout> | undefined;
    // If the defer flag is set when the timeout fires, we'll reschedule rather than clear immediately
    // This deferral approach is used (rather than clearing/resetting the timer) as current calling patterns trigger
    // too many calls to setTimeout/clearTimeout.
    private deferBlobCacheClear: boolean = false;

    private readonly _blobCache: Map<string, ArrayBuffer> = new Map();

    // Tracks all blob IDs evicted from cache
    private readonly blobsEvicted: Set<string> = new Set();

    // Initial time-out to purge data from cache
    // If this time out is very small, then we purge blobs from cache too soon and that results in a lot of
    // requests to storage, which brings down perf and may trip protection limits causing 429s
    private blobCacheTimeoutDuration = 2 * 60 * 1000;

    // SPO does not keep old snapshots around for long, so we are running chances of not
    // being able to rehydrate data store / DDS in the future if we purge anything (and with blob de-duping,
    // even if blob read by runtime, it could be read again in the future)
    // So for now, purging is disabled.
    private readonly purgeEnabled = false;

    public get value() {
        return this._blobCache;
    }

    public addBlobs(blobs: Map<string, ArrayBuffer>) {
        blobs.forEach((value, blobId) => {
            this._blobCache.set(blobId, value);
        });
        // Reset the timer on cache set
        this.scheduleClearBlobsCache();
    }

    /**
     * Schedule a timer for clearing the blob cache or defer the current one.
     */
    private scheduleClearBlobsCache() {
        if (this.blobCacheTimeout !== undefined) {
            // If we already have an outstanding timer, just signal that we should defer the clear
            this.deferBlobCacheClear = true;
        } else if (this.purgeEnabled) {
            // If we don't have an outstanding timer, set a timer
            // When the timer runs out, we'll decide whether to proceed with the cache clear or reset the timer
            const clearCacheOrDefer = () => {
                this.blobCacheTimeout = undefined;
                if (this.deferBlobCacheClear) {
                    this.deferBlobCacheClear = false;
                    this.scheduleClearBlobsCache();
                } else {
                    // NOTE: Slightly better algorithm here would be to purge either only big blobs,
                    // or sort them by size and purge enough big blobs to leave only 256Kb of small blobs in cache
                    // Purging is optimizing memory footprint. But count controls potential number of storage requests
                    // We want to optimize both - memory footprint and number of future requests to storage.
                    // Note that Container can realize data store or DDS on-demand at any point in time, so we do not
                    // control when blobs will be used.
                    this._blobCache.forEach((_, blobId) => this.blobsEvicted.add(blobId));
                    this._blobCache.clear();
                }
            };
            this.blobCacheTimeout = setTimeout(clearCacheOrDefer, this.blobCacheTimeoutDuration);
            // any future storage reads that get into the cache should be cleared from cache rather quickly -
            // there is not much value in keeping them longer
            this.blobCacheTimeoutDuration = 10 * 1000;
        }
    }

    public getBlob(blobId: string) {
        // Reset the timer on attempted cache read
        this.scheduleClearBlobsCache();
        const blobContent = this._blobCache.get(blobId);
        const evicted = this.blobsEvicted.has(blobId);
        return { blobContent, evicted };
    }

    public setBlob(blobId: string, blob: ArrayBuffer) {
        // This API is called as result of cache miss and reading blob from storage.
        // Runtime never reads same blob twice.
        // The only reason we may get read request for same blob is blob de-duping in summaries.
        // Note that the bigger the size, the less likely blobs are the same, so there is very little benefit of caching big blobs.
        // Images are the only exception - user may insert same image twice. But we currently do not de-dup them - only snapshot
        // blobs are de-duped.
        const size = blob.byteLength;
        if (size < 256 * 1024) {
            // Reset the timer on cache set
            this.scheduleClearBlobsCache();
            return this._blobCache.set(blobId, blob);
        } else {
            // we evicted it here by not caching.
            this.blobsEvicted.add(blobId);
        }
    }
}

export abstract class OdspDocumentStorageServiceBase implements IDocumentStorageService {
    readonly policies = {
        // By default, ODSP tells the container not to prefetch/cache.
        caching: LoaderCachingPolicy.NoCaching,

        // ODSP storage works better if it has less number of blobs / edges
        // Runtime creating many small blobs results in sub-optimal perf.
        // 2K seems like the sweat spot:
        // The smaller the number, less blobs we aggregate. Most storages are very likely to have notion
        // of minimal "cluster" size, so having small blobs is wasteful
        // At the same time increasing the limit ensure that more blobs with user content are aggregated,
        // reducing possibility for de-duping of same blobs (i.e. .attributes rolled into aggregate blob
        // are not reused across data stores, or even within data store, resulting in duplication of content)
        // Note that duplication of content should not have significant impact for bytes over wire as
        // compression of http payload mostly takes care of it, but it does impact storage size and in-memory sizes.
        minBlobSize: 2048,
        maximumCacheDurationMs: defaultCacheExpiryTimeoutMs,
    };

    protected readonly commitCache: Map<string, api.ISnapshotTree> = new Map();

    private readonly attributesBlobHandles: Set<string> = new Set();

    private _ops: api.ISequencedDocumentMessage[] | undefined;

    private _snapshotSequenceNumber: number | undefined;

    protected readonly blobCache = new BlobCache();

    public set ops(ops: api.ISequencedDocumentMessage[] | undefined) {
        assert(this._ops === undefined, 0x0a5 /* "Trying to set ops when they are already set!" */);
        this._ops = ops;
    }

    public get ops(): api.ISequencedDocumentMessage[] | undefined {
        return this._ops;
    }

    public get snapshotSequenceNumber() {
        return this._snapshotSequenceNumber;
    }

    public get repositoryUrl(): string {
        return "";
    }

    public abstract createBlob(file: ArrayBufferLike): Promise<api.ICreateBlobResponse>;

    private async readBlobCore(blobId: string): Promise<ArrayBuffer> {
        const { blobContent, evicted } = this.blobCache.getBlob(blobId);
        return blobContent ?? this.fetchBlobFromStorage(blobId, evicted);
    }

    protected abstract fetchBlobFromStorage(blobId: string, evicted: boolean): Promise<ArrayBuffer>;

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        return this.readBlobCore(blobId);
    }

    public async getSnapshotTree(version?: api.IVersion, scenarioName?: string): Promise<api.ISnapshotTree | null> {
        let id: string;
        if (!version || !version.id) {
            const versions = await this.getVersions(null, 1, scenarioName);
            if (!versions || versions.length === 0) {
                return null;
            }
            id = versions[0].id;
        } else {
            id = version.id;
        }

        const snapshotTree = await this.readTree(id, scenarioName);
        if (!snapshotTree) {
            return null;
        }

        if (snapshotTree.blobs) {
            const attributesBlob = snapshotTree.blobs.attributes;
            if (attributesBlob) {
                this.attributesBlobHandles.add(attributesBlob);
            }
        }

        // When we upload the container snapshot, we upload appTree in ".app" and protocol tree in ".protocol"
        // So when we request the snapshot we get ".app" as tree and not as commit node as in the case just above.
        const appTree = snapshotTree.trees[".app"];
        const protocolTree = snapshotTree.trees[".protocol"];

        return this.combineProtocolAndAppSnapshotTree(appTree, protocolTree);
    }

    public abstract getVersions(blobid: string | null, count: number, scenarioName?: string): Promise<api.IVersion[]>;

    public abstract uploadSummaryWithContext(summary: api.ISummaryTree, context: ISummaryContext): Promise<string>;

    public async downloadSummary(commit: api.ISummaryHandle): Promise<api.ISummaryTree> {
        throw new Error("Not implemented yet");
    }

    protected setRootTree(id: string, tree: api.ISnapshotTree) {
        this.commitCache.set(id, tree);
    }

    protected initBlobsCache(blobs: Map<string, ArrayBuffer>) {
        this.blobCache.addBlobs(blobs);
    }

    private async readTree(id: string, scenarioName?: string): Promise<api.ISnapshotTree | null> {
        let tree = this.commitCache.get(id);
        if (!tree) {
            tree = await this.fetchTreeFromSnapshot(id, scenarioName);
        }

        return tree ?? null;
    }

    protected abstract fetchTreeFromSnapshot(id: string, scenarioName?: string): Promise<api.ISnapshotTree | undefined>;

    private combineProtocolAndAppSnapshotTree(
        hierarchicalAppTree: api.ISnapshotTree,
        hierarchicalProtocolTree: api.ISnapshotTree,
    ) {
        const summarySnapshotTree: api.ISnapshotTree = {
            blobs: {
                ...hierarchicalAppTree.blobs,
            },
            trees: {
                ...hierarchicalAppTree.trees,
                // the app tree could have a .protocol
                // in that case we want to server protocol to override it
                ".protocol": hierarchicalProtocolTree,
            },
        };

        return summarySnapshotTree;
    }

    protected initializeFromSnapshot(odspSnapshotCacheValue: ISnapshotContents): string | undefined {
        this._snapshotSequenceNumber = odspSnapshotCacheValue.sequenceNumber;
        const { snapshotTree, blobs, ops } = odspSnapshotCacheValue;

        // id should be undefined in case of just ops in snapshot.
        let id: string | undefined;
        if (snapshotTree) {
            id = snapshotTree.id;
            assert(id !== undefined, 0x221 /* "Root tree should contain the id" */);
            this.setRootTree(id, snapshotTree);
        }

        if (blobs) {
            this.initBlobsCache(blobs);
        }

        this.ops = ops;
        return id;
    }
}

/* eslint-enable max-len */
