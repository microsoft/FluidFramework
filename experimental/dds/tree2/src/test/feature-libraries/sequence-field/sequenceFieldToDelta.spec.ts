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
	TreeNodeSchemaIdentifier,
	mintRevisionTag,
	ChangesetLocalId,
	makeAnonChange,
	tagChange,
	deltaForSet,
	emptyFieldChanges,
} from "../../../core";
import {
	FieldChange,
	FieldKinds,
	NodeChangeset,
	SequenceField as SF,
	singleTextCursor,
} from "../../../feature-libraries";
import { brand, makeArray } from "../../../util";
import { TestChange } from "../../testChange";
import { assertFieldChangesEqual, deepFreeze } from "../../utils";
import { ChangeMaker as Change, MarkMaker as Mark, TestChangeset } from "./testEdits";
import { composeAnonChanges, toDelta } from "./utils";

const type: TreeNodeSchemaIdentifier = brand("Node");
const nodeX = { type, value: 0 };
const nodeY = { type, value: 1 };
const content = [nodeX];
const content2 = [nodeX, nodeY];
const contentCursor: ITreeCursorSynchronous = singleTextCursor(nodeX);
const contentCursor2: ITreeCursorSynchronous[] = content2.map((node) => singleTextCursor(node));
const moveId = brand<ChangesetLocalId>(4242);
const moveId2 = brand<ChangesetLocalId>(4343);
const tag: RevisionTag = mintRevisionTag();
const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const fooField = brand<FieldKey>("foo");

const DUMMY_REVIVED_NODE_TYPE: TreeNodeSchemaIdentifier = brand("DummyRevivedNode");

function fakeRepairData(_revision: RevisionTag, _index: number, count: number): Delta.ProtoNode[] {
	return makeArray(count, () => singleTextCursor({ type: DUMMY_REVIVED_NODE_TYPE }));
}

function toDeltaShallow(change: TestChangeset): Delta.FieldChanges {
	deepFreeze(change);
	return SF.sequenceFieldToDelta(makeAnonChange(change), () =>
		fail("Unexpected call to child ToDelta"),
	);
}

const childChange1 = TestChange.mint([0], 1);
const childChange1Delta = TestChange.toDelta(tagChange(childChange1, tag));
const detachId = { major: tag, minor: 42 };

