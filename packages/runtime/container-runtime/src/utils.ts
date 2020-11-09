/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { ISummarizeResult } from "@fluidframework/runtime-definitions";

export function convertSnapshotToSummaryTree(snapshotTree: ISnapshotTree): ISummarizeResult {
    const builder = new SummaryTreeBuilder();
    for (const [key, value] of Object.entries(snapshotTree.blobs)) {
        // The entries in blobs are supposed to be blobPath -> blobId and blobId -> blobValue
        // and we want to push blobPath to blobValue in tree entries.
        if (snapshotTree.blobs[value] !== undefined) {
            const decoded = fromBase64ToUtf8(snapshotTree.blobs[value]);
            builder.addBlob(key, decoded);
        }
    }
    for (const [key, tree] of Object.entries(snapshotTree.trees)) {
        const subtree = convertSnapshotToSummaryTree(tree);
        builder.addWithStats(key, subtree);
    }
    return builder.getSummaryTree();
}
