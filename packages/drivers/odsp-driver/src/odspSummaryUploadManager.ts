/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import cloneDeep from "lodash/cloneDeep";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, hashFile, IsoBuffer, Uint8ArrayToString, unreachableCase } from "@fluidframework/common-utils";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { getGitType } from "@fluidframework/protocol-base";
import * as api from "@fluidframework/protocol-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import {
    IBlob,
    ISnapshotRequest,
    ISnapshotResponse,
    ISnapshotTree,
    ISnapshotTreeBaseEntry,
    SnapshotTreeEntry,
    SnapshotTreeValue,
    SnapshotType,
} from "./contracts";
import { EpochTracker } from "./epochTracker";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { getWithRetryForTokenRefresh } from "./odspUtils";
import { TokenFetchOptions } from "./tokenFetch";

/* eslint-disable max-len */

export interface IDedupCaches {
    // Cache which contains mapping from blob sha to the blob path in summary. Path starts from ".app" or ".protocol"
    blobShaToPath: Map<string, string>,
    // Cache which contains mapping from blob path to blob sha in summary. Path starts from ".app" or ".protocol".
    // It is reverse mapping of "blobShaToPath" cache but the number entries in it are always >= number of entries in
    // "blobShaToPath" cache as hash of multiple blobs can be same but not the path. In case the blob contents were not
    // returned during snapshot fetch we will put the value as undefined.
    pathToBlobSha: Map<string, string | undefined>,
    // Cache which contains mapping from trees path to summary tree in the summary. Path starts from ".app" or ".protocol".
    // The stored trees are fully expanded trees. However the blobs content are empty as we don't need them because their
    // hashes are stored in the "pathToBlobSha" cache for a given path.
    treesPathToTree: Map<string, api.ISummaryTree>,
}

/**
 * This class manages a summary upload. First it builts some caches from a downloaded summary which it then uses to dedup
 * blobs in the summary getting uploaded. When it receives a call to upload summary, it converts the summary tree into
 * a snapshot tree and while doing that dedup the blobs in the summary tree from the caches it built.
 */
export class OdspSummaryUploadManager {
    // This cache is associated with mapping sha to path for previous summary which belongs to lastSummaryProposalHandle.
    private blobTreeDedupCaches: IDedupCaches = {
        blobShaToPath: new Map(),
        pathToBlobSha: new Map(),
        treesPathToTree: new Map(),
    };

    // This cache is associated with mapping sha to path for last acked summary. We check this by comparing the lastSummaryProposalHandle
    // which the driver has with the proposedHandle received in summary context in writeSummaryTree call. If they match, it means the last
    // uploaded summary got acked. However if the summary is not acked, then we overwrite the "blobTreeDedupCaches" with this cache.
    private previousBlobTreeDedupCaches: IDedupCaches = {
        blobShaToPath: new Map(),
        pathToBlobSha: new Map(),
        treesPathToTree: new Map(),
    };

    // Last proposed handle of the uploaded app summary.
    private lastSummaryProposalHandle: string | undefined;

    constructor(
        private readonly snapshotUrl: string,
        private readonly getStorageToken: (options: TokenFetchOptions, name?: string) => Promise<string | null>,
        private readonly logger: ITelemetryLogger,
        private readonly epochTracker: EpochTracker,
        private readonly blobCache: Map<string, IBlob | ArrayBuffer> = new Map(),
    ) {
    }

    /**
     * Builts the caches which will be used for blob deduping.
     * @param snapshotTree - snapshot tree from which the dedup caches are built.
     */
    public async buildCachesForDedup(snapshotTree: api.ISnapshotTree) {
        const prefixedSnapshotTree = this.addAppPrefixToSnapshotTree(snapshotTree);
        await this.buildCachesForDedupCore(prefixedSnapshotTree);
        this.previousBlobTreeDedupCaches = { ...this.blobTreeDedupCaches };
    }

    /**
     * Builts the caches which will be used for blob deduping.
     * @param snapshotTree - snapshot tree from which the dedup caches are built.
     * @param path - path of the current node evaluated.
     */
    private async buildCachesForDedupCore(snapshotTree: api.ISnapshotTree, path: string = ""): Promise<api.ISummaryTree> {
        assert(Object.keys(snapshotTree.commits).length === 0, "There should not be commit tree entries in snapshot");

        const summaryTree: api.ISummaryTree = {
            type: api.SummaryType.Tree,
            tree: {},
        };
        for (const [key, value] of Object.entries(snapshotTree.blobs)) {
            // fullBlobPath does not start with "/"
            const fullBlobPath = path === "" ? key : `${path}/${key}`;
            let hash: string | undefined;
            const blobValue = this.blobCache.get(value);
            if (blobValue !== undefined) {
                hash = await hashFile(
                    blobValue instanceof ArrayBuffer ?
                        IsoBuffer.from(blobValue) :
                            IsoBuffer.from(blobValue.content, blobValue.encoding ?? "utf-8"),
                );
                this.blobTreeDedupCaches.blobShaToPath.set(hash, fullBlobPath);
            }
            // We are setting the content as undefined because we won't use it anywhere.
            // Instead we will use the hash of the blob from pathToBlobSha cache.
            summaryTree.tree[key] = {
                type: api.SummaryType.Blob,
                content: "",
            };
            (summaryTree.tree[key] as any).content = undefined;
            this.blobTreeDedupCaches.pathToBlobSha.set(fullBlobPath, hash);
        }

        for (const [key, tree] of Object.entries(snapshotTree.trees)) {
            // fullTreePath does not start with "/"
            const fullTreePath = path === "" ? key : `${path}/${key}`;
            const subtree = await this.buildCachesForDedupCore(tree, fullTreePath);
            this.blobTreeDedupCaches.treesPathToTree.set(fullTreePath, subtree);
            summaryTree.tree[key] = subtree;
        }
        return summaryTree;
    }

