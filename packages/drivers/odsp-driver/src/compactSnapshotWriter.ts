/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { stringToBuffer } from "@fluidframework/common-utils";
import { IBlob, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { snapshotMinReadVersion } from "./compactSnapshotParser";
import { ISequencedDeltaOpMessage } from "./contracts";
import { ReadBuffer } from "./zipItDataRepresentationReadUtils";
import { NodeCore, TreeBuilder } from "./zipItDataRepresentationUtils";

/**
 * Writes header section of the snapshot.
 * @param node - tree node to serialize to
 * @param snapshotSeqNumber - seq number at which snapshot is created.
*/
function writeHeaderSection(node: NodeCore, snapshotSeqNumber: number) {
    node.addString("MinReadVersion");
    node.addString(snapshotMinReadVersion);
    node.addString("CreateVersion");
    node.addString(snapshotMinReadVersion);
    node.addString("SnapshotSequenceNumber");
    node.addNumber(snapshotSeqNumber);
}

/**
 * Build dictionary to be able to represent paths and IDs more compactly
 * Adds to a set all known names such that later on they can have integer representation
 * This substantially reduced representation, as same path name or ID can be used many times.
 * @param tree - snapshot tree.
 * @param dict - dictionary, all path and IDs are added to it.
*/
function buildDictionary(snapshotTree: ISnapshotTree, dict: Set<string>) {
    for (const [path, childTree] of Object.entries(snapshotTree.trees)) {
        dict.add(path);
        buildDictionary(childTree, dict);
    }

    for (const [path, _] of Object.entries(snapshotTree.blobs)) {
        dict.add(path);
    }
}

/**
 * Represents (serializes) snapshot tree as generalizes tree
 * @param treeNode - tree node to serialize to
 * @param tree - snapshot tree that is being serialized
 * @param mapping - name mapping, used to map path and IDs to integer representation
*/
function writeTree(treeNode: NodeCore, tree: ISnapshotTree, mapping: Map<string, number>) {
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
}

/**
 * Represents blobs in the tree.
 * @param node - node to serialize to.
 * @param blobs - blobs that is being serialized
 * @param mapping - name mapping, used to map path and IDs to integer representation
*/
function writeBlobsSection(node: NodeCore, blobs: Map<string, IBlob | ArrayBuffer>, mapping: Map<string, number>) {
    for (const [storageBlobId, blob] of blobs) {
        node.addNumber(mapping.get(storageBlobId));
        if (blob instanceof ArrayBuffer) {
            node.addBlob(new Uint8Array(blob));
        } else {
            node.addBlob(new Uint8Array(stringToBuffer(blob.contents, blob.encoding ?? "utf-8")));
        }
    }
}

/**
 * Represents ops in the tree.
 * @param node - node to serialize to.
 * @param ops - ops that is being serialized
*/
function writeOpsSection(node: NodeCore, ops: ISequencedDeltaOpMessage[]) {
    ops.forEach((op) => {
        node.addString(JSON.stringify(op));
    });
}

/**
 * Converts trees/blobs/ops to binary compact representation.
 * @param snapshotTree - snapshot tree to serialize
 * @param blobs - blobs to serialize
 * @param snapshotSeqNumber - seq number at which snapshot is created.
 * @param ops - ops to serialize
 * @returns - ReadBuffer - binary representation of the data.
 */
export function convertToCompactSnapshot(
    snapshotTree: ISnapshotTree,
    blobs: Map<string, IBlob | ArrayBuffer>,
    snapshotSeqNumber: number,
    ops?: ISequencedDeltaOpMessage[]): ReadBuffer
{
    const builder = new TreeBuilder();
    // Create the root node.
    const rootNode = builder.addNode();
    // Header node containing versions and snapshot seq number.
    const headerNode = rootNode.addNode();
    writeHeaderSection(headerNode, snapshotSeqNumber);

    const dict: Set<string> = new Set();
    buildDictionary(snapshotTree, dict);
    for (const id of blobs.keys()) {
        dict.add(id);
    }
    // Next is tree node containing tree structure.
    const treeSectionNode = rootNode.addNode();
    // Third is dictionary node container paths and ids.
    const mappingNode = rootNode.addNode();
    const mapping = new Map<string, number>();
    let i = 0;
    for (const id of dict) {
        mapping.set(id, i);
        mappingNode.addString(id);
        i++;
    }

    writeTree(treeSectionNode, snapshotTree, mapping);
    // Next is blobs node.
    const blobsNode = rootNode.addNode();
    writeBlobsSection(blobsNode, blobs, mapping);
    // Then write the ops node.
    if (ops) {
        const opsNode = rootNode.addNode();
        writeOpsSection(opsNode, ops);
    }
    return builder.serialize();
}
