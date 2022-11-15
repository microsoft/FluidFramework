/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import { v4 as uuid } from "uuid";
import {
    assert,
    stringToBuffer,
    Uint8ArrayToArrayBuffer,
    unreachableCase,
} from "@fluidframework/common-utils";
import { ISummaryTree, ISnapshotTree, SummaryType } from "@fluidframework/protocol-definitions";
import { LoggingError } from "@fluidframework/telemetry-utils";

// This is used when we rehydrate a container from the snapshot. Here we put the blob contents
// in separate property: blobContents.
export interface ISnapshotTreeWithBlobContents extends ISnapshotTree {
    blobsContents: { [path: string]: ArrayBufferLike; };
    trees: { [path: string]: ISnapshotTreeWithBlobContents; };
}

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
        throw new LoggingError("Failed to parse pathname");
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
): ISnapshotTreeWithBlobContents {
    const treeNode: ISnapshotTreeWithBlobContents = {
        blobs: {},
        blobsContents: {},
        trees: {},
        id: uuid(),
        unreferenced: summary.unreferenced,
    };
    const keys = Object.keys(summary.tree);
    for (const key of keys) {
        const summaryObject = summary.tree[key];

        switch (summaryObject.type) {
            case SummaryType.Tree: {
                treeNode.trees[key] = convertSummaryToSnapshotWithEmbeddedBlobContents(summaryObject);
                break;
            }
            case SummaryType.Attachment:
                treeNode.blobs[key] = summaryObject.id;
                break;
            case SummaryType.Blob: {
                const blobId = uuid();
                treeNode.blobs[key] = blobId;
                const contentBuffer = typeof summaryObject.content === "string" ?
                    stringToBuffer(summaryObject.content, "utf8") : Uint8ArrayToArrayBuffer(summaryObject.content);
                treeNode.blobsContents[blobId] = contentBuffer;
                break;
            }
            case SummaryType.Handle:
                throw new LoggingError("No handles should be there in summary in detached container!!");
                break;
            default: {
                unreachableCase(summaryObject, `Unknown tree type ${(summaryObject as any).type}`);
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
): ISnapshotTreeWithBlobContents {
    // Shallow copy is fine, since we are doing a deep clone below.
    const combinedSummary: ISummaryTree = {
        type: SummaryType.Tree,
        tree: { ...appSummaryTree.tree },
    };

    combinedSummary.tree[".protocol"] = protocolSummaryTree;
    const snapshotTreeWithBlobContents =
        convertSummaryToSnapshotWithEmbeddedBlobContents(combinedSummary);
    return snapshotTreeWithBlobContents;
}

// This function converts the snapshot taken in detached container(by serialize api) to snapshotTree with which
// a detached container can be rehydrated.
export const getSnapshotTreeFromSerializedContainer = (detachedContainerSnapshot: ISummaryTree) => {
    const protocolSummaryTree = detachedContainerSnapshot.tree[".protocol"] as ISummaryTree;
    const appSummaryTree = detachedContainerSnapshot.tree[".app"] as ISummaryTree;
    assert(protocolSummaryTree !== undefined && appSummaryTree !== undefined,
        0x1e0 /* "Protocol and App summary trees should be present" */);
    const snapshotTreeWithBlobContents = convertProtocolAndAppSummaryToSnapshotTree(
        protocolSummaryTree,
        appSummaryTree,
    );
    return snapshotTreeWithBlobContents;
};

export function getProtocolSnapshotTree(snapshot: ISnapshotTree): ISnapshotTree {
    return ".protocol" in snapshot.trees ? snapshot.trees[".protocol"] : snapshot;
}