    /**
     * Adds ".app" as prefix to paths which belongs to app snapshot tree.
     * @param snapshotTree - Snapshot tree to which complete path will be added.
     */
    private addAppPrefixToSnapshotTree(snapshotTree: api.ISnapshotTree): api.ISnapshotTree {
        const prefixedSnapshotTree: api.ISnapshotTree = {
            id: snapshotTree.id,
            commits: snapshotTree.commits,
            trees: {},
            blobs: {},
        };
        for (const [key, value] of Object.entries(snapshotTree.blobs)) {
            prefixedSnapshotTree.blobs[`.app/${key}`] = value;
        }
        for (const [key, value] of Object.entries(snapshotTree.trees)) {
            prefixedSnapshotTree.trees[key === ".protocol" ? `${key}` : `.app/${key}`] = value;
        }
        return prefixedSnapshotTree;
    }

    public async writeSummaryTree(tree: api.ISummaryTree, context: ISummaryContext) {
        // If the last proposed handle is not the proposed handle of the acked summary(could happen when the last summary get nacked),
        // then re-initialize the caches with the previous ones else just update the previous caches with the caches from acked summary.
        if (context.proposalHandle !== this.lastSummaryProposalHandle) {
            this.logger.sendTelemetryEvent({
                eventName: "LastSummaryProposedHandleMismatch",
                ackedSummaryProposedHandle: context.proposalHandle,
                lastSummaryProposalHandle: this.lastSummaryProposalHandle,
            });
            this.blobTreeDedupCaches = { ...this.previousBlobTreeDedupCaches };
        } else {
            this.previousBlobTreeDedupCaches = { ...this.blobTreeDedupCaches };
        }
        const { result, blobTreeDedupCachesLatest } = await this.writeSummaryTreeCore(context.ackHandle, tree);
        const id = result ? result.id : undefined;
        if (!result || !id) {
            throw new Error(`Failed to write summary tree`);
        }
        this.blobTreeDedupCaches = { ...blobTreeDedupCachesLatest };
        this.lastSummaryProposalHandle = id;
        return id;
    }

