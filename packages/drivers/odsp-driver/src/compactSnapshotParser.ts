/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { ISnapshotContents } from "./odspPublicUtils";
import { ReadBuffer } from "./ReadBufferUtils";
import { ISnapshotTreeEx } from "./contracts";
import {
    assertBlobCoreInstance,
    getStringInstance,
    assertBoolInstance,
    assertNodeCoreInstance,
    assertNumberInstance,
    getNodeProps,
    NodeCore,
    NodeTypes,
    TreeBuilder,
} from "./zipItDataRepresentationUtils";

export const snapshotMinReadVersion = "1.0";
export const currentReadVersion = "1.0";

interface ISnapshotSection {
    snapshotTree: ISnapshotTree;
    sequenceNumber: number;
}

/**
 * Recreates blobs section of the tree.
 * @param node - tree node to read blob section from
 */
function readBlobSection(node: NodeTypes) {
    assertNodeCoreInstance(node, "TreeBlobs should be of type NodeCore");
    const blobs: Map<string, ArrayBuffer> = new Map();
    for (let count = 0; count < node.length; ++count) {
        const blob = node.getNode(count);
        const records = getNodeProps(blob);
        assertBlobCoreInstance(records.data, "data should be of BlobCore type");
        const id = getStringInstance(records.id, "blob id should be of BlobCore type");
        blobs.set(id, records.data.arrayBuffer);
    }
    return blobs;
}

/**
 * Recreates ops section of the tree.
 * @param node - tree node to read ops section from
 */
function readOpsSection(node: NodeTypes) {
    assertNodeCoreInstance(node, "Deltas should be of type NodeCore");
    const ops: ISequencedDocumentMessage[] = [];
    const records = getNodeProps(node);
    assertNumberInstance(records.firstSequenceNumber, "Seq number should be a number");
    assertNodeCoreInstance(records.deltas, "Deltas should be a Node");
    for (let i = 0; i < records.deltas.length; ++i) {
        ops.push(JSON.parse(records.deltas.getString(i)));
    }
    assert(records.firstSequenceNumber.valueOf() === ops[0].sequenceNumber,
        0x280 /* "Validate first op seq number" */);
    return ops;
}

/**
 * Recreates snapshot tree out of tree representation.
 * @param node - tree node to de-serialize from
 */
function readTreeSection(node: NodeCore) {
    const snapshotTree: ISnapshotTreeEx = {
        blobs: {},
        commits: {},
        trees: {},
    };
    for (let count = 0; count < node.length; count++) {
        const treeNode = node.getNode(count);
        const records = getNodeProps(treeNode);
        const path = getStringInstance(records.name, "Path should be of BlobCore");
        if (records.value !== undefined) {
            const value = getStringInstance(records.value, "Blob value should be BlobCore");
            snapshotTree.blobs[path] = value;
        } else if (records.children !== undefined) {
            assertNodeCoreInstance(records.children, "Trees should be of type NodeCore");
            snapshotTree.trees[path] = readTreeSection(records.children);
        } else {
            snapshotTree.trees[path] = { blobs: {}, commits: {}, trees: {} };
        }
        if (records.unreferenced !== undefined) {
            assertBoolInstance(records.unreferenced, "Unreferenced flag should be bool");
            const unreferenced = records.unreferenced.valueOf();
            assert(unreferenced, 0x281 /* "Unreferenced if present should be true" */);
            snapshotTree.unreferenced = unreferenced;
        }
    }
    return snapshotTree;
}

/**
 * Recreates snapshot tree out of tree representation.
 * @param node - tree node to de-serialize from
 */
function readSnapshotSection(node: NodeTypes): ISnapshotSection {
    assertNodeCoreInstance(node, "Snapshot should be of type NodeCore");
    const records = getNodeProps(node);

    assertNodeCoreInstance(records.treeNodes, "TreeNodes should be of type NodeCore");
    assertNumberInstance(records.sequenceNumber, "sequenceNumber should be of type number");
    const snapshotTree: ISnapshotTree = readTreeSection(records.treeNodes);
    snapshotTree.id = getStringInstance(records.id, "snapshotId should be BlobCore");
    const sequenceNumber = records.sequenceNumber.valueOf();
    return {
        sequenceNumber,
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

    const records = getNodeProps(root);

    const mrv = getStringInstance(records.mrv, "minReadVersion should be of BlobCore type");
    const cv = getStringInstance(records.cv, "createVersion should be of BlobCore type");
    if (records.lsn !== undefined) {
        assertNumberInstance(records.lsn, "lsn should be a number");
    }

    assert(parseFloat(snapshotMinReadVersion) >= parseFloat(mrv),
        0x20f /* "Driver min read version should >= to server minReadVersion" */);
    assert(parseFloat(cv) >= parseFloat(snapshotMinReadVersion),
        0x210 /* "Snapshot should be created with minReadVersion or above" */);
    assert(currentReadVersion === cv,
        0x2c2 /* "Create Version should be equal to currentReadVersion" */);

    return {
        ...readSnapshotSection(records.snapshot),
        blobs: readBlobSection(records.blobs),
        ops: records.deltas !== undefined ? readOpsSection(records.deltas) : [],
        latestSequenceNumber: records.lsn,
    };
}
