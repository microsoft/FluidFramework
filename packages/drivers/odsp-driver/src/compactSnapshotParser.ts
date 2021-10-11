/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { ISnapshotContents } from "./odspUtils";
import { ReadBuffer } from "./ReadBufferUtils";
import { BlobCore, getAndValidateNodeProps, NodeCore, TreeBuilder } from "./zipItDataRepresentationUtils";

export const snapshotMinReadVersion = "1.0";

interface ISnapshotSection {
    blobs: Map<string, ArrayBuffer>,
    snapshotTree: ISnapshotTree,
    sequenceNumber: number,
}

/**
 * Recreates blobs section of the tree.
 * @param node - tree node to read blob section from
 */
function readBlobSection(node: NodeCore) {
    const blobs: Map<string, ArrayBuffer> = new Map();
    for (let count = 0; count < node.length; ++count) {
        let id: string | undefined;
        const blob = node.getNode(count);
        for (let i = 0; i < blob.length;) {
            const key = blob.getString(i++);
            switch (key) {
                case "id":
                    assert(id === undefined, "id should be undefined here");
                    id = blob.getString(i++);
                    break;
                case "data":
                    assert(id !== undefined, "id should be defined before reading contents");
                    blobs.set(id, blob.getBlob(i++).arrayBuffer);
                    break;
                default:
                    throw new Error(`unkonwnPropertyWhileReadingBlobs: ${key}`);
            }
        }
        id = undefined;
    }
    return blobs;
}

/**
 * Recreates ops section of the tree.
 * @param node - tree node to read ops section from
 */
function readOpsSection(node: NodeCore) {
    const ops: ISequencedDocumentMessage[] = [];
    for (let i = 0; i < node.length; ++i) {
        ops.push(JSON.parse(node.getString(i)));
    }
    return ops;
}

/**
 * Recreates snapshot tree out of tree representation.
 * @param node - tree node to de-serialize from
 */
function readTreeSection(node: NodeCore) {
    const tree: ISnapshotTree = {
        blobs: {},
        commits: {},
        trees: {},
    };
    for (let count = 0; count < node.length;) {
        const treeNode = node.getNode(count++);
        let path: string | undefined;
        for (let i = 0; i < treeNode.length;) {
            const prop = treeNode.getString(i++);
            switch(prop) {
                case "name":
                    path = treeNode.getString(i++);
                    break;
                case "value":
                    assert(path !== undefined, "path should be defined to put value");
                    tree.blobs[path] = treeNode.getString(i++);
                    break;
                case "children":
                    assert(path !== undefined, "path should be defined to put value");
                    tree.trees[path] = readTreeSection(treeNode.getNode(i++));
                    break;
                case "unreferenced":
                {
                    const unreferenced = treeNode.getBool(i++);
                    assert(unreferenced, "Unreferenced if present should be true");
                    tree.unreferenced = unreferenced;
                    break;
                }
                default:
                    throw new Error(`unkonwnPropertyWhileReadingTree: ${prop}`);
            }
        }
        path = undefined;
    }
    return tree;
}

/**
 * Recreates snapshot tree out of tree representation.
 * @param node - tree node to de-serialize from
 */
function readSnapshotSection(node: NodeCore): ISnapshotSection {
    let snapshotTree: ISnapshotTree | undefined;
    let snapshotId: string | undefined;
    let sequenceNumber: number | undefined;
    let blobs: Map<string, ArrayBuffer> | undefined;
    for (let count = 0; count < node.length;) {
        const prop = node.getString(count++);
        switch(prop) {
            case "snapshotId":
                snapshotId = node.getString(count++);
                break;
            case "sequenceNumber":
                sequenceNumber = node.getNumber(count++);
                break;
            case "message":
                node.getString(count++);
                break;
            case "treeNodes":
                snapshotTree = readTreeSection(node.getNode(count++));
                break;
            case "treeBlobs":
                blobs = readBlobSection(node.getNode(count++));
                break;
            default:
                throw new Error(`unkonwnPropertyWhileReadingSnapshot: ${prop}`);
        }
    }
    assert(snapshotTree !== undefined, "Tree structure should be present");
    assert(snapshotId !== undefined, "Snapshot id should be present");
    snapshotTree.id = snapshotId;
    assert(sequenceNumber !== undefined, "seqNum should be present in snapshot");
    assert(blobs !== undefined, "Blobs should be present in snapshot");
    return {
        sequenceNumber,
        blobs,
        snapshotTree,
    };
}

/**
 * Converts snapshot from binary compact representation to tree/blobs/ops.
 * @param buffer - Compact snapshot to be parsed into tree/blobs/ops.
 * @returns - tree, blobs and ops from the snapshot.
 */
export function parseCompactSnapshotResponse(buffer: ReadBuffer): ISnapshotContents {
    const builder = TreeBuilder.load(buffer);
    assert(builder.length === 1, 0x219 /* "1 root should be there" */);
    const root = builder.getNode(0);
    let snapshotSection: ISnapshotSection | undefined;
    let ops: ISequencedDocumentMessage[] | undefined;

    for (let count = 0; count < root.length;) {
        const prop = root.getString(count++);
        switch(prop) {
            case "minReadVersion":
            {
                const minReadVersion = root.getString(count++);
                assert(snapshotMinReadVersion >= minReadVersion,
                    0x20f /* "Driver min read version should >= to server minReadVersion" */);
                break;
            }
            case "createVersion":
            {
                const createVersion = root.getString(count++);
                assert(createVersion >= snapshotMinReadVersion,
                    0x210 /* "Snapshot should be created with minReadVersion or above" */);
                break;
            }
            case "latestSequenceNumber":
                root.getNumber(count++);
                break;
            case "snapshot":
                snapshotSection = readSnapshotSection(root.getNode(count++));
                break;
            case "deltas":
                ops = readOpsSection(root.getNode(count++));
                break;
            default:
                throw new Error(`unkonwnPropertyWhileReadingSnapshotResponse: ${prop}`);
        }
    }
    assert(snapshotSection !== undefined, "snapshot section should be present in snapshot");
    return {
        ...snapshotSection,
        ops: ops ?? [],
    };
}

interface IWholeSnapshot {
    minReadVersion: string,
    createVersion: string,
    latestSequenceNumber: number,
    snapshot: NodeCore,
    deltas: NodeCore,
}
