/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import { Delta, FieldKey, ITreeCursorSynchronous } from "../../../tree";
import {
    FieldChange,
    FieldKind,
    Multiplicity,
    NodeChangeset,
    SequenceField as SF,
    singleTextCursorNew,
} from "../../../feature-libraries";
import { TreeSchemaIdentifier } from "../../../schema-stored";
import { brand, brandOpaque } from "../../../util";
import { TestChange } from "../../testChange";
import { assertMarkListEqual, deepFreeze } from "../../utils";
import { TestChangeset } from "./utils";

const type: TreeSchemaIdentifier = brand("Node");
const nodeX = { type, value: "X" };
const content = [nodeX];
const contentCursor: ITreeCursorSynchronous[] = [singleTextCursorNew(nodeX)];
const opId = 42;
const moveId = brandOpaque<Delta.MoveId>(opId);
const fooField = brand<FieldKey>("foo");

function toDelta(change: TestChangeset): Delta.MarkList {
    deepFreeze(change);
    return SF.sequenceFieldToDelta(change, TestChange.toDelta);
}

function toDeltaShallow(change: TestChangeset): Delta.MarkList {
    deepFreeze(change);
    return SF.sequenceFieldToDelta(change, () => fail("Unexpected call to child ToDelta"));
}

describe("SequenceField - toDelta", () => {
    it("empty mark list", () => {
        const actual = toDeltaShallow([]);
        assert.deepEqual(actual, []);
    });

    it("child change", () => {
        const actual = toDelta([{ type: "Modify", changes: TestChange.mint([0], 1) }]);
        const expected: Delta.MarkList = [
            {
                type: Delta.MarkType.Modify,
                setValue: "1",
            },
        ];
        assert.deepEqual(actual, expected);
    });

    it("muted child change", () => {
        const actual = toDelta([{
            type: "Modify",
            tomb: "DummyTag",
            changes: TestChange.mint([0], 1),
        }]);
        const expected: Delta.MarkList = [];
        assert.deepEqual(actual, expected);
    });

    it("tomb", () => {
        const actual = toDelta([{
            type: "Tomb",
            change: "DummyTag",
            count: 3,
        }]);
        const expected: Delta.MarkList = [];
        assert.deepEqual(actual, expected);
    });

    it("empty child change", () => {
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
            content: contentCursor,
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

    it("multiple changes", () => {
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
            2,
            {
                type: "Tomb",
                change: "DummyTag",
                count: 3,
            },
        ];
        const del: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const ins: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content: contentCursor,
        };
        const set: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: "1",
        };
        const expected: Delta.MarkList = [del, 3, ins, 1, set];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("insert and modify => insert", () => {
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
            content: [singleTextCursorNew({
                type,
                value: "1",
            })],
        };
        const expected: Delta.MarkList = [mark];
        const actual = toDelta(changeset);
        assertMarkListEqual(actual, expected);
    });

    it("modify and delete => delete", () => {
        const changeset: TestChangeset = [
            {
                type: "MDelete",
                id: opId,
                changes: TestChange.mint([0], 1),
            },
        ];
        const mark: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 1,
        };
        const expected: Delta.MarkList = [mark];
        const actual = toDelta(changeset);
        assertMarkListEqual(actual, expected);
    });

    // This test requires more support for MoveIn
    it.skip("Insert and modify => Insert and modify", () => {
        const sequenceField = new FieldKind(
            brand("Sequence"),
            Multiplicity.Sequence,
            SF.sequenceFieldChangeHandler,
            () => false,
            new Set(),
        );
        const nestedChange: FieldChange = {
            fieldKind: sequenceField.identifier,
            change: brand({
                type: "MoveIn",
                id: opId,
                count: 42,
            }),
       };
        const nodeChange = {
            fieldChanges: new Map([
                [fooField, nestedChange],
            ]),
        };
        const changeset: SF.Changeset = [
            {
                type: "MInsert",
                id: opId,
                content: content[0],
                changes: nodeChange,
            },
        ];
        const nestedMoveDelta = new Map([
            [fooField, [{ type: Delta.MarkType.MoveIn, moveId }]],
        ]);
        const mark: Delta.InsertAndModify = {
            type: Delta.MarkType.InsertAndModify,
            content: contentCursor[0],
            fields: nestedMoveDelta,
        };
        const expected: Delta.MarkList = [mark];
        const deltaFromChild = (child: NodeChangeset): Delta.Modify => {
            assert.deepEqual(child, nodeChange);
            return { type: Delta.MarkType.Modify, fields: nestedMoveDelta };
        };
        const actual = SF.sequenceFieldToDelta(changeset, deltaFromChild);
        assertMarkListEqual(actual, expected);
    });
});
