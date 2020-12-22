/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, IsoBuffer, hashFile } from "@fluidframework/common-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";

import { IBlob, IOdspSnapshot, ISequencedDeltaOpMessage } from "./contracts";
import {
    TreeBuilder,
    Node,
    ReadBuffer,
    BlobCore,
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
    return { snapshotTree, blobs: cache.blobCache, ops: odspSnapshot.ops };
}

function replaceBlobs(tree: ISnapshotTree, mapping: Map<string, string>) {
    for (const value of Object.values(tree.trees)) {
        replaceBlobs(value, mapping);
    }
    for (const [path, id] of Object.entries(tree.blobs)) {
        const newId = mapping.get(id);
        // blob might be missing, i.e. downloaded on demand.
        if (newId !== undefined) {
            tree.blobs[path] = newId;
        }
    }
}

export async function dedupBlobs(snapshotTree: ISnapshotTree, blobs: Map<string, IBlob | Uint8Array>) {
    const hashToId = new Map<string, string>();
    const idToId = new Map<string, string>();
    const newBlobs = new Map<string, IBlob | Uint8Array>();
    for (const [id, blob] of blobs) {
        let sha: string;
        if (blob instanceof Uint8Array) {
            sha = await hashFile(blob);
        } else {
            sha = await hashFile(IsoBuffer.from(blob.content, blob.encoding));
        }
        if (!hashToId.has(sha)) {
            hashToId.set(sha, id);
            newBlobs.set(id, blob);
        }
        idToId.set(id, hashToId.get(sha)!);
    }
    replaceBlobs(snapshotTree, idToId);
    return newBlobs;
}

export function shortenBlobIds(snapshotTree: ISnapshotTree, blobs: Map<string, IBlob | Uint8Array>) {
    const idToId = new Map<string, string>();
    const newBlobs = new Map<string, IBlob | Uint8Array>();
    let counter = 0;
    for (const [id, blob] of blobs) {
        const newId = counter.toString(36);
        counter++;
        if (blob instanceof Uint8Array) {
            newBlobs.set(newId, blob);
        } else {
            newBlobs.set(newId, { ...blob, id: newId });
        }
        idToId.set(id, newId);
    }
    replaceBlobs(snapshotTree, idToId);
    return newBlobs;
}

export function unpackBlobs(blobs: Map<string, IBlob | Uint8Array>) {
    const newBlobs = new Map<string, Uint8Array>();
    for (const [id, blob] of blobs) {
        if (blob instanceof Uint8Array) {
            newBlobs.set(id, blob);
        } else {
            newBlobs.set(id, IsoBuffer.from(blob.content, blob.encoding));
        }
    }
    return newBlobs;
}

/**
 * Useful for debugging purposes only.
 *
export function identityReplacement(snapshotTree: ISnapshotTree, blobs: Map<string, IBlob>) {
    const idToId = new Map<string, string>();
    const newBlobs = new Map<string, IBlob>();
    for (const [id, blob] of blobs) {
        newBlobs.set(id, blob);
        idToId.set(id, id);
    }
    replaceBlobs(snapshotTree, idToId);
    return newBlobs;
}
*/

function writeTree(trees: Node, tree: ISnapshotTree, mapping: Map<string, number>) {
    for (const [path, value] of Object.entries(tree.trees)) {
        trees.addNumber(mapping.get(path));
        writeTree(trees.addNode(), value, mapping);
    }

    if (tree.blobs) {
        for (const [path, id] of Object.entries(tree.blobs)) {
            trees.addNumber(mapping.get(path));
            trees.addNumber(mapping.get(id));
        }
    }
}

function readTree(node: Node, mapping: string[]) {
    const tree: ISnapshotTree = {
        id: "id",
        blobs: {},
        commits: {},
        trees: {},
    };
    for (const [pathIndex, child] of node.iteratePairs()) {
        assert(typeof pathIndex == "number");
        const path = mapping[pathIndex];
        assert(path !== undefined);

        if (child instanceof Node) {
            tree.trees[path] = readTree(child, mapping);
        } else {
            assert (typeof child == "number");
            const id = mapping[child];
            assert(id !== undefined);
            tree.blobs[path] = id;
        }
    }

    return tree;
}

function buildDictionary(tree: ISnapshotTree, dict: Set<string>) {
    for (const [path, value] of Object.entries(tree.trees)) {
        dict.add(path);
        buildDictionary(value, dict);
    }

    for (const [path, value] of Object.entries(tree.blobs)) {
        dict.add(path);
        // Some blob payload might be missing, so their IDs will only show up in the tree
        dict.add(value);
    }
}

export function convertOdspSnapshotToCompactSnapshot(
    snapshotTree: ISnapshotTree,
    blobs: Map<string, IBlob | Uint8Array>,
    ops?: ISequencedDeltaOpMessage[])
{
    const dict: Set<string> = new Set();

    buildDictionary(snapshotTree, dict);
    for (const id of blobs.keys()) {
        dict.add(id);
    }

    const builder = new TreeBuilder();

    const mappingNode = builder.addNode();

    const mapping = new Map<string, number>();
    let i = 0;
    for (const id of dict) {
        mapping.set(id, i);
        mappingNode.addString(id);
        i++;
    }

    writeTree(builder.addNode(), snapshotTree, mapping);

    const blobsNode = builder.addNode();
    for (const [id, blob] of blobs) {
        blobsNode.addNumber(mapping.get(id));
        if (blob instanceof Uint8Array) {
            blobsNode.addBlob(blob);
        } else {
            blobsNode.addBlob(IsoBuffer.from(blob.content, blob.encoding ?? "utf-8"));
        }
    }

    if (ops) {
        const opsNode = builder.addNode();
        opsNode.addString(JSON.stringify(ops));
    }

    return builder.serialize();
}

export function convertCompactSnapshotToSnapshotTree(buffer: ReadBuffer) {
    const builder = TreeBuilder.load(buffer);
    let ops: ISequencedDeltaOpMessage[] | undefined;
    const blobs: Map<string, Uint8Array> = new Map();
    const mapping: string[] = [];

    assert(builder.length >= 3 && builder.length <= 4, "length");

    for (const name of builder.getNode(0)) {
        assert(name instanceof BlobCore, "mapping");
        mapping.push(name.toString());
    }

    const tree = readTree(builder.getNode(1), mapping);

    for (const [idIndex, blob] of builder.getNode(2).iteratePairs()) {
        assert(typeof idIndex == "number", "blob index");
        assert(blob instanceof BlobCore, "blob content");
        const id = mapping[idIndex];
        assert(id !== undefined, "blob id");
        blobs.set(id, blob.buffer);
    }

    if (builder.length === 4) {
        const opsNode = builder.getNode(3);
        assert (opsNode.length === 1, "ops");
        ops = JSON.parse(opsNode.getString(0)) as ISequencedDeltaOpMessage[];
    }

    return { tree, blobs, ops };
}
