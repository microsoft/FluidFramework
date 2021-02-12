/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert, IsoBuffer, hashFile, stringToBuffer } from "@fluidframework/common-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";

import { IBlob, IOdspSnapshot, ISequencedDeltaOpMessage } from "./contracts";
import {
    TreeBuilder,
    Node,
    ReadBuffer,
    BlobCore,
} from "./tree";
import { OdspSnapshotCache } from "./odspDocumentStorageManager";

/**
 * Converts existing IOdspSnapshot to snapshot tree, blob array and ops
 * @param odspSnapshot - snapshot
 */
export function convertOdspSnapshotToSnapsohtTreeAndBlobs(odspSnapshot: IOdspSnapshot) {
    const cache = new OdspSnapshotCache();
    cache.initTreesCache(odspSnapshot.trees);
    // versionId is the id of the first tree
    if (odspSnapshot.blobs) {
        cache.addBlobs(odspSnapshot.blobs);
    }
    const iTree = cache.treesCache.get(odspSnapshot.trees[0].id);
    assert(iTree !== undefined);
    const tree = cache.snapshotTreeFromITree(iTree);
    return { tree, blobs: cache.value, ops: odspSnapshot.ops };
}

/**
 * Helper function used to remap blob IDs
 * Used to do various manipulations, like blob de-duping, compaction of ID space, etc.
 * @param tree - snapshot tree
 * @param mapping - map that provides mapping for blob IDs.
 */
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

/**
 * De-dup blobs. Calculates SHA checksum for all blobs, finds and collapses duplicates.
 * @param snapshotTree - snapshot tree. Changed in place, and assumes usage in conjunction with returned blobs.
 * @param blobs - array of blobs
 * @returns - new array of blobs.
 */
export async function dedupBlobs(snapshotTree: ISnapshotTree, blobs: Map<string, Uint8Array>) {
    const hashToId = new Map<string, string>();
    const idToId = new Map<string, string>();
    const newBlobs = new Map<string, IBlob | ArrayBuffer>();
    for (const [id, blob] of blobs) {
        const sha = await hashFile(IsoBuffer.from(blob, blob.byteOffset, blob.byteLength));
        if (!hashToId.has(sha)) {
            hashToId.set(sha, id);
            newBlobs.set(id, blob);
        }
        idToId.set(id, hashToId.get(sha)!);
    }
    replaceBlobs(snapshotTree, idToId);
    return newBlobs;
}

/**
 * Shortens IDs of blobs - replaces them with newly generated IDs that are shorter in size
 * @param snapshotTree - snapshot tree. Changed in place, and assumes usage in conjunction with returned blobs.
 * @param blobs - array of blobs
 * @returns - new array of blobs.
 */
export function shortenBlobIds(snapshotTree: ISnapshotTree, blobs: Map<string, Uint8Array>) {
    const idToId = new Map<string, string>();
    const newBlobs = new Map<string, IBlob | ArrayBuffer>();
    let counter = 0;
    for (const [id, blob] of blobs) {
        const newId = counter.toString(36);
        counter++;
        newBlobs.set(newId, blob);
        idToId.set(id, newId);
    }
    replaceBlobs(snapshotTree, idToId);
    return newBlobs;
}

/**
 * Decodes base64 or utf-8 blobs and returns back blobs in ArrayBuffer format.
 */
export function unpackIBlobs(blobs: Map<string, IBlob | ArrayBuffer>) {
    const newBlobs = new Map<string, Uint8Array>();
    for (const [id, blob] of blobs) {
        if (blob instanceof ArrayBuffer) {
            newBlobs.set(id, new Uint8Array(blob));
        } else {
            newBlobs.set(id, new Uint8Array(stringToBuffer(blob.content, blob.encoding ?? "uint-8")));
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

/**
 * Represents (serializes) snapshot tree as generalizes tree
 * @param treeNode - tree node to serialize to
 * @param tree - snapshot tree that is being serialized
 * @param mapping - name mapping, used to map path and IDs to integer representation
 */
function writeTree(treeNode: Node, tree: ISnapshotTree, mapping: Map<string, number>) {
    for (const [path, value] of Object.entries(tree.trees)) {
        treeNode.addNumber(mapping.get(path));
        writeTree(treeNode.addNode(), value, mapping);
    }

    if (tree.blobs) {
        for (const [path, id] of Object.entries(tree.blobs)) {
            treeNode.addNumber(mapping.get(path));
            treeNode.addNumber(mapping.get(id));
        }
    }

    if (tree.props) {
        for (const [path, value] of Object.entries(tree.props)) {
            treeNode.addNumber(mapping.get(path));
            treeNode.addString(value);
        }
    }
}

/**
 * Recreates snapshot tree out of tree representation.
 * @param node - tree node to de-serialize from
 * @param mapping - name map, used to decode path/IDs.
 */
function readTree(treeNode: Node, mapping: string[]) {
    const tree: ISnapshotTree = {
        id: "id",
        blobs: {},
        commits: {},
        trees: {},
    };
    for (const [pathIndex, child] of treeNode.iteratePairs()) {
        assert(typeof pathIndex == "number");
        const path = mapping[pathIndex];
        assert(path !== undefined);

        if (child instanceof Node) {
            tree.trees[path] = readTree(child, mapping);
        } else if (typeof child == "number") {
            const id = mapping[child];
            assert(id !== undefined);
            tree.blobs[path] = id;
        } else {
            assert(child instanceof BlobCore);
            tree.props[path] = child.toString();
        }
    }
}

    return tree;
}

/**
 * Build dictionary to be able to represent paths and IDs more compactly
 * Adds to a set all known names such that later on they can have integer representation
 * This substantially reduced representation, as same path name or ID can be used many times.
 * @param tree - snapshot tree.
 * @param dict - dictionary, all path and IDs are added to it.
 */
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

    for (const path of Object.keys(tree.props)) {
        dict.add(path);
    }
}

/**
 * Converts ODSP snapshot format to binary compact representation.
 * @param snapshotTree - snapshot tree to serialize
 * @param blobs - blobs to serialize
 * @param ops - ops to serialize
 * @returns - ReadBuffer - binary representation of the data.
 */
export function convertOdspSnapshotToCompactSnapshot(
    snapshotTree: ISnapshotTree,
    blobs: Map<string, IBlob | Uint8Array>,
    ops?: ISequencedDeltaOpMessage[]): ReadBuffer
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
    for (const [storageBlobId, blob] of blobs) {
        blobsNode.addNumber(mapping.get(storageBlobId));
        if (blob instanceof Uint8Array) {
            blobsNode.addBlob(blob);
        } else {
            blobsNode.addBlob(new Uint8Array(stringToBuffer(blob.content, blob.encoding ?? "utf-8")));
        }
    }

    if (ops) {
        const opsNode = builder.addNode();
        opsNode.addString(JSON.stringify(ops));
    }

    return builder.serialize();
}

/**
 * De-serializes compact representation of snapshot
 * @param buffer - ReadBuffer, binary representation
 * @returns - snapshot tree, blobs, ops
 */
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
