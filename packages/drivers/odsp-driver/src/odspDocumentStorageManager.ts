/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { default as AbortController } from "abort-controller";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { v4 as uuid } from "uuid";
import {
    assert,
    fromBase64ToUtf8,
    fromUtf8ToBase64,
    hashFile,
    IsoBuffer,
    Uint8ArrayToString,
    performance,
    unreachableCase,
} from "@fluidframework/common-utils";
import {
    PerformanceEvent,
    TelemetryLogger,
} from "@fluidframework/telemetry-utils";
import { getGitType } from "@fluidframework/protocol-base";
import * as api from "@fluidframework/protocol-definitions";
import {
    ISummaryContext,
    IDocumentStorageService,
    DriverErrorType,
} from "@fluidframework/driver-definitions";
import { OdspErrorType } from "@fluidframework/odsp-doclib-utils";
import {
    IDocumentStorageGetVersionsResponse,
    IOdspResolvedUrl,
    IOdspSnapshot,
    ISequencedDeltaOpMessage,
    HostStoragePolicyInternal,
    ISnapshotRequest,
    ISnapshotResponse,
    ISnapshotTree,
    ISnapshotTreeBaseEntry,
    SnapshotTreeEntry,
    SnapshotTreeValue,
    SnapshotType,
    ISnapshotOptions,
    ITree,
    IBlob,
} from "./contracts";
import { fetchSnapshot } from "./fetchSnapshot";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import {
    IOdspCache,
    ICacheEntry,
    IFileEntry,
    snapshotExpirySummarizerOps,
    IPersistedCacheValueWithEpoch,
    persistedCacheValueVersion,
} from "./odspCache";
import { getWithRetryForTokenRefresh, IOdspResponse } from "./odspUtils";
import { throwOdspNetworkError } from "./odspError";
import { TokenFetchOptions } from "./tokenFetch";
import { EpochTracker, FetchType } from "./epochTracker";

/* eslint-disable max-len */

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
            const newTree = { id: entry.id, blobs: {}, commits: {}, trees: {} };
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

export class OdspDocumentStorageService implements IDocumentStorageService {
    // This cache is associated with mapping sha to path for previous summary which belongs to last summary handle.
    private blobsShaToPathCache: Map<string, string> = new Map();
    // A set of pending blob hashes that will be inserted into blobsShaToPathCache
    private readonly blobsCachePendingHashes: Set<Promise<void>> = new Set();
    private readonly blobCache: Map<string, IBlob | ArrayBuffer> = new Map();
    private readonly treesCache: Map<string, ITree> = new Map();

    // Save the timeout so we can cancel and reschedule it as needed
    private blobCacheTimeout: ReturnType<typeof setTimeout> | undefined;
    // If the defer flag is set when the timeout fires, we'll reschedule rather than clear immediately
    // This deferral approach is used (rather than clearing/resetting the timer) as current calling patterns trigger
    // too many calls to setTimeout/clearTimeout.
    private deferBlobCacheClear: boolean = false;

    private readonly attributesBlobHandles: Set<string> = new Set();

    private lastSummaryHandle: string | undefined;
    // Last proposed handle of the uploaded app summary.
    private blobsShaProposalHandle: string | undefined;

    private _ops: ISequencedDeltaOpMessage[] | undefined;

    private firstVersionCall = true;
    private _snapshotCacheEntry: ICacheEntry | undefined;

    private readonly fileEntry: IFileEntry;

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

    public set ops(ops: ISequencedDeltaOpMessage[] | undefined) {
        assert(this._ops === undefined);
        assert(ops !== undefined);
        this._ops = ops;
    }

    public get ops(): ISequencedDeltaOpMessage[] | undefined {
        return this._ops;
    }

    public get snapshotCacheEntry() {
        return this._snapshotCacheEntry;
    }

    constructor(
        odspResolvedUrl: IOdspResolvedUrl,
        private readonly getStorageToken: (options: TokenFetchOptions, name?: string) => Promise<string | null>,
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

        this.fileEntry = {
            resolvedUrl: odspResolvedUrl,
            docId: this.documentId,
        };
    }

    public get repositoryUrl(): string {
        return "";
    }

