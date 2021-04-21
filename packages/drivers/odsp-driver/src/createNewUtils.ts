/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { fromUtf8ToBase64, Uint8ArrayToString } from "@fluidframework/common-utils";
import { IBlob, IOdspSnapshot, ITree, ITreeEntry } from "./contracts";

/**
 * Converts a summary(ISummaryTree) taken in detached container to IOdspSnapshot tree
 */
export function convertSummaryTreeToIOdspSnapshot(summary: ISummaryTree): IOdspSnapshot {
    const trees: ITree[] = [];
    const blobs: IBlob[] = [];
    const mainTree: ITree = {
        entries: [],
        id: uuid(),
        sequenceNumber: 0,
    };
    trees.push(mainTree);
    const snapshotTree: IOdspSnapshot = {
        trees,
        blobs,
        id: mainTree.id,
    };

    convertSummaryTreeToIOdspSnapshotCore(summary, mainTree.entries, blobs);
    return snapshotTree;
}

function convertSummaryTreeToIOdspSnapshotCore(
    summary: ISummaryTree,
    trees: ITreeEntry[],
    blobs: IBlob[],
    path: string = "",
) {
    const keys = Object.keys(summary.tree);
    for (const key of keys) {
        const summaryObject = summary.tree[key];
        const currentPath = path !== "" ? `${path}/${key}` : `${key}`;

        switch (summaryObject.type) {
            case SummaryType.Tree: {
                trees.push({
                    id: uuid(),
                    type: "tree",
                    path: currentPath,
                });
                convertSummaryTreeToIOdspSnapshotCore(summaryObject, trees, blobs, currentPath);
                break;
            }
            case SummaryType.Blob: {
                const content = typeof summaryObject.content === "string" ?
                    fromUtf8ToBase64(summaryObject.content) : Uint8ArrayToString(summaryObject.content, "base64");
                const blob: IBlob = {
                    id: uuid(),
                    encoding: "base64",
                    content,
                    size: content.length,
                };
                blobs.push(blob);
                trees.push({
                    id: blob.id,
                    path: currentPath,
                    type: "blob",
                });
                break;
            }
            case SummaryType.Handle: {
                throw new Error("No handle should be present for detached summary!!");
            }
            default: {
                throw new Error(`Unknown tree type ${summaryObject.type}`);
            }
        }
    }
}
