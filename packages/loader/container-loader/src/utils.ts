/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import { fromUtf8ToBase64, Uint8ArrayToString } from "@fluidframework/common-utils";
import { ISummaryTree, ISnapshotTree, SummaryType } from "@fluidframework/protocol-definitions";
import { v4 as uuid } from "uuid";

export interface IParsedUrl {
    id: string;
    path: string;
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

    const regex = /^\/([^/]*\/[^/]*)(\/?.*)$/;
    const match = regex.exec(parsed.pathname);

    return (match?.length === 3)
        ? { id: match[1], path: match[2], version: parsed.query.version as string }
        : undefined;
}

function convertProtocolAndAppSummaryToSnapshotTreeCore(
    summary: ISummaryTree,
): ISnapshotTree {
    const treeNode = {
        blobs: {},
        trees: {},
        commits: {},
        id: uuid(),
    };
    const keys = Object.keys(summary.tree);
    for (const key of keys) {
        const summaryObject = summary.tree[key];

        switch (summaryObject.type) {
            case SummaryType.Tree: {
                treeNode.trees[key] = convertProtocolAndAppSummaryToSnapshotTreeCore(summaryObject);
                break;
            }
            case SummaryType.Blob: {
                const blobId = uuid();
                treeNode.blobs[key] = blobId;
                const content = typeof summaryObject.content === "string" ?
                    summaryObject.content : Uint8ArrayToString(summaryObject.content, "base64");
                treeNode.blobs[blobId] = fromUtf8ToBase64(content);
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
): ISnapshotTree {
    const protocolSummaryTreeModified: ISummaryTree = {
        type: SummaryType.Tree,
        tree: {
            ".protocol": {
                type: SummaryType.Tree,
                tree: { ...protocolSummaryTree.tree },
            },
        },
    };
    const snapshotTree = convertProtocolAndAppSummaryToSnapshotTreeCore(protocolSummaryTreeModified);
    snapshotTree.trees = {
        ...snapshotTree.trees,
        ...convertProtocolAndAppSummaryToSnapshotTreeCore(appSummaryTree).trees,
    };

    return snapshotTree;
}
