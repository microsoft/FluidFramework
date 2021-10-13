/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { ISnapshotContents } from "./odspUtils";
import { ReadBuffer } from "./ReadBufferUtils";
import {
    assertBlobCoreInstance,
    assertBoolInstance,
    assertNodeCoreInstance,
    assertNumberInstance,
    getAndValidateNodeProps,
    NodeCore,
    TreeBuilder,
} from "./zipItDataRepresentationUtils";

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
        const blob = node.getNode(count);
        const records = getAndValidateNodeProps(blob, ["id", "data"]);
        assertBlobCoreInstance(records.data, "data should be of BlobCore type");
        assertBlobCoreInstance(records.id, "blob id should be of BlobCore type");
        blobs.set(records.id.toString(), records.data.arrayBuffer);
    }
    return blobs;
}

/**
 * Recreates ops section of the tree.
 * @param node - tree node to read ops section from
 */
function readOpsSection(node: NodeCore) {
    const ops: ISequencedDocumentMessage[] = [];
    const records = getAndValidateNodeProps(node, ["firstSequenceNumber", "deltas"]);
    assertNumberInstance(records.firstSequenceNumber, "Seq number should be a number");
    assertNodeCoreInstance(records.deltas, "Deltas should be a Node");
    for (let i = 0; i < records.deltas.length; ++i) {
        ops.push(JSON.parse(records.deltas.getString(i)));
    }
    assert(records.firstSequenceNumber.valueOf() === ops[0].sequenceNumber, "Validate first op seq number");
    return ops;
}

/**
 * Recreates snapshot tree out of tree representation.
 * @param node - tree node to de-serialize from
 */
function readTreeSection(node: NodeCore) {
    const snapshotTree: ISnapshotTree = {
        blobs: {},
        commits: {},
        trees: {},
    };
    for (let count = 0; count < node.length; count++) {
        const treeNode = node.getNode(count);
        const records = getAndValidateNodeProps(treeNode,
            ["name", "value", "children", "unreferenced"], false);
        assertBlobCoreInstance(records.name, "Path should be of BlobCore");
        const path = records.name.toString();
        if (records.value !== undefined) {
            assertBlobCoreInstance(records.value, "Blob value should be BlobCore");
            snapshotTree.blobs[path] = records.value.toString();
        } else {
            assertNodeCoreInstance(records.children, "Trees should be of type NodeCore");
            snapshotTree.trees[path] = readTreeSection(records.children);
        }
        if (snapshotTree.unreferenced !== undefined) {
            assertBoolInstance(records.unreferenced, "Unreferenced flag should be bool");
            const unreferenced = records.unreferenced.valueOf();
            assert(unreferenced, "Unreferenced if present should be true");
            snapshotTree.unreferenced = unreferenced;
        }
    }
    return snapshotTree;
}

/**
 * Recreates snapshot tree out of tree representation.
 * @param node - tree node to de-serialize from
 */
function readSnapshotSection(node: NodeCore): ISnapshotSection {
    const records = getAndValidateNodeProps(node,
        ["snapshotId", "sequenceNumber", "treeNodes", "blobs"]);

    assertNodeCoreInstance(records.treeNodes, "TreeNodes should be of type NodeCore");
    assertNodeCoreInstance(records.blobs, "TreeBlobs should be of type NodeCore");
    assertNumberInstance(records.sequenceNumber, "sequenceNumber should be of type number");
    assertBlobCoreInstance(records.snapshotId, "snapshotId should be BlobCore");
    const snapshotTree: ISnapshotTree = readTreeSection(records.treeNodes);
    snapshotTree.id = records.snapshotId.toString();
    const sequenceNumber = records.sequenceNumber.valueOf();
    return {
        sequenceNumber,
        blobs: readBlobSection(records.blobs),
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

    const records = getAndValidateNodeProps(root,
        ["minReadVersion", "createVersion", "snapshot", "deltas"]);

    assertBlobCoreInstance(records.minReadVersion, "minReadVersion should be of BlobCore type");
    assertBlobCoreInstance(records.createVersion, "createVersion should be of BlobCore type");
    assert(snapshotMinReadVersion >= records.minReadVersion.toString(),
        0x20f /* "Driver min read version should >= to server minReadVersion" */);
    assert(records.createVersion.toString() >= snapshotMinReadVersion,
        0x210 /* "Snapshot should be created with minReadVersion or above" */);

    assertNodeCoreInstance(records.snapshot, "Snapshot should be of type NodeCore");
    assertNodeCoreInstance(records.deltas, "Deltas should be of type NodeCore");

    return {
        ...readSnapshotSection(records.snapshot),
        ops: readOpsSection(records.deltas),
    };
}
