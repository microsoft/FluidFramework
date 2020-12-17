/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, IsoBuffer } from "@fluidframework/common-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";

import { IBlob, IOdspSnapshot, ISequencedDeltaOpMessage } from "./contracts";
import {
    TreeBuilder,
    Node,
} from "./tree";
import { OdspSnapshotCache } from "./odspDocumentStorageManager";

/*
export interface ISnapshotTree {
    id: string | null;
    blobs: { [path: string]: string };
    commits: { [path: string]: string };
    trees: { [path: string]: ISnapshotTree };
}
*/

function processTree(trees: Node, tree: ISnapshotTree) {
    const treeNode = trees.addNode();
    treeNode.addString(tree.id!);

    const subTree = treeNode.addNode();
    for (const [path, value] of Object.entries(tree.trees)) {
        subTree.addString(path);
        subTree.addString(value.id!);
        processTree(trees, value);
    }

    if (tree.blobs) {
        const subBlobs = treeNode.addNode();
        for (const [path, id] of Object.entries(tree.blobs)) {
            subBlobs.addString(path);
            subBlobs.addString(id);
        }
    }
}

function convertSnapshotTreeToCompactTree(
    builder: TreeBuilder,
    snapshotTree: ISnapshotTree,
    ops?: ISequencedDeltaOpMessage[])
{
    const trees = builder.addNode();
    trees.addString("trees");

    processTree(trees, snapshotTree);

    if (ops) {
        const opsNode = builder.addNode();
        opsNode.addString("ops");
        opsNode.addString(JSON.stringify(ops));
    }
}

export function convertOdspSnapshotToSnapsohtTreeAndBlobs(odspSnapshot: IOdspSnapshot) {
    const cache = new OdspSnapshotCache();
    cache.initTreesCache(odspSnapshot.trees);
    // versionId is the id of the first tree
    if (odspSnapshot.blobs) {
        cache.initBlobsCache(odspSnapshot.blobs);
    }
    const iTree = cache.treesCache.get(odspSnapshot.trees[0].id);
    assert(iTree !== undefined);
    const snapshotTree = cache.snapshotTreeFromITree(iTree);
    return { snapshotTree, blobs: cache.blobCache };
}

export function convertOdspSnapshotToCompactSnapshot(
    snapshotTree: ISnapshotTree,
    blobs: Map<string, IBlob>,
    ops?: ISequencedDeltaOpMessage[])
{
    const builder = new TreeBuilder();

    convertSnapshotTreeToCompactTree(builder, snapshotTree, ops);

    const blobsNode = builder.addNode();
    blobsNode.addString("blobs");
    for (const [id, blob] of blobs) {
        blobsNode.addString(id);
        blobsNode.addBlob(IsoBuffer.from(blob.content, blob.encoding ?? "utf-8"));
    }

    return builder.serialize();
}
