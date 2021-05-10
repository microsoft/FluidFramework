/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { default as AbortController } from "abort-controller";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { v4 as uuid } from "uuid";
import {
    assert,
    fromBase64ToUtf8,
    performance,
    stringToBuffer,
    bufferToString,
} from "@fluidframework/common-utils";
import {
    PerformanceEvent,
} from "@fluidframework/telemetry-utils";
import * as api from "@fluidframework/protocol-definitions";
import {
    ISummaryContext,
    IDocumentStorageService,
    DriverErrorType,
    LoaderCachingPolicy,
} from "@fluidframework/driver-definitions";
import { throwOdspNetworkError } from "@fluidframework/odsp-doclib-utils";
import {
    IOdspResolvedUrl,
    TokenFetchOptions,
    IEntry,
    snapshotKey,
    ISnapshotOptions,
    OdspErrorType,
} from "@fluidframework/odsp-driver-definitions";
import {
    IDocumentStorageGetVersionsResponse,
    IOdspSnapshot,
    ISequencedDeltaOpMessage,
    HostStoragePolicyInternal,
    ITree,
    IBlob,
} from "./contracts";
import { fetchSnapshot } from "./fetchSnapshot";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { IOdspCache } from "./odspCache";
import { getWithRetryForTokenRefresh, IOdspResponse } from "./odspUtils";
import { EpochTracker } from "./epochTracker";
import { OdspSummaryUploadManager } from "./odspSummaryUploadManager";
import { RateLimiter } from "./rateLimiter";

/* eslint-disable max-len */

interface ISnapshotCacheValue {
    snapshot: IOdspSnapshot;
    sequenceNumber: number | undefined;
}

/**
 * Build a tree hierarchy base on a flat tree
 *
 * @param flatTree - a flat tree
 * @param blobsShaToPathCache - Map with blobs sha as keys and values as path of the blob.
 * @returns the hierarchical tree
 */
