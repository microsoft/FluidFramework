/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ChangeAtomId,
	ChangesetLocalId,
	mintRevisionTag,
	RevisionTag,
	tagChange,
	tagRollbackInverse,
} from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import { CellId } from "../../../feature-libraries/sequence-field";
import { TestChange } from "../../testChange";
import { deepFreeze } from "../../utils";
import { brand } from "../../../util";
import { invert as invertChange } from "./utils";
import { ChangeMaker as Change, MarkMaker as Mark, TestChangeset } from "./testEdits";

function invert(change: TestChangeset, tag?: RevisionTag): TestChangeset {
	deepFreeze(change);
	return invertChange(tagChange(change, tag ?? tag1));
}

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();

const childChange1 = TestChange.mint([0], 1);
const childChange2 = TestChange.mint([1], 2);
const childChange3 = TestChange.mint([2], 3);
const inverseChildChange1 = TestChange.invert(childChange1);
const inverseChildChange2 = TestChange.invert(childChange2);
const inverseChildChange3 = TestChange.invert(childChange3);

describe("SequenceField - Invert", () => {
	it("no changes", () => {
		const input: TestChangeset = [];
		const expected: TestChangeset = [];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("child changes", () => {
		const input = Change.modify(0, childChange1);
		const expected = Change.modify(0, inverseChildChange1);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("child changes of removed content", () => {
		const detachEvent = { revision: tag1, localId: brand<ChangesetLocalId>(0) };
		const input = Change.modifyDetached(0, childChange1, detachEvent);
		const actual = invert(input);
		const expected = Change.modifyDetached(0, inverseChildChange1, detachEvent);
		assert.deepEqual(actual, expected);
	});

	it("insert => delete", () => {
		const input = Change.insert(0, 2);
		const expected = Change.delete(0, 2);
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("insert & modify => modify & delete", () => {
		const input = [Mark.insert(1, brand(0), { changes: childChange1 })];
		const expected = [Mark.delete(1, brand(0), { changes: inverseChildChange1 })];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("delete => revive", () => {
		const input = [
			Mark.delete(1, brand(0), { changes: childChange1 }),
			Mark.delete(1, brand(1)),
		];
		const expected = [
			Mark.revive(1, { revision: tag1, localId: brand(0) }, { changes: inverseChildChange1 }),
			Mark.revive(1, { revision: tag1, localId: brand(1) }),
		];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("delete => revive (with rollback ID)", () => {
		const detachId: ChangeAtomId = { revision: tag2, localId: brand(0) };
		const input = tagRollbackInverse([Mark.delete(2, brand(0))], tag1, tag2);
		const expected = [Mark.revive(2, detachId)];
		const actual = invertChange(input);
		assert.deepEqual(actual, expected);
	});

	it("delete => revive (with override ID)", () => {
		const redetachId: ChangeAtomId = { revision: tag2, localId: brand(0) };
		const input: TestChangeset = [Mark.delete(2, brand(5), { redetachId })];
		const expected = [Mark.revive(2, redetachId, { id: brand(5) })];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("active revive => delete", () => {
		const cellId: CellId = {
			revision: tag1,
			localId: brand(0),
			lineage: [{ revision: tag2, id: brand(42), count: 2, offset: 1 }],
		};
		const input = Change.revive(0, 2, cellId);
		const expected: TestChangeset = [Mark.delete(2, brand(0), { redetachId: cellId })];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("move => return", () => {
		const input = [
			Mark.moveOut(1, brand(0), { changes: childChange1 }),
			Mark.moveOut(1, brand(1)),
			Mark.skip(3),
			Mark.moveIn(2, brand(0)),
		];
		const expected = [
			Mark.returnTo(2, brand(0), { revision: tag1, localId: brand(0) }),
			Mark.skip(3),
			Mark.moveOut(1, brand(0), { changes: inverseChildChange1 }),
			Mark.moveOut(1, brand(1)),
		];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("move backward => return", () => {
		const input = [
			Mark.moveIn(2, brand(0)),
			Mark.skip(3),
			Mark.moveOut(1, brand(0), { changes: childChange1 }),
			Mark.moveOut(1, brand(1)),
		];
		const expected = [
			Mark.moveOut(1, brand(0), { changes: inverseChildChange1 }),
			Mark.moveOut(1, brand(1)),
			Mark.skip(3),
			Mark.returnTo(2, brand(0), { revision: tag1, localId: brand(0) }),
		];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("return => return", () => {
		const cellId: ChangeAtomId = { revision: tag2, localId: brand(0) };
		const input = [
			Mark.moveOut(1, brand(42), { changes: childChange1 }),
			Mark.moveOut(1, brand(43)),
			Mark.skip(3),
			Mark.returnTo(2, brand(42), cellId),
		];

		const expected: TestChangeset = [
			Mark.returnTo(2, brand(42), { revision: tag1, localId: brand(42) }),
			{ count: 3 },
			Mark.moveOut(1, brand(42), {
				redetachId: cellId,
				changes: inverseChildChange1,
			}),
			Mark.moveOut(1, brand(43), {
				redetachId: { ...cellId, localId: brand(1) },
			}),
		];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("pin live nodes => skip", () => {
		const input = [Mark.pin(1, brand(0), { changes: childChange1 })];
		const expected: TestChangeset = [Mark.modify(inverseChildChange1)];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("pin removed nodes => remove", () => {
		const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
		const input = [Mark.pin(1, brand(0), { cellId, changes: childChange1 })];
		const expected: TestChangeset = [
			Mark.delete(1, brand(0), {
				redetachId: cellId,
				changes: inverseChildChange1,
			}),
		];
		const actual = invert(input);
		assert.deepEqual(actual, expected);
	});

	it("insert & delete => revive & delete", () => {
		const transient = [
			Mark.attachAndDetach(Mark.insert(1, brand(1)), Mark.delete(1, brand(0)), {
				changes: childChange1,
			}),
		];

		const inverse = invert(transient);
		const expected = [
			Mark.delete(1, brand(1), {
				cellId: { revision: tag1, localId: brand(0) },
				changes: inverseChildChange1,
			}),
		];

		assert.deepEqual(inverse, expected);
	});

	it("revive & delete => revive & delete", () => {
		const startId: ChangeAtomId = { revision: tag1, localId: brand(1) };
		const detachId: ChangeAtomId = { revision: tag1, localId: brand(2) };
		const transient = [
			Mark.delete(1, detachId.localId, {
				cellId: { localId: startId.localId },
				changes: childChange1,
			}),
		];

		const inverse = invertChange(tagChange(transient, startId.revision));
		const expected = [
			Mark.delete(1, detachId.localId, {
				cellId: detachId,
				changes: inverseChildChange1,
				redetachId: startId,
			}),
		];
		assert.deepEqual(inverse, expected);
	});

	it("Insert and move => move and delete", () => {
		const insertAndMove = [
			Mark.attachAndDetach(Mark.insert(1, brand(0)), Mark.moveOut(1, brand(1)), {
				changes: childChange1,
			}),
			{ count: 1 },
			Mark.moveIn(1, brand(1)),
		];

		const inverse = invert(insertAndMove);
		const expected = [
			Mark.attachAndDetach(
				Mark.returnTo(1, brand(1), { revision: tag1, localId: brand(1) }),
				Mark.delete(1, brand(0)),
			),
			{ count: 1 },
			Mark.moveOut(1, brand(1), { changes: inverseChildChange1 }),
		];

		assert.deepEqual(inverse, expected);
	});

	it("revive & move => move & delete", () => {
		const startId: ChangeAtomId = { revision: tag1, localId: brand(1) };
		const detachId: ChangeAtomId = { revision: tag1, localId: brand(2) };
		const transient = [
			Mark.moveOut(1, detachId.localId, {
				cellId: { localId: startId.localId },
				changes: childChange1,
			}),
			{ count: 1 },
			Mark.moveIn(1, detachId.localId),
		];

		const inverse = invertChange(tagChange(transient, startId.revision));
		const expected = [
			Mark.attachAndDetach(
				Mark.returnTo(1, detachId.localId, detachId),
				Mark.delete(1, detachId.localId, {
					redetachId: startId,
				}),
			),
			{ count: 1 },
			Mark.moveOut(1, detachId.localId, { changes: inverseChildChange1 }),
		];
		assert.deepEqual(inverse, expected);
	});

	it("Move and delete => revive and return", () => {
		const moveAndDelete = [
			Mark.moveOut(1, brand(0), { changes: childChange1 }),
			{ count: 1 },
			Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.delete(1, brand(1))),
		];

		const inverse = invert(moveAndDelete);
		const expected = [
			Mark.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
			{ count: 1 },
			Mark.moveOut(1, brand(0), {
				cellId: { revision: tag1, localId: brand(1) },
				changes: inverseChildChange1,
			}),
		];

		assert.deepEqual(inverse, expected);
	});

	it("Move chain => return chain", () => {
		const moves = [
			Mark.moveOut(1, brand(0), {
				changes: childChange1,
				finalEndpoint: { localId: brand(1) },
			}),
			{ count: 1 },
			Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.moveOut(1, brand(1))),
			{ count: 1 },
			Mark.moveIn(1, brand(1), { finalEndpoint: { localId: brand(0) } }),
		];

		const inverse = invert(moves);
		const expected = [
			Mark.returnTo(
				1,
				brand(0),
				{ revision: tag1, localId: brand(0) },
				{ finalEndpoint: { localId: brand(1) } },
			),
			{ count: 1 },
			Mark.attachAndDetach(
				Mark.returnTo(1, brand(1), { revision: tag1, localId: brand(1) }),
				Mark.moveOut(1, brand(0)),
			),
			{ count: 1 },
			Mark.moveOut(1, brand(1), {
				changes: inverseChildChange1,
				finalEndpoint: { localId: brand(0) },
			}),
		];

		assert.deepEqual(inverse, expected);
	});

	describe("Redundant changes", () => {
		it("delete (same detach ID)", () => {
			const cellId = { revision: tag1, localId: brand<ChangesetLocalId>(0) };
			const input = [
				Mark.onEmptyCell(cellId, Mark.delete(1, brand(0), { changes: childChange1 })),
			];

			const actual = invert(input, tag1);
			const expected = Change.modifyDetached(0, inverseChildChange1, cellId);
			assert.deepEqual(actual, expected);
		});

		it("delete (same detach ID through metadata)", () => {
			const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const input = [
				Mark.onEmptyCell(cellId, Mark.delete(1, brand(0), { changes: childChange1 })),
			];

			const actual = invertChange(tagRollbackInverse(input, tag2, tag1));
			const expected = Change.modifyDetached(0, inverseChildChange1, cellId);
			assert.deepEqual(actual, expected);
		});

		it("delete (different detach ID)", () => {
			const startId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const endId: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const input = [
				Mark.delete(1, endId, {
					changes: childChange1,
					cellId: startId,
				}),
			];

			const actual = invert(input, tag2);
			const expected = [
				Mark.delete(1, brand(0), {
					changes: inverseChildChange1,
					cellId: endId,
					redetachId: startId,
				}),
			];
			assert.deepEqual(actual, expected);
		});

		it("redundant revive => skip", () => {
			const input = [
				Mark.modify(childChange1),
				Mark.pin(1, brand(0), { revision: tag1 }),
				Mark.modify(childChange2),
			];
			const expected = [
				Mark.modify(inverseChildChange1),
				Mark.skip(1),
				Mark.modify(inverseChildChange2),
			];
			const actual = invert(input);
			assert.deepEqual(actual, expected);
		});
	});
});
