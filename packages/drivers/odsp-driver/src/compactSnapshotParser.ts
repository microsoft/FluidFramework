/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { ISequencedDeltaOpMessage } from "./contracts";
import { ReadBuffer } from "./zipItDataRepresentationReadUtils";
import { BlobCore, NodeCore, TreeBuilder } from "./zipItDataRepresentationUtils";

export const snapshotMinReadVersion = "1.0";

/**
 *  Header of the downloaded snapshot.
 */
export interface ISnapshotHeader {
    // This is the minimum version of the reader required to read the wire format of a given snapshot.
    minReadVersion: string,
    // Represents the version with which snapshot is created.
    createVersion: string,
    // Seq number at which the snapshot is created.
    snapshotSeqNumber: number,
}

/**
 * Recreates header section and then validate that.
 * @param node - tree node to read header section from
 */
function readAndValidateHeaderSection(node: NodeCore) {
    let minReadVersion: string | undefined;
    let createVersion: string | undefined;
    for (const [headerName, value] of node.iteratePairs()) {
        assert(headerName instanceof BlobCore, "Header name should be string");
        switch(headerName.toString()) {
            case "MinReadVersion": {
                assert(value instanceof BlobCore, "MinReadVersion should be a string");
                minReadVersion = value.toString();
                break;
            }
            case "CreateVersion": {
                assert(value instanceof BlobCore, "CreateVersion should be a string");
                createVersion = value.toString();
                break;
            }
            default: {
                break;
            }
        }
    }

    assert(minReadVersion !== undefined &&
        snapshotMinReadVersion >= minReadVersion, "Driver min read version should >= to server minReadVersion");
    assert(createVersion !== undefined &&
        createVersion >= snapshotMinReadVersion, "Snapshot should be created with minReadVersion or above");
}

/**
 * Recreates dictionary section of the tree.
 * @param node - tree node to read dictionary section from. This container paths/ids mapping
 * to integer representation.
 */
function readDictionarySection(node: NodeCore) {
    const dictionary = new Array<string>();
    for (const name of node) {
        assert(name instanceof BlobCore, "Mapping should be of type BlobCore");
        dictionary.push(name.toString());
    }
    return dictionary;
}

/**
 * Recreates blobs section of the tree.
 * @param node - tree node to read blob section from
 * @param dictionary - name map, used to decode path/IDs.
 */
function readBlobSection(node: NodeCore, dictionary: string[]) {
    const blobs: Map<string, ArrayBuffer> = new Map();
    for (const [idIndex, blob] of node.iteratePairs()) {
        assert(typeof idIndex === "number", "Blob index should be a number");
        assert(blob instanceof BlobCore, "Blob content should be of type blob");
        const blobId = dictionary[idIndex];
        assert(blobId !== undefined, "blob id should be present");
        const unit8Array = blob.buffer;
        blobs.set(blobId,
            unit8Array.buffer.slice(unit8Array.byteOffset, unit8Array.byteOffset + unit8Array.byteLength));
    }
    return blobs;
}

/**
 * Recreates ops section of the tree.
 * @param node - tree node to read ops section from
 */
function readOpsSection(node: NodeCore) {
    const ops: ISequencedDeltaOpMessage[] = [];
    for (let i = 0; i < node.length; ++i) {
        ops.push(JSON.parse(node.getString(i)));
    }
    return ops;
}

/**
 * Recreates snapshot tree out of tree representation.
 * @param treeNode - tree node to de-serialize from
 * @param dictionary - name map, used to decode path/IDs.
 */
function readTreeSection(treeNode: NodeCore, dictionary: string[]) {
    const tree: ISnapshotTree = {
        blobs: {},
        commits: {},
        trees: {},
    };
    for (const [pathIndex, child] of treeNode.iteratePairs()) {
        assert(typeof pathIndex == "number", "Tree index should be a number");
        const path = dictionary[pathIndex];
        assert(path !== undefined, "Path should not be undefined");

        if (child instanceof NodeCore) {
            tree.trees[path] = readTreeSection(child, dictionary);
        } else {
            assert(typeof child == "number", "Should be number to look in dictionary");
            const id = dictionary[child];
            assert(id !== undefined, "Id is out of range");
            tree.blobs[path] = id;
        }
    }
    return tree;
}

/**
 * Converts snapshot from binary compact representation to tree/blobs/ops.
 * @param buffer - Compact snapshot to be parsed into tree/blobs/ops.
 * @returns - tree, blobs and ops from the snapshot.
 */
export function parseCompactSnapshotResponse(buffer: ReadBuffer) {
    const builder = TreeBuilder.load(buffer);
    let ops: ISequencedDeltaOpMessage[] | undefined;

    assert(builder.length === 1, "1 root should be there");
    const root = builder.getNode(0);
    assert(root.length >= 4 && root.length <= 5, "4 or 5 sections should be there");

    readAndValidateHeaderSection(root.getNode(0));

    const dictionary = readDictionarySection(root.getNode(2));

    const tree = readTreeSection(root.getNode(1), dictionary);

    const blobs = readBlobSection(root.getNode(3), dictionary);

    if (root.length === 5) {
        ops = readOpsSection(root.getNode(4));
    }

    return { tree, blobs, ops };
}
