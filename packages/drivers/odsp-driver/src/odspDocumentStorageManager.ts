/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { default as AbortController } from "abort-controller";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    assert,
    stringToBuffer,
    bufferToString,
    delay,
} from "@fluidframework/common-utils";
import {
    PerformanceEvent,
} from "@fluidframework/telemetry-utils";
import * as api from "@fluidframework/protocol-definitions";
import {
    ISummaryContext,
    IDocumentStorageService,
    LoaderCachingPolicy,
} from "@fluidframework/driver-definitions";
import { RateLimiter } from "@fluidframework/driver-utils";
import { throwOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import {
    IOdspResolvedUrl,
    ISnapshotOptions,
    OdspErrorType,
    InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions";
import {
    IDocumentStorageGetVersionsResponse,
    HostStoragePolicyInternal,
    IVersionedValueWithEpoch,
} from "./contracts";
import { downloadSnapshot, fetchSnapshot, fetchSnapshotWithRedeem } from "./fetchSnapshot";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { IOdspCache } from "./odspCache";
import {
    createCacheSnapshotKey,
    getWithRetryForTokenRefresh,
    ISnapshotContents,
} from "./odspUtils";
import { EpochTracker } from "./epochTracker";
import { OdspSummaryUploadManager } from "./odspSummaryUploadManager";
import { FlushResult } from "./odspDocumentDeltaConnection";

/* eslint-disable max-len */

// An implementation of Promise.race that gives you the winner of the promise race
async function promiseRaceWithWinner<T>(promises: Promise<T>[]): Promise<{ index: number, value: T }> {
    return new Promise((resolve, reject) => {
        promises.forEach((p, index) => {
            p.then((v) => resolve({ index, value: v })).catch(reject);
        });
    });
}

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

export class OdspDocumentStorageService implements IDocumentStorageService {
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
    };

    private readonly commitCache: Map<string, api.ISnapshotTree> = new Map();

    private readonly attributesBlobHandles: Set<string> = new Set();

    private readonly odspSummaryUploadManager: OdspSummaryUploadManager;
    private _ops: api.ISequencedDocumentMessage[] | undefined;

    private firstVersionCall = true;
    private _snapshotSequenceNumber: number | undefined;

    private readonly documentId: string;
    private readonly snapshotUrl: string | undefined;
    private readonly attachmentPOSTUrl: string | undefined;
    private readonly attachmentGETUrl: string | undefined;
    // Driver specified limits for snapshot size and time.
    /**
     * NOTE: While commit cfff6e3 added restrictions to prevent large payloads, snapshot failures will continue to
     * happen until blob request throttling is implemented. Until then, as a temporary fix we set arbitrarily large
     * snapshot size and timeout limits so that such failures are unlikely to occur.
     */
    private readonly maxSnapshotSizeLimit = 500000000; // 500 MB
    private readonly maxSnapshotFetchTimeout = 120000; // 2 min

    // limits the amount of parallel "attachment" blob uploads
    private readonly createBlobRateLimiter = new RateLimiter(1);

    private readonly blobCache = new BlobCache();

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

    constructor(
        private readonly odspResolvedUrl: IOdspResolvedUrl,
        private readonly getStorageToken: InstrumentedStorageTokenFetcher,
        private readonly logger: ITelemetryLogger,
        private readonly fetchFullSnapshot: boolean,
        private readonly cache: IOdspCache,
        private readonly hostPolicy: HostStoragePolicyInternal,
        private readonly epochTracker: EpochTracker,
        private readonly flushCallback: () => Promise<FlushResult>,
    ) {
        this.documentId = this.odspResolvedUrl.hashedDocumentId;
        this.snapshotUrl = this.odspResolvedUrl.endpoints.snapshotStorageUrl;
        this.attachmentPOSTUrl = this.odspResolvedUrl.endpoints.attachmentPOSTStorageUrl;
        this.attachmentGETUrl = this.odspResolvedUrl.endpoints.attachmentGETStorageUrl;
        this.odspSummaryUploadManager = new OdspSummaryUploadManager(this.snapshotUrl, getStorageToken, logger, epochTracker);
    }

    public get repositoryUrl(): string {
        return "";
    }

    public async createBlob(file: ArrayBufferLike): Promise<api.ICreateBlobResponse> {
        this.checkAttachmentPOSTUrl();

        const response = await getWithRetryForTokenRefresh(async (options) => {
            const storageToken = await this.getStorageToken(options, "CreateBlob");
            const { url, headers } = getUrlAndHeadersWithAuth(`${this.attachmentPOSTUrl}/content`, storageToken);
            headers["Content-Type"] = "application/octet-stream";

            return PerformanceEvent.timedExecAsync(
                this.logger,
                {
                    eventName: "createBlob",
                    size: file.byteLength,
                    waitQueueLength: this.createBlobRateLimiter.waitQueueLength,
                },
                async (event) => {
                    const res = await this.createBlobRateLimiter.schedule(async () =>
                        this.epochTracker.fetchAndParseAsJSON<api.ICreateBlobResponse>(
                            url,
                            {
                                body: file,
                                headers,
                                method: "POST",
                            },
                            "createBlob",
                    ));
                    event.end({
                        blobId: res.content.id,
                        ...res.commonSpoHeaders,
                    });
                    return res;
                },
            );
        });

        return response.content;
    }

    private async readBlobCore(blobId: string): Promise<ArrayBuffer> {
        const { blobContent, evicted } = this.blobCache.getBlob(blobId);
        let blob = blobContent;

        if (blob === undefined) {
            this.checkAttachmentGETUrl();

            blob = await getWithRetryForTokenRefresh(async (options) => {
                const storageToken = await this.getStorageToken(options, "GetBlob");
                const unAuthedUrl = `${this.attachmentGETUrl}/${encodeURIComponent(blobId)}/content`;
                const { url, headers } = getUrlAndHeadersWithAuth(unAuthedUrl, storageToken);

                return PerformanceEvent.timedExecAsync(
                    this.logger,
                    {
                        eventName: "readDataBlob",
                        blobId,
                        evicted,
                        headers: Object.keys(headers).length !== 0 ? true : undefined,
                        waitQueueLength: this.epochTracker.rateLimiter.waitQueueLength,
                    },
                    async (event) => {
                        const res = await this.epochTracker.fetchArray(url, { headers }, "blob");
                        event.end({
                            waitQueueLength: this.epochTracker.rateLimiter.waitQueueLength,
                            ...res.commonSpoHeaders,
                            attempts: options.refresh ? 2 : 1,
                        });
                        const cacheControl = res.headers.get("cache-control");
                        if (cacheControl === undefined || !(cacheControl.includes("private") || cacheControl.includes("public"))) {
                            this.logger.sendErrorEvent({
                                eventName: "NonCacheableBlob",
                                cacheControl,
                                blobId,
                                ...res.commonSpoHeaders,
                            });
                        }
                        return res.content;
                    },
                );
            });
            this.blobCache.setBlob(blobId, blob);
        }

        if (!this.attributesBlobHandles.has(blobId)) {
            return blob;
        }
        // ODSP document ids are random guids (different per session)
        // fix the branch name in attributes
        // this prevents issues when generating summaries
        const documentAttributes: api.IDocumentAttributes = JSON.parse(bufferToString(blob, "utf8"));
        documentAttributes.branch = this.documentId;
        const content = JSON.stringify(documentAttributes);
        const patchedBlob = stringToBuffer(content, "utf8");
        return patchedBlob;
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        return this.readBlobCore(blobId);
    }

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        if (!this.snapshotUrl) {
            return null;
        }

        let id: string;
        if (!version || !version.id) {
            const versions = await this.getVersions(null, 1);
            if (!versions || versions.length === 0) {
                return null;
            }
            id = versions[0].id;
        } else {
            id = version.id;
        }

        const snapshotTree = await this.readTree(id);
        if (!snapshotTree) {
            return null;
        }
        // Decode commit paths
        const commits = {};

        for (const key of Object.keys(snapshotTree.commits)) {
            commits[decodeURIComponent(key)] = snapshotTree.commits[key];
        }

        let finalTree: api.ISnapshotTree;
        // For container loaded from detach new summary, we will not have a commit for ".app" in downloaded summary as the client uploaded both
        // ".app" and ".protocol" trees by itself. For other summaries, we will have ".app" as commit because client previously only uploaded the
        // app summary.
        if (commits && commits[".app"]) {
            // The latest snapshot is a summary
            // attempt to read .protocol from commits for backwards compat
            finalTree = await this.readSummaryTree(commits[".protocol"] || snapshotTree.trees[".protocol"], commits[".app"] as string);
        } else {
            if (snapshotTree.blobs) {
                const attributesBlob = snapshotTree.blobs.attributes;
                if (attributesBlob) {
                    this.attributesBlobHandles.add(attributesBlob);
                }
            }

            snapshotTree.commits = commits;

            // When we upload the container snapshot, we upload appTree in ".app" and protocol tree in ".protocol"
            // So when we request the snapshot we get ".app" as tree and not as commit node as in the case just above.
            const appTree = snapshotTree.trees[".app"];
            const protocolTree = snapshotTree.trees[".protocol"];
            finalTree = this.combineProtocolAndAppSnapshotTree(appTree, protocolTree);
        }
        return finalTree;
    }

    public async getVersions(blobid: string | null, count: number): Promise<api.IVersion[]> {
        // Regular load workflow uses blobId === documentID to indicate "latest".
        if (blobid !== this.documentId && blobid) {
            // FluidFetch & FluidDebugger tools use empty sting to query for versions
            // In such case we need to make a call against SPO to give full picture to the tool.
            // Otherwise, each commit calls getVersions but odsp doesn't have a history for each commit
            // return the blobid as is
            return [
                {
                    id: blobid,
                    treeId: undefined!,
                },
            ];
        }

        // Can't really make a call if we do not have URL
        if (!this.snapshotUrl) {
            return [];
        }

        // If count is one, we can use the trees/latest API, which returns the latest version and trees in a single request for better performance
        // Do it only once - we might get more here due to summarizer - it needs only container tree, not full snapshot.
        if (this.firstVersionCall && count === 1 && (blobid === null || blobid === this.documentId)) {
            const hostSnapshotOptions = this.hostPolicy.snapshotOptions;
            const odspSnapshotCacheValue: ISnapshotContents = await PerformanceEvent.timedExecAsync(
                this.logger,
                { eventName: "ObtainSnapshot" },
                async (event: PerformanceEvent) => {
                    let cachedSnapshot: ISnapshotContents | undefined;
                    const cachedSnapshotP: Promise<ISnapshotContents | undefined> =
                        this.epochTracker.get(createCacheSnapshotKey(this.odspResolvedUrl));

                    let method: string;
                    if (this.hostPolicy.concurrentSnapshotFetch && !this.hostPolicy.summarizerClient) {
                        const snapshotP = this.fetchSnapshot(hostSnapshotOptions);

                        // Ensure that failures on both paths are ignored initially.
                        // I.e. if cache fails for some reason, we will proceed with network result.
                        // And vice versa - if (for example) client is offline and network request fails first, we
                        // do want to attempt to succeed with cached data!
                        const promiseRaceWinner = await promiseRaceWithWinner([
                            cachedSnapshotP.catch(() => undefined),
                            snapshotP.catch(() => undefined),
                        ]);
                        cachedSnapshot = promiseRaceWinner.value;
                        method = promiseRaceWinner.index === 0 ? "cache" : "network";

                        if (cachedSnapshot === undefined) {
                            // if network failed -> wait for cache ( then return network failure)
                            // If cache returned empty or failed -> wait for network (success of failure)
                            if (promiseRaceWinner.index === 1) {
                                cachedSnapshot = await cachedSnapshotP;
                                method = "cache";
                            }
                            if (cachedSnapshot === undefined) {
                                cachedSnapshot = await snapshotP;
                                method = "network";
                            }
                        }
                    } else {
                        // Note: There's a race condition here - another caller may come past the undefined check
                        // while the first caller is awaiting later async code in this block.

                        cachedSnapshot = await cachedSnapshotP;

                        method = cachedSnapshot !== undefined ? "cache" : "network";

                        if (cachedSnapshot === undefined) {
                            cachedSnapshot = await this.fetchSnapshot(hostSnapshotOptions);
                        }
                    }
                    event.end({ method });
                    return cachedSnapshot;
                },
                {end: true, cancel: "error"},
            );

            // Successful call, redirect future calls to getVersion only!
            this.firstVersionCall = false;

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
            return id ? [{ id, treeId: undefined! }] : [];
        }

        return getWithRetryForTokenRefresh(async (options) => {
            const storageToken = await this.getStorageToken(options, "GetVersions");
            const { url, headers } = getUrlAndHeadersWithAuth(`${this.snapshotUrl}/versions?count=${count}`, storageToken);

            // Fetch the latest snapshot versions for the document
            const response = await PerformanceEvent.timedExecAsync(
                this.logger,
                {
                    eventName: "getVersions",
                    headers: Object.keys(headers).length !== 0 ? true : undefined,
                },
                async () => this.epochTracker.fetchAndParseAsJSON<IDocumentStorageGetVersionsResponse>(url, { headers }, "versions"),
            );
            const versionsResponse = response.content;
            if (!versionsResponse) {
                throwOdspNetworkError("getVersionsReturnedNoResponse", 400);
            }
            if (!Array.isArray(versionsResponse.value)) {
                throwOdspNetworkError("getVersionsReturnedNonArrayResponse", 400);
            }
            return versionsResponse.value.map((version) => {
                // Parse the date from the message
                let date: string | undefined;
                for (const rec of version.message.split("\n")) {
                    const index = rec.indexOf(":");
                    if (index !== -1 && rec.substr(0, index) === "Date") {
                        date = rec.substr(index + 1).trim();
                        break;
                    }
                }
                return {
                    date,
                    id: version.id,
                    treeId: undefined!,
                };
            });
        });
    }

    private async fetchSnapshot(hostSnapshotOptions: ISnapshotOptions | undefined) {
        return this.fetchSnapshotCore(hostSnapshotOptions).catch((error) => {
            // Issue #5895:
            // If we are offline, this error is retryable. But that means that RetriableDocumentStorageService
            // will run in circles calling getSnapshotTree, which would result in OdspDocumentStorageService class
            // going getVersions / individual blob download path. This path is very slow, and will not work with
            // delay-loaded data stores and ODSP storage deleting old snapshots and blobs.
            if (typeof error === "object" && error !== null) {
                error.canRetry = false;
            }
            throw error;
        });
    }

    private async fetchSnapshotCore(hostSnapshotOptions: ISnapshotOptions | undefined) {
        const snapshotOptions: ISnapshotOptions = {
            mds: this.maxSnapshotSizeLimit,
            ...hostSnapshotOptions,
            timeout: hostSnapshotOptions?.timeout ? Math.min(hostSnapshotOptions.timeout, this.maxSnapshotFetchTimeout) : this.maxSnapshotFetchTimeout,
        };

        // No limit on size of snapshot or time to fetch, as otherwise we fail all clients to summarize
        if (this.hostPolicy.summarizerClient) {
            snapshotOptions.mds = undefined;
            snapshotOptions.timeout = undefined;
        }

        const snapshotDownloader = async (
            finalOdspResolvedUrl: IOdspResolvedUrl,
            storageToken: string,
            options: ISnapshotOptions | undefined,
            controller?: AbortController,
        ) => {
            return downloadSnapshot(
                finalOdspResolvedUrl,
                storageToken,
                this.logger,
                options,
                this.hostPolicy.fetchBinarySnapshotFormat,
                controller,
                this.epochTracker,
            );
        };
        const putInCache = async (valueWithEpoch: IVersionedValueWithEpoch) => {
            return this.cache.persistedCache.put(
                createCacheSnapshotKey(this.odspResolvedUrl),
                // Epoch tracker will add the epoch and version to the value here. So just send value to cache.
                valueWithEpoch.value,
            );
        };
        const removeEntries = async () => this.cache.persistedCache.removeEntries();
        try {
            const odspSnapshot = await fetchSnapshotWithRedeem(
                this.odspResolvedUrl,
                this.getStorageToken,
                snapshotOptions,
                this.logger,
                snapshotDownloader,
                putInCache,
                removeEntries,
                this.hostPolicy.enableRedeemFallback);
            return odspSnapshot;
        } catch (error) {
            const errorType = error.errorType;
            // If the snapshot size is too big and the host specified the size limitation(specified in hostSnapshotOptions), then don't try to fetch the snapshot again.
            if ((errorType === OdspErrorType.snapshotTooBig && hostSnapshotOptions?.mds !== undefined) && (this.hostPolicy.summarizerClient !== true)) {
                throw error;
            }
            // If the first snapshot request was with blobs and we either timed out or the size was too big, then try to fetch without blobs.
            if ((errorType === OdspErrorType.snapshotTooBig || errorType === OdspErrorType.fetchTimeout) && snapshotOptions.blobs) {
                this.logger.sendErrorEvent({
                    eventName: "TreeLatest_SecondCall",
                    errorType,
                });
                const snapshotOptionsWithoutBlobs: ISnapshotOptions = { ...snapshotOptions, blobs: 0, mds: undefined, timeout: undefined };
                const odspSnapshot = await fetchSnapshotWithRedeem(
                    this.odspResolvedUrl,
                    this.getStorageToken,
                    snapshotOptionsWithoutBlobs,
                    this.logger,
                    snapshotDownloader,
                    putInCache,
                    removeEntries,
                    this.hostPolicy.enableRedeemFallback);
                return odspSnapshot;
            }
            throw error;
        }
    }

    public async write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        this.checkSnapshotUrl();

        throw new Error("Not supported");
    }

    public async uploadSummaryWithContext(summary: api.ISummaryTree, context: ISummaryContext): Promise<string> {
        this.checkSnapshotUrl();

        // Enable flushing only if we have single commit summary and this is not the initial summary for an empty file
        if (".protocol" in summary.tree && context.ackHandle !== undefined) {
            let retry = 0;
            for (;;) {
                const result = await this.flushCallback();
                const seq = result.lastPersistedSequenceNumber;
                if (seq !== undefined && seq >= context.referenceSequenceNumber) {
                    break;
                }

                retry++;
                if (retry > 3) {
                    this.logger.sendErrorEvent({
                        eventName: "FlushFailure",
                        ...result,
                        retry,
                        referenceSequenceNumber: context.referenceSequenceNumber,
                    });
                    break;
                }

                this.logger.sendPerformanceEvent({
                    eventName: "FlushExtraCall",
                    ...result,
                    retry,
                    referenceSequenceNumber: context.referenceSequenceNumber,
                });

                await delay(1000 * (result.retryAfter ?? 1));
            }
        }

        const id = await PerformanceEvent.timedExecAsync(this.logger,
            { eventName: "uploadSummaryWithContext" },
            async () => this.odspSummaryUploadManager.writeSummaryTree(summary, context));
        return id;
    }

    public async downloadSummary(commit: api.ISummaryHandle): Promise<api.ISummaryTree> {
        throw new Error("Not implemented yet");
    }

    private setRootTree(id: string, tree: api.ISnapshotTree) {
        this.commitCache.set(id, tree);
    }

    private initBlobsCache(blobs: Map<string, ArrayBuffer>) {
        this.blobCache.addBlobs(blobs);
    }

    private checkSnapshotUrl() {
        if (!this.snapshotUrl) {
            throwOdspNetworkError("methodNotSupportedBecauseNoSnapshotUrlWasProvided", 400);
        }
    }

    private checkAttachmentPOSTUrl() {
        if (!this.attachmentPOSTUrl) {
            throwOdspNetworkError("methodNotSupportedBecauseNoAttachmentPOSTUrlWasProvided", 400);
        }
    }

    private checkAttachmentGETUrl() {
        if (!this.attachmentGETUrl) {
            throwOdspNetworkError("methodNotSupportedBecauseNoAttachmentGETUrlWasProvided", 400);
        }
    }

    private async readTree(id: string): Promise<api.ISnapshotTree | null> {
        if (!this.snapshotUrl) {
            return null;
        }
        let tree = this.commitCache.get(id);
        if (!tree) {
            tree = await getWithRetryForTokenRefresh(async (options) => {
                const storageToken = await this.getStorageToken(options, "ReadCommit");
                const snapshotDownloader = async (url: string, fetchOptions: {[index: string]: any}) => {
                    return this.epochTracker.fetchAndParseAsJSON(
                        url,
                        fetchOptions,
                        "snapshotTree",
                    );
                };
                const snapshot = await fetchSnapshot(this.snapshotUrl!, storageToken, id, this.fetchFullSnapshot, this.logger, snapshotDownloader);
                let treeId = "";
                if (snapshot.snapshotTree) {
                    assert(snapshot.snapshotTree.id !== undefined, 0x222 /* "Root tree should contain the id!!" */);
                    treeId = snapshot.snapshotTree.id;
                    this.setRootTree(treeId, snapshot.snapshotTree);
                }
                if (snapshot.blobs) {
                    this.initBlobsCache(snapshot.blobs);
                }
                // If the version id doesn't match with the id of the tree, then use the id of first tree which in that case
                // will be the actual id of tree to be fetched.
                return this.commitCache.get(id) ?? this.commitCache.get(treeId);
            });
        }

        if (!tree) {
            return null;
        }

        return tree;
    }

    /**
     * Reads a summary tree
     * @param protocolTreeOrId - Protocol snapshot tree or id of the protocol tree
     * @param appTreeId - Id of the app tree
     */
    private async readSummaryTree(protocolTreeOrId: api.ISnapshotTree | string, appTreeId: string): Promise<api.ISnapshotTree> {
        // Load the app and protocol trees and return them
        let hierarchicalProtocolTree: api.ISnapshotTree | null;
        if (typeof (protocolTreeOrId) === "string") {
            // Backwards compat for older summaries
            hierarchicalProtocolTree = await this.readTree(protocolTreeOrId);
        } else {
            hierarchicalProtocolTree = protocolTreeOrId;
        }

        const hierarchicalAppTree = await this.readTree(appTreeId);
        if (!hierarchicalProtocolTree) {
            throw new Error("Invalid protocol tree");
        }

        if (!hierarchicalAppTree) {
            throw new Error("Invalid app tree");
        }

        if (hierarchicalProtocolTree.blobs) {
            const attributesBlob = hierarchicalProtocolTree.blobs.attributes;
            if (attributesBlob) {
                this.attributesBlobHandles.add(attributesBlob);
            }
        }
        return this.combineProtocolAndAppSnapshotTree(hierarchicalAppTree, hierarchicalProtocolTree);
    }

    private combineProtocolAndAppSnapshotTree(
        hierarchicalAppTree: api.ISnapshotTree,
        hierarchicalProtocolTree: api.ISnapshotTree,
    ) {
        const summarySnapshotTree: api.ISnapshotTree = {
            blobs: {
                ...hierarchicalAppTree.blobs,
            },
            commits: {
                ...hierarchicalAppTree.commits,
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
}

/* eslint-enable max-len */
