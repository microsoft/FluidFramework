/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, fromBase64ToUtf8, hashFile, IsoBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";
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
import { EpochTracker, FetchType } from "./epochTracker";
import { getUrlAndHeadersWithAuth } from "./getUrlAndHeadersWithAuth";
import { getWithRetryForTokenRefresh } from "./odspUtils";
import { TokenFetchOptions } from "./tokenFetch";

/* eslint-disable max-len */

interface IDedupCaches {
    blobShaToPath: Map<string, string>,
    pathToBlobSha: Map<string, string>,
    treesPathToTree: Map<string, api.ISummaryTree>,
}

export class OdspSummaryUploadManager {
    // This cache is associated with mapping sha to path for previous summary which belongs to last summary handle.
    private blobTreeDedupCaches: IDedupCaches = {
        blobShaToPath: new Map(),
        pathToBlobSha: new Map(),
        treesPathToTree: new Map(),
    };

    private backupBlobTreeDedupCaches: IDedupCaches = {
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

    public async buildCachesForDedup(snapshotTree: api.ISnapshotTree, path: string = ""): Promise<api.ISummaryTree> {
        assert(Object.keys(snapshotTree.commits).length === 0, "There should not be commit tree entries in snapshot");

        const summaryTree: api.ISummaryTree = {
            type: api.SummaryType.Tree,
            tree: {},
        };
        for (const [key, value] of Object.entries(snapshotTree.blobs)) {
            const blobValue = this.blobCache.get(value);
            assert(blobValue !== undefined, "Blob should exists");
            const decodedBlobValue = {
                content: blobValue instanceof ArrayBuffer ? IsoBuffer.from(blobValue).toString("utf8") : fromBase64ToUtf8(blobValue.content),
                encoding: "utf-8",
            };
            const hash = await hashFile(IsoBuffer.from(decodedBlobValue.content, decodedBlobValue.encoding));
            // We are just setting the hash as content but we won't use it anywhere as it doesn't represent the actual content of blob.
            summaryTree.tree[key] = {
                type: api.SummaryType.Blob,
                content: hash,
            };
            const fullBlobPath = path === "" ? `.app/${key}` : `${path}/${key}`;
            this.blobTreeDedupCaches.blobShaToPath.set(hash, fullBlobPath);
            this.blobTreeDedupCaches.pathToBlobSha.set(fullBlobPath, hash);
        }

        for (const [key, tree] of Object.entries(snapshotTree.trees)) {
            const fullTreePath = path === "" ? key === ".protocol" ? `${key}` : ".app" : `${path}/${key}`;
            const subtree = await this.buildCachesForDedup(tree, fullTreePath);
            this.blobTreeDedupCaches.treesPathToTree.set(fullTreePath, subtree);
            summaryTree.tree[key] = subtree;
        }
        return summaryTree;
    }

    public async writeSummaryTree(tree: api.ISummaryTree, context: ISummaryContext) {
        // If the last proposed handle is not the proposed handle of the acked summary(could happen when the last summary get nacked),
        // then re-initialize the caches with the backup ones.
        if (context.proposalHandle !== this.lastSummaryProposalHandle) {
            this.blobTreeDedupCaches = { ...this.backupBlobTreeDedupCaches };
        }
        this.backupBlobTreeDedupCaches = { ...this.blobTreeDedupCaches };

        const { result, blobTreeDedupCachesLatest } = await this.writeSummaryTreeCore(context.ackHandle, tree, 0);
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
        depth: number,
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
            tree,
            blobTreeDedupCachesLatest,
            0,
            ".app",
        );
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
                    return { result: response.content, blobTreeDedupCachesLatest };
                });
        });
    }

    /**
     * Converts a summary tree to ODSP tree
     */
    private async convertSummaryToSnapshotTree(
        parentHandle: string | undefined,
        tree: api.ISummaryTree,
        blobTreeDedupCachesLatest: IDedupCaches,
        depth: number = 0,
        path: string = "",
        expanded: boolean = false,
    ) {
        const snapshotTree: ISnapshotTree = {
            entries: [],
        }!;

        let reusedBlobs = 0;
        let blobs = 0;

        const keys = Object.keys(tree.tree);
        for (const key of keys) {
            const summaryObject = tree.tree[key];

            let id: string | undefined;
            let value: SnapshotTreeValue | undefined;
            const currentPath = `${path}/${key}`;
            switch (summaryObject.type) {
                case api.SummaryType.Tree: {
                    blobTreeDedupCachesLatest.treesPathToTree.set(currentPath, summaryObject);
                    const result = await this.convertSummaryToSnapshotTree(
                        parentHandle,
                        summaryObject,
                        blobTreeDedupCachesLatest,
                        depth + 1,
                        currentPath,
                        expanded);
                    value = result.snapshotTree;
                    reusedBlobs += result.reusedBlobs;
                    blobs += result.blobs;
                    break;
                }
                case api.SummaryType.Blob: {
                    let hash: string | undefined;
                    let cachedPath: string | undefined;
                    // If we are expanding the handle, then the blobPath should exist in the cache as we will get the blob
                    // hash from the cache.
                    if (expanded) {
                        hash = this.blobTreeDedupCaches.pathToBlobSha.get(currentPath);
                        assert(hash !== undefined, "hash should be set here");
                        cachedPath = this.blobTreeDedupCaches.blobShaToPath.get(hash);
                        assert(cachedPath !== undefined, "path should be defined as path->sha mapping exists");
                    } else {
                        value = typeof summaryObject.content === "string"
                        ? { content: summaryObject.content, encoding: "utf-8" }
                        : { content: Uint8ArrayToString(summaryObject.content, "base64"), encoding: "base64" };
                        hash = await hashFile(IsoBuffer.from(value.content, value.encoding));
                    }

                    assert(hash !== undefined, "hash should be set!");
                    // If the cache has the hash of the blob and handle of last summary is also present, then use that
                    // cached path for the given blob.
                    if (cachedPath === undefined || parentHandle === undefined) {
                        blobs++;
                        blobTreeDedupCachesLatest.blobShaToPath.set(hash, currentPath);
                        blobTreeDedupCachesLatest.pathToBlobSha.set(currentPath, hash);
                    } else {
                        reusedBlobs++;
                        id = `${parentHandle}/${cachedPath}`;
                        blobTreeDedupCachesLatest.blobShaToPath.set(hash, currentPath);
                        blobTreeDedupCachesLatest.pathToBlobSha.set(currentPath, hash);
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
                    const pathKey = `${path}${handlePath}`;
                    // We try to get the summary tree from the cache so that we can expand it in order to dedup the blobs.
                    // We always send whole tree no matter what, even if some part of the tree did not change in order to dedup
                    // the blobs. However it may happen that the tree is not found in cache and then we have to use the handle.
                    const summaryTreeToExpand = this.blobTreeDedupCaches.treesPathToTree.get(pathKey);
                    if (summaryTreeToExpand !== undefined) {
                        blobTreeDedupCachesLatest.treesPathToTree.set(currentPath, summaryTreeToExpand);
                        const result = await this.convertSummaryToSnapshotTree(
                            parentHandle,
                            summaryTreeToExpand,
                            blobTreeDedupCachesLatest,
                            depth + 1,
                            currentPath,
                            true);
                        value = result.snapshotTree;
                        reusedBlobs += result.reusedBlobs;
                        blobs += result.blobs;
                    } else {
                        id = `${parentHandle}/${pathKey}`;
                        // TODO: SPO will deprecate this soon
                        if (summaryObject.handleType === api.SummaryType.Commit) {
                            value = {
                                content: id,
                            };
                        }
                    }
                    break;
                }
                case api.SummaryType.Attachment: {
                    id = summaryObject.id;
                    break;
                }
                default: {
                    throw new Error(`Unknown tree type ${summaryObject.type}`);
                }
            }

            const baseEntry: ISnapshotTreeBaseEntry = {
                path: encodeURIComponent(key),
                type: getGitType(summaryObject) === "attachment" ? "blob" : getGitType(summaryObject),
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

        return { snapshotTree, blobs, reusedBlobs };
    }
}

/* eslint-enable max-len */
