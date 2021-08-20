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
    for (const name of node) {
        assert(name instanceof BlobCore, 0x211 /* "Mapping should be of type BlobCore" */);
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
        assert(typeof idIndex === "number", 0x212 /* "Blob index should be a number" */);
        assert(blob instanceof BlobCore, 0x213 /* "Blob content should be of type blob" */);
        const blobId = dictionary[idIndex];
        assert(blobId !== undefined, 0x214 /* "blob id should be present" */);
        blobs.set(blobId, blob.arrayBuffer);
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
    for (const [pathIndex, child] of treeNode.iteratePairs()) {
        assert(typeof pathIndex == "number", 0x215 /* "Tree index should be a number" */);
        const path = dictionary[pathIndex];
        assert(path !== undefined, 0x216 /* "Path should not be undefined" */);

        if (child instanceof NodeCore) {
            tree.trees[path] = readTreeSection(child, dictionary);
        } else {
            assert(typeof child == "number", 0x217 /* "Should be number to look in dictionary" */);
            const id = dictionary[child];
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
    let ops: ISequencedDocumentMessage[] | undefined;

    assert(builder.length === 1, 0x219 /* "1 root should be there" */);
    const root = builder.getNode(0);
    assert(root.length >= 4 && root.length <= 5, 0x21a /* "4 or 5 sections should be there" */);

    const header = readAndValidateHeaderSection(root.getNode(0));

    const dictionary = readDictionarySection(root.getNode(2));

    const snapshotTree = readTreeSection(root.getNode(1), dictionary);
    snapshotTree.id = header.SnapshotId;
    const blobs = readBlobSection(root.getNode(3), dictionary);

    if (root.length === 5) {
        ops = readOpsSection(root.getNode(4));
    }

    return {
        snapshotTree,
        blobs,
        ops: ops ?? [],
        sequenceNumber: header.SnapshotSequenceNumber,
    };
}