function buildHierarchy(
    flatTree: ITree,
    blobsShaToPathCache: Map<string, string> = new Map<string, string>()): api.ISnapshotTree {
    const lookup: { [path: string]: api.ISnapshotTree } = {};
    const root: api.ISnapshotTree = { blobs: {}, commits: {}, trees: {} };
    lookup[""] = root;

    for (const entry of flatTree.entries) {
        const lastIndex = entry.path.lastIndexOf("/");
        const entryPathDir = entry.path.slice(0, Math.max(0, lastIndex));
        const entryPathBase = entry.path.slice(lastIndex + 1);

        // ODSP snapshots are created breadth-first so we can assume we see tree nodes prior to their contents
        const node = lookup[entryPathDir];

        // Add in either the blob or tree
        if (entry.type === "tree") {
            const newTree: api.ISnapshotTree = {
                id: entry.id,
                blobs: {},
                commits: {},
                trees: {},
                unreferenced: entry.unreferenced,
            };
            node.trees[decodeURIComponent(entryPathBase)] = newTree;
            lookup[entry.path] = newTree;
        } else if (entry.type === "blob") {
            node.blobs[decodeURIComponent(entryPathBase)] = entry.id;
            blobsShaToPathCache.set(entry.id, `/${entry.path}`);
        } else if (entry.type === "commit") {
            node.commits[decodeURIComponent(entryPathBase)] = entry.id;
        }
    }

    return root;
}

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

    private readonly _blobCache: Map<string, IBlob | ArrayBuffer> = new Map();

    // Tracks all blob IDs evicted from cache
    private readonly blobsEvicted: Set<string> = new Set();

    // Initial time-out to purge data from cache
    // If this time out is very small, then we purge blobs from cache too soon and that results in a lot of
    // requests to storage, which brings down perf and may trip protection limits causing 429s
    // Also we need to ensure that buildCachesForDedup() is called with full cache for summarizer client to build
    // its SHA cache for blobs (currently that happens as result of requesting snapshot tree)
    private blobCacheTimeoutDuration = 2 * 60 * 1000;

    // SPO does not keep old snapshots around for long, so we are running chances of not
    // being able to rehydrate data store / DDS in the future if we purge anything (and with blob de-duping,
    // even if blob read by runtime, it could be read again in the future)
    // So for now, purging is disabled.
    private readonly purgeEnabled = false;

    public get value() {
        return this._blobCache;
    }

    public addBlobs(blobs: IBlob[]) {
        blobs.forEach((blob) => {
            assert(blob.encoding === "base64" || blob.encoding === undefined,
                0x0a4 /* `Unexpected blob encoding type: '${blob.encoding}'` */);
            this._blobCache.set(blob.id, blob);
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
        } else {
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
                    if (this.purgeEnabled) {
                        this._blobCache.forEach((_, blobId) => this.blobsEvicted.add(blobId));
                        this._blobCache.clear();
                    }
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

    public setBlob(blobId: string, blob: IBlob | ArrayBuffer) {
        // This API is called as result of cache miss and reading blob from storage.
        // Runtime never reads same blob twice.
        // The only reason we may get read request for same blob is blob de-duping in summaries.
        // Note that the bigger the size, the less likely blobs are the same, so there is very little benefit of caching big blobs.
        // Images are the only exception - user may insert same image twice. But we currently do not de-dup them - only snapshot
        // blobs are de-duped.
        const size = blob instanceof ArrayBuffer ? blob.byteLength : blob.size;
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

    private readonly treesCache: Map<string, ITree> = new Map();

    private readonly attributesBlobHandles: Set<string> = new Set();

    private readonly odspSummaryUploadManager: OdspSummaryUploadManager;
    private _ops: ISequencedDeltaOpMessage[] | undefined;

    private firstVersionCall = true;
    private readonly _snapshotCacheEntry: IEntry;
    private _snapshotSequenceNumber: number | undefined;

    private readonly documentId: string;
    private readonly snapshotUrl: string | undefined;
    private readonly redeemSharingLink: string | undefined;
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

    public set ops(ops: ISequencedDeltaOpMessage[] | undefined) {
        assert(this._ops === undefined, 0x0a5 /* "Trying to set ops when they are already set!" */);
        assert(ops !== undefined, 0x0a6 /* "Input ops are undefined!" */);
        this._ops = ops;
    }

    public get ops(): ISequencedDeltaOpMessage[] | undefined {
        return this._ops;
    }

    public get snapshotSequenceNumber() {
        return this._snapshotSequenceNumber;
    }

    constructor(
        odspResolvedUrl: IOdspResolvedUrl,
        private readonly getStorageToken: (options: TokenFetchOptions, name: string) => Promise<string | null>,
        private readonly logger: ITelemetryLogger,
        private readonly fetchFullSnapshot: boolean,
        private readonly cache: IOdspCache,
        private readonly hostPolicy: HostStoragePolicyInternal,
        private readonly epochTracker: EpochTracker,
    ) {
        this.documentId = odspResolvedUrl.hashedDocumentId;
        this.snapshotUrl = odspResolvedUrl.endpoints.snapshotStorageUrl;
        this.redeemSharingLink = odspResolvedUrl.sharingLinkToRedeem;
        this.attachmentPOSTUrl = odspResolvedUrl.endpoints.attachmentPOSTStorageUrl;
        this.attachmentGETUrl = odspResolvedUrl.endpoints.attachmentGETStorageUrl;

        this._snapshotCacheEntry = {
            type: snapshotKey,
            key: "",
        };

        this.odspSummaryUploadManager = new OdspSummaryUploadManager(this.snapshotUrl, getStorageToken, logger, epochTracker, this.hostPolicy);
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

    private async readBlobCore(blobId: string): Promise<IBlob | ArrayBuffer> {
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
        let documentAttributes: api.IDocumentAttributes;
        if (blob instanceof ArrayBuffer) {
            documentAttributes = JSON.parse(bufferToString(blob, "utf8"));
        } else {
            documentAttributes = JSON.parse(blob.encoding === "base64" ? fromBase64ToUtf8(blob.content) : blob.content);
        }

        documentAttributes.branch = this.documentId;
        const content = JSON.stringify(documentAttributes);

        const blobPatched: IBlob = {
            id: blobId,
            content,
            size: content.length,
            encoding: undefined, // string
        };

        return blobPatched;
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        const blob = await this.readBlobCore(blobId);
        if (blob instanceof ArrayBuffer) {
            return blob;
        }
        return stringToBuffer(blob.content, blob.encoding ?? "utf8");
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

        const tree = await this.readTree(id);
        if (!tree) {
            return null;
        }

        const hierarchicalTree = buildHierarchy(tree);

        // Decode commit paths
        const commits = {};

        const keys = Object.keys(hierarchicalTree.commits);
        for (const key of keys) {
            commits[decodeURIComponent(key)] = hierarchicalTree.commits[key];
        }

        let finalTree: api.ISnapshotTree | undefined;
        // For container loaded from detach new summary, we will not have a commit for ".app" in downloaded summary as the client uploaded both
        // ".app" and ".protocol" trees by itself. For other summaries, we will have ".app" as commit because client previously only uploaded the
        // app summary.
        if (commits && commits[".app"]) {
            // The latest snapshot is a summary
            // attempt to read .protocol from commits for backwards compat
            finalTree = await this.readSummaryTree(tree.id, commits[".protocol"] || hierarchicalTree.trees[".protocol"], commits[".app"] as string);
        } else {
            if (hierarchicalTree.blobs) {
                const attributesBlob = hierarchicalTree.blobs.attributes;
                if (attributesBlob) {
                    this.attributesBlobHandles.add(attributesBlob);
                }
            }

            hierarchicalTree.commits = commits;

            // When we upload the container snapshot, we upload appTree in ".app" and protocol tree in ".protocol"
            // So when we request the snapshot we get ".app" as tree and not as commit node as in the case just above.
            const appTree = hierarchicalTree.trees[".app"];
            const protocolTree = hierarchicalTree.trees[".protocol"];
            finalTree = this.combineProtocolAndAppSnapshotTree(appTree, protocolTree);
        }

        if (this.hostPolicy.summarizerClient && this.hostPolicy.blobDeduping) {
            await this.odspSummaryUploadManager.buildCachesForDedup(finalTree, this.blobCache.value);
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
            return getWithRetryForTokenRefresh(async (tokenFetchOptions) => {
                if (tokenFetchOptions.refresh) {
                    // This is the most critical code path for boot.
                    // If we get incorrect / expired token first time, that adds up to latency of boot
                    this.logger.sendErrorEvent({
                        eventName: "TreeLatest_SecondCall",
                        hasClaims: !!tokenFetchOptions.claims,
                        hasTenantId: !!tokenFetchOptions.tenantId,
                    });
                }

                const hostSnapshotOptions = this.hostPolicy.snapshotOptions;
                let cachedSnapshot: ISnapshotCacheValue | undefined;
                // No need to ask cache twice - if first request was unsuccessful, cache unlikely to have data on second turn.
                if (tokenFetchOptions.refresh) {
                    cachedSnapshot = await this.fetchSnapshot(hostSnapshotOptions, undefined, tokenFetchOptions);
                } else {
                    cachedSnapshot = await PerformanceEvent.timedExecAsync(
                        this.logger,
                        { eventName: "ObtainSnapshot" },
                        async (event: PerformanceEvent) => {
                            const cachedSnapshotP: Promise<ISnapshotCacheValue | undefined> = this.epochTracker.get(this._snapshotCacheEntry);

                            let method: string;
                            if (this.hostPolicy.concurrentSnapshotFetch && !this.hostPolicy.summarizerClient) {
                                const snapshotP = this.fetchSnapshot(hostSnapshotOptions, undefined, tokenFetchOptions);

                                const promiseRaceWinner = await promiseRaceWithWinner([cachedSnapshotP, snapshotP]);
                                cachedSnapshot = promiseRaceWinner.value;

                                if (cachedSnapshot === undefined) {
                                    cachedSnapshot = await snapshotP;
                                }

                                method = promiseRaceWinner.index === 0 && promiseRaceWinner.value !== undefined ? "cache" : "network";
                            } else {
                                // Note: There's a race condition here - another caller may come past the undefined check
                                // while the first caller is awaiting later async code in this block.

                                cachedSnapshot = await cachedSnapshotP;

                                method = cachedSnapshot !== undefined ? "cache" : "network";

                                if (cachedSnapshot === undefined) {
                                    cachedSnapshot = await this.fetchSnapshot(hostSnapshotOptions, undefined, tokenFetchOptions);
                                }
                            }
                            event.end({ method });
                            return cachedSnapshot;
                        });
                }

                // Successful call, redirect future calls to getVersion only!
                this.firstVersionCall = false;

                const odspSnapshot: IOdspSnapshot = cachedSnapshot.snapshot;
                this._snapshotSequenceNumber = cachedSnapshot.sequenceNumber;

                const { trees, blobs, ops } = odspSnapshot;
                // id should be undefined in case of just ops in snapshot.
                let id: string | undefined;
                if (trees) {
                    this.initTreesCache(trees);
                    // versionId is the id of the first tree
                    if (trees.length > 0) {
                        id = trees[0].id;
                    }
                }
                if (blobs) {
                    this.initBlobsCache(blobs);
                }

                this.ops = ops;
                return id ? [{ id, treeId: undefined! }] : [];
            }).catch(async (error) => {
                const errorType = error.errorType;
                // Clear the cache on 401/403/404 on snapshot fetch from network because this means either the user doesn't have
                // permissions for the file or it was deleted. So the user will again try to fetch from cache on any failure in future.
                if (errorType === DriverErrorType.authorizationError || errorType === DriverErrorType.fileNotFoundOrAccessDeniedError) {
                    await this.cache.persistedCache.removeEntries();
                }
                throw error;
            });
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
                throwOdspNetworkError("getVersions returned no response", 400);
            }
            if (!Array.isArray(versionsResponse.value)) {
                throwOdspNetworkError("getVersions returned non-array response", 400);
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

    private async fetchSnapshot(
        hostSnapshotOptions: ISnapshotOptions | undefined,
        driverSnapshotOptions: ISnapshotOptions | undefined,
        tokenFetchOptions: TokenFetchOptions,
    ) {
        const snapshotOptions: ISnapshotOptions = driverSnapshotOptions ?? {
            deltas: 1,
            channels: 1,
            blobs: 2,
            mds: this.maxSnapshotSizeLimit,
            ...hostSnapshotOptions,
            timeout: hostSnapshotOptions?.timeout ? Math.min(hostSnapshotOptions.timeout, this.maxSnapshotFetchTimeout) : this.maxSnapshotFetchTimeout,
        };

        // No limit on size of snapshot, as otherwise we fail all clients to summarize
        if (this.hostPolicy.summarizerClient) {
            snapshotOptions.mds = undefined;
        }

        try {
            const odspSnapshot = await this.fetchSnapshotCore(snapshotOptions, tokenFetchOptions);
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
                return this.fetchSnapshotCore(snapshotOptionsWithoutBlobs, tokenFetchOptions);
            }
            throw error;
        }
    }

    private async fetchSnapshotCore(
        snapshotOptions: ISnapshotOptions,
        tokenFetchOptions: TokenFetchOptions,
    ) {
        const storageToken = await this.getStorageToken(tokenFetchOptions, "TreesLatest");
        const url = `${this.snapshotUrl}/trees/latest?ump=1`;
        const formBoundary = uuid();
        let postBody = `--${formBoundary}\r\n`;
        postBody += `Authorization: Bearer ${storageToken}\r\n`;
        postBody += `X-HTTP-Method-Override: GET\r\n`;
        const logOptions = {};
        Object.entries(snapshotOptions).forEach(([key, value]) => {
            if (value !== undefined) {
                postBody += `${key}: ${value}\r\n`;
                logOptions[`snapshotOption_${key}`] = value;
            }
        });
        if (this.redeemSharingLink) {
            postBody += `sl: ${this.redeemSharingLink}\r\n`;
        }
        postBody += `_post: 1\r\n`;
        postBody += `\r\n--${formBoundary}--`;
        const headers: {[index: string]: any} = {
            "Content-Type": `multipart/form-data;boundary=${formBoundary}`,
        };

        let controller: AbortController | undefined;
        if (this.hostPolicy.summarizerClient !== true) {
            controller = new AbortController();
            setTimeout(
                () => controller!.abort(),
                snapshotOptions.timeout,
            );
        }

        // This event measures only successful cases of getLatest call (no tokens, no retries).
        return PerformanceEvent.timedExecAsync(
            this.logger,
            {
                eventName: "TreesLatest",
                ...logOptions,
            },
            async (event) => {
                const startTime = performance.now();
                const response: IOdspResponse<IOdspSnapshot> = await this.epochTracker.fetchAndParseAsJSON<IOdspSnapshot>(
                    url,
                    {
                        body: postBody,
                        headers,
                        signal: controller?.signal,
                        method: "POST",
                    },
                    "treesLatest",
                    true,
                );
                const endTime = performance.now();
                const overallTime = endTime - startTime;
                const snapshot: IOdspSnapshot = response.content;
                let dnstime: number | undefined; // domainLookupEnd - domainLookupStart
                let redirectTime: number | undefined; // redirectEnd -redirectStart
                let tcpHandshakeTime: number | undefined; // connectEnd  - connectStart
                let secureConntime: number | undefined; // connectEnd  - secureConnectionStart
                let responseTime: number | undefined; // responsEnd - responseStart
                let fetchStToRespEndTime: number | undefined; // responseEnd  - fetchStart
                let reqStToRespEndTime: number | undefined; // responseEnd - requestStart
                let networkTime: number | undefined; // responseEnd - startTime
                const spReqDuration = response.headers.get("sprequestduration");

                // getEntriesByType is only available in browser performance object
                const resources1 = performance.getEntriesByType?.("resource") ?? [];
                // Usually the latest fetch call is to the end of resources, so we start from the end.
                for (let i = resources1.length - 1; i > 0; i--) {
                    const indResTime = resources1[i] as PerformanceResourceTiming;
                    const resource_name = indResTime.name;
                    const resource_initiatortype = indResTime.initiatorType;
                    if ((resource_initiatortype.localeCompare("fetch") === 0) && (resource_name.localeCompare(url) === 0)) {
                        redirectTime = indResTime.redirectEnd - indResTime.redirectStart;
                        dnstime = indResTime.domainLookupEnd - indResTime.domainLookupStart;
                        tcpHandshakeTime = indResTime.connectEnd - indResTime.connectStart;
                        secureConntime = (indResTime.secureConnectionStart > 0) ? (indResTime.connectEnd - indResTime.secureConnectionStart) : 0;
                        responseTime = indResTime.responseEnd - indResTime.responseStart;
                        fetchStToRespEndTime = (indResTime.fetchStart > 0) ? (indResTime.responseEnd - indResTime.fetchStart) : 0;
                        reqStToRespEndTime = (indResTime.requestStart > 0) ? (indResTime.responseEnd - indResTime.requestStart) : 0;
                        networkTime = (indResTime.startTime > 0) ? (indResTime.responseEnd - indResTime.startTime) : 0;
                        if (spReqDuration) {
                            networkTime = networkTime - parseInt(spReqDuration, 10);
                        }
                        break;
                    }
                }

                const { numTrees, numBlobs, encodedBlobsSize, decodedBlobsSize } = this.evalBlobsAndTrees(snapshot);
                const clientTime = networkTime ? overallTime - networkTime : undefined;

                // There are some scenarios in ODSP where we cannot cache, trees/latest will explicitly tell us when we cannot cache using an HTTP response header.
                const canCache = response.headers.get("disablebrowsercachingofusercontent") !== "true";
                // There maybe no snapshot - TreesLatest would return just ops.
                const sequenceNumber: number = (snapshot.trees && (snapshot.trees[0] as any).sequenceNumber) ?? 0;
                const seqNumberFromOps = snapshot.ops && snapshot.ops.length > 0 ?
                    snapshot.ops[0].sequenceNumber - 1 :
                    undefined;

                const value: ISnapshotCacheValue = { snapshot, sequenceNumber };

                if (!Number.isInteger(sequenceNumber) || seqNumberFromOps !== undefined && seqNumberFromOps !== sequenceNumber) {
                    this.logger.sendErrorEvent({ eventName: "fetchSnapshotError", sequenceNumber, seqNumberFromOps });
                    value.sequenceNumber = undefined;
                } else if (canCache) {
                    this.cache.persistedCache.put(
                        this._snapshotCacheEntry,
                        value,
                    ).catch(() => {});
                }

                event.end({
                    trees: numTrees,
                    blobs: snapshot.blobs?.length ?? 0,
                    leafNodes: numBlobs,
                    encodedBlobsSize,
                    decodedBlobsSize,
                    sequenceNumber,
                    ops: snapshot.ops?.length ?? 0,
                    headers: Object.keys(headers).length !== 0 ? true : undefined,
                    redirecttime: redirectTime,
                    dnsLookuptime: dnstime,
                    responsenetworkTime: responseTime,
                    tcphandshakeTime: tcpHandshakeTime,
                    secureconnectiontime: secureConntime,
                    fetchstarttorespendtime: fetchStToRespEndTime,
                    reqstarttorespendtime: reqStToRespEndTime,
                    overalltime: overallTime,
                    networktime: networkTime,
                    clienttime: clientTime,
                    // Sharing link telemetry regarding sharing link redeem status and performance. Ex: FRL; dur=100, FRS; desc=S, FRP; desc=False
                    // Here, FRL is the duration taken for redeem, FRS is the redeem status (S means success), and FRP is a flag to indicate if the permission has changed.
                    sltelemetry: response.headers.get("x-fluid-sltelemetry"),
                    ...response.commonSpoHeaders,
                });
                return value;
            },
        ).catch((error) => {
            // Issue #5895:
            // If we are offline, this error is retryable. But that means that RetriableDocumentStorageService
            // will run in circles calling getSnapshotTree, which would result in this class going getVersions / individual blob download path.
            // This path is very slow, and will not work with delay-loaded data stores and ODSP storage deleting old snapshots and blobs.
            if (typeof error === "object" && error !== null) {
                error.canRetry = false;
            }
            throw error;
        });
    }

    private evalBlobsAndTrees(snapshot: IOdspSnapshot) {
        let numTrees = 0;
        let numBlobs = 0;
        let encodedBlobsSize = 0;
        let decodedBlobsSize = 0;
        for (const tree of snapshot.trees) {
            for(const treeEntry of tree.entries) {
                if (treeEntry.type === "blob") {
                    numBlobs++;
                } else if (treeEntry.type === "tree") {
                    numTrees++;
                }
            }
        }
        if (snapshot.blobs !== undefined) {
            for (const blob of snapshot.blobs) {
                decodedBlobsSize += blob.size;
                encodedBlobsSize += blob.content.length;
            }
        }
        return { numTrees, numBlobs, encodedBlobsSize, decodedBlobsSize };
    }

    public async write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        this.checkSnapshotUrl();

        throw new Error("Not supported");
    }

    public async uploadSummaryWithContext(summary: api.ISummaryTree, context: ISummaryContext): Promise<string> {
        this.checkSnapshotUrl();

        const id = await PerformanceEvent.timedExecAsync(this.logger,
            { eventName: "uploadSummaryWithContext" },
            async () => this.odspSummaryUploadManager.writeSummaryTree(summary, context));
        return id;
    }

    public async downloadSummary(commit: api.ISummaryHandle): Promise<api.ISummaryTree> {
        throw new Error("Not implemented yet");
    }

    private initTreesCache(trees: ITree[]) {
        trees.forEach((tree) => {
            this.treesCache.set(tree.id, tree);
        });
    }

    private initBlobsCache(blobs: IBlob[]) {
        this.blobCache.addBlobs(blobs);
    }

    private checkSnapshotUrl() {
        if (!this.snapshotUrl) {
            throwOdspNetworkError("Method not supported because no snapshotUrl was provided", 400);
        }
    }

    private checkAttachmentPOSTUrl() {
        if (!this.attachmentPOSTUrl) {
            throwOdspNetworkError("Method not supported because no attachmentPOSTUrl was provided", 400);
        }
    }

    private checkAttachmentGETUrl() {
        if (!this.attachmentGETUrl) {
            throwOdspNetworkError("Method not supported because no attachmentGETUrl was provided", 400);
        }
    }

    private async readTree(id: string): Promise<ITree | null> {
        if (!this.snapshotUrl) {
            return null;
        }
        let tree = this.treesCache.get(id);
        if (!tree) {
            tree = await getWithRetryForTokenRefresh(async (options) => {
                const storageToken = await this.getStorageToken(options, "ReadTree");

                const response = await fetchSnapshot(this.snapshotUrl!, storageToken, id, this.fetchFullSnapshot, this.logger, this.epochTracker);
                const odspSnapshot: IOdspSnapshot = response.content;
                let treeId = "";
                if (odspSnapshot) {
                    if (odspSnapshot.trees) {
                        this.initTreesCache(odspSnapshot.trees);
                        if (odspSnapshot.trees.length > 0) {
                            treeId = odspSnapshot.trees[0].id;
                        }
                    }
                    if (odspSnapshot.blobs) {
                        this.initBlobsCache(odspSnapshot.blobs);
                    }
                }
                // If the version id doesn't match with the id of the tree, then use the id of first tree which in that case
                // will be the actual id of tree to be fetched.
                return this.treesCache.get(id) ?? this.treesCache.get(treeId);
            });
        }

        if (!tree) {
            return null;
        }

        return tree;
    }

    /**
     * Reads a summary tree
     * @param snapshotTreeId - Id of the snapshot
     * @param protocolTreeOrId - Protocol snapshot tree or id of the protocol tree
     * @param appTreeId - Id of the app tree
     */
    private async readSummaryTree(snapshotTreeId: string, protocolTreeOrId: api.ISnapshotTree | string, appTreeId: string): Promise<api.ISnapshotTree> {
        // Load the app and protocol trees and return them
        let hierarchicalProtocolTree: api.ISnapshotTree;
        let appTree: ITree | null;

        if (typeof (protocolTreeOrId) === "string") {
            // Backwards compat for older summaries
            const trees = await Promise.all([
                this.readTree(protocolTreeOrId),
                this.readTree(appTreeId),
            ]);

            const protocolTree = trees[0];
            if (!protocolTree) {
                throw new Error("Invalid protocol tree");
            }

            appTree = trees[1];

            hierarchicalProtocolTree = buildHierarchy(protocolTree);
        } else {
            appTree = await this.readTree(appTreeId);

            hierarchicalProtocolTree = protocolTreeOrId;
        }

        if (!appTree) {
            throw new Error("Invalid app tree");
        }

        const hierarchicalAppTree = buildHierarchy(appTree);

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
                ".protocol": hierarchicalProtocolTree,
                ...hierarchicalAppTree.trees,
            },
        };

        return summarySnapshotTree;
    }
}

/* eslint-enable max-len */