    private async writeSummaryTreeCore(
        parentHandle: string | undefined,
        tree: api.ISummaryTree,
    ): Promise<{
            result: ISnapshotResponse,
            blobTreeDedupCachesLatest: IDedupCaches,
    }> {
        // This cache is associated with mapping sha to path for currently generated summary.
        // We are building these caches from scratch as this will take care of the deleted blobs. The deleted blobs/trees will not come
        // in these caches and then we will replace the old caches with these new caches, so that they have the correct values.
        const blobTreeDedupCachesLatest: IDedupCaches = {
            blobShaToPath: new Map(),
            pathToBlobSha: new Map(),
            treesPathToTree: new Map(),
        };
        const { snapshotTree, reusedBlobs, blobs } = await this.convertSummaryToSnapshotTree(
            parentHandle,
            // Clone as we change the blob contents.
            cloneDeep(tree),
            blobTreeDedupCachesLatest,
            ".app",
            true,
            "",
            false,
        );
        const snapshot: ISnapshotRequest = {
            entries: snapshotTree.entries!,
            message: "app",
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
                        "uploadSummary");
                    return { result: response.content, blobTreeDedupCachesLatest };
                });
        });
    }

    /**
     * Following are the goals of this function.
     *  a.) Converts the summary tree to a snapshot/odsp tree to be uploaded. Always upload full snapshot tree.
     *  b.) Blob deduping - Blob deduping means instead of creating a new blob on server we reuse a previous
     *      blob which has same content as the blob being evaluated. In this case we send the server a path
     *      of the previous blob as id so that server can refer to that blob and find out the actual contents
     *      of the blob. We always send the path from the last uploaded summary as we always upload the full
     *      snapshot tree instead of handles.
     *      Handles: Whenever we evaluate a handle in current summary, we expect that a summary tree corresponding
     *               to that handle exists in "treesPathToTree" cache. We get that tree and start evaluating it.
     *               This leads us to dedup any blobs which could be deduped but wasn't because we can't refer to blobs
     *               within same summary due to limitation of server. We set the "expanded" as true in that case.
     *      Blobs: For a blob, we find the hash of the blobs using the contents so that we can match with the ones in
     *             caches and if present we dedup them. Now when the expanded is true we always expect it to be present
     *             in the cache because it means that it was also present in the last summary. So while expanding a handle
     *             we make sure that we are not adding a new blob instead we are just deduping the ones which can be deduped.
     *             If not expanding a handle, we still check whether the blob can de deduped. If so, we use the cachedPath
     *             as id of the blob so that the server can refer to it.
     *  c.) Building new trees/blobs dedup caches so that they can be used to dedup blobs in next summary.
     * @param parentHandle - Handle of the last uploaded summary or detach new summary.
     * @param tree - Summary Tree which will be converted to snapshot tree to be uploaded.
     * @param blobTreeDedupCachesLatest - Blobs/Trees caches which will be build to be used in next summary upload
     *  in order to dedup the blobs.
     * @param rootNodeName - Root node name of the summary tree.
     * @param path - Current path of node which is getting evaluated.
     * @param expanded - True if we are currently expanding a handle by a tree stored in the cache.
     */
    private async convertSummaryToSnapshotTree(
        parentHandle: string | undefined,
        tree: api.ISummaryTree,
        blobTreeDedupCachesLatest: IDedupCaches,
        rootNodeName: string,
        allowHandleExpansion: boolean,
        path: string = "",
        expanded: boolean = false,
    ) {
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
            const currentPath = path === "" ? `${rootNodeName}/${key}` : `${path}/${key}`;
            switch (summaryObject.type) {
                case api.SummaryType.Tree: {
                    blobTreeDedupCachesLatest.treesPathToTree.set(currentPath, summaryObject);
                    const result = await this.convertSummaryToSnapshotTree(
                        parentHandle,
                        summaryObject,
                        blobTreeDedupCachesLatest,
                        rootNodeName,
                        allowHandleExpansion,
                        currentPath,
                        expanded);
                    value = result.snapshotTree;
                    unreferenced = summaryObject.unreferenced;
                    reusedBlobs += result.reusedBlobs;
                    blobs += result.blobs;
                    break;
                }
                case api.SummaryType.Blob: {
                    let hash: string | undefined;
                    let cachedPath: string | undefined;
                    // If we are expanding the handle, then the currentPath should exist in the cache as we will get the blob
                    // hash from the cache.
                    if (expanded) {
                        hash = this.blobTreeDedupCaches.pathToBlobSha.get(currentPath);
                        if (hash !== undefined) {
                            cachedPath = this.blobTreeDedupCaches.blobShaToPath.get(hash);
                            assert(cachedPath !== undefined, "path should be defined as path->sha mapping exists");
                        } else {
                            // We may not have the blob hash in case its contents were not returned during snapshot fetch.
                            // In that case just put the current path as cached path as its contents should not have changed
                            // in expansion flow.
                            cachedPath = currentPath;
                        }
                    } else {
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
                        hash = await hashFile(IsoBuffer.from(value.content, value.encoding));
                        cachedPath = this.blobTreeDedupCaches.blobShaToPath.get(hash);
                    }
                    (summaryObject as any).content = undefined;
                    // If the cache has the hash of the blob and handle of last summary is also present, then use that
                    // cached path for the given blob. Also update the caches for future use.
                    if (cachedPath === undefined || parentHandle === undefined) {
                        blobs++;
                    } else {
                        reusedBlobs++;
                        id = `${parentHandle}/${cachedPath}`;
                        value = undefined;
                    }
                    if (hash !== undefined) {
                        blobTreeDedupCachesLatest.blobShaToPath.set(hash, currentPath);
                    }
                    blobTreeDedupCachesLatest.pathToBlobSha.set(currentPath, hash);
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
                    const pathKey = `${rootNodeName}${handlePath}`;
                    // We try to get the summary tree from the cache so that we can expand it in order to dedup the blobs.
                    // We always send whole tree no matter what, even if some part of the tree did not change in order to dedup
                    // the blobs.
                    const summaryTreeToExpand = this.blobTreeDedupCaches.treesPathToTree.get(pathKey);
                    if (summaryTreeToExpand !== undefined && allowHandleExpansion) {
                        blobTreeDedupCachesLatest.treesPathToTree.set(currentPath, summaryTreeToExpand);
                        const result = await this.convertSummaryToSnapshotTree(
                            parentHandle,
                            summaryTreeToExpand,
                            blobTreeDedupCachesLatest,
                            rootNodeName,
                            allowHandleExpansion,
                            currentPath,
                            true);
                        value = result.snapshotTree;
                        unreferenced = summaryTreeToExpand.unreferenced;
                        reusedBlobs += result.reusedBlobs;
                        blobs += result.blobs;
                    } else {
                        // Ideally we should not come here as we should have found it in cache. But in order to successfully upload the summary
                        // we are just logging the event. Once we make sure that we don't have any telemetry for this, we would remove this.
                        this.logger.sendErrorEvent({ eventName: "SummaryTreeHandleCacheMiss", parentHandle, handlePath: pathKey });
                        id = `${parentHandle}/${pathKey}`;
                    }
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
