/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import {
	makeAnonChange,
	RevisionTag,
	Delta,
	ITreeCursorSynchronous,
	TreeSchemaIdentifier,
} from "../../../core";
import {
	ChangesetLocalId,
	NodeChangeset,
	NodeReviver,
	SequenceField as SF,
	singleTextCursor,
} from "../../../feature-libraries";
import { brand, brandOpaque, makeArray } from "../../../util";
import { TestChange } from "../../testChange";
import { assertFieldChangesEqual, deepFreeze } from "../../utils";
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

const DUMMY_REVIVED_NODE_TYPE: TreeSchemaIdentifier = brand("DummyRevivedNode");

function fakeRepairData(_revision: RevisionTag, _index: number, count: number): Delta.ProtoNode[] {
	return makeArray(count, () => singleTextCursor({ type: DUMMY_REVIVED_NODE_TYPE }));
}

function toDelta(change: TestChangeset, reviver: NodeReviver = fakeRepairData): Delta.FieldChanges {
	deepFreeze(change);
	return SF.sequenceFieldToDelta(change, TestChange.toDelta, reviver);
}

function toDeltaShallow(change: TestChangeset): Delta.FieldChanges {
	deepFreeze(change);
	return SF.sequenceFieldToDelta(
		change,
		() => fail("Unexpected call to child ToDelta"),
		fakeRepairData,
	);
}

const childChange1 = TestChange.mint([0], 1);
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const childChange1Delta = TestChange.toDelta(childChange1)!;

describe("SequenceField - toDelta", () => {
	it("empty mark list", () => {
		const actual = toDeltaShallow([]);
		assert.deepEqual(actual, {});
	});

	it("child change", () => {
		const actual = toDelta(Change.modify(0, childChange1));
		const expected: Delta.FieldChanges = {
			beforeShallow: [{ index: 0, ...childChange1Delta }],
		};
		assert.deepEqual(actual, expected);
	});

	it("empty child change", () => {
		const actual = toDelta(Change.modify(0, TestChange.emptyChange));
		const expected: Delta.FieldChanges = {};
		assert.deepEqual(actual, expected);
	});

	it("insert", () => {
		const changeset = Change.insert(0, 1);
		const mark: Delta.Insert = {
			type: Delta.MarkType.Insert,
			content: contentCursor,
		};
		const expected: Delta.FieldChanges = {
			shallow: [mark],
		};
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
		const expected: Delta.FieldChanges = {
			shallow: [
				{
					type: Delta.MarkType.Insert,
					content: contentCursor,
				},
			],
		};
		assertFieldChangesEqual(actual, expected);
	});

	it("conflicted revive => skip", () => {
		const changeset: TestChangeset = composeAnonChanges([
			Change.revive(0, 1, tag, 0, tag2),
			Change.delete(1, 1),
		]);
		const actual = toDelta(changeset);
		const expected: Delta.FieldChanges = {
			shallow: [1, { type: Delta.MarkType.Delete, count: 1 }],
		};
		assertFieldChangesEqual(actual, expected);
	});

	it("blocked revive => nil", () => {
		const changeset: TestChangeset = composeAnonChanges([
			Change.revive(0, 1, tag, 0, tag2, undefined, tag3),
			Change.delete(1, 1),
		]);
		const actual = toDelta(changeset);
		const expected: Delta.FieldChanges = {
			shallow: [1, { type: Delta.MarkType.Delete, count: 1 }],
		};
		assertFieldChangesEqual(actual, expected);
	});

	it("revive and modify => insert", () => {
		const dummyNodeChange = "Dummy Child Change" as NodeChangeset;
		const dummyNodeDelta = "Dummy Child Delta" as Delta.NodeChanges;
		const changeset: SF.Changeset = [
			{ type: "Revive", count: 1, detachedBy: tag, detachIndex: 0, changes: dummyNodeChange },
		];
		const deltaFromChild = (child: NodeChangeset): Delta.NodeChanges => {
			assert.deepEqual(child, dummyNodeChange);
			return dummyNodeDelta;
		};
		function reviver(revision: RevisionTag, index: number, count: number): Delta.ProtoNode[] {
			assert.equal(revision, tag);
			assert.equal(index, 0);
			assert.equal(count, 1);
			return contentCursor;
		}
		const actual = SF.sequenceFieldToDelta(changeset, deltaFromChild, reviver);
		const expected: Delta.FieldChanges = {
			shallow: [
				{
					type: Delta.MarkType.Insert,
					content: contentCursor,
				},
			],
			afterShallow: [{ index: 0, ...dummyNodeDelta }],
		};
		assertFieldChangesEqual(actual, expected);
	});

	it("delete", () => {
		const changeset = Change.delete(0, 10);
		const mark: Delta.Delete = {
			type: Delta.MarkType.Delete,
			count: 10,
		};
		const expected: Delta.FieldChanges = {
			shallow: [mark],
		};
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
		const expected: Delta.FieldChanges = {
			shallow: [42, moveOut, 8, moveIn],
		};
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
		const expected: Delta.FieldChanges = {
			shallow: [del, 3, ins],
			beforeShallow: [{ index: 14, setValue: "1" }],
		};
		const actual = toDelta(changeset);
		assert.deepStrictEqual(actual, expected);
	});

	it("insert and modify => insert and nested change", () => {
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
					value: 0,
				}),
			],
		};
		const expected: Delta.FieldChanges = {
			shallow: [mark],
			afterShallow: [{ index: 0, setValue: "1" }],
		};
		const actual = toDelta(changeset);
		assertFieldChangesEqual(actual, expected);
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
		const expected: Delta.FieldChanges = {
			shallow: [mark],
		};
		const actual = toDelta(changeset);
		assertFieldChangesEqual(actual, expected);
	});
});
