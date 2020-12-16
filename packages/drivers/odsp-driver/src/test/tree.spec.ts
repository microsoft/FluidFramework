/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/common-utils";
import {
    bufferFromString,
    stringFromBuffer,
    TreeBuilder,
    BlobCore,
    BlobDeepCopy,
    Node,
} from "../tree";

function compareBuilfers(b1: Node | BlobCore, b2: Node | BlobCore) {
    if (b1 instanceof Node) {
        assert(b2 instanceof Node, "Node vs. Buffer");
        assert(b1.length === b2.length, "Node lengths are not same");
        for (let i = 0; i < b1.length; i++) {
            compareBuilfers(b1.get(i), b2.get(i));
        }
    } else {
        assert(!(b2 instanceof Node), "Buffer vs. Node");
        assert(stringFromBuffer(b1) === stringFromBuffer(b2), "Buffer sizes not same");
    }
}

function longBuffer(length: number) {
    const buffer = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        buffer[i] = 30 + (i % 10); // 0-9
    }
    return new BlobDeepCopy(buffer);
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
        compareBuilfers(builder, builder2);
    }

    it("empty", async () => {
        validate(3);
    });

    it("single node", async () => {
        builder.addChildNode();
        validate(5);
    });

    it("single buffer", async () => {
        builder.addChildBuffer(bufferFromString("first"));
        validate(10);
    });

    it("single long buffer (255)", async () => {
        builder.addChildBuffer(longBuffer(255));
        validate(5 + 255);
    });

    it("single long buffer (256)", async () => {
        builder.addChildBuffer(longBuffer(256));
        validate(5 + 256 + 1);
    });

    it("single long buffer (257)", async () => {
        builder.addChildBuffer(longBuffer(257));
        validate(5 + 257 + 1);
    });

    it("single long buffer", async () => {
        builder.addChildBuffer(longBuffer(65538));
        validate(5 + 65538 + 2);
    });

    it("two node", async () => {
        builder.addChildNode();
        builder.addChildNode();
        validate(7);
    });

    it("two buffer", async () => {
        builder.addChildBuffer(bufferFromString("first"));
        builder.addChildBuffer(bufferFromString("second"));
        validate(18);
    });

    it("single node + buffer", async () => {
        builder.addChildNode().addChildBuffer(bufferFromString("first"));
        validate(12);
    });

    it("complex", async () => {
        builder.addChildBuffer(bufferFromString("first"));
        const node = builder.addChildNode();
        node.addChildBuffer(bufferFromString("second"));
        node.addChildBuffer(bufferFromString("third"));
        const node2 = node.addChildNode();
        node2.addChildBuffer(bufferFromString("fourth"));
        validate(37);
    });
});
