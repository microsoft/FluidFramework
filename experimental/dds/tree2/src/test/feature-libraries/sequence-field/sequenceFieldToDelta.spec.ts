/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, strict as assert } from "assert";
import {
	RevisionTag,
	Delta,
	FieldKey,
	ITreeCursorSynchronous,
	TreeSchemaIdentifier,
	mintRevisionTag,
	ChangesetLocalId,
	unsupportedRepairDataHandler,
	RepairDataBuilder,
} from "../../../core";
import {
	FieldChange,
	FieldKinds,
	NodeChangeset,
	SequenceField as SF,
	idAllocatorFromMaxId,
	singleTextCursor,
} from "../../../feature-libraries";
import { brand, brandOpaque, makeArray } from "../../../util";
import { TestChange } from "../../testChange";
import { assertMarkListEqual, deepFreeze } from "../../utils";
import { makeRepairDataBuilder } from "../repairDataTestUtils";
import { ChangeMaker as Change, MarkMaker as Mark, TestChangeset } from "./testEdits";
import { composeAnonChanges } from "./utils";

const type: TreeSchemaIdentifier = brand("Node");
const nodeX = { type, value: 0 };
const content = [nodeX];
const contentCursor: ITreeCursorSynchronous[] = [singleTextCursor(nodeX)];
const moveId = brand<ChangesetLocalId>(4242);
const tag: RevisionTag = mintRevisionTag();
const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const deltaMoveId = brandOpaque<Delta.MoveId>(moveId);
const fooField = brand<FieldKey>("foo");

const DUMMY_REVIVED_NODE_TYPE: TreeSchemaIdentifier = brand("DummyRevivedNode");

function fakeRepairData(_revision: RevisionTag, _index: number, count: number): Delta.ProtoNode[] {
	return makeArray(count, () => singleTextCursor({ type: DUMMY_REVIVED_NODE_TYPE }));
}

function toDelta(
	change: TestChangeset,
	repairDataBuilder: RepairDataBuilder = {
		handler: unsupportedRepairDataHandler,
		accumulator: () => fail("Unexpected call to accumulator"),
	},
): Delta.MarkList {
	deepFreeze(change);
	return SF.sequenceFieldToDelta(
		change,
		TestChange.toDelta,
		repairDataBuilder,
		idAllocatorFromMaxId(),
	);
}

