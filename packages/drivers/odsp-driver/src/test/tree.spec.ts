/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/common-utils";
import {
    TreeBuilder,
    BlobCore,
    Node,
    NodeTypes,
} from "../tree";

function compareNodes(b1: NodeTypes, b2: NodeTypes) {
    if (b1 instanceof Node) {
        assert(b2 instanceof Node, "not Node");
        assert(b1.length === b2.length, "Node lengths are not same");
        for (let i = 0; i < b1.length; i++) {
            compareNodes(b1.get(i), b2.get(i));
        }
    } else if (b1 instanceof BlobCore) {
        assert(b2 instanceof BlobCore, "not buffer");
        assert(b1.toString() === b2.toString(), "Buffer sizes not same");
    } else {
        assert(typeof b1 === "number", "not number");
        assert(typeof b2 === "number", "not number");
        assert(b1 === b2);
    }
}

function longBuffer(length: number) {
    const buffer = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        buffer[i] = 30 + (i % 10); // 0-9
    }
    return buffer;
}

describe("Tree test", () => {
    let builder: TreeBuilder;

    beforeEach(() => {
        builder = new TreeBuilder();
    });

    function validate(length = -1) {
        const buffer = builder.serialize();

        assert(buffer.length === length, "buffer size");

        const builder2 = TreeBuilder.load(buffer);
        compareNodes(builder, builder2);
    }

    it("empty", async () => {
        validate(3);
    });

    it("single node", async () => {
        builder.addNode();
        validate(5);
    });

    it("single buffer", async () => {
        builder.addString("first");
        validate(10);
    });

    it("single long buffer (255)", async () => {
        builder.addBlob(longBuffer(255));
        validate(5 + 255);
    });

    it("single long buffer (256)", async () => {
        builder.addBlob(longBuffer(256));
        validate(5 + 256 + 1);
    });

    it("single long buffer (257)", async () => {
        builder.addBlob(longBuffer(257));
        validate(5 + 257 + 1);
    });

    it("single long buffer", async () => {
        builder.addBlob(longBuffer(65538));
        validate(5 + 65538 + 2);
    });

    it("two node", async () => {
        builder.addNode();
        builder.addNode();
        validate(7);
    });

    it("two buffer", async () => {
        builder.addString("first");
        builder.addString("second");
        validate(18);
    });

    it("single node + buffer", async () => {
        builder.addNode().addString("first");
        validate(12);
    });

    it("complex", async () => {
        builder.addString("first");
        const node = builder.addNode();
        node.addString("second");
        node.addString("third");
        const node2 = node.addNode();
        node2.addString("fourth");
        validate(37);
    });
});
