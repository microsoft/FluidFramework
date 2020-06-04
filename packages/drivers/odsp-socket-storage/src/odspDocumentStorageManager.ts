/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    fromBase64ToUtf8,
    fromUtf8ToBase64,
    hashFile,
    PerformanceEvent,
    TelemetryLogger,
} from "@fluidframework/common-utils";
import * as resources from "@fluidframework/gitresources";
import { buildHierarchy, getGitType } from "@fluidframework/protocol-base";
import * as api from "@fluidframework/protocol-definitions";
import {
    ISummaryContext,
    IDocumentStorageService,
} from "@fluidframework/driver-definitions";
import {
    IDocumentStorageGetVersionsResponse,
    IOdspSnapshot,
    ISequencedDeltaOpMessage,
    HostStoragePolicy,
    ISnapshotRequest,
    ISnapshotResponse,
    ISnapshotTree,
    ISnapshotTreeBaseEntry,
    SnapshotTreeEntry,
    SnapshotTreeValue,
    SnapshotType,
    ITree,
    IBlob,
    idFromSpoEntry,
} from "./contracts";
import { fetchSnapshot } from "./fetchSnapshot";
import { IFetchWrapper } from "./fetchWrapper";
import { getQueryString } from "./getQueryString";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { IOdspCache } from "./odspCache";
import { getWithRetryForTokenRefresh, throwOdspNetworkError } from "./odspUtils";

/* eslint-disable max-len */

// back-compat: 0.14 uploadSummary
type ConditionallyContextedSummary = {
    useContext: true,
    parentHandle: string | undefined,
    tree: api.ISummaryTree,
} | {
    useContext: false,
    tree: api.ISummaryTree,
};

function convertOdspTree(tree: ITree) {
    const gitTree: resources.ITree = {
        sha: idFromSpoEntry(tree),
        url: "",
        tree: [],
    };
    for (const entry of tree.entries) {
        gitTree.tree.push({
            path: entry.path,
            mode: "",
            type: entry.type,
            size: 0,
            sha: idFromSpoEntry(entry),
            url: "",
        });
    }
    return gitTree;
}

export class OdspDocumentStorageService implements IDocumentStorageService {
    // This cache is associated with mapping sha to path for previous summary which belongs to last summary handle.
    private blobsShaToPathCache: Map<string, string> = new Map();
    // A set of pending blob hashes that will be inserted into blobsShaToPathCache
    private readonly blobsCachePendingHashes: Set<Promise<void>> = new Set();
    private readonly blobCache: Map<string, IBlob> = new Map();
    private readonly treesCache: Map<string, ITree> = new Map();

    private readonly attributesBlobHandles: Set<string> = new Set();

    private lastSummaryHandle: string | undefined;
    // Last proposed handle of the uploaded app summary.
    private blobsShaProposalHandle: string | undefined;

    private _ops: ISequencedDeltaOpMessage[] | undefined;

    private firstVersionCall = true;

    public set ops(ops: ISequencedDeltaOpMessage[] | undefined) {
        assert(this._ops === undefined);
        assert(ops !== undefined);
        this._ops = ops;
    }

    public get ops(): ISequencedDeltaOpMessage[] | undefined {
        return this._ops;
    }

    constructor(
        private readonly documentId: string,
        private readonly snapshotUrl: string | undefined,
        private readonly fetchWrapper: IFetchWrapper,
        private readonly getStorageToken: (refresh: boolean, name?: string) => Promise<string | null>,
        private readonly logger: ITelemetryLogger,
        private readonly fetchFullSnapshot: boolean,
        private readonly cache: IOdspCache,
        private readonly isFirstTimeDocumentOpened: boolean,
        private readonly hostPolicy: HostStoragePolicy,
    ) {
    }

    public get repositoryUrl(): string {
        return "";
    }

    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        this.checkSnapshotUrl();

        const event = PerformanceEvent.start(this.logger, {
            eventName: "createBlob",
            size: file.length,
        });

        try {
            // Future implementation goes here
            // Need to wrap implementation with getWithRetryForTokenRefresh()
            throw new Error("StandardDocumentStorageManager.createBlob() not implemented");
        } catch (error) {
            event.cancel({}, error);
            throw error;
        }

