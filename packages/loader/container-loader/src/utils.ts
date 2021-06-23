/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import { v4 as uuid } from "uuid";
import { assert, bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import { ISummaryTree, ISnapshotTree, SummaryType } from "@fluidframework/protocol-definitions";

export interface IParsedUrl {
    id: string;
    path: string;
    query: string;
    /**
     * Null means do not use snapshots, undefined means load latest snapshot
     * otherwise it's version ID passed to IDocumentStorageService.getVersions() to figure out what snapshot to use.
     * If needed, can add undefined which is treated by Container.load() as load latest snapshot.
     */
    version: string | null | undefined;
}

export function parseUrl(url: string): IParsedUrl | undefined {
    const parsed = parse(url, true);
    if (typeof parsed.pathname !== "string") {
        throw new Error("Failed to parse pathname");
    }
    const query = parsed.search ?? "";
    const regex = /^\/([^/]*\/[^/]*)(\/?.*)$/;
    const match = regex.exec(parsed.pathname);
    return (match?.length === 3)
        ? { id: match[1], path: match[2], query, version: parsed.query.version as string }
        : undefined;
}

/**
 * Converts summary tree (for upload) to snapshot tree (for download).
 * Summary tree blobs contain contents, but snapshot tree blobs normally
 * contain IDs pointing to storage. This will create 2 blob entries in the
 * snapshot tree for each blob in the summary tree. One will be the regular
 * path pointing to a uniquely generated ID. Then there will be another
 * entry with the path as that uniquely generated ID, and value as the
 * blob contents as a base-64 string.
 * @param summary - summary to convert
 */
function convertSummaryToSnapshotWithEmbeddedBlobContents(
    summary: ISummaryTree,
    blobs: Map<string, ArrayBufferLike>,
): ISnapshotTree {
    const treeNode: ISnapshotTree = {
        blobs: {},
        trees: {},
        commits: {},
        id: uuid(),
        unreferenced: summary.unreferenced,
    };
    const keys = Object.keys(summary.tree);
    for (const key of keys) {
        const summaryObject = summary.tree[key];

        switch (summaryObject.type) {
            case SummaryType.Tree: {
                treeNode.trees[key] = convertSummaryToSnapshotWithEmbeddedBlobContents(summaryObject, blobs);
                break;
            }
            case SummaryType.Blob: {
                const blobId = uuid();
                treeNode.blobs[key] = blobId;
                const contentBuffer = typeof summaryObject.content === "string" ?
                    stringToBuffer(summaryObject.content, "utf8") : summaryObject.content;
                blobs.set(blobId, contentBuffer);
                treeNode.blobs[blobId] = bufferToString(contentBuffer, "base64");
                break;
            }
            case SummaryType.Handle:
                throw new Error("No handles should be there in summary in detached container!!");
                break;
            default: {
                throw new Error(`Unknown tree type ${summaryObject.type}`);
            }
        }
    }
    return treeNode;
}

/**
 * Combine and convert protocol and app summary tree to format which is readable by container while rehydrating.
 * @param protocolSummaryTree - Protocol Summary Tree
 * @param appSummaryTree - App Summary Tree
 */
export function convertProtocolAndAppSummaryToSnapshotTree(
    protocolSummaryTree: ISummaryTree,
    appSummaryTree: ISummaryTree,
) {
    // Shallow copy is fine, since we are doing a deep clone below.
    const combinedSummary: ISummaryTree = {
        type: SummaryType.Tree,
        tree: { ...appSummaryTree.tree },
    };

    combinedSummary.tree[".protocol"] = protocolSummaryTree;
    const blobs = new Map<string, ArrayBufferLike>();
    const snapshotTree = convertSummaryToSnapshotWithEmbeddedBlobContents(combinedSummary, blobs);
    return { snapshotTree, blobs };
}

// This function converts the snapshot taken in detached container(by serialize api) to snapshotTree with which
// a detached container can be rehydrated.
export const getSnapshotTreeFromSerializedContainer = (detachedContainerSnapshot: ISummaryTree) => {
    const protocolSummaryTree = detachedContainerSnapshot.tree[".protocol"] as ISummaryTree;
    const appSummaryTree = detachedContainerSnapshot.tree[".app"] as ISummaryTree;
    assert(protocolSummaryTree !== undefined && appSummaryTree !== undefined,
        0x1e0 /* "Protocol and App summary trees should be present" */);
    const { snapshotTree, blobs } = convertProtocolAndAppSummaryToSnapshotTree(
        protocolSummaryTree,
        appSummaryTree,
    );
    return { snapshotTree, blobs };
};
