/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Buffer } from "buffer";
import {
    SummaryObject,
    ISummaryTree,
    ISnapshotTree,
    ISummaryBlob,
    SummaryType,
} from "@fluidframework/protocol-definitions";

export function convertSnapshotToSummaryTree(snapshotTree: ISnapshotTree): ISummaryTree {
    const entries: {[index: string]: SummaryObject} = {};
    const blobMapInitial = new Map(Object.entries(snapshotTree.blobs));
    const blobMapFinal = new Map<string, string>();
    for (const [key, value] of blobMapInitial.entries()) {
        if (blobMapInitial.has(value)) {
            blobMapFinal[key] = blobMapInitial.get(value);
        }
    }
    for (const [key, value] of Object.entries(blobMapFinal)) {
        const decoded = Buffer.from(value, "base64").toString();
        const summaryBlob: ISummaryBlob = {
            content: decoded,
            type: SummaryType.Blob,
        };
        entries[key] = summaryBlob;
    }
    for (const [key, tree] of Object.entries(snapshotTree.trees)) {
        entries[key] = convertSnapshotToSummaryTree(tree);
    }
    const summaryTree: ISummaryTree = {
        tree: entries,
        type: SummaryType.Tree,
    };
    return summaryTree;
}
