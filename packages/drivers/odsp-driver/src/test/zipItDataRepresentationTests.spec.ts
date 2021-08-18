/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ReadBuffer } from "../ReadBufferUtils";
import { TreeBuilderSerializer } from "../WriteBufferUtils";
import {
    TreeBuilder,
    BlobCore,
    NodeCore,
    NodeTypes,
    BlobShallowCopy,
    assertBlobCoreInstance,
    assertNodeCoreInstance,
    assertNumberInstance,
} from "../zipItDataRepresentationUtils";

function compareNodes(node1: NodeTypes, node2: NodeTypes) {
    if (node1 instanceof NodeCore) {
        assert(node2 instanceof NodeCore, "Node 2 should be a NodeCore type");
        assert.strictEqual(node1.length, node2.length, "Node lengths are not same");
        for (let i = 0; i < node1.length; i++) {
            compareNodes(node1.get(i), node2.get(i));
        }
    } else if (node1 instanceof BlobCore) {
        assert(node2 instanceof BlobCore, "Node2 should also be a blob");
        assert(node1.toString() === node2.toString(), "Blob contents not same");
    } else {
        assert(Number.isInteger(node1), "Content 1 should be an integer");
        assert(Number.isInteger(node1), "Content 2 should be an integer");
        assert.strictEqual(node1, node2, "Number should be equal");
    }
}

function createLongBuffer(length: number) {
    const buffer = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        buffer[i] = 30 + (i % 10); // 0-9
    }
    return buffer;
}

describe("Tree Representation tests", () => {
    let builder: TreeBuilderSerializer;

    beforeEach(() => {
        builder = new TreeBuilderSerializer();
    });

    function validate(length = -1) {
        const buffer = builder.serialize();
        assert.strictEqual(buffer.length, length, "buffer size not equal");
        const builder2 = TreeBuilder.load(buffer);
        compareNodes(builder, builder2);
    }

    it("empty", async () => {
        validate(0);
    });

    it("single node", async () => {
        builder.addNode();
        validate(2);
    });

    it("number 0", async () => {
        builder.addNumber(0);
        validate(1);
    });

    it("number", async () => {
        builder.addNumber(1);
        validate(1 + 1);
    });

    it("big number", async () => {
        builder.addNumber(65536 * 65536);
        // 1 for Marker Code and 8 for representation
        validate(1 + 8);
    });

    it("empty string", async () => {
        builder.addString("");
        // 1 for Marker Code is enough for empty string.
        validate(1);
    });

    it("single buffer", async () => {
        builder.addString("first");
        validate(2 + 5);
    });

    it("empty buffer", async () => {
        builder.addBlob(createLongBuffer(0));
        validate(1);
    });

    it("single long buffer (255)", async () => {
        builder.addBlob(createLongBuffer(255));
        validate(2 + 255);
    });

    it("single long buffer (256)", async () => {
        builder.addBlob(createLongBuffer(256));
        // 1 for Marker Code, 2 for representing length of buffer and 256 for data
        validate(1 + 2 + 256);
    });

    it("single long buffer (257)", async () => {
        builder.addBlob(createLongBuffer(257));
        validate(1 + 2 + 257);
    });

    it("single long buffer", async () => {
        builder.addBlob(createLongBuffer(65538));
        validate(1 + 4 + 65538);
    });

    it("two node", async () => {
        builder.addNode();
        builder.addNode();
        validate(2 + 2);
    });

    it("two buffer", async () => {
        builder.addString("first");
        builder.addString("Seventeen");
        validate(2 + 5 + 2 + 9);
    });

    it("single node + buffer", async () => {
        builder.addNode().addString("first");
        validate(2 + 2 + 5);
    });

    it("complex tree structure", async () => {
        builder.addString("first");
        const node = builder.addNode();
        node.addString("second");
        node.addString("third");
        const node2 = node.addNode();
        node2.addString("fourth");
        validate(2 + 5 + 2 + 2 + 6 + 2 + 5 + 2 + 2 + 6);
    });

    it("blob instance test", async () => {
        const blobNode = new BlobShallowCopy(new ReadBuffer(new Uint8Array()), 0, 0);
        assertBlobCoreInstance(blobNode);

        let success = true;
        const nonBlobNode: NodeTypes = 5;
        try {
            assertBlobCoreInstance(nonBlobNode);
        } catch (err) {
            success = false;
        }
        assert(!success, "Error should have occured");
    });

    it("node instance test", async () => {
        const node = new NodeCore();
        assertNodeCoreInstance(node);

        let success = true;
        const nonNode: NodeTypes = new BlobShallowCopy(new ReadBuffer(new Uint8Array()), 0, 0);
        try {
            assertNodeCoreInstance(nonNode);
        } catch (err) {
            success = false;
        }
        assert(!success, "Error should have occured");
    });

    it("number instance test", async () => {
        const numNode = 5;
        assertNumberInstance(numNode);

        let success = true;
        const nonNumberNode: NodeTypes = new BlobShallowCopy(new ReadBuffer(new Uint8Array()), 0, 0);
        try {
            assertNumberInstance(nonNumberNode);
        } catch (err) {
            success = false;
        }
        assert(!success, "Error should have occured");
    });
});
