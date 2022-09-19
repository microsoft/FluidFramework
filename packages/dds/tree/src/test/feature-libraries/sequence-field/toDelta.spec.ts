/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { Delta } from "../../../tree";
import { SequenceField as SF } from "../../../feature-libraries";
import { TreeSchemaIdentifier } from "../../../schema-stored";
import { brand, brandOpaque } from "../../../util";
import { TestChange } from "../../testChange";
import { deepFreeze } from "../../utils";
import { TestChangeset } from "./utils";

const type: TreeSchemaIdentifier = brand("Node");
const nodeX = { type, value: "X" };
const content = [nodeX];
const opId = 42;
const moveId = brandOpaque<Delta.MoveId>(opId);

function toDelta(change: TestChangeset): Delta.MarkList {
    deepFreeze(change);
    return SF.sequenceFieldToDelta(change, TestChange.toDelta);
}

function toDeltaShallow(change: TestChangeset): Delta.MarkList {
    deepFreeze(change);
    return SF.sequenceFieldToDelta(change, () => fail("Unexpected call to child ToDelta"));
}

describe("SequenceField - toDelta", () => {
    it("Empty mark list", () => {
        const actual = toDeltaShallow([]);
        assert.deepEqual(actual, []);
    });

    it("Child change", () => {
        const actual = toDelta([{ type: "Modify", changes: TestChange.mint([0], 1) }]);
        const expected: Delta.MarkList = [
            {
                type: Delta.MarkType.Modify,
                setValue: "1",
            },
        ];
        assert.deepEqual(actual, expected);
    });

    it("Empty child change", () => {
        const actual = toDelta([{ type: "Modify", changes: TestChange.emptyChange }]);
        const expected: Delta.MarkList = [];
        assert.deepEqual(actual, expected);
    });

    it("insert", () => {
        const changeset: TestChangeset = [
            { type: "Insert", id: opId, content },
        ];
        const mark: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content,
        };
        const expected: Delta.MarkList = [mark];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("delete", () => {
        const changeset: TestChangeset = [{
            type: "Delete",
            id: opId,
            count: 10,
        }];
        const mark: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const expected: Delta.MarkList = [mark];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("move", () => {
        const changeset: TestChangeset = [
            42,
            {
                type: "MoveOut",
                id: opId,
                count: 10,
            },
            8,
            {
                type: "MoveIn",
                id: opId,
                count: 10,
            },
        ];
        const moveOut: Delta.MoveOut = {
            type: Delta.MarkType.MoveOut,
            moveId,
            count: 10,
        };
        const moveIn: Delta.MoveIn = {
            type: Delta.MarkType.MoveIn,
            moveId,
        };
        const expected: Delta.MarkList = [42, moveOut, 8, moveIn];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("the lot", () => {
        const changeset: TestChangeset = [
            {
                type: "Delete",
                id: opId,
                count: 10,
            },
            3,
            {
                type: "Insert",
                id: opId,
                content,
            },
            1,
            {
                type: "Modify",
                changes: TestChange.mint([0], 1),
            },
        ];
        const del: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const ins: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content,
        };
        const set: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: "1",
        };
        const expected: Delta.MarkList = [del, 3, ins, 1, set];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("Insert and modify", () => {
        const changeset: TestChangeset = [
            {
                type: "MInsert",
                id: opId,
                content: content[0],
                changes: TestChange.mint([0], 1),
            },
        ];
        const mark: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content: [{
                type,
                value: "1",
            }],
        };
        const expected: Delta.MarkList = [mark];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });
});
