/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, stringToBuffer } from "@fluidframework/common-utils";
import * as api from "@fluidframework/protocol-definitions";
import { IOdspSnapshot, IOdspSnapshotCommit } from "./contracts";
import { ISnapshotContents } from "./odspUtils";

/**
 * Build a tree hierarchy base on a flat tree
 *
 * @param flatTree - a flat tree
 * @param blobsShaToPathCache - Map with blobs sha as keys and values as path of the blob.
 * @returns the hierarchical tree
 */
function buildHierarchy(flatTree: IOdspSnapshotCommit): api.ISnapshotTree {
    const lookup: { [path: string]: api.ISnapshotTree; } = {};
    // id is required for root tree as it will be used to determine the version we loaded from.
    const root: api.ISnapshotTree = { id: flatTree.id, blobs: {}, trees: {} };
    lookup[""] = root;

    for (const entry of flatTree.entries) {
        const lastIndex = entry.path.lastIndexOf("/");
        const entryPathDir = entry.path.slice(0, Math.max(0, lastIndex));
        const entryPathBase = entry.path.slice(lastIndex + 1);

        // ODSP snapshots are created breadth-first so we can assume we see tree nodes prior to their contents
        const node = lookup[entryPathDir];

        // Add in either the blob or tree
        if (entry.type === "tree") {
            const newTree: api.ISnapshotTree = {
                blobs: {},
                trees: {},
                unreferenced: entry.unreferenced,
            };
            node.trees[decodeURIComponent(entryPathBase)] = newTree;
            lookup[entry.path] = newTree;
        } else if (entry.type === "blob") {
            node.blobs[decodeURIComponent(entryPathBase)] = entry.id;
        }
    }

    return root;
}

/**
 * Converts existing IOdspSnapshot to snapshot tree, blob array and ops
 * @param odspSnapshot - snapshot
 */
export function convertOdspSnapshotToSnapsohtTreeAndBlobs(
    odspSnapshot: IOdspSnapshot,
): ISnapshotContents {
    const blobsWithBufferContent = new Map<string, ArrayBuffer>();
    if (odspSnapshot.blobs) {
        odspSnapshot.blobs.forEach((blob) => {
            assert(blob.encoding === "base64" || blob.encoding === undefined,
                0x0a4 /* `Unexpected blob encoding type: '${blob.encoding}'` */);
            blobsWithBufferContent.set(blob.id, stringToBuffer(blob.content, blob.encoding ?? "utf8"));
        });
    }
    const val: ISnapshotContents = {
        blobs: blobsWithBufferContent,
        ops: odspSnapshot.ops?.map((op) => op.op) ?? [],
        sequenceNumber: odspSnapshot.trees && (odspSnapshot.trees[0]).sequenceNumber,
        snapshotTree: buildHierarchy(odspSnapshot.trees[0]),
    };
    return val;
}