    public async createBlob(file: Uint8Array): Promise<api.ICreateBlobResponse> {
        this.checkAttachmentPOSTUrl();

        const response = await getWithRetryForTokenRefresh(async (options) => {
            const storageToken = await this.getStorageToken(options, "CreateBlob");
            const { url, headers } = getUrlAndHeadersWithAuth(`${this.attachmentPOSTUrl}/content`, storageToken);
            headers["Content-Type"] = "application/octet-stream";

            return PerformanceEvent.timedExecAsync(
                this.logger,
                {
                    eventName: "createBlob",
                    size: file.length,
                },
                async (event) => {
                    const res = await this.epochTracker.fetchAndParseAsJSON<api.ICreateBlobResponse>(
                        url,
                        {
                            body: file,
                            headers,
                            method: "POST",
                        },
                        FetchType.createBlob,
                    );
                    event.end({ blobId: res.content.id });
                    return res;
                },
            );
        });

        return response.content;
    }

    public async readBlobCore(blobId: string): Promise<IBlob | ArrayBuffer> {
        let blob = this.blobCache.get(blobId);
        // Reset the timer on attempted cache read
        this.scheduleClearBlobsCache();

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
                        headers: Object.keys(headers).length !== 0 ? true : undefined,
                        waitQueueLength: this.epochTracker.rateLimiter.waitQueueLength,
                    },
                    async (event) => {
                        const res = await this.epochTracker.fetchResponse(url, { headers }, FetchType.blob);
                        const blobContent = await res.arrayBuffer();
                        event.end({ size: blobContent.byteLength });
                        return blobContent;
                    },
                );
            });
            this.blobCache.set(blobId, blob);
        }

        if (!this.attributesBlobHandles.has(blobId)) {
            return blob;
        }
        // ODSP document ids are random guids (different per session)
        // fix the branch name in attributes
        // this prevents issues when generating summaries
        let documentAttributes: api.IDocumentAttributes;
        if (blob instanceof ArrayBuffer) {
            documentAttributes = JSON.parse(IsoBuffer.from(blob).toString("utf8"));
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
        this.blobCache.set(blobId, blobPatched);

        // No need to patch it again
        this.attributesBlobHandles.delete(blobId);

        return blobPatched;
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        const blob = await this.readBlobCore(blobId);
        if (blob instanceof ArrayBuffer) {
            return blob;
        }
        return IsoBuffer.from(blob.content, blob.encoding ?? "utf-8");
    }

    public async read(blobId: string): Promise<string> {
        return this.readWithEncodingOutput(blobId, "base64");
    }

    private async readWithEncodingOutput(blobId: string, outputFormat: "base64" | "string"): Promise<string> {
        const blob = await this.readBlobCore(blobId);

        if (blob instanceof ArrayBuffer) {
            return IsoBuffer.from(blob).toString(outputFormat === "base64" ? "base64" : "utf8");
        }
        if (outputFormat === blob.encoding || (outputFormat === "string" && blob.encoding === undefined))  {
            return blob.content;
        } else if (outputFormat === "base64") {
            return fromUtf8ToBase64(blob.content);
        } else {
            return fromBase64ToUtf8(blob.content);
        }
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

        if (commits && commits[".app"]) {
            // The latest snapshot is a summary
            // attempt to read .protocol from commits for backwards compat
            return this.readSummaryTree(tree.id, commits[".protocol"] || hierarchicalTree.trees[".protocol"], commits[".app"] as string);
        }

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
        if (appTree && protocolTree) {
            return this.combineProtocolAndAppSnapshotTree(tree.id, appTree, protocolTree);
        }

        return hierarchicalTree;
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
            this.firstVersionCall = false;

            return getWithRetryForTokenRefresh(async (tokenFetchOptions) => {
                if (tokenFetchOptions.refresh) {
                    // This is the most critical code path for boot.
                    // If we get incorrect / expired token first time, that adds up to latency of boot
                    this.logger.sendErrorEvent({ eventName: "TreeLatest_SecondCall", hasClaims: !!tokenFetchOptions.claims });
                }

                const hostSnapshotOptions = this.hostPolicy.snapshotOptions;
                let cachedSnapshot: IOdspSnapshot | undefined;
                // No need to ask cache twice - if first request was unsuccessful, cache unlikely to have data on second turn.
                if (tokenFetchOptions.refresh) {
                    cachedSnapshot = await this.fetchSnapshot(hostSnapshotOptions, undefined, tokenFetchOptions);
                } else {
                    cachedSnapshot = await PerformanceEvent.timedExecAsync(
                        this.logger,
                        { eventName: "ObtainSnapshot" },
                        async (event: PerformanceEvent) => {
                            const cachedSnapshotP = this.epochTracker.fetchFromCache<IOdspSnapshot>(
                                {
                                    file: this.fileEntry,
                                    type: "snapshot",
                                    key: "",
                                },
                                this.hostPolicy.summarizerClient ? snapshotExpirySummarizerOps : undefined,
                                FetchType.treesLatest,
                            );

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

                const odspSnapshot: IOdspSnapshot = cachedSnapshot;

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

                if (this.hostPolicy.summarizerClient && trees && blobs) {
                    const blobsIdToPathMap: Map<string, string> = new Map();
                    let appCommit: string | undefined;
                    let appTree: string | undefined;

                    for (const [key, treeVal] of this.treesCache.entries()) {
                        if (!appCommit && !appTree) {
                            for (const entry of treeVal.entries) {
                                if (entry.path === ".app") {
                                    if (entry.type === "commit") {
                                        // This is the unacked handle of the latest summary generated.
                                        appCommit = entry.id;
                                    }
                                    if (entry.type === "tree") {
                                        appTree = entry.id;
                                    }
                                    break;
                                }
                            }
                            assert(!!appCommit || !!appTree); // .app commit or tree should be first entry in first entry.
                        }
                        for (const entry of treeVal.entries) {
                            if (entry.type === "blob") {
                                blobsIdToPathMap.set(entry.id, key === appCommit ? `/.app/${entry.path}` : `/${entry.path}`);
                            }
                        }
                    }

                    // Populate the cache with paths from id-to-path mapping.
                    for (const [blobId, blob] of this.blobCache.entries()) {
                        const path = blobsIdToPathMap.get(blobId);
                        // If this is the first container that was created for the service, it cannot be
                        // the summarizing container (because the summarizing container is always created
                        // after the main container). In this case, we do not need to do any hashing
                        if (path) {
                            // Schedule the hashes for later, but keep track of the tasks
                            // to ensure they finish before they might be used
                            const hashP = hashFile(
                                blob instanceof ArrayBuffer ?
                                IsoBuffer.from(blob) :
                                IsoBuffer.from(blob.content, blob.encoding ?? "utf-8"))
                            .then((hash: string) => {
                                this.blobsShaToPathCache.set(hash, path);
                            }).finally(() => {
                                this.blobsCachePendingHashes.delete(hashP);
                            });
                            this.blobsCachePendingHashes.add(hashP);
                        }
                    }
                }

                this.ops = ops;
                return id ? [{ id, treeId: undefined! }] : [];
            }).catch(async (error) => {
                const errorType = error.errorType;
                // Clear the cache on 401/403/404 on snapshot fetch from network because this means either the user doesn't have permissions
                // permissions for the file or it was deleted. So the user will again try to fetch from cache on any failure in future.
                if (errorType === DriverErrorType.authorizationError || errorType === DriverErrorType.fileNotFoundOrAccessDeniedError) {
                    await this.cache.persistedCache.removeEntries(this.fileEntry);
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
                async () => this.epochTracker.fetchAndParseAsJSON<IDocumentStorageGetVersionsResponse>(url, { headers }, FetchType.treesLatest),
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
    ): Promise<IOdspSnapshot> {
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
        let abortController: AbortController | undefined;
        if (this.hostPolicy.summarizerClient !== true) {
            abortController = new AbortController();
            const timeout = setTimeout(
                () => {
                    clearTimeout(timeout);
                    abortController?.abort();
                },
                snapshotOptions.timeout,
            );
        }

        try {
            const odspSnapshot = await this.fetchSnapshotCore(snapshotOptions, tokenFetchOptions, abortController);
            return odspSnapshot;
        } catch (error) {
            const errorType = error.errorType;
            // If the snapshot size is too big and the host specified the size limitation(specified in hostSnapshotOptions), then don't try to fetch the snapshot again.
            if ((errorType === OdspErrorType.snapshotTooBig && hostSnapshotOptions?.mds !== undefined) && (this.hostPolicy.summarizerClient !== true)) {
                throw error;
            }
            // If the first snapshot request was with blobs and we either timed out or the size was too big, then try to fetch without blobs.
            if ((errorType === OdspErrorType.snapshotTooBig || errorType === OdspErrorType.fetchTimeout) && snapshotOptions.blobs) {
                const snapshotOptionsWithoutBlobs: ISnapshotOptions = { ...snapshotOptions, blobs: 0, mds: undefined };
                return this.fetchSnapshotCore(snapshotOptionsWithoutBlobs, tokenFetchOptions);
            }
            throw error;
        }
    }

    private async fetchSnapshotCore(
        snapshotOptions: ISnapshotOptions,
        tokenFetchOptions: TokenFetchOptions,
        controller?: AbortController,
    ): Promise<IOdspSnapshot> {
        const storageToken = await this.getStorageToken(tokenFetchOptions, "TreesLatest");
        const url = `${this.snapshotUrl}/trees/latest?ump=1`;
        const formBoundary = uuid();
        let postBody = `--${formBoundary}\r\n`;
        postBody += `Authorization: Bearer ${storageToken}\r\n`;
        postBody += `X-HTTP-Method-Override: GET\r\n`;
        Object.entries(snapshotOptions).forEach(([key, value]) => {
            if (value !== undefined) {
                postBody += `${key}: ${value}\r\n`;
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

        // This event measures only successful cases of getLatest call (no tokens, no retries).
        const { snapshot, canCache } = await PerformanceEvent.timedExecAsync(this.logger, { eventName: "TreesLatest", fetchTimeout: snapshotOptions.timeout, maxSnapshotSize: snapshotOptions.mds }, async (event) => {
            const startTime = performance.now();
            const response: IOdspResponse<IOdspSnapshot> = await this.epochTracker.fetchAndParseAsJSON<IOdspSnapshot>(
                url,
                {
                    body: postBody,
                    headers,
                    signal: controller?.signal,
                    method: "POST",
                },
                FetchType.treesLatest,
                true,
            );
            const endTime = performance.now();
            const overallTime = endTime - startTime;
            const content = response.content;
            let dnstime: number | undefined; // domainLookupEnd - domainLookupStart
            let redirectTime: number | undefined; // redirectEnd -redirectStart
            let tcpHandshakeTime: number | undefined; // connectEnd  - connectStart
            let secureConntime: number | undefined; // connectEnd  - secureConnectionStart
            let responseTime: number | undefined; // responsEnd - responseStart
            let fetchStToRespEndTime: number | undefined; // responseEnd  - fetchStart
            let reqStToRespEndTime: number | undefined; // responseEnd - requestStart
            let networkTime: number | undefined; // responseEnd - startTime
            const spReqDuration = response.headers.get("sprequestduration");
            const msEdge = response.headers.get("x-msedge-ref"); // To track Azure Front Door information of which the request came in at

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

            const clientTime = networkTime ? overallTime - networkTime : undefined;
            const isAfd = msEdge !== undefined;

            event.end({
                trees: content.trees?.length ?? 0,
                blobs: content.blobs?.length ?? 0,
                ops: content.ops?.length ?? 0,
                headers: Object.keys(headers).length !== 0 ? true : undefined,
                sprequestguid: response.headers.get("sprequestguid"),
                sprequestduration: TelemetryLogger.numberFromString(response.headers.get("sprequestduration")),
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
                msedge: msEdge,
                isafd: isAfd,
                contentsize: TelemetryLogger.numberFromString(response.headers.get("content-length")),
                bodysize: TelemetryLogger.numberFromString(response.headers.get("body-size")),
            });
            return {
                snapshot: content,
                // There are some scenarios in ODSP where we cannot cache, trees/latest will explicitly tell us when we cannot cache using an HTTP response header.
                canCache: response.headers.get("disablebrowsercachingofusercontent") !== "true",
            };
        });

        assert(this._snapshotCacheEntry === undefined);
        this._snapshotCacheEntry = {
            file: this.fileEntry,
            type: "snapshot",
            key: "",
        };

        // There maybe no snapshot - TreesLatest would return just ops.
        const seqNumber: number = (snapshot.trees && (snapshot.trees[0] as any).sequenceNumber) ?? 0;
        const seqNumberFromOps = snapshot.ops && snapshot.ops.length > 0 ?
            snapshot.ops[0].sequenceNumber - 1 :
            undefined;

        if (!Number.isInteger(seqNumber) || seqNumberFromOps !== undefined && seqNumberFromOps !== seqNumber) {
            this.logger.sendErrorEvent({ eventName: "fetchSnapshotError", seqNumber, seqNumberFromOps });
        } else if (canCache) {
            const cacheValue: IPersistedCacheValueWithEpoch = {
                value: snapshot,
                fluidEpoch: this.epochTracker.fluidEpoch,
                version: persistedCacheValueVersion,
            };
            this.cache.persistedCache.put(
                this._snapshotCacheEntry,
                cacheValue,
                seqNumber,
            );
        }

        return snapshot;
    }

    public async write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        this.checkSnapshotUrl();

        throw new Error("Not supported");
    }

    public async uploadSummaryWithContext(summary: api.ISummaryTree, context: ISummaryContext): Promise<string> {
        this.checkSnapshotUrl();

        // If the last proposed handle is not the proposed handle of the acked summary, clear the cache as the last summary
        // could have got nacked.
        if (context.proposalHandle !== this.blobsShaProposalHandle) {
            this.blobsShaToPathCache.clear();
        }
        this.lastSummaryHandle = context.ackHandle;

        const { result, blobsShaToPathCacheLatest } = await PerformanceEvent.timedExecAsync(this.logger,
            { eventName: "uploadSummaryWithContext" },
            async () => this.writeSummaryTree(this.lastSummaryHandle, summary));
        const id = result ? result.id : undefined;
        if (!result || !id) {
            throw new Error(`Failed to write summary tree`);
        }
        if (blobsShaToPathCacheLatest) {
            this.blobsShaToPathCache = blobsShaToPathCacheLatest;
            this.blobsShaProposalHandle = id;
        }

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
        blobs.forEach((blob) => {
            assert(blob.encoding === "base64" || blob.encoding === undefined);
            this.blobCache.set(blob.id, blob);
        });
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
                    this.blobCache.clear();
                }
            };
            const blobCacheTimeoutDuration = 10000;
            this.blobCacheTimeout = setTimeout(clearCacheOrDefer, blobCacheTimeoutDuration);
        }
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

        return this.combineProtocolAndAppSnapshotTree(snapshotTreeId, hierarchicalAppTree, hierarchicalProtocolTree);
    }

    private combineProtocolAndAppSnapshotTree(
        snapshotTreeId: string,
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

    private async writeSummaryTree(
        parentHandle: string | undefined,
        tree: api.ISummaryTree,
        depth: number = 0): Promise<{ result: ISnapshotResponse, blobsShaToPathCacheLatest?: Map<string, string> }> {
        // Wait for all pending hashes to complete before using them in convertSummaryToSnapshotTree
        await Promise.all(this.blobsCachePendingHashes.values());
        // This cache is associated with mapping sha to path for currently generated summary.
        const blobsShaToPathCacheLatest: Map<string, string> = new Map();
        const { snapshotTree, reusedBlobs, blobs } = await this.convertSummaryToSnapshotTree(parentHandle, tree, blobsShaToPathCacheLatest);

        const snapshot: ISnapshotRequest = {
            entries: snapshotTree.entries!,
            message: "app",
            sequenceNumber: depth === 0 ? 1 : 2,
            type: SnapshotType.Channel,
        };

        return getWithRetryForTokenRefresh(async (options) => {
            const storageToken = await this.getStorageToken(options, "WriteSummaryTree");

            const { url, headers } = getUrlAndHeadersWithAuth(`${this.snapshotUrl}/snapshot`, storageToken);
            headers["Content-Type"] = "application/json";

            const postBody = JSON.stringify(snapshot);

            return PerformanceEvent.timedExecAsync(this.logger,
                {
                    eventName: "uploadSummary",
                    attempt: options.refresh ? 2 : 1,
                    hasClaims: !!options.claims,
                    headers: Object.keys(headers).length !== 0 ? true : undefined,
                    blobs,
                    reusedBlobs,
                    size: postBody.length,
                },
                async () => {
                    const response = await this.epochTracker.fetchAndParseAsJSON<ISnapshotResponse>(
                        url,
                        {
                            body: postBody,
                            headers,
                            method: "POST",
                        },
                        FetchType.uploadSummary);
                    return { result: response.content, blobsShaToPathCacheLatest };
                });
        });
    }

    /**
     * Converts a summary tree to ODSP tree
     */
    private async convertSummaryToSnapshotTree(
        parentHandle: string | undefined,
        tree: api.ISummaryTree,
        blobsShaToPathCacheLatest: Map<string, string>,
        depth: number = 0,
        path: string = "",
    ): Promise<{ snapshotTree: ISnapshotTree, blobs: number, reusedBlobs: number }> {
        const snapshotTree: ISnapshotTree = {
            type: "tree",
            entries: [] as SnapshotTreeEntry[],
        };

        let reusedBlobs = 0;
        let blobs = 0;

        const keys = Object.keys(tree.tree);
        for (const key of keys) {
            const summaryObject = tree.tree[key];

            let id: string | undefined;
            let value: SnapshotTreeValue | undefined;

            // Tracks if an entry is unreferenced. Currently, only tree entries can be marked as unreferenced. If the
            // property is not present, the tree entry is considered referenced. If the property is present and is
            // true (which is the only value it can have), the tree entry is considered unreferenced.
            let unreferenced: true | undefined;

            switch (summaryObject.type) {
                case api.SummaryType.Tree: {
                    const result = await this.convertSummaryToSnapshotTree(
                        parentHandle,
                        summaryObject,
                        blobsShaToPathCacheLatest,
                        depth + 1,
                        `${path}/${key}`);
                    value = result.snapshotTree;
                    unreferenced = summaryObject.unreferenced;
                    reusedBlobs += result.reusedBlobs;
                    blobs += result.blobs;
                    break;
                }
                case api.SummaryType.Blob: {
                    if (typeof summaryObject.content === "string") {
                        value = {
                            type: "blob",
                            content: summaryObject.content,
                            encoding: "utf-8",
                        };
                    } else {
                        value = {
                            type: "blob",
                            content: Uint8ArrayToString(summaryObject.content, "base64"),
                            encoding: "base64",
                        };
                    }

                    // Promises for pending hashes in blobsCachePendingHashes should all have resolved and removed themselves
                    assert(this.blobsCachePendingHashes.size === 0);
                    const hash = await hashFile(IsoBuffer.from(value.content, value.encoding));
                    let completePath = this.blobsShaToPathCache.get(hash);
                    // If the cache has the hash of the blob and handle of last summary is also present, then use that
                    // to generate complete path for the given blob.
                    if (!completePath || !this.lastSummaryHandle) {
                        blobs++;
                        completePath = `/.app${path}/${key}`;
                        blobsShaToPathCacheLatest.set(hash, completePath);
                    } else {
                        reusedBlobs++;
                        id = `${this.lastSummaryHandle}${completePath}`;
                        value = undefined;
                    }
                    break;
                }
                case api.SummaryType.Handle: {
                    if (!parentHandle) {
                        throw Error("Parent summary does not exist to reference by handle.");
                    }
                    let handlePath = summaryObject.handle;
                    if (handlePath.length > 0 && !handlePath.startsWith("/")) {
                        handlePath = `/${handlePath}`;
                    }
                    id = `${parentHandle}/.app${handlePath}`;

                    break;
                }
                case api.SummaryType.Attachment: {
                    id = summaryObject.id;
                    break;
                }

                default: {
                    unreachableCase(summaryObject, `Unknown type: ${(summaryObject as any).type}`);
                }
            }

            const baseEntry: ISnapshotTreeBaseEntry = {
                path: encodeURIComponent(key),
                type: getGitType(summaryObject),
            };

            let entry: SnapshotTreeEntry;

            if (value) {
                assert(id === undefined);
                entry = {
                    value,
                    ...baseEntry,
                    unreferenced,
                };
            } else if (id) {
                entry = {
                    ...baseEntry,
                    id,
                };
            } else {
                throw new Error(`Invalid tree entry for ${summaryObject.type}`);
            }

            snapshotTree.entries!.push(entry);
        }

        return { snapshotTree, blobs, reusedBlobs };
    }
}

/* eslint-enable max-len */
