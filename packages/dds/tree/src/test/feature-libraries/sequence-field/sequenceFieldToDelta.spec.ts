/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import {
    makeAnonChange,
    RevisionTag,
    Delta,
    FieldKey,
    ITreeCursorSynchronous,
    TreeSchemaIdentifier,
} from "../../../core";
import {
    ChangesetLocalId,
    FieldChange,
    FieldKinds,
    NodeChangeset,
    NodeReviver,
    SequenceField as SF,
    singleTextCursor,
} from "../../../feature-libraries";
import { brand, brandOpaque, makeArray } from "../../../util";
import { TestChange } from "../../testChange";
import { assertMarkListEqual, deepFreeze, noRepair } from "../../utils";
import { ChangeMaker as Change, TestChangeset } from "./testEdits";
import { composeAnonChanges, idAllocatorFromMaxId } from "./utils";

const type: TreeSchemaIdentifier = brand("Node");
const nodeX = { type, value: 0 };
const content = [nodeX];
const contentCursor: ITreeCursorSynchronous[] = [singleTextCursor(nodeX)];
const moveId = brand<ChangesetLocalId>(4242);
const tag: RevisionTag = brand(41);
const tag2: RevisionTag = brand(42);
const tag3: RevisionTag = brand(43);
const deltaMoveId = brandOpaque<Delta.MoveId>(moveId);
const fooField = brand<FieldKey>("foo");

const DUMMY_REVIVED_NODE_TYPE: TreeSchemaIdentifier = brand("DummyRevivedNode");

function fakeRepairData(_revision: RevisionTag, _index: number, count: number): Delta.ProtoNode[] {
    return makeArray(count, () => singleTextCursor({ type: DUMMY_REVIVED_NODE_TYPE }));
}

function toDelta(change: TestChangeset, reviver: NodeReviver = fakeRepairData): Delta.MarkList {
    deepFreeze(change);
    return SF.sequenceFieldToDelta(change, TestChange.toDelta, reviver);
}

function toDeltaShallow(change: TestChangeset): Delta.MarkList {
    deepFreeze(change);
    return SF.sequenceFieldToDelta(
        change,
        () => fail("Unexpected call to child ToDelta"),
        fakeRepairData,
    );
}

const childChange1 = TestChange.mint([0], 1);
const childChange1Delta = TestChange.toDelta(childChange1);

