/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, stringToBuffer } from "@fluidframework/common-utils";
import { IBlob, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { ISequencedDeltaOpMessage } from "./contracts";
import { BlobCore, NodeCore, ReadBuffer, TreeBuilder } from "./snapshotRepresentation";

const minReadVersion = "1.0";

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
 * Class used to convert snapshot formats. It can convert binary compact representation to
 * odsp snapshot and vice-versa.
 */
export class SnapshotFormatConverter {
    constructor() {}

    /**
     * Recreates header section and then validate that.
     * @param node - tree node to read header section from
     */
    private readAndValidateHeaderSection(node: NodeCore) {
        assert(node.getString(0) === "MinReadVersion", "MinReadVersion header should be present");
        assert(node.getString(2) === "CreateVersion", "CreateVersion header should be present");
        assert(node.getString(4) === "SnapshotSequenceNumber", "SnapshotSequenceNumber header should be present");
        const header = {
            minReadVersion: node.getString(1),
            createVersion: node.getString(3),
            snapshotSeqNumber: node.getNumber(5),
        };
        assert(minReadVersion >= header.minReadVersion, "Driver min read version should >= to server minReadVersion");
        assert(header.createVersion >= minReadVersion, "Snapshot should be created with minReadVersion or above");
    }

    /**
     * Recreates dictionary section of the tree.
     * @param node - tree node to read dictionary section from. This container paths/ids mapping
     * to integer representation.
     */
    private readDictionarySection(node: NodeCore) {
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
    private readBlobSection(node: NodeCore, dictionary: string[]) {
        const blobs: Map<string, Uint8Array> = new Map();
        for (const [idIndex, blob] of node.iteratePairs()) {
            assert(typeof idIndex === "number", "Blob index should be a number");
            assert(blob instanceof BlobCore, "Blob content should be of type blob");
            const blobId = dictionary[idIndex];
            assert(blobId !== undefined, "blob id should be present");
            blobs.set(blobId, blob.buffer);
        }
        return blobs;
    }

    /**
     * Recreates ops section of the tree.
     * @param node - tree node to read ops section from
     */
    private readOpsSection(node: NodeCore) {
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
    private readTreeSection(treeNode: NodeCore, dictionary: string[]) {
        const tree: ISnapshotTree = {
            id: "id",
            blobs: {},
            commits: {},
            trees: {},
        };
        for (const [pathIndex, child] of treeNode.iteratePairs()) {
            assert(typeof pathIndex == "number", "Tree index should be a number");
            const path = dictionary[pathIndex];
            assert(path !== undefined, "Path should not be undefined");

            if (child instanceof NodeCore) {
                tree.trees[path] = this.readTreeSection(child, dictionary);
            } else {
                assert(typeof child == "number", "Should be number to look in dictionary");
                const id = dictionary[child];
                assert(id !== undefined, "Blob id should not be undefined");
                tree.blobs[path] = id;
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
    private buildDictionary(snapshotTree: ISnapshotTree, dict: Set<string>) {
        for (const [path, childTree] of Object.entries(snapshotTree.trees)) {
            dict.add(path);
            this.buildDictionary(childTree, dict);
        }

        for (const [path, _] of Object.entries(snapshotTree.blobs)) {
            dict.add(path);
        }
    }

    /**
     * Writes header section of the snapshot.
     * @param node - tree node to serialize to
     * @param snapshotSeqNumber - seq number at which snapshot is created.
    */
    private writeHeaderSection(node: NodeCore, snapshotSeqNumber: number) {
        node.addString("MinReadVersion");
        node.addString(minReadVersion);
        node.addString("CreateVersion");
        node.addString(minReadVersion);
        node.addString("SnapshotSequenceNumber");
        node.addNumber(snapshotSeqNumber);
    }

    /**
     * Represents (serializes) snapshot tree as generalizes tree
     * @param treeNode - tree node to serialize to
     * @param tree - snapshot tree that is being serialized
     * @param mapping - name mapping, used to map path and IDs to integer representation
    */
    private writeTree(treeNode: NodeCore, tree: ISnapshotTree, mapping: Map<string, number>) {
        for (const [path, value] of Object.entries(tree.trees)) {
            treeNode.addNumber(mapping.get(path));
            this.writeTree(treeNode.addNode(), value, mapping);
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
    private writeBlobsSection(node: NodeCore, blobs: Map<string, IBlob | Uint8Array>, mapping: Map<string, number>) {
        for (const [storageBlobId, blob] of blobs) {
            node.addNumber(mapping.get(storageBlobId));
            if (blob instanceof Uint8Array) {
                node.addBlob(blob);
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
    private writeOpsSection(node: NodeCore, ops: ISequencedDeltaOpMessage[]) {
        ops.forEach((op) => {
            node.addString(JSON.stringify(op));
        });
    }

    /**
     * Converts snapshot from binary compact representation to ODSP snapshot.
     * @param buffer - Compact snapshot to be parsed into odsp snapshot.
     * @returns - tree, blobs and ops from the snapshot.
     */
    public convertBinaryFormatToOdspSnapshot(buffer: ReadBuffer) {
        const builder = TreeBuilder.load(buffer);
        let ops: ISequencedDeltaOpMessage[] | undefined;

        assert(builder.length === 1, "1 root should be there");
        const root = builder.getNode(0);
        assert(root.length >= 4 && root.length <= 5, "4 or 5 sections should be there");

        this.readAndValidateHeaderSection(root.getNode(0));

        const dictionary = this.readDictionarySection(root.getNode(2));

        const tree = this.readTreeSection(root.getNode(1), dictionary);

        const blobs = this.readBlobSection(root.getNode(3), dictionary);

        if (root.length === 5) {
            ops = this.readOpsSection(root.getNode(4));
        }

        return { tree, blobs, ops };
    }

    /**
     * Converts ODSP snapshot format to binary compact representation.
     * @param snapshotTree - snapshot tree to serialize
     * @param blobs - blobs to serialize
     * @param snapshotSeqNumber - seq number at which snapshot is created.
     * @param ops - ops to serialize
     * @returns - ReadBuffer - binary representation of the data.
     */
    public convertOdspSnapshotToCompactSnapshot(
        snapshotTree: ISnapshotTree,
        blobs: Map<string, IBlob | Uint8Array>,
        snapshotSeqNumber: number,
        ops?: ISequencedDeltaOpMessage[]): ReadBuffer
    {
        const builder = new TreeBuilder();
        // Create the root node.
        const rootNode = builder.addNode();
        // Header node containing versions and snapshot seq number.
        const headerNode = rootNode.addNode();
        this.writeHeaderSection(headerNode, snapshotSeqNumber);

        const dict: Set<string> = new Set();
        this.buildDictionary(snapshotTree, dict);
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

        this.writeTree(treeSectionNode, snapshotTree, mapping);
        // Next is blobs node.
        const blobsNode = rootNode.addNode();
        this.writeBlobsSection(blobsNode, blobs, mapping);
        // Then write the ops node.
        if (ops) {
            const opsNode = rootNode.addNode();
            this.writeOpsSection(opsNode, ops);
        }
        return builder.serialize();
    }
}