function toDeltaShallow(
	change: TestChangeset,
	repairDataBuilder: RepairDataBuilder = {
		handler: unsupportedRepairDataHandler,
		accumulator: () => fail("Unexpected call to accumulator"),
	},
): Delta.MarkList {
	deepFreeze(change);
	return SF.sequenceFieldToDelta(
		change,
		() => fail("Unexpected call to child ToDelta"),
		repairDataBuilder,
		idAllocatorFromMaxId(),
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
		function reviver(revision: RevisionTag, index: number, count: number): Delta.ProtoNode[] {
			assert.equal(revision, tag);
			assert.equal(index, 0);
			assert.equal(count, 1);
			return contentCursor;
		}
		const changeset = Change.revive(0, 1, { revision: tag, localId: brand(0) }, reviver);
		const actual = toDelta(changeset);
		const expected: Delta.MarkList = [
			{
				type: Delta.MarkType.Insert,
				content: contentCursor,
			},
		];
		assertMarkListEqual(actual, expected);
	});

	it("revive and modify => insert", () => {
		const nestedChange: FieldChange = {
			fieldKind: FieldKinds.sequence.identifier,
			change: brand("Dummy Child Change"),
		};
		const changes = {
			fieldChanges: new Map([[fooField, nestedChange]]),
		};
		const changeset = [
			Mark.revive(contentCursor, { revision: tag, localId: brand(0) }, { changes }),
		];
		const fieldChanges = new Map([[fooField, [{ type: Delta.MarkType.Insert, content: [] }]]]);
		const deltaFromChild = (child: NodeChangeset): Delta.Modify => {
			assert.deepEqual(child, changes);
			return { type: Delta.MarkType.Modify, fields: fieldChanges };
		};
		const { repairDataBuilder, repairDataMarks } = makeRepairDataBuilder();
		const actual = SF.sequenceFieldToDelta(
			changeset,
			deltaFromChild,
			repairDataBuilder,
			idAllocatorFromMaxId(brand(3)),
		);
		const expected: Delta.MarkList = [
			{
				type: Delta.MarkType.Insert,
				content: contentCursor,
				fields: fieldChanges,
			},
		];
		assertMarkListEqual(actual, expected);
		assert.deepEqual(repairDataMarks, new Map([]));
	});

	it("delete produces repair data", () => {
		const changeset = Change.delete(0, 10);
		const mark: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 10,
			moveId: brand(0),
			isDelete: true,
		};
		const repairDataKey: FieldKey = brand("repair-data-0");
		const repairData: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 10,
			moveId: brand(0),
			isDelete: true,
		};
		const expected: Delta.MarkList = [mark];
		const { repairDataBuilder, repairDataMarks } = makeRepairDataBuilder();
		const actual = toDelta(changeset, repairDataBuilder);
		assert.deepStrictEqual(actual, expected);
		assert.deepStrictEqual(repairDataMarks, new Map([[repairDataKey, [repairData]]]));
	});

	it("move", () => {
		const changeset = [
			{ count: 42 },
			Mark.moveOut(10, moveId),
			{ count: 8 },
			Mark.moveIn(10, moveId),
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
		const changeset = composeAnonChanges([
			Change.delete(0, 10),
			Change.insert(3, 1),
			Change.modify(5, childChange1),
		]);
		const del: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 10,
			moveId: brand(0),
			isDelete: true,
		};
		const repairDataKey: FieldKey = brand("repair-data-0");
		const repairData: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 10,
			moveId: brand(0),
			isDelete: true,
		};
		const ins: Delta.Insert = {
			type: Delta.MarkType.Insert,
			content: contentCursor,
		};
		const modify: Delta.Modify = {
			type: Delta.MarkType.Modify,
			fields: new Map([
				[
					brand("foo"),
					[
						{ type: Delta.MarkType.Delete, count: 1 },
						{
							type: Delta.MarkType.Insert,
							content: [
								singleTextCursor({
									type: brand("test"),
									value: "1",
								}),
							],
						},
					],
				],
			]),
		};
		const expected: Delta.MarkList = [del, 3, ins, 1, modify];
		const { repairDataBuilder, repairDataMarks } = makeRepairDataBuilder();
		const actual = toDelta(changeset, repairDataBuilder);
		assert.deepStrictEqual(actual, expected);
		// TestChange does not produce repair data so we expect only one from the sequence field
		assert.deepStrictEqual(repairDataMarks, new Map([[repairDataKey, [repairData]]]));
	});

	it("insert and modify => insert", () => {
		const changeset = composeAnonChanges([Change.insert(0, 1), Change.modify(0, childChange1)]);
		const mark: Delta.Insert = {
			type: Delta.MarkType.Insert,
			content: [
				singleTextCursor({
					type,
					value: 0,
				}),
			],
			fields: new Map([
				[
					brand("foo"),
					[
						{ type: Delta.MarkType.Delete, count: 1 },
						{
							type: Delta.MarkType.Insert,
							content: [
								singleTextCursor({
									type: brand("test"),
									value: "1",
								}),
							],
						},
					],
				],
			]),
		};
		const expected: Delta.MarkList = [mark];
		const actual = toDelta(changeset);
		assertMarkListEqual(actual, expected);
	});

	it("modify and delete => delete", () => {
		const changeset: TestChangeset = [
			{ type: "Delete", id: brand(0), count: 1, changes: childChange1 },
		];
		const mark: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId: brand(0),
			isDelete: true,
			fields: new Map([
				[
					brand("foo"),
					[
						{ type: Delta.MarkType.Delete, count: 1 },
						{
							type: Delta.MarkType.Insert,
							content: [
								singleTextCursor({
									type: brand("test"),
									value: "1",
								}),
							],
						},
					],
				],
			]),
		};
		const repairDataKey: FieldKey = brand("repair-data-0");
		const repairData: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId: brand(0),
			isDelete: true,
		};
		const expected: Delta.MarkList = [mark];
		const { repairDataBuilder, repairDataMarks } = makeRepairDataBuilder();
		const actual = toDelta(changeset, repairDataBuilder);
		assertMarkListEqual(actual, expected);
		assert.deepStrictEqual(repairDataMarks, new Map([[repairDataKey, [repairData]]]));
	});

	it("modify and move-out => move-out", () => {
		const changeset = [Mark.moveOut(1, moveId, { changes: childChange1 })];
		const mark: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			moveId: deltaMoveId,
			count: 1,
			fields: new Map([
				[
					brand("foo"),
					[
						{ type: Delta.MarkType.Delete, count: 1 },
						{
							type: Delta.MarkType.Insert,
							content: [
								singleTextCursor({
									type: brand("test"),
									value: "1",
								}),
							],
						},
					],
				],
			]),
		};
		const expected: Delta.MarkList = [mark];
		const actual = toDelta(changeset);
		assertMarkListEqual(actual, expected);
	});

	it("insert and modify w/ move-in => insert", () => {
		const nestedChange: FieldChange = {
			fieldKind: FieldKinds.sequence.identifier,
			change: brand([Mark.moveIn(42, moveId)]),
		};
		const nodeChange = {
			fieldChanges: new Map([[fooField, nestedChange]]),
		};
		const changeset = [Mark.insert(content, brand(0), { changes: nodeChange })];
		const nestedMoveDelta = new Map([
			[fooField, [{ type: Delta.MarkType.MoveIn, moveId: deltaMoveId, count: 42 }]],
		]);
		const mark: Delta.Insert = {
			type: Delta.MarkType.Insert,
			content: contentCursor,
			fields: nestedMoveDelta,
		};
		const expected: Delta.MarkList = [mark];
		const deltaFromChild = (child: NodeChangeset): Delta.Modify => {
			assert.deepEqual(child, nodeChange);
			return { type: Delta.MarkType.Modify, fields: nestedMoveDelta };
		};
		const { repairDataBuilder, repairDataMarks } = makeRepairDataBuilder();
		const actual = SF.sequenceFieldToDelta(
			changeset,
			deltaFromChild,
			repairDataBuilder,
			idAllocatorFromMaxId(brand(3)),
		);
		assertMarkListEqual(actual, expected);
		assert.deepEqual(repairDataMarks, new Map([]));
	});

	describe("Muted changes", () => {
		const cellId = { revision: tag1, localId: brand<ChangesetLocalId>(0) };

		it("delete", () => {
			const deletion = [Mark.onEmptyCell(cellId, Mark.delete(2, brand(0)))];

			const actual = toDelta(deletion);
			const expected: Delta.MarkList = [];
			assertMarkListEqual(actual, expected);
		});

		it("modify", () => {
			const modify = [Mark.modify(childChange1, cellId)];

			const actual = toDelta(modify);
			const expected: Delta.MarkList = [];
			assertMarkListEqual(actual, expected);
		});

		it("move", () => {
			const move = [
				Mark.moveIn(1, brand(0), { isSrcConflicted: true }),
				{ count: 1 },
				Mark.onEmptyCell(cellId, Mark.moveOut(1, brand(0))),
			];

			const actual = toDelta(move);
			const expected: Delta.MarkList = [];
			assertMarkListEqual(actual, expected);
		});

		it("redundant revive", () => {
			const changeset = [
				Mark.revive(fakeRepairData(tag, 0, 1)),
				Mark.revive(fakeRepairData(tag, 1, 1), undefined, { changes: childChange1 }),
			];
			const actual = toDelta(changeset);
			const expected: Delta.MarkList = [1, childChange1Delta];
			assertMarkListEqual(actual, expected);
		});

		it("blocked revive", () => {
			const changeset = [
				Mark.revive(
					fakeRepairData(tag, 0, 1),
					{ revision: tag2, localId: brand(0) },
					{ inverseOf: tag1 },
				),
				Mark.revive(
					fakeRepairData(tag, 1, 1),
					{ revision: tag2, localId: brand(1) },
					{ inverseOf: tag1, changes: childChange1 },
				),
			];
			const actual = toDelta(changeset);
			const expected: Delta.MarkList = [];
			assertMarkListEqual(actual, expected);
		});
	});
});
