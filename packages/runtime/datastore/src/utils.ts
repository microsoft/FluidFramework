/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshotTree, ITreeEntry, ITree } from "@fluidframework/protocol-definitions";
import { BlobTreeEntry, TreeTreeEntry } from "@fluidframework/protocol-base";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";

export function convertSnapshotToITree(snapshotTree: ISnapshotTree): ITree {
    const entries: ITreeEntry[] = [];
    for (const [key, value] of Object.entries(snapshotTree.blobs)) {
        // The entries in blobs are supposed to be blobPath -> blobId and blobId -> blobValue
        // and we want to push blobPath to blobValue in tree entries.
        if (snapshotTree.blobs[value] !== undefined) {
            const decoded = fromBase64ToUtf8(snapshotTree.blobs[value]);
            entries.push(new BlobTreeEntry(key, decoded));
        }
    }
    for (const [key, tree] of Object.entries(snapshotTree.trees)) {
        entries.push(new TreeTreeEntry(key, convertSnapshotToITree(tree)));
    }
    const finalTree: ITree = {
        entries,
        // eslint-disable-next-line no-null/no-null
        id: null,
    };
    return finalTree;
}