describe("SequenceField - toDelta", () => {
    it("empty mark list", () => {
        const actual = toDeltaShallow([]);
        assert.deepEqual(actual, []);
    });

    it("child change", () => {
        const actual = toDelta(Change.modify(0, childChange1));
        const expected: Delta.MarkList = [childChange1Delta];
        assert.deepEqual(actual, expected);
    });

    it("empty child change", () => {
        const actual = toDelta(Change.modify(0, TestChange.emptyChange));
        const expected: Delta.MarkList = [];
        assert.deepEqual(actual, expected);
    });

    it("insert", () => {
        const changeset = Change.insert(0, 1);
        const mark: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content: contentCursor,
        };
        const expected: Delta.MarkList = [mark];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("revive => insert", () => {
        const changeset = Change.revive(0, 1, tag, 0);
        function reviver(revision: RevisionTag, index: number, count: number): Delta.ProtoNode[] {
            assert.equal(revision, tag);
            assert.equal(index, 0);
            assert.equal(count, 1);
            return contentCursor;
        }
        const actual = toDelta(changeset, reviver);
        const expected: Delta.MarkList = [
            {
                type: Delta.MarkType.Insert,
                content: contentCursor,
            },
        ];
        assertMarkListEqual(actual, expected);
    });

    it("conflicted revive => skip", () => {
        const changeset: TestChangeset = composeAnonChanges([
            Change.revive(0, 1, tag, 0, tag2),
            Change.modify(1, childChange1),
        ]);
        const actual = toDelta(changeset);
        const expected: Delta.MarkList = [1, childChange1Delta];
        assertMarkListEqual(actual, expected);
    });

    it("blocked revive => nil", () => {
        const changeset: TestChangeset = composeAnonChanges([
            Change.revive(0, 1, tag, 0, tag2, undefined, tag3),
            Change.modify(1, childChange1),
        ]);
        const actual = toDelta(changeset);
        const expected: Delta.MarkList = [1, childChange1Delta];
        assertMarkListEqual(actual, expected);
    });

    it("revive and modify => insert", () => {
        const nestedChange: FieldChange = {
            fieldKind: FieldKinds.sequence.identifier,
            change: brand("Dummy Child Change"),
        };
        const nodeChange = {
            fieldChanges: new Map([[fooField, nestedChange]]),
        };
        const changeset: SF.Changeset = [
            { type: "Revive", count: 1, detachedBy: tag, detachIndex: 0, changes: nodeChange },
        ];
        const fieldChanges = new Map([[fooField, [{ type: Delta.MarkType.Insert, content: [] }]]]);
        const deltaFromChild = (child: NodeChangeset): Delta.Modify => {
            assert.deepEqual(child, nodeChange);
            return { type: Delta.MarkType.Modify, fields: fieldChanges };
        };
        function reviver(revision: RevisionTag, index: number, count: number): Delta.ProtoNode[] {
            assert.equal(revision, tag);
            assert.equal(index, 0);
            assert.equal(count, 1);
            return contentCursor;
        }
        const actual = SF.sequenceFieldToDelta(changeset, deltaFromChild, reviver);
        const expected: Delta.MarkList = [
            {
                type: Delta.MarkType.Insert,
                content: contentCursor,
            },
        ];
        assertMarkListEqual(actual, expected);
    });

    it("delete", () => {
        const changeset = Change.delete(0, 10);
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
                id: moveId,
                count: 10,
            },
            8,
            {
                type: "MoveIn",
                id: moveId,
                count: 10,
            },
        ];
        const moveOut: Delta.MoveOut = {
            type: Delta.MarkType.MoveOut,
            moveId: deltaMoveId,
            count: 10,
        };
        const moveIn: Delta.MoveIn = {
            type: Delta.MarkType.MoveIn,
            moveId: deltaMoveId,
            count: 10,
        };
        const expected: Delta.MarkList = [42, moveOut, 8, moveIn];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("multiple changes", () => {
        const changeset = SF.sequenceFieldChangeRebaser.compose(
            [
                makeAnonChange(Change.delete(0, 10)),
                makeAnonChange(Change.insert(3, 1)),
                makeAnonChange(Change.modify(5, childChange1)),
            ],
            TestChange.compose,
            idAllocatorFromMaxId(),
        );
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
        const changeset = SF.sequenceFieldChangeRebaser.compose(
            [makeAnonChange(Change.insert(0, 1)), makeAnonChange(Change.modify(0, childChange1))],
            TestChange.compose,
            idAllocatorFromMaxId(),
        );
        const mark: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content: [
                singleTextCursor({
                    type,
                    value: "1",
                }),
            ],
        };
        const expected: Delta.MarkList = [mark];
        const actual = toDelta(changeset);
        assertMarkListEqual(actual, expected);
    });

    it("modify and delete => delete", () => {
        const changeset = SF.sequenceFieldChangeRebaser.compose(
            [makeAnonChange(Change.modify(0, childChange1)), makeAnonChange(Change.delete(0, 1))],
            TestChange.compose,
            idAllocatorFromMaxId(),
        );
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
        const nestedChange: FieldChange = {
            fieldKind: FieldKinds.sequence.identifier,
            change: brand({
                type: "MoveIn",
                id: moveId,
                count: 42,
            }),
        };
        const nodeChange = {
            fieldChanges: new Map([[fooField, nestedChange]]),
        };
        const changeset: SF.Changeset = [
            {
                type: "Insert",
                content,
                changes: nodeChange,
            },
        ];
        const nestedMoveDelta = new Map([
            [fooField, [{ type: Delta.MarkType.MoveIn, moveId: deltaMoveId, count: 42 }]],
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
        const actual = SF.sequenceFieldToDelta(changeset, deltaFromChild, noRepair);
        assertMarkListEqual(actual, expected);
    });
});
