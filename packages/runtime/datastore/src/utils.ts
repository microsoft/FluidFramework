/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISnapshotTree, ITreeEntry, ITree } from "@fluidframework/protocol-definitions";
import { BlobTreeEntry, TreeTreeEntry } from "@fluidframework/protocol-base";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";

export function convertSnapshotToITree(snapshotTree: ISnapshotTree): ITree {
    const entries: ITreeEntry[] = [];
    const blobMapInitial = new Map(Object.entries(snapshotTree.blobs));
    const blobMapFinal = new Map<string, string>();
    for (const [key, value] of blobMapInitial.entries()) {
        if (blobMapInitial.has(value)) {
            blobMapFinal[key] = blobMapInitial.get(value);
        }
    }
    for (const [key, value] of Object.entries(blobMapFinal)) {
        const decoded = fromBase64ToUtf8(value);
        entries.push(new BlobTreeEntry(key, decoded));
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