describe("SequenceField - toDelta", () => {
	it("empty mark list", () => {
		const actual = toDeltaShallow([]);
		assert.deepEqual(actual, {});
	});

	it("child change", () => {
		const actual = toDelta(Change.modify(0, childChange1), tag);
		const markList: Delta.Mark[] = [{ count: 1, fields: childChange1Delta }];
		const expected: Delta.FieldChanges = { local: markList };
		assert.deepEqual(actual, expected);
	});

	it("empty child change", () => {
		const actual = toDelta(Change.modify(0, TestChange.emptyChange));
		assert.deepEqual(actual, emptyFieldChanges);
	});

	it("insert", () => {
		const changeset = Change.insert(0, 1);
		const expected = deltaForSet(contentCursor, { minor: 0 });
		const actual = toDelta(changeset);
		assert.deepStrictEqual(actual, expected);
	});

	it("revive => restore", () => {
		const changeset = Change.revive(0, 1, { revision: tag, localId: brand(0) });
		const actual = toDelta(changeset);
		const expected: Delta.FieldChanges = {
			local: [
				{
					count: 1,
					attach: { major: tag, minor: 0 },
				},
			],
		};
		assertFieldChangesEqual(actual, expected);
	});

	it("revive and modify => restore and modify", () => {
		const nestedChange: FieldChange = {
			fieldKind: FieldKinds.sequence.identifier,
			change: brand("Dummy Child Change"),
		};
		const changes = {
			fieldChanges: new Map([[fooField, nestedChange]]),
		};
		const changeset = [Mark.revive(1, { revision: tag, localId: brand(0) }, { changes })];
		const fieldChanges = new Map([[fooField, {}]]);
		const deltaFromChild = (child: NodeChangeset): Delta.FieldMap => {
			assert.deepEqual(child, changes);
			return fieldChanges;
		};
		const actual = SF.sequenceFieldToDelta(makeAnonChange(changeset), deltaFromChild);
		const expected: Delta.FieldChanges = {
			local: [
				{
					count: 1,
					attach: { major: tag, minor: 0 },
				},
			],
			global: [
				{
					id: { major: tag, minor: 0 },
					fields: fieldChanges,
				},
			],
		};
		assertFieldChangesEqual(actual, expected);
	});

	it("delete", () => {
		const changeset = [Mark.delete(10, brand(42))];
		const expected: Delta.FieldChanges = {
			local: [
				{
					count: 10,
					detach: detachId,
				},
			],
		};
		const actual = toDelta(changeset, tag);
		assert.deepStrictEqual(actual, expected);
	});

	it("delete with override", () => {
		const changeset = [
			Mark.delete(10, brand(42), { detachIdOverride: { revision: tag2, localId: brand(1) } }),
		];
		const expected: Delta.FieldChanges = {
			local: [
				{
					count: 10,
					detach: { major: tag2, minor: 1 },
				},
			],
		};
		const actual = toDelta(changeset, tag);
		assert.deepStrictEqual(actual, expected);
	});

	it("move", () => {
		const changeset = [
			{ count: 42 },
			Mark.moveOut(10, moveId),
			{ count: 8 },
			Mark.moveIn(10, moveId),
		];
		const moveOut: Delta.Mark = {
			detach: { minor: moveId },
			count: 10,
		};
		const moveIn: Delta.Mark = {
			attach: { minor: moveId },
			count: 10,
		};
		const markList: Delta.Mark[] = [{ count: 42 }, moveOut, { count: 8 }, moveIn];
		const expected: Delta.FieldChanges = { local: markList };
		const actual = toDelta(changeset);
		assert.deepStrictEqual(actual, expected);
	});

	it("multiple moves from different revisions", () => {
		const changeset = [
			Mark.moveOut(10, { revision: tag1, localId: moveId }),
			Mark.moveIn(10, { revision: tag1, localId: moveId }),
			Mark.moveOut(2, { revision: tag2, localId: moveId }),
			Mark.moveIn(2, { revision: tag2, localId: moveId }),
			Mark.moveOut(3, { revision: tag1, localId: moveId2 }),
			Mark.moveIn(3, { revision: tag1, localId: moveId2 }),
		];
		const moveOut1: Delta.Mark = {
			detach: { major: tag1, minor: moveId },
			count: 10,
		};
		const moveIn1: Delta.Mark = {
			attach: { major: tag1, minor: moveId },
			count: 10,
		};
		const moveOut2: Delta.Mark = {
			detach: { major: tag2, minor: moveId },
			count: 2,
		};
		const moveIn2: Delta.Mark = {
			attach: { major: tag2, minor: moveId },
			count: 2,
		};
		const moveOut3: Delta.Mark = {
			detach: { major: tag1, minor: moveId2 },
			count: 3,
		};
		const moveIn3: Delta.Mark = {
			attach: { major: tag1, minor: moveId2 },
			count: 3,
		};
		const markList: Delta.Mark[] = [moveOut1, moveIn1, moveOut2, moveIn2, moveOut3, moveIn3];
		const expected: Delta.FieldChanges = { local: markList };
		const actual = toDelta(changeset);
		assert.deepStrictEqual(actual, expected);
	});

	it("multiple changes", () => {
		const changeset: TestChangeset = [
			Mark.delete(10, brand(42)),
			{ count: 3 },
			Mark.insert(1, brand(52)),
			{ count: 1 },
			Mark.modify(childChange1),
		];
		const del: Delta.Mark = {
			count: 10,
			detach: detachId,
		};
		const ins: Delta.Mark = {
			count: 1,
			attach: { minor: 52 },
		};
		const markList: Delta.Mark[] = [
			del,
			{ count: 3 },
			ins,
			{ count: 1 },
			{ count: 1, fields: childChange1Delta },
		];
		const expected: Delta.FieldChanges = {
			build: [{ id: { minor: 52 }, trees: [contentCursor] }],
			local: markList,
		};
		const actual = toDelta(changeset, tag);
		assert.deepStrictEqual(actual, expected);
	});

	it("insert and modify => insert", () => {
		const changeset = composeAnonChanges([Change.insert(0, 1), Change.modify(0, childChange1)]);
		const buildId = { minor: 0 };
		const expected: Delta.FieldChanges = {
			build: [
				{
					id: buildId,
					trees: [
						singleTextCursor({
							type,
							value: 0,
						}),
					],
				},
			],
			global: [{ id: buildId, fields: childChange1Delta }],
			local: [{ count: 1, attach: buildId }],
		};
		const actual = toDelta(changeset, tag);
		assertFieldChangesEqual(actual, expected);
	});

	it("modify and delete => delete", () => {
		const changeset = [Mark.delete(1, brand(42), { changes: childChange1 })];
		const expected: Delta.FieldChanges = {
			local: [{ count: 1, detach: detachId, fields: childChange1Delta }],
		};
		const actual = toDelta(changeset, tag);
		assertFieldChangesEqual(actual, expected);
	});

	it("modify and move-out => move-out", () => {
		const changeset = [Mark.moveOut(1, moveId, { changes: childChange1 })];
		const expected: Delta.FieldChanges = {
			local: [{ count: 1, detach: { major: tag, minor: moveId }, fields: childChange1Delta }],
		};
		const actual = toDelta(changeset, tag);
		assertFieldChangesEqual(actual, expected);
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
			[fooField, { local: [{ attach: { minor: moveId }, count: 42 }] }],
		]);
		const buildId = { minor: 0 };
		const expected: Delta.FieldChanges = {
			build: [
				{
					id: buildId,
					trees: [
						singleTextCursor({
							type,
							value: 0,
						}),
					],
				},
			],
			global: [{ id: buildId, fields: nestedMoveDelta }],
			local: [{ count: 1, attach: buildId }],
		};
		const deltaFromChild = (child: NodeChangeset): Delta.FieldMap => {
			assert.deepEqual(child, nodeChange);
			return nestedMoveDelta;
		};
		const actual = SF.sequenceFieldToDelta(makeAnonChange(changeset), deltaFromChild);
		assertFieldChangesEqual(actual, expected);
	});

	describe("Transient changes", () => {
		// TODO: Should test revives and returns in addition to inserts and moves
		it("insert & delete", () => {
			const changeset = [
				Mark.transient(Mark.insert(content2, brand(0)), Mark.delete(2, brand(2))),
			];
			const delta = toDelta(changeset);
			const buildId = { minor: 0 };
			const expected: Delta.FieldChanges = {
				build: [{ id: buildId, trees: contentCursor2 }],
				rename: [{ count: 2, oldId: buildId, newId: { minor: 2 } }],
			};
			assertFieldChangesEqual(delta, expected);
		});

		it("insert & move", () => {
			const changeset = [
				Mark.transient(Mark.insert(content2, brand(0)), Mark.moveOut(2, brand(2))),
				{ count: 1 },
				Mark.moveIn(2, brand(2)),
			];
			const delta = toDelta(changeset);
			const buildId = { minor: 0 };
			const id = { minor: 2 };
			const expected: Delta.FieldChanges = {
				build: [{ id: buildId, trees: contentCursor2 }],
				rename: [{ oldId: buildId, newId: id, count: 2 }],
				local: [{ count: 1 }, { count: 2, attach: id }],
			};
			assertFieldChangesEqual(delta, expected);
		});

		it("move & delete", () => {
			const changeset = [
				Mark.moveOut(2, brand(0)),
				{ count: 1 },
				Mark.transient(Mark.moveIn(2, brand(0)), Mark.delete(2, brand(2))),
			];
			const delta = toDelta(changeset);

			const id = { minor: 0 };
			const expected: Delta.FieldChanges = {
				local: [{ count: 2, detach: id }],
				rename: [{ count: 2, oldId: id, newId: { minor: 2 } }],
			};
			assertFieldChangesEqual(delta, expected);
		});

		it("insert & move & delete", () => {
			const changeset = [
				Mark.transient(Mark.insert(content2, brand(0)), Mark.moveOut(2, brand(2))),
				{ count: 1 },
				Mark.transient(Mark.moveIn(2, brand(2)), Mark.delete(2, brand(4))),
			];
			const delta = toDelta(changeset);
			const buildId = { minor: 0 };
			const id1 = { minor: 2 };
			const id2 = { minor: 4 };
			const expected: Delta.FieldChanges = {
				build: [{ id: buildId, trees: contentCursor2 }],
				rename: [
					{ count: 2, oldId: buildId, newId: id1 },
					{ count: 2, oldId: id1, newId: id2 },
				],
			};
			assertFieldChangesEqual(delta, expected);
		});

		it("move & move & move", () => {
			const changeset = [
				Mark.moveOut(2, brand(0), { finalEndpoint: { localId: brand(4) } }),
				{ count: 1 },
				Mark.transient(Mark.moveIn(2, brand(0)), Mark.moveOut(2, brand(2))),
				Mark.transient(Mark.moveIn(2, brand(2)), Mark.moveOut(2, brand(4))),
				{ count: 1 },
				Mark.moveIn(2, brand(4), { finalEndpoint: { localId: brand(0) } }),
			];
			const delta = toDelta(changeset);

			const id = { minor: 0 };
			const expected: Delta.FieldChanges = {
				local: [
					{ count: 2, detach: id },
					{ count: 1 },
					{ count: 1 },
					{ count: 2, attach: id },
				],
			};
			assertFieldChangesEqual(delta, expected);
		});
	});

	describe("Muted changes", () => {
		const cellId = { revision: tag1, localId: brand<ChangesetLocalId>(0) };

		it("delete", () => {
			const deletion = [Mark.onEmptyCell(cellId, Mark.delete(2, brand(0)))];

			const actual = toDelta(deletion);
			assertFieldChangesEqual(actual, {});
		});

		it("modify", () => {
			const modify = [Mark.modify(childChange1, cellId)];

			const actual = toDelta(modify);
			assertFieldChangesEqual(actual, {});
		});

		it("move", () => {
			const move = [
				Mark.moveIn(1, brand(0), { isSrcConflicted: true }),
				{ count: 1 },
				Mark.onEmptyCell(cellId, Mark.moveOut(1, brand(0))),
			];

			const actual = toDelta(move);
			assertFieldChangesEqual(actual, {});
		});

		it("redundant revive", () => {
			const changeset = [
				Mark.revive(1),
				Mark.revive(1, undefined, { changes: childChange1 }),
			];
			const actual = toDelta(changeset, tag);
			const expected: Delta.FieldChanges = {
				local: [{ count: 1 }, { count: 1, fields: childChange1Delta }],
			};
			assertFieldChangesEqual(actual, expected);
		});
	});
});