        event.end();
    }

    public async read(blobid: string): Promise<string> {
        let blob = this.blobCache.get(blobid);
        if (!blob) {
            this.checkSnapshotUrl();

            const response = await getWithRetryForTokenRefresh(async (refresh: boolean) => {
                const storageToken = await this.getStorageToken(refresh, "GetBlob");

                const { url, headers } = getUrlAndHeadersWithAuth(`${this.snapshotUrl}/blobs/${blobid}`, storageToken);

                return this.fetchWrapper.get<IBlob>(url, blobid, headers);
            });
            blob = response.content;
        }

        if (blob && this.attributesBlobHandles.has(blobid)) {
            // ODSP document ids are random guids (different per session)
            // fix the branch name in attributes
            // this prevents issues when generating summaries
            const documentAttributes: api.IDocumentAttributes = JSON.parse(fromBase64ToUtf8(blob.content));
            documentAttributes.branch = this.documentId;

            blob.content = fromUtf8ToBase64(JSON.stringify(documentAttributes));
        }

        return blob.content;
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        this.checkSnapshotUrl();

        return getWithRetryForTokenRefresh(async (refresh: boolean) => {
            const storageToken = await this.getStorageToken(refresh, "GetContent");

            const { url, headers } = getUrlAndHeadersWithAuth(`${this.snapshotUrl}/contents${getQueryString({ ref: version.id, path })}`, storageToken);

            const response = await this.fetchWrapper.get<IBlob>(url, version.id, headers);
            return response.content.content;
        });
    }

    public getRawUrl(blobid: string): string {
        this.checkSnapshotUrl();

        return `${this.snapshotUrl}/blobs/${blobid}`;
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

        const hierarchicalTree = buildHierarchy(convertOdspTree(tree));

        // Decode commit paths
        const commits = {};

        const keys = Object.keys(hierarchicalTree.commits);
        for (const key of keys) {
            commits[decodeURIComponent(key)] = hierarchicalTree.commits[key];
        }

        if (commits && commits[".app"]) {
            // The latest snapshot is a summary
            // attempt to read .protocol from commits for backwards compat
            return this.readSummaryTree(idFromSpoEntry(tree), commits[".protocol"] || hierarchicalTree.trees[".protocol"], commits[".app"] as string);
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
            return this.combineProtocolAndAppSnapshotTree(idFromSpoEntry(tree), appTree, protocolTree);
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

            return getWithRetryForTokenRefresh(async (refresh) => {
                if (refresh) {
                    // This is the most critical code path for boot.
                    // If we get incorrect / expired token first time, that adds up to latency of boot
                    this.logger.sendErrorEvent({ eventName: "TreeLatest_SecondCall" });
                }

                // Note: There's a race condition here - another caller may come past the undefined check
                // while the first caller is awaiting later async code in this block.
                const snapshotCacheKey: string = `${this.documentId}/getlatest`;
                let cachedSnapshot: IOdspSnapshot | undefined = await this.cache.persistedCache.get(snapshotCacheKey);
                if (cachedSnapshot === undefined) {
                    const storageToken = await this.getStorageToken(refresh, "TreesLatest");

                    const hostPolicy = {
                        deltas: 1,
                        channels: 1,
                        blobs: 2,
                        ...this.hostPolicy.snapshotOptions,
                    };

                    let delimiter = "?";
                    let options = "";
                    for (const [key, value] of Object.entries(hostPolicy)) {
                        options = `${options}${delimiter}${key}=${value}`;
                        delimiter = "&";
                    }

                    // TODO: This snapshot will return deltas, which we currently aren't using. We need to enable this flag to go down the "optimized"
                    // snapshot code path. We should leverage the fact that these deltas are returned to speed up the deltas fetch.
                    const { headers, url } = getUrlAndHeadersWithAuth(`${this.snapshotUrl}/trees/latest${options}`, storageToken);

                    // This event measures only successful cases of getLatest call (no tokens, no retries).
                    const event = PerformanceEvent.start(this.logger, { eventName: "TreesLatest" });

                    try {
                        const response = await this.fetchWrapper.get<IOdspSnapshot>(url, this.documentId, headers);
                        cachedSnapshot = response.content;

                        const props = {
                            trees: cachedSnapshot.trees?.length ?? 0,
                            blobs: cachedSnapshot.blobs?.length ?? 0,
                            ops: cachedSnapshot.ops?.length ?? 0,
                            sprequestguid: response.headers.get("sprequestguid"),
                            sprequestduration: TelemetryLogger.numberFromString(response.headers.get("sprequestduration")),
                            contentsize: TelemetryLogger.numberFromString(response.headers.get("content-length")),
                            bodysize: TelemetryLogger.numberFromString(response.headers.get("body-size")),
                        };
                        event.end(props);
                    } catch (error) {
                        event.cancel({}, error);
                        throw error;
                    }

                    // We are storing the getLatest response in cache for 10s so that other containers initializing in the same timeframe can use this
                    // result. We are choosing a small time period as the summarizes are generated frequently and if that is the case then we don't
                    // want to use the same getLatest result.
                    await this.cache.persistedCache.put(snapshotCacheKey, cachedSnapshot, 10 * 1000 /* durationMs */);
                }
                const odspSnapshot: IOdspSnapshot = cachedSnapshot;

                const { trees, blobs, ops, sha } = odspSnapshot;
                const blobsIdToPathMap: Map<string, string> = new Map();
                if (trees) {
                    let appCommit: string | undefined;
                    this.initTreesCache(trees);
                    for (const [key, treeVal] of this.treesCache.entries()) {
                        if (appCommit) {
                            break;
                        }
                        for (const entry of treeVal.entries) {
                            if (entry.type === "commit" && entry.path === ".app") {
                                // This is the unacked handle of the latest summary generated.
                                appCommit = idFromSpoEntry(entry);
                                break;
                            }
                        }
                        assert(appCommit); // .app commit should be first entry in first entry.
                        for (const entry of treeVal.entries) {
                            if (entry.type === "blob") {
                                blobsIdToPathMap.set(idFromSpoEntry(entry), key === appCommit ? `/.app/${entry.path}` : `/${entry.path}`);
                            }
                        }
                    }
                }

                if (blobs) {
                    this.initBlobsCache(blobs);
                    if (!this.isFirstTimeDocumentOpened) {
                        // Populate the cache with paths from id-to-path mapping.
                        for (const blob of this.blobCache.values()) {
                            const path = blobsIdToPathMap.get(idFromSpoEntry(blob));
                            // If this is the first container that was created for the service, it cannot be
                            // the summarizing container (becauase the summarizing container is always created
                            // after the main container). In this case, we do not need to do any hashing
                            if (path) {
                                // Schedule the hashes for later, but keep track of the tasks
                                // to ensure they finish before they might be used
                                const hashP = hashFile(Buffer.from(blob.content, blob.encoding)).then((hash: string) => {
                                    this.blobsShaToPathCache.set(hash, path);
                                });
                                this.blobsCachePendingHashes.add(hashP);
                                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                                hashP.finally(() => {
                                    this.blobsCachePendingHashes.delete(hashP);
                                });
                            }
                        }
                    }
                }

                this.ops = ops;
                return sha ? [{ id: sha, treeId: undefined! }] : [];
            });
        }

        return getWithRetryForTokenRefresh(async (refresh) => {
            const storageToken = await this.getStorageToken(refresh, "GetVersions");
            const { url, headers } = getUrlAndHeadersWithAuth(`${this.snapshotUrl}/versions?count=${count}`, storageToken);

            // Fetch the latest snapshot versions for the document
            const response = await this.fetchWrapper
                .get<IDocumentStorageGetVersionsResponse>(url, this.documentId, headers);
            const versionsResponse = response.content;
            if (!versionsResponse) {
                throwOdspNetworkError("getVersions returned no response", 400, false);
            }
            if (!Array.isArray(versionsResponse.value)) {
                throwOdspNetworkError("getVersions returned non-array response", 400, false);
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
                    id: idFromSpoEntry(version),
                    treeId: undefined!,
                };
            });
        });
    }

    public async write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        this.checkSnapshotUrl();

        throw new Error("Not supported");
    }

    // back-compat: 0.14 uploadSummary
    public async uploadSummary(tree: api.ISummaryTree): Promise<api.ISummaryHandle> {
        this.checkSnapshotUrl();

        const { result, blobsShaToPathCacheLatest } = await this.writeSummaryTree({
            useContext: false,
            tree,
        });

        if (!result || !idFromSpoEntry(result)) {
            throw new Error(`Failed to write summary tree`);
        }
        if (blobsShaToPathCacheLatest) {
            this.blobsShaToPathCache = blobsShaToPathCacheLatest;
        }

        this.lastSummaryHandle = idFromSpoEntry(result);
        return {
            handle: this.lastSummaryHandle,
            handleType: api.SummaryType.Tree,
            type: api.SummaryType.Handle,
        };
    }

    public async uploadSummaryWithContext(summary: api.ISummaryTree, context: ISummaryContext): Promise<string> {
        this.checkSnapshotUrl();

        // If the last proposed handle is not the proposed handle of the acked summary, clear the cache as the last summary
        // could have got nacked.
        if (context.proposalHandle !== this.blobsShaProposalHandle) {
            this.blobsShaToPathCache.clear();
        }
        this.lastSummaryHandle = context.ackHandle;

        const { result, blobsShaToPathCacheLatest } = await this.writeSummaryTree({
            useContext: true,
            parentHandle: this.lastSummaryHandle,
            tree: summary,
        });
        const id = result ? idFromSpoEntry(result) : undefined;
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
            this.treesCache.set(idFromSpoEntry(tree), tree);
        });
    }

    private initBlobsCache(blobs: IBlob[]) {
        blobs.forEach((blob) => this.blobCache.set(idFromSpoEntry(blob), blob));
    }

    private checkSnapshotUrl() {
        if (!this.snapshotUrl) {
            throwOdspNetworkError("Method not supported because no snapshotUrl was provided", 400, false);
        }
    }

    private async readTree(id: string): Promise<ITree | null> {
        if (!this.snapshotUrl) {
            return null;
        }
        let tree = this.treesCache.get(id);
        if (!tree) {
            tree = await getWithRetryForTokenRefresh(async (refresh: boolean) => {
                const storageToken = await this.getStorageToken(refresh, "ReadTree");

                const response = await fetchSnapshot(this.snapshotUrl!, storageToken, this.fetchWrapper, id, this.fetchFullSnapshot);
                const odspSnapshot: IOdspSnapshot = response.content;
                // OdspSnapshot contain "trees" when the request is made for latest or the root of the tree, for all other cases it will contain "tree" which is the fetched tree with the id
                if (odspSnapshot) {
                    if (odspSnapshot.trees) {
                        this.initTreesCache(odspSnapshot.trees);
                    }
                    if (odspSnapshot.blobs) {
                        this.initBlobsCache(odspSnapshot.blobs);
                    }
                }
                return this.treesCache.get(id);
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

            hierarchicalProtocolTree = buildHierarchy(convertOdspTree(protocolTree));
        } else {
            appTree = await this.readTree(appTreeId);

            hierarchicalProtocolTree = protocolTreeOrId;
        }

        if (!appTree) {
            throw new Error("Invalid app tree");
        }

        const hierarchicalAppTree = buildHierarchy(convertOdspTree(appTree));

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
            id: snapshotTreeId,
            trees: {
                ".protocol": hierarchicalProtocolTree,
                ...hierarchicalAppTree.trees,
            },
        };

        return summarySnapshotTree;
    }

    private async writeSummaryTree(summary: ConditionallyContextedSummary, depth: number = 0): Promise<{ result: ISnapshotResponse, blobsShaToPathCacheLatest?: Map<string, string> }> {
        // Wait for all pending hashes to complete before using them in convertSummaryToSnapshotTree
        await Promise.all(this.blobsCachePendingHashes.values());
        // This cache is associated with mapping sha to path for currently generated summary.
        const blobsShaToPathCacheLatest: Map<string, string> = new Map();
        const snapshotTree = await this.convertSummaryToSnapshotTree(summary, blobsShaToPathCacheLatest);

        const snapshot: ISnapshotRequest = {
            entries: snapshotTree.entries!,
            message: "app",
            sequenceNumber: depth === 0 ? 1 : 2,
            type: SnapshotType.Channel,
        };

        return getWithRetryForTokenRefresh(async (refresh: boolean) => {
            const storageToken = await this.getStorageToken(refresh, "WriteSummaryTree");

            const { url, headers } = getUrlAndHeadersWithAuth(`${this.snapshotUrl}/snapshot`, storageToken);
            headers["Content-Type"] = "application/json";

            const postBody = JSON.stringify(snapshot);

            const response = await this.fetchWrapper.post<ISnapshotResponse>(url, postBody, headers);
            return { result: response.content, blobsShaToPathCacheLatest };
        });
    }

    /**
     * Converts a summary tree to ODSP tree
     */
    private async convertSummaryToSnapshotTree(
        summary: ConditionallyContextedSummary,
        blobsShaToPathCacheLatest: Map<string, string>,
        depth: number = 0,
        path: string = "",
    ): Promise<ISnapshotTree> {
        const snapshotTree: ISnapshotTree = {
            entries: [],
        }!;

        const keys = Object.keys(summary.tree.tree);
        for (const key of keys) {
            const summaryObject = summary.tree.tree[key];

            let id: string | undefined;
            let value: SnapshotTreeValue | undefined;

            switch (summaryObject.type) {
                case api.SummaryType.Tree: {
                    const subtree: ConditionallyContextedSummary = summary.useContext === true ? {
                        useContext: true,
                        parentHandle: summary.parentHandle,
                        tree: summaryObject,
                    } : {
                        useContext: false,
                        tree: summaryObject,
                    };

                    value = await this.convertSummaryToSnapshotTree(
                        subtree,
                        blobsShaToPathCacheLatest,
                        depth + 1,
                        `${path}/${key}`);
                    break;
                }
                case api.SummaryType.Blob: {
                    const content = typeof summaryObject.content === "string" ? summaryObject.content : summaryObject.content.toString("base64");
                    const encoding = typeof summaryObject.content === "string" ? "utf-8" : "base64";

                    // Promises for pending hashes in blobsCachePendingHashes should all have resolved and removed themselves
                    assert(this.blobsCachePendingHashes.size === 0);
                    const hash = await hashFile(Buffer.from(content, encoding));
                    let completePath = this.blobsShaToPathCache.get(hash);
                    // If the cache has the hash of the blob and handle of last summary is also present, then use that
                    // to generate complete path for the given blob.
                    if (!completePath || !this.lastSummaryHandle) {
                        value = {
                            content,
                            encoding,
                        };
                        completePath = `/.app${path}/${key}`;
                        blobsShaToPathCacheLatest.set(hash, completePath);
                    } else {
                        id = `${this.lastSummaryHandle}${completePath}`;
                    }
                    break;
                }
                case api.SummaryType.Handle: {
                    if (summary.useContext === true) {
                        if (!summary.parentHandle) {
                            throw Error("Parent summary does not exist to reference by handle.");
                        }
                        let handlePath = summaryObject.handle;
                        if (handlePath.length > 0 && !handlePath.startsWith("/")) {
                            handlePath = `/${handlePath}`;
                        }
                        id = `${summary.parentHandle}/.app${handlePath}`;
                    } else {
                        // back-compat: 0.14 uploadSummary
                        id = summaryObject.handle;
                    }

                    // TODO: SPO will deprecate this soon
                    if (summaryObject.handleType === api.SummaryType.Commit) {
                        value = {
                            content: id,
                        };
                    }

                    break;
                }
                default: {
                    throw new Error(`Unknown tree type ${summaryObject.type}`);
                }
            }

            const baseEntry: ISnapshotTreeBaseEntry = {
                mode: "100644",
                path: encodeURIComponent(key),
                type: getGitType(summaryObject),
            };

            let entry: SnapshotTreeEntry;

            if (value) {
                entry = {
                    ...baseEntry,
                    id,
                    value,
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

        return snapshotTree;
    }
}

/* eslint-enable max-len */
