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
    ReadBuffer,
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

export function convertCompactSnapshotToSnapshotTree(buffer: ReadBuffer) {
    const builder = TreeBuilder.load(buffer);
    let ops: string | undefined;
    const blobs: Map<string, Uint8Array> = new Map();

    for (const n of builder) {
        const node = (n as Node);
        const el = node.getString(0);
        switch (el) {
            case "trees":
                for (let i = 1; i < node.length; i++) {
                    const trees = node.getNode(i);
                    assert(trees.length === 3);

                    trees.getString(0);
                    /*
                    const tree: ISnapshotTree = {
                        id: treeNode.getString(0),
                        blobs: {},
                        commits: {},
                        trees: {},
                    };
                    */
                    const subTrees = trees.getNode(1);
                    for (let j = 0; j < subTrees.length;) {
                        // tree.trees[]
                        subTrees.getString(j); // path
                        subTrees.getString(j + 1); // id
                        j += 2;
                    }

                    const blobNode = trees.getNode(2);
                    for (let j = 0; j < blobNode.length;) {
                        blobs.set(blobNode.getString(j), blobNode.getBlob(j + 1).buffer);
                        j += 2;
                    }
                    break;
                }
            case "blobs":
            case "ops":
                ops = node.getString(1);
                break;
            default:
                throw new Error(`Unknown node: ${el}`);
        }
    }
    return ops;
}
