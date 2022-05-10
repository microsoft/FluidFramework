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
    assertBoolInstance,
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
    } else if (typeof node1 === "number") {
        assert(Number.isInteger(node1), "Content 1 should be an integer");
        assert(Number.isInteger(node2), "Content 2 should be an integer");
        assert.strictEqual(node1, node2, "Number should be equal");
    } else if (typeof node1 === "boolean") {
        assert(typeof node2 === "boolean", "Content2 should be boolean");
        assert.strictEqual(node1, node2, "Bool value should be equal");
    } else {
        assert.fail("Unknown entity type!!");
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

    it("boolean", async () => {
        builder.addBool(true);
        validate(1);
    });

    it("empty string", async () => {
        builder.addString("", false);
        // 1 for Marker Code is enough for empty string.
        validate(1);
    });

    it("small string", async () => {
        builder.addString("first", false);
        validate(2 + 5);
    });

    it("small const string", async () => {
        builder.addString("first", true);
        validate(8 + 2);
    });

    it("empty buffer", async () => {
        builder.addBlob(createLongBuffer(0), false);
        validate(1);
    });

    it("single long buffer (255)", async () => {
        builder.addBlob(createLongBuffer(255), false);
        validate(2 + 255);
    });

    it("single long buffer (256)", async () => {
        builder.addBlob(createLongBuffer(256), false);
        // 1 for Marker Code, 2 for representing length of buffer and 256 for data
        validate(1 + 2 + 256);
    });

    it("single long buffer (257)", async () => {
        builder.addBlob(createLongBuffer(257), false);
        validate(1 + 2 + 257);
    });

    it("single long buffer", async () => {
        builder.addBlob(createLongBuffer(65538), false);
        validate(1 + 4 + 65538);
    });

    it("two node", async () => {
        builder.addNode();
        builder.addNode();
        validate(2 + 2);
    });

    it("two buffer", async () => {
        builder.addString("first", false);
        builder.addString("Seventeen", false);
        validate(2 + 5 + 2 + 9);
    });

    it("single node + buffer", async () => {
        builder.addNode().addString("first", false);
        validate(2 + 2 + 5);
    });

    it("single node + const string", async () => {
        builder.addNode().addString("first", true);
        validate(2 + 8 + 2);
    });

    it(">1 byte length string", async () => {
        let str = "";
        for (let i = 0; i <= 256; ++i) {
            str += "a";
        }
        builder.addNode().addString(str, true);
        validate(2 + 9 + 257 + 2);
    });

    it("complex tree structure", async () => {
        builder.addString("first", false);
        const node = builder.addNode();
        node.addString("second", false);
        node.addString("third", false);
        const node2 = node.addNode();
        node2.addString("fourth", false);
        validate(2 + 5 + 2 + 2 + 6 + 2 + 5 + 2 + 2 + 6);
    });

    it("blob instance test", async () => {
        const blobNode = new BlobShallowCopy(new ReadBuffer(new Uint8Array()), 0, 0, false);
        assertBlobCoreInstance(blobNode, "should be a blob");

        let success = true;
        const nonBlobNode: NodeTypes = 5;
        try {
            assertBlobCoreInstance(nonBlobNode, "should be a blob");
        } catch (err) {
            success = false;
        }
        assert(!success, "Error should have occured");
    });

    it("node instance test", async () => {
        const node = new NodeCore();
        assertNodeCoreInstance(node, "should be a node");

        let success = true;
        const nonNode: NodeTypes = new BlobShallowCopy(new ReadBuffer(new Uint8Array()), 0, 0, false);
        try {
            assertNodeCoreInstance(nonNode, "should be a node");
        } catch (err) {
            success = false;
        }
        assert(!success, "Error should have occured");
    });

    it("number instance test", async () => {
        const numNode = 5;
        assertNumberInstance(numNode, "should be a number");

        let success = true;
        const nonNumberNode: NodeTypes = new BlobShallowCopy(new ReadBuffer(new Uint8Array()), 0, 0, false);
        try {
            assertNumberInstance(nonNumberNode, "should be a number");
        } catch (err) {
            success = false;
        }
        assert(!success, "Error should have occured");
    });

    it("bool instance test", async () => {
        const boolNode = true;
        assertBoolInstance(boolNode, "should be a boolean");

        let success = true;
        const nonBoolNode: NodeTypes = 0;
        try {
            assertBoolInstance(nonBoolNode, "should be a bool");
        } catch (err) {
            success = false;
        }
        assert(!success, "Error should have occured");
    });
});
