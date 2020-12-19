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

function buildDictionary(tree: ISnapshotTree, dict: Set<string>) {
    for (const [path, value] of Object.entries(tree.trees)) {
        dict.add(path);
        buildDictionary(value, dict);
    }

    for (const path of Object.keys(tree.blobs)) {
        dict.add(path);
    }
}

function processTree(trees: Node, tree: ISnapshotTree, mapping: Map<string, number>) {
    for (const [path, value] of Object.entries(tree.trees)) {
        const treeNode = trees.addNode();
        treeNode.addNumber(mapping[path]);
        processTree(treeNode, value, mapping);
    }

    if (tree.blobs) {
        for (const [path, id] of Object.entries(tree.blobs)) {
            trees.addNumber(mapping[path]);
            trees.addNumber(mapping[id]);
        }
    }
}

export function convertOdspSnapshotToCompactSnapshot(
    snapshotTree: ISnapshotTree,
    blobs: Map<string, IBlob>,
    ops?: ISequencedDeltaOpMessage[])
{
    const dict: Set<string> = new Set();
    buildDictionary(snapshotTree, dict);
    for (const id of blobs.keys()) {
        dict.add(id);
    }

    const builder = new TreeBuilder();

    const mappingNode = builder.addNode();
    mappingNode.addString("mappings");

    const mapping = new Map<string, number>();
    let i = 0;
    for (const id of dict) {
        mapping[id] = i;
        mappingNode.addString(id);
        i++;
    }

    const trees = builder.addNode();
    trees.addString("trees");

    processTree(trees, snapshotTree, mapping);

    const blobsNode = builder.addNode();
    blobsNode.addString("blobs");
    for (const [id, blob] of blobs) {
        blobsNode.addNumber(mapping[id]);
        blobsNode.addBlob(IsoBuffer.from(blob.content, blob.encoding ?? "utf-8"));
    }

    if (ops) {
        const opsNode = builder.addNode();
        opsNode.addString("ops");
        opsNode.addString(JSON.stringify(ops));
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
