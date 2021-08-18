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
    assertNumberInstance,
    getAndValidateNodeProps,
    NodeCore,
    TreeBuilder,
} from "./zipItDataRepresentationUtils";

export const snapshotMinReadVersion = "1.0";

/**
 *  Header of the downloaded snapshot.
 */
interface ISnapshotHeader {
    // This is the minimum version of the reader required to read the wire format of a given snapshot.
    MinReadVersion: string,
    // Represents the version with which snapshot is created.
    CreateVersion: string,
    // Seq number at which the snapshot is created.
    SnapshotSequenceNumber: number,
    // Id of the snapshot.
    SnapshotId: string,
}

/**
 * Recreates header section and then validate that.
 * @param node - tree node to read header section from
 */
function readAndValidateHeaderSection(node: NodeCore): ISnapshotHeader {
    const records =
        getAndValidateNodeProps(node,
            ["MinReadVersion", "CreateVersion", "SnapshotSequenceNumber", "SnapshotId"]);

    const header: ISnapshotHeader = {
        MinReadVersion: records.MinReadVersion.toString(),
        CreateVersion: records.CreateVersion.toString(),
        SnapshotSequenceNumber: records.SnapshotSequenceNumber.valueOf() as number,
        SnapshotId: records.SnapshotId.toString(),
    };
    assert(snapshotMinReadVersion >= header.MinReadVersion,
        0x20f /* "Driver min read version should >= to server minReadVersion" */);
    assert(header.CreateVersion >= snapshotMinReadVersion,
        0x210 /* "Snapshot should be created with minReadVersion or above" */);
    return header;
}

/**
 * Recreates dictionary section of the tree.
 * @param node - tree node to read dictionary section from. This container paths/ids mapping
 * to integer representation.
 */
function readDictionarySection(node: NodeCore) {
    const dictionary = new Array<string>();
    for (const childNode of node) {
        assertBlobCoreInstance(childNode, "Mapping should be of type BlobCore");
        dictionary.push(childNode.toString());
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
    for (const [idIndexNode, blobNode] of node.iteratePairs()) {
        assertNumberInstance(idIndexNode, "Blob index should be a number");
        assertBlobCoreInstance(blobNode, "Blob content should be of type blob");
        const blobId = dictionary[idIndexNode];
        assert(blobId !== undefined, 0x214 /* "blob id should be present" */);
        blobs.set(blobId, blobNode.arrayBuffer);
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
 * @param treeNode - tree node to de-serialize from
 * @param dictionary - name map, used to decode path/IDs.
 */
function readTreeSection(treeNode: NodeCore, dictionary: string[]) {
    const tree: ISnapshotTree = {
        blobs: {},
        commits: {},
        trees: {},
    };
    for (const [pathIndexNode, childNode] of treeNode.iteratePairs()) {
        assertNumberInstance(pathIndexNode, "Tree index should be a number");
        const path = dictionary[pathIndexNode];
        assert(path !== undefined, 0x216 /* "Path should not be undefined" */);

        if (childNode instanceof NodeCore) {
            tree.trees[path] = readTreeSection(childNode, dictionary);
        } else {
            assertNumberInstance(childNode, "Should be number to look in dictionary");
            const id = dictionary[childNode];
            assert(id !== undefined, 0x218 /* "Id is out of range" */);
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
export function parseCompactSnapshotResponse(buffer: ReadBuffer): ISnapshotContents {
    const builder = TreeBuilder.load(buffer);

    assert(builder.length === 1, 0x219 /* "1 root should be there" */);
    const root = builder.getNode(0);
    assert(root.length === 5, "5 sections should be there");

    const header = readAndValidateHeaderSection(root.getNode(0));

    const dictionary = readDictionarySection(root.getNode(2));

    const snapshotTree = readTreeSection(root.getNode(1), dictionary);
    snapshotTree.id = header.SnapshotId;
    const blobs = readBlobSection(root.getNode(3), dictionary);

    const ops: ISequencedDocumentMessage[] = readOpsSection(root.getNode(4));

    return {
        snapshotTree,
        blobs,
        ops,
        sequenceNumber: header.SnapshotSequenceNumber,
    };
}
