/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, stringToBuffer } from "@fluidframework/common-utils";
import { IBlob, ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { snapshotMinReadVersion } from "./compactSnapshotParser";
import { ISnapshotContents } from "./odspPublicUtils";
import { TreeBuilderSerializer } from "./WriteBufferUtils";
import {
    addBoolProperty,
    addNumberProperty,
    addStringProperty,
    addDictionaryStringProperty,
    NodeCore,
} from "./zipItDataRepresentationUtils";

/**
 * Writes header section of the snapshot.
 * @param node - snapshot node to serialize to
 * @param latestSequenceNumber - latest seq number of the container.
*/
function writeSnapshotProps(node: NodeCore, latestSequenceNumber: number) {
    addStringProperty(node, "mrv", snapshotMinReadVersion);
    addStringProperty(node, "cv", snapshotMinReadVersion);
    addNumberProperty(node, "lsn", latestSequenceNumber);
}

/**
 * Represents blobs in the tree.
 * @param snapshotNode - node to serialize to.
 * @param blobs - blobs that is being serialized
*/
function writeBlobsSection(snapshotNode: NodeCore, blobs: Map<string, IBlob | ArrayBuffer>) {
    snapshotNode.addDictionaryString("blobs");
    const blobsNode = snapshotNode.addNode("list");
    for (const [storageBlobId, blob] of blobs) {
        const blobNode = blobsNode.addNode();
        addDictionaryStringProperty(blobNode, "id", storageBlobId);
        blobNode.addString("data");
        if (blob instanceof ArrayBuffer) {
            blobNode.addBlob(new Uint8Array(blob));
        } else {
            blobNode.addBlob(new Uint8Array(stringToBuffer(blob.contents, blob.encoding ?? "utf-8")));
        }
    }
}

/**
 * Represents and serializes tree part of the snapshot
 * @param snapshotNode - tree node to serialize to
 * @param snapshotTree - snapshot tree that is being serialized
*/
function writeTreeSection(snapshotNode: NodeCore, snapshotTree: ISnapshotTree) {
    snapshotNode.addDictionaryString("treeNodes");
    const treesNode = snapshotNode.addNode("list");
    writeTreeSectionCore(treesNode, snapshotTree);
}

function writeTreeSectionCore(treesNode: NodeCore, snapshotTree: ISnapshotTree) {
    for (const [path, value] of Object.entries(snapshotTree.trees)) {
        const treeNode = treesNode.addNode();
        // Many leaf nodes in the tree have same names like "content", "body", "header"
        // We could be smarter here and not use dictionary where we are sure reuse is unlikely, but
        // it does not feel like it's worth it.
        addDictionaryStringProperty(treeNode, "name", path);
        if (snapshotTree.unreferenced) {
            addBoolProperty(treeNode, "unreferenced", snapshotTree.unreferenced);
        }
        // Only write children prop if either blobs or trees are present.
        if (Object.keys(value.blobs).length > 0 || Object.keys(value.trees).length > 0) {
            treeNode.addDictionaryString("children");
            const childNode = treeNode.addNode("list");
            writeTreeSectionCore(childNode, value);
        }
    }

    if (snapshotTree.blobs) {
        for (const [path, id] of Object.entries(snapshotTree.blobs)) {
            const blobNode = treesNode.addNode();
            addDictionaryStringProperty(blobNode, "name", path);
            addDictionaryStringProperty(blobNode, "value", id);
        }
    }
}

/**
 * Represents (serializes) snapshot tree as generalizes tree
 * @param rootNode - tree node to serialize to
 * @param snapshotTree - snapshot tree that is being serialized
 * @param blobs - blobs mapping of the snapshot
 * @param snapshotSequenceNumber - seq number at which snapshot is taken
*/
function writeSnapshotSection(
    rootNode: NodeCore,
    snapshotTree: ISnapshotTree,
    snapshotSequenceNumber: number,
) {
    rootNode.addDictionaryString("snapshot");
    const snapshotNode = rootNode.addNode();

    const snapshotId = snapshotTree.id;
    assert(snapshotId !== undefined, 0x21b /* "Snapshot id should be provided" */);
    addStringProperty(snapshotNode, "id", snapshotId);
    addStringProperty(snapshotNode, "message", `Snapshot@${snapshotSequenceNumber}`);
    addNumberProperty(snapshotNode, "sequenceNumber", snapshotSequenceNumber);

    // Add Trees
    writeTreeSection(snapshotNode, snapshotTree);
}

/**
 * Represents ops in the tree.
 * @param rootNode - node to serialize to.
 * @param ops - ops that is being serialized
*/
function writeOpsSection(rootNode: NodeCore, ops: ISequencedDocumentMessage[]) {
    let firstSequenceNumber: number | undefined;
    if (ops.length > 0) {
        firstSequenceNumber = ops[0].sequenceNumber;
    }
    if (firstSequenceNumber !== undefined) {
        rootNode.addDictionaryString("deltas");
        const opsNode = rootNode.addNode();
        addNumberProperty(opsNode, "firstSequenceNumber", firstSequenceNumber);
        opsNode.addDictionaryString("deltas");
        const deltaNode = opsNode.addNode("list");
        ops.forEach((op) => {
            deltaNode.addString(JSON.stringify(op));
        });
    }
}

/**
 * Converts trees/blobs/ops to binary compact representation.
 * @param snapshotContents - snapshot tree contents to serialize
 * @returns - ReadBuffer - binary representation of the data.
 */
export function convertToCompactSnapshot(snapshotContents: ISnapshotContents): Uint8Array {
    const builder = new TreeBuilderSerializer();
    // Create the root node.
    const rootNode = builder.addNode();
    assert(snapshotContents.sequenceNumber !== undefined, 0x21c /* "Seq number should be provided" */);

    const latestSequenceNumber = snapshotContents.latestSequenceNumber ??
        snapshotContents.ops.length > 0 ?
        snapshotContents.ops[snapshotContents.ops.length - 1].sequenceNumber : snapshotContents.sequenceNumber;

    writeSnapshotProps(rootNode, latestSequenceNumber);

    writeSnapshotSection(
        rootNode,
        snapshotContents.snapshotTree,
        snapshotContents.sequenceNumber,
    );

    // Add Blobs
    writeBlobsSection(rootNode, snapshotContents.blobs);

    // Then write the ops node.
    writeOpsSection(rootNode, snapshotContents.ops);

    return builder.serialize();
}
