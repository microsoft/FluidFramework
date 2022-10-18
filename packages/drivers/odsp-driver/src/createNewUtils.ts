/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ISummaryTree, SummaryType, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { getDocAttributesFromProtocolSummary } from "@fluidframework/driver-utils";
import { stringToBuffer, unreachableCase } from "@fluidframework/common-utils";
import { ISnapshotContents } from "./odspPublicUtils";

/**
 * Converts a summary(ISummaryTree) taken in detached container to snapshot tree and blobs
 */
export function convertCreateNewSummaryTreeToTreeAndBlobs(summary: ISummaryTree, treeId: string): ISnapshotContents {
    const protocolSummary = summary.tree[".protocol"] as ISummaryTree;
    const documentAttributes = getDocAttributesFromProtocolSummary(protocolSummary);
    const sequenceNumber = documentAttributes.sequenceNumber;
    const blobs = new Map<string, ArrayBuffer>();
    const snapshotTree = convertCreateNewSummaryTreeToTreeAndBlobsCore(summary, blobs);
    snapshotTree.id = treeId;
    const snapshotTreeValue: ISnapshotContents = {
        snapshotTree,
        blobs,
        ops: [],
        sequenceNumber,
        latestSequenceNumber: sequenceNumber,
    };

    return snapshotTreeValue;
}

function convertCreateNewSummaryTreeToTreeAndBlobsCore(
    summary: ISummaryTree,
    blobs: Map<string, ArrayBuffer>,
) {
    const treeNode: ISnapshotTree = {
        blobs: {},
        trees: {},
        unreferenced: summary.unreferenced,
    };
    const keys = Object.keys(summary.tree);
    for (const key of keys) {
        const summaryObject = summary.tree[key];

        switch (summaryObject.type) {
            case SummaryType.Tree: {
                treeNode.trees[key] =
                    convertCreateNewSummaryTreeToTreeAndBlobsCore(summaryObject, blobs);
                break;
            }
            case SummaryType.Blob: {
                const contentBuffer = typeof summaryObject.content === "string" ?
                    stringToBuffer(summaryObject.content, "utf8") : summaryObject.content;
                const blobId = uuid();
                treeNode.blobs[key] = blobId;
                blobs.set(blobId, contentBuffer);
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
    return treeNode;
}
