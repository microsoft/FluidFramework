/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { getDocAttributesFromProtocolSummary } from "@fluidframework/driver-utils";
import { Uint8ArrayToString, unreachableCase } from "@fluidframework/common-utils";
import { IOdspSnapshotBlob, IOdspSnapshot, IOdspSnapshotTreeEntry } from "./contracts";

/**
 * Converts a summary(ISummaryTree) taken in detached container to IOdspSnapshot tree
 */
export function convertCreateNewSummaryTreeToIOdspSnapshot(summary: ISummaryTree, treeId: string): IOdspSnapshot {
    const protocolSummary = summary.tree[".protocol"] as ISummaryTree;
    const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
    const sequenceNumber = documentAttributes.sequenceNumber;
    const blobs: IOdspSnapshotBlob[] = [];
    const snapshotTree: IOdspSnapshot = {
        trees: [
            {
                entries: [],
                id: treeId,
                sequenceNumber,
            },
        ],
        blobs,
        id: treeId,
    };

    convertSummaryTreeToIOdspSnapshotCore(summary, snapshotTree.trees[0].entries, blobs);
    return snapshotTree;
}

function convertSummaryTreeToIOdspSnapshotCore(
    summary: ISummaryTree,
    trees: IOdspSnapshotTreeEntry[],
    blobs: IOdspSnapshotBlob[],
    path: string = "",
) {
    const keys = Object.keys(summary.tree);
    for (const key of keys) {
        const summaryObject = summary.tree[key];
        const currentPath = path !== "" ? `${path}/${key}` : `${key}`;

        switch (summaryObject.type) {
            case SummaryType.Tree: {
                trees.push({
                    type: "tree",
                    path: currentPath,
                    unreferenced: summaryObject.unreferenced,
                });
                convertSummaryTreeToIOdspSnapshotCore(summaryObject, trees, blobs, currentPath);
                break;
            }
            case SummaryType.Blob: {
                const content = typeof summaryObject.content === "string" ?
                    summaryObject.content : Uint8ArrayToString(summaryObject.content, "base64");
                const blob: IOdspSnapshotBlob = {
                    id: uuid(),
                    encoding: typeof summaryObject.content === "string" ? undefined : "base64",
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
            case SummaryType.Handle:
            case SummaryType.Attachment: {
                throw new Error(`No ${summaryObject.type} should be present for detached summary!`);
            }
            default: {
                unreachableCase(summaryObject, `Unknown tree type ${(summaryObject as any).type}`);
            }
        }
    }
}
