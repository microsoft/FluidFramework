/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FieldKinds, NodeChangeset } from "../feature-libraries";
import { TreeSchemaIdentifier } from "../schema-stored";
import { Delta } from "../tree";
import { brand } from "../util";
import { TestChange, TestChangeEncoder } from "./testChange";

const nodeType: TreeSchemaIdentifier = brand("Node");
const fieldHandler = FieldKinds.value.changeHandler;
const tree1 = { type: nodeType, value: "value1" };
const tree2 = { type: nodeType, value: "value2" };
const nodeChange1: NodeChangeset = { valueChange: { value: "value3" } };
const nodeChange2: NodeChangeset = { valueChange: { value: "value4" } };
const nodeChange3: NodeChangeset = { valueChange: { value: "value5" } };

const change1WithChildChange = { value: tree1, changes: nodeChange1 };
const childChange1 = { changes: nodeChange1 };
const childChange2 = { changes: nodeChange2 };
const childChange3 = { changes: nodeChange3 };

describe("TestChange", () => {
    it("can be composed", () => {
        const change1 = TestChange.mint([0, 1], 2);
        const change2 = TestChange.mint([0, 1, 2], 3);
        const composed = TestChange.compose(
            [change1, change2],
        );

        const expected = TestChange.mint([0, 1], [2, 3]);
        assert.deepEqual(composed, expected);
    });

    it("can be composed without verification", () => {
        const change1 = TestChange.mint([0], 1);
        const change2 = TestChange.mint([2], 3);
        const composed = TestChange.compose(
            [change1, change2],
            false,
        );

        const expected = TestChange.mint([0], [1, 3]);
        assert.deepEqual(composed, expected);
    });

    it("composition of inverses leads to normalized form", () => {
        const change1 = TestChange.mint([0], [1, 2]);
        const change2 = TestChange.mint([0, 1, 2], [-2, -1, 3]);
        const composed = TestChange.compose(
            [change1, change2],
        );

        const expected = TestChange.mint([0], [3]);
        assert.deepEqual(composed, expected);
    });

    it("can be inverted", () => {
        const change1 = TestChange.mint([0, 1], 2);
        const inverted = TestChange.invert(
            change1,
        );

        const expected = TestChange.mint([0, 1, 2], -2);
        assert.deepEqual(inverted, expected);
    });

    it("can be rebased", () => {
        const change1 = TestChange.mint([0], 1);
        const change2 = TestChange.mint([0], 2);
        const rebased = TestChange.rebase(
            change2,
            change1,
        );

        const expected = TestChange.mint([0, 1], 2);
        assert.deepEqual(rebased, expected);
    });

    it("can be represented as a delta", () => {
        const change1 = TestChange.mint([0, 1], [2, 3]);
        const delta = TestChange.toDelta(change1);
        const expected = {
            type: Delta.MarkType.Modify,
            setValue: "2|3",
        };

        assert.deepEqual(delta, expected);
        assert.deepEqual(TestChange.toDelta(TestChange.mint([0, 1], [])), { type: Delta.MarkType.Modify });
    });

    it("can be encoded in JSON", () => {
        const version = 0;
        const codec = new TestChangeEncoder();
        const empty = TestChange.emptyChange;
        const normal = TestChange.mint([0, 1], [2, 3]);
        assert.deepEqual(empty, codec.decodeJson(version, codec.encodeForJson(version, empty)));
        assert.deepEqual(normal, codec.decodeJson(version, codec.encodeForJson(version, normal)));
    });
});
