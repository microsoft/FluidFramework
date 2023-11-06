/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF, revisionMetadataSourceFromInfo } from "../../../feature-libraries";
import { ChangeAtomId, mintRevisionTag, RevisionTag, tagChange } from "../../../core";
import { TestChange } from "../../testChange";
import { brand } from "../../../util";
import {
	checkDeltaEquality,
	composeAnonChanges,
	rebaseTagged,
	rebase as rebaseI,
	shallowCompose,
	rebaseOverComposition,
} from "./utils";
import { cases, ChangeMaker as Change, MarkMaker as Mark, TestChangeset } from "./testEdits";

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();

function rebase(change: TestChangeset, base: TestChangeset, baseRev?: RevisionTag): TestChangeset {
	return rebaseI(change, tagChange(base, baseRev ?? tag1));
}

describe("SequenceField - Rebase", () => {
	describe("no changes ↷ *", () => {
		for (const [name, testCase] of Object.entries(cases)) {
			it(`no changes ↷ ${name}`, () => {
				const actual = rebase([], testCase);
				assert.deepEqual(actual, cases.no_change);
			});
		}
	});

	describe("* ↷ no changes", () => {
		for (const [name, testCase] of Object.entries(cases)) {
			it(`${name} ↷ no changes`, () => {
				const actual = rebase(testCase, cases.no_change);
				assert.deepEqual(actual, testCase);
			});
		}
	});

	it("modify ↷ modify", () => {
		const change1 = Change.modify(0, TestChange.mint([0], 1));
		const change2 = Change.modify(0, TestChange.mint([0], 2));
		const expected = Change.modify(0, TestChange.mint([0, 1], 2));
		const actual = rebase(change2, change1);
		assert.deepEqual(actual, expected);
	});

	it("insert ↷ modify", () => {
		const actual = rebase(cases.insert, cases.modify);
		assert.deepEqual(actual, cases.insert);
	});

	it("modify insert ↷ modify", () => {
		const actual = rebase(cases.modify_insert, cases.modify);
		assert.deepEqual(actual, cases.modify_insert);
	});

	it("delete ↷ modify", () => {
		const actual = rebase(cases.delete, cases.modify);
		assert.deepEqual(actual, cases.delete);
	});

	it("revive ↷ modify", () => {
		const revive = composeAnonChanges([
			Change.revive(0, 2, { revision: tag1, localId: brand(0) }),
			Change.revive(4, 2, { revision: tag1, localId: brand(2) }),
			Change.revive(10, 2, { revision: tag1, localId: brand(4) }),
		]);
		const mods = composeAnonChanges([
			Change.modify(0, TestChange.mint([0], 1)),
			Change.modify(3, TestChange.mint([0], 2)),
			Change.modify(8, TestChange.mint([0], 3)),
		]);
		const actual = rebase(revive, mods);
		assert.deepEqual(actual, revive);
	});

	it("modify ↷ delete", () => {
		const mods = composeAnonChanges([
			Change.modify(0, TestChange.mint([0], 1)),
			Change.modify(3, TestChange.mint([0], 2)),
			Change.modify(8, TestChange.mint([0], 3)),
		]);
		const deletion = Change.delete(1, 3);
		const actual = rebase(mods, deletion);
		const expected = composeAnonChanges([
			// Modify at an earlier index is unaffected by a delete at a later index
			Change.modify(0, TestChange.mint([0], 1)),
			// Modify as the same index as a delete is muted by the delete
			// Modify at a later index moves to an earlier index due to a delete at an earlier index
			Change.modify(5, TestChange.mint([0], 3)),
		]);
		checkDeltaEquality(actual, expected);
	});

	it("insert ↷ delete", () => {
		const insert = composeAnonChanges([
			Change.insert(0, 1, 1),
			Change.insert(3, 1, 2),
			Change.insert(8, 1, 3),
		]);
		const deletion = Change.delete(1, 3);
		const actual = rebase(insert, deletion);
		const expected = composeAnonChanges([
			// Earlier insert is unaffected
			Change.insert(0, 1, 1),
			// Overlapping insert has its index reduced
			Change.insert(2, 1, 2),
			// Later insert has its index reduced
			Change.insert(5, 1, 3),
		]);
		checkDeltaEquality(actual, expected);
	});

	it("revive ↷ delete", () => {
		const revive = composeAnonChanges([
			Change.revive(0, 1, { revision: tag1, localId: brand(0) }),
			Change.revive(3, 1, { revision: tag1, localId: brand(1) }),
			Change.revive(8, 1, { revision: tag1, localId: brand(2) }),
		]);
		const deletion = Change.delete(1, 3);
		const actual = rebase(revive, deletion, tag2);
		const expected = composeAnonChanges([
			// Rebase does not affect the stored repair data
			Change.revive(0, 1, { revision: tag1, localId: brand(0) }),
			Change.revive(2, 1, {
				revision: tag1,
				localId: brand(1),
				lineage: [{ revision: tag2, id: brand(0), count: 3, offset: 1 }],
			}),
			Change.revive(5, 1, { revision: tag1, localId: brand(2) }),
		]);
		assert.deepEqual(actual, expected);
	});

	it("redundant revive ↷ related delete", () => {
		const revive = Change.redundantRevive(0, 3, { revision: tag1, localId: brand(1) });
		const deletion = Change.delete(1, 1);
		const actual = rebase(revive, deletion, tag2);
		const expected = composeAnonChanges([
			// Earlier revive is unaffected
			Change.redundantRevive(0, 1, { revision: tag1, localId: brand(1) }),
			// Overlapping revive is no longer redundant
			Change.revive(1, 1, {
				revision: tag2,
				localId: brand(0),
				adjacentCells: [{ id: brand(0), count: 1 }],
			}),
			// Later revive is unaffected
			Change.redundantRevive(2, 1, { revision: tag1, localId: brand(3) }),
		]);
		assert.deepEqual(actual, expected);
	});

	it("delete ↷ overlapping delete", () => {
		// Deletes ---DEFGH--
		const deleteA = Change.delete(3, 5);
		// Deletes --CD-F-HI
		const deleteB = composeAnonChanges([
			Change.delete(2, 2, brand(0)),
			Change.delete(3, 1, brand(2)),
			Change.delete(4, 2, brand(3)),
		]);
		const actual = rebase(deleteA, deleteB, tag1);
		// Deletes --E-G
		const expected = [
			{ count: 2 },
			Mark.onEmptyCell({ revision: tag1, localId: brand(1) }, Mark.delete(1, brand(0))),
			Mark.delete(1, brand(1)),
			Mark.onEmptyCell({ revision: tag1, localId: brand(2) }, Mark.delete(1, brand(2))),
			Mark.delete(1, brand(3)),
			Mark.onEmptyCell({ revision: tag1, localId: brand(3) }, Mark.delete(1, brand(4))),
		];
		checkDeltaEquality(actual, expected);
	});

	it("delete ↷ earlier delete", () => {
		// Deletes ---DE
		const deleteA = Change.delete(3, 2);
		// Deletes AB--
		const deleteB = Change.delete(0, 2);
		const actual = rebase(deleteA, deleteB);
		// Deletes -DE
		const expected = Change.delete(1, 2);
		assert.deepEqual(actual, expected);
	});

	it("delete ↷ later delete", () => {
		// Deletes AB--
		const deleteA = Change.delete(0, 2);
		// Deletes ---DE
		const deleteB = Change.delete(2, 2);
		const actual = rebase(deleteA, deleteB);
		assert.deepEqual(actual, deleteA);
	});

	it("move ↷ overlapping delete", () => {
		// Moves ---DEFGH--
		const move = Change.move(3, 5, 0);
		// Deletes --CD-F-HI
		const deletion = composeAnonChanges([
			Change.delete(2, 2, brand(0)),
			Change.delete(3, 1, brand(2)),
			Change.delete(4, 2, brand(3)),
		]);
		const actual = rebase(move, deletion, tag1);

		// Moves --E-G
		const expected = [
			Mark.moveIn(1, brand(0), { isSrcConflicted: true }),
			Mark.moveIn(1, brand(1)),
			Mark.moveIn(1, brand(2), { isSrcConflicted: true }),
			Mark.moveIn(1, brand(3)),
			Mark.moveIn(1, brand(4), { isSrcConflicted: true }),
			{ count: 2 },
			Mark.onEmptyCell(
				{
					revision: tag1,
					localId: brand(1),
					adjacentCells: [{ id: brand(0), count: 2 }],
				},
				Mark.moveOut(1, brand(0)),
			),
			Mark.moveOut(1, brand(1)),
			Mark.onEmptyCell(
				{ revision: tag1, localId: brand(2), adjacentCells: [{ id: brand(2), count: 1 }] },
				Mark.moveOut(1, brand(2)),
			),
			Mark.moveOut(1, brand(3)),
			Mark.onEmptyCell(
				{
					revision: tag1,
					localId: brand(3),
					adjacentCells: [{ id: brand(3), count: 2 }],
				},
				Mark.moveOut(1, brand(4)),
			),
		];
		assert.deepEqual(actual, expected);
	});

	it("modify ↷ insert", () => {
		const mods = composeAnonChanges([
			Change.modify(0, TestChange.mint([0], 1)),
			Change.modify(3, TestChange.mint([0], 2)),
		]);
		const insert = Change.insert(2, 1, 2);
		const expected = composeAnonChanges([
			// Modify at earlier index is unaffected
			Change.modify(0, TestChange.mint([0], 1)),
			// Modify at later index has its index increased
			Change.modify(4, TestChange.mint([0], 2)),
		]);
		const actual = rebase(mods, insert);
		assert.deepEqual(actual, expected);
	});

	it("delete ↷ insert", () => {
		// Deletes A-CD-E
		const deletion = composeAnonChanges([
			Change.delete(0, 1, brand(0)),
			Change.delete(1, 2, brand(1)),
			Change.delete(2, 1, brand(3)),
		]);
		// Inserts between C and D
		const insert = Change.insert(3, 1, 2);
		const expected = composeAnonChanges([
			// Delete with earlier index is unaffected
			Change.delete(0, 1, brand(0)),
			// Delete at overlapping index is split
			Change.delete(1, 1, brand(1)),
			Change.delete(2, 1, brand(2)),
			// Delete at later index has its index increased
			Change.delete(3, 1, brand(3)),
		]);
		const actual = rebase(deletion, insert);
		assert.deepEqual(actual, expected);
	});

	it("insert ↷ insert", () => {
		const insertA = composeAnonChanges([Change.insert(0, 1, 1), Change.insert(3, 1, 2)]);
		const insertB = Change.insert(1, 1, 3);
		const actual = rebase(insertA, insertB);
		const expected = composeAnonChanges([Change.insert(0, 1, 1), Change.insert(4, 1, 2)]);
		assert.deepEqual(actual, expected);
	});

	it("revive ↷ insert", () => {
		const revive = composeAnonChanges([
			Change.revive(0, 1, { revision: tag1, localId: brand(0) }),
			Change.revive(3, 2, { revision: tag1, localId: brand(1) }),
			Change.revive(7, 1, { revision: tag1, localId: brand(3) }),
		]);
		// TODO: test both tiebreak policies
		const insert = Change.insert(2, 1);
		const actual = rebase(revive, insert);
		const expected = composeAnonChanges([
			Change.revive(0, 1, { revision: tag1, localId: brand(0) }),
			Change.revive(4, 2, { revision: tag1, localId: brand(1) }),
			Change.revive(8, 1, { revision: tag1, localId: brand(3) }),
		]);
		assert.deepEqual(actual, expected);
	});

	it("redundant revive ↷ insert", () => {
		const revive = Change.redundantRevive(0, 3, { revision: tag1, localId: brand(0) });
		const insert = Change.insert(1, 1);
		const actual = rebase(revive, insert);
		const expected = composeAnonChanges([
			Change.redundantRevive(0, 1, { revision: tag1, localId: brand(0) }),
			Change.redundantRevive(2, 2, { revision: tag1, localId: brand(1) }),
		]);
		assert.deepEqual(actual, expected);
	});

	it("modify ↷ revive", () => {
		const mods = composeAnonChanges([
			Change.modify(0, TestChange.mint([0], 1)),
			Change.modify(3, TestChange.mint([0], 2)),
		]);
		const revive = Change.revive(2, 1, { revision: tag1, localId: brand(0) });
		const expected = composeAnonChanges([
			// Modify at earlier index is unaffected
			Change.modify(0, TestChange.mint([0], 1)),
			// Modify at later index has its index increased
			Change.modify(4, TestChange.mint([0], 2)),
		]);
		const actual = rebase(mods, revive);
		assert.deepEqual(actual, expected);
	});

	it("delete ↷ revive", () => {
		// Deletes A-CD-E
		const deletion = composeAnonChanges([
			Change.delete(0, 1, brand(0)),
			Change.delete(1, 2, brand(1)),
			Change.delete(2, 1, brand(3)),
		]);
		// Revives content between C and D
		const revive = Change.revive(3, 1, { revision: tag1, localId: brand(0) });
		const expected = composeAnonChanges([
			// Delete with earlier index is unaffected
			Change.delete(0, 1, brand(0)),
			// Delete at overlapping index is split
			Change.delete(1, 1, brand(1)),
			Change.delete(2, 1, brand(2)),
			// Delete at later index has its index increased
			Change.delete(3, 1, brand(3)),
		]);
		const actual = rebase(deletion, revive);
		assert.deepEqual(actual, expected);
	});

	it("insert ↷ revive", () => {
		const insert = composeAnonChanges([Change.insert(0, 1, 1), Change.insert(3, 1, 2)]);
		const revive = Change.revive(1, 1, { revision: tag1, localId: brand(0) });
		const actual = rebase(insert, revive);
		const expected = composeAnonChanges([Change.insert(0, 1, 1), Change.insert(4, 1, 2)]);
		assert.deepEqual(actual, expected);
	});

	it("reviveAA ↷ reviveB => BAA", () => {
		const lineage: SF.LineageEvent[] = [{ revision: tag2, id: brand(0), count: 1, offset: 1 }];
		const reviveAA = Change.revive(0, 2, { revision: tag1, localId: brand(0), lineage });
		const reviveB = Change.revive(0, 1, { revision: tag2, localId: brand(0) });
		const expected = Change.revive(1, 2, { revision: tag1, localId: brand(0), lineage });
		const actual = rebase(reviveAA, reviveB);
		assert.deepEqual(actual, expected);
	});

	it("reviveAA ↷ reviveB => AAB", () => {
		const lineage: SF.LineageEvent[] = [{ revision: tag2, id: brand(0), count: 1, offset: 0 }];
		const reviveAA = Change.revive(0, 2, { revision: tag1, localId: brand(0), lineage });
		const reviveB = Change.revive(0, 1, { revision: tag2, localId: brand(0) });
		const expected = Change.revive(0, 2, { revision: tag1, localId: brand(0), lineage });
		const actual = rebase(reviveAA, reviveB);
		assert.deepEqual(actual, expected);
	});

	it("reviveBB ↷ reviveA => BBA", () => {
		const reviveBB = Change.revive(0, 2, { revision: tag2, localId: brand(0) });
		const reviveA = Change.revive(0, 1, {
			revision: tag1,
			localId: brand(1),
			lineage: [{ revision: tag2, id: brand(0), count: 2, offset: 2 }],
		});
		const expected = Change.revive(0, 2, { revision: tag2, localId: brand(0) });
		const actual = rebase(reviveBB, reviveA);
		assert.deepEqual(actual, expected);
	});

	it("reviveBB ↷ reviveA => ABB", () => {
		const reviveBB = Change.revive(5, 2, { revision: tag2, localId: brand(0) });
		const reviveA = Change.revive(5, 1, {
			revision: tag1,
			localId: brand(0),
			lineage: [{ revision: tag2, id: brand(0), count: 2, offset: 0 }],
		});
		const expected = Change.revive(6, 2, { revision: tag2, localId: brand(0) });
		const actual = rebase(reviveBB, reviveA);
		assert.deepEqual(actual, expected);
	});

	it("reviveA ↷ reviveBB => BAB", () => {
		const lineage: SF.LineageEvent[] = [{ revision: tag2, id: brand(5), count: 2, offset: 1 }];
		const reviveA = Change.revive(5, 1, { revision: tag1, localId: brand(6), lineage });
		const reviveBB = Change.revive(5, 2, { revision: tag2, localId: brand(5) });
		const expected = Change.revive(6, 1, { revision: tag1, localId: brand(6), lineage });
		const actual = rebase(reviveA, reviveBB);
		assert.deepEqual(actual, expected);
	});

	it("reviveAA ↷ reviveCB => CBAA", () => {
		const lineage: SF.LineageEvent[] = [
			{ revision: tag2, id: brand(0), count: 1, offset: 1 },
			{ revision: tag3, id: brand(0), count: 1, offset: 1 },
		];
		const reviveAA = Change.revive(0, 2, { revision: tag1, localId: brand(0), lineage });
		const reviveB = composeAnonChanges([
			Change.revive(0, 1, { revision: tag2, localId: brand(0) }),
			Change.revive(0, 1, { revision: tag3, localId: brand(0) }),
		]);
		const expected = Change.revive(2, 2, { revision: tag1, localId: brand(0), lineage });
		const actual = rebase(reviveAA, reviveB);
		assert.deepEqual(actual, expected);
	});

	it("revive ↷ same revive", () => {
		const reviveA = Change.revive(0, 3, { revision: tag1, localId: brand(1) });
		const reviveB = Change.revive(0, 1, { revision: tag1, localId: brand(2) });
		const actual = rebase(reviveA, reviveB, tag2);
		const expected = composeAnonChanges([
			Change.revive(0, 1, { revision: tag1, localId: brand(1) }),
			Change.redundantRevive(1, 1, { revision: tag1, localId: brand(2) }),
			Change.revive(2, 1, { revision: tag1, localId: brand(3) }),
		]);
		assert.deepEqual(actual, expected);
	});

	it("revive ↷ same revive (base within curr)", () => {
		const reviveA = Change.revive(0, 3, { revision: tag1, localId: brand(1) });
		const reviveB = Change.revive(0, 1, { revision: tag1, localId: brand(2) });
		const actual = rebase(reviveA, reviveB, tag2);
		const expected = composeAnonChanges([
			Change.revive(0, 1, { revision: tag1, localId: brand(1) }),
			Change.redundantRevive(1, 1, { revision: tag1, localId: brand(2) }),
			Change.revive(2, 1, { revision: tag1, localId: brand(3) }),
		]);
		assert.deepEqual(actual, expected);
	});

	it("revive ↷ same revive (curr within base)", () => {
		const reviveA = Change.revive(0, 1, { revision: tag1, localId: brand(2) });
		const reviveB = Change.revive(0, 3, { revision: tag1, localId: brand(1) });
		const actual = rebase(reviveA, reviveB, tag2);
		const expected = Change.redundantRevive(1, 1, { revision: tag1, localId: brand(2) });
		assert.deepEqual(actual, expected);
	});

	it("concurrent inserts ↷ delete", () => {
		const delA = tagChange(Change.delete(0, 1), mintRevisionTag());
		const insertB = tagChange(Change.insert(0, 1), mintRevisionTag());
		const insertC = tagChange(Change.insert(1, 1), mintRevisionTag());
		const insertB2 = rebaseTagged(insertB, delA);
		const insertC2 = rebaseTagged(insertC, delA, insertB2);
		const expected = Change.insert(1, 1);
		checkDeltaEquality(insertC2.change, expected);
	});

	it("concurrent inserts ↷ connected delete", () => {
		const delA = tagChange(Change.delete(0, 1), mintRevisionTag());
		const delB = tagChange(Change.delete(1, 1), mintRevisionTag());
		const delC = tagChange(Change.delete(0, 1), mintRevisionTag());

		const insertD = tagChange(Change.insert(0, 1), mintRevisionTag());
		const insertE = tagChange(Change.insert(3, 1), mintRevisionTag());
		const insertD2 = rebaseTagged(insertD, delA, delB, delC);
		const insertE2 = rebaseTagged(insertE, delA, delB, delC, insertD2);
		const expected = Change.insert(1, 1);
		checkDeltaEquality(insertE2.change, expected);
	});

	it("concurrent insert and move ↷ delete", () => {
		const delA = tagChange(Change.delete(0, 1), mintRevisionTag());
		const insertB = tagChange(Change.insert(0, 1), mintRevisionTag());
		const moveC = tagChange(Change.move(2, 1, 1), mintRevisionTag());
		const insertB2 = rebaseTagged(insertB, delA);
		const moveC2 = rebaseTagged(moveC, delA, insertB2);
		const expected = Change.move(2, 1, 1);
		checkDeltaEquality(moveC2.change, expected);
	});

	it("modify ↷ move", () => {
		const inner = TestChange.mint([0], 1);
		const modify = Change.modify(0, inner);
		const move = Change.move(0, 1, 4);
		const expected = Change.modify(3, inner);
		const rebased = rebase(modify, move);
		assert.deepEqual(rebased, expected);
	});

	it("delete ↷ move", () => {
		const deletion = Change.delete(2, 2);
		const move = Change.move(1, 3, 0);
		const expected = Change.delete(1, 2);
		const rebased = rebase(deletion, move);
		assert.deepEqual(rebased, expected);
	});

	it("move ↷ move", () => {
		const moveA = Change.move(2, 2, 0);
		const moveB = Change.move(2, 2, 5);
		const expected = Change.move(0, 2, 5);
		const rebased = rebase(moveB, moveA);
		assert.deepEqual(rebased, expected);
	});

	it("delete ↷ composite move", () => {
		const move1 = Change.move(0, 1, 2, brand(0));
		const move2 = Change.move(1, 1, 3, brand(1));
		const move3 = Change.move(2, 1, 4, brand(2));
		const move = composeAnonChanges([move1, move2, move3]);
		const del = Change.delete(0, 1);
		const rebased = rebase(del, move);
		const expected = Change.delete(3, 1);
		assert.deepEqual(rebased, expected);
	});

	it("rebasing over transient revive changes cell ID", () => {
		const change = TestChange.mint([0], 1);
		const modify = Change.modifyDetached(0, change, {
			revision: tag1,
			localId: brand(1),
		});

		const revive = [
			Mark.transient(
				Mark.revive(2, { revision: tag1, localId: brand(0) }),
				Mark.delete(2, brand(2)),
			),
		];

		const rebased = rebase(modify, revive, tag2);
		const expected = Change.modifyDetached(0, change, {
			revision: tag2,
			localId: brand(3),
			adjacentCells: [{ id: brand(2), count: 2 }],
		});
		assert.deepEqual(rebased, expected);
	});

	it("rebasing over transient adds lineage", () => {
		const insert = Change.insert(0, 1);
		const transient = [Mark.transient(Mark.insert(2, brand(0)), Mark.delete(2, brand(2)))];
		const rebased = rebase(insert, transient);
		const expected = [
			Mark.insert(1, {
				localId: brand(0),
				lineage: [{ revision: tag1, id: brand(2), count: 2, offset: 0 }],
			}),
		];

		assert.deepEqual(rebased, expected);
	});

	it("delete ↷ [move, delete]", () => {
		const moveAndDelete = [
			Mark.moveOut(1, brand(0)),
			{ count: 1 },
			Mark.transient(Mark.moveIn(1, brand(0)), Mark.delete(1, brand(1))),
		];

		const del = Change.delete(0, 1);
		const rebased = rebase(del, moveAndDelete);
		const expected = [
			{ count: 1 },
			Mark.delete(1, brand(0), {
				cellId: {
					revision: tag1,
					localId: brand(1),
					adjacentCells: [{ id: brand(1), count: 1 }],
				},
			}),
		];

		assert.deepEqual(rebased, expected);
	});

	it("revive ↷ [revive, move]", () => {
		const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
		const reviveAndMove = [
			Mark.transient(Mark.revive(1, cellId), Mark.moveOut(1, brand(1))),
			{ count: 1 },
			Mark.moveIn(1, brand(1)),
		];
		const revive = Change.revive(0, 1, cellId);
		const rebased = rebase(revive, reviveAndMove, tag2);
		const expected = Change.redundantRevive(1, 1, cellId);
		assert.deepEqual(rebased, expected);
	});

	it("revive ↷ [revive, move, delete]", () => {
		const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
		const reviveMoveDelete = [
			Mark.transient(Mark.revive(1, cellId), Mark.moveOut(1, brand(1))),
			{ count: 1 },
			Mark.transient(Mark.moveIn(1, brand(1)), Mark.delete(1, brand(2))),
		];
		const revive = Change.revive(0, 1, cellId);
		const rebased = rebase(revive, reviveMoveDelete, tag2);
		const expected = Change.revive(1, 1, {
			revision: tag2,
			localId: brand(2),
			adjacentCells: [{ id: brand(2), count: 1 }],
		});
		assert.deepEqual(rebased, expected);
	});

	it("move chain ↷ delete", () => {
		const del = Change.delete(0, 1);
		const move = [
			Mark.moveOut(1, brand(0), {
				finalEndpoint: { localId: brand(1) },
			}),
			{ count: 1 },
			Mark.transient(Mark.moveIn(1, brand(0)), Mark.moveOut(1, brand(1))),
			{ count: 1 },
			Mark.moveIn(1, brand(1), { finalEndpoint: { localId: brand(0) } }),
		];

		const rebased = rebase(move, del);
		const expected = [
			Mark.moveOut(1, brand(0), {
				cellId: {
					revision: tag1,
					localId: brand(0),
					adjacentCells: [{ id: brand(0), count: 1 }],
				},
				finalEndpoint: { localId: brand(1) },
			}),
			{ count: 1 },
			Mark.transient(Mark.moveIn(1, brand(0)), Mark.moveOut(1, brand(1))),
			{ count: 1 },
			Mark.moveIn(1, brand(1), {
				finalEndpoint: { localId: brand(0) },
				isSrcConflicted: true,
			}),
		];

		assert.deepEqual(rebased, expected);
	});

	it("revive and move ↷ move", () => {
		const reviveAndMove = [
			Mark.transient(Mark.revive(1, undefined), Mark.moveOut(1, brand(1))),
			{ count: 2 },
			Mark.moveIn(1, brand(1)),
		];

		const move = Change.move(0, 1, 2);
		const rebased = rebase(reviveAndMove, move);
		const expected = [
			{ count: 1 },
			Mark.transient(Mark.revive(1, undefined), Mark.moveOut(1, brand(1))),
			{ count: 1 },
			Mark.moveIn(1, brand(1)),
		];

		assert.deepEqual(rebased, expected);
	});

	it("delete ↷ move with multiple destinations", () => {
		const del = [Mark.delete(2, brand(0))];
		const move = [
			Mark.moveOut(2, brand(0)),
			{ count: 1 },
			Mark.moveIn(1, brand(0)),
			{ count: 1 },
			Mark.moveIn(1, brand(1)),
		];

		const rebased = rebase(del, move);
		const expected = [
			{ count: 1 },
			Mark.delete(1, brand(0)),
			{ count: 1 },
			Mark.delete(1, brand(1)),
		];
		assert.deepEqual(rebased, expected);
	});

	describe("Over composition", () => {
		it("insert ↷ [delete, delete]", () => {
			const deletes: TestChangeset = shallowCompose([
				tagChange(Change.delete(1, 2), tag1),
				tagChange(Change.delete(0, 2), tag2),
			]);

			const insert = Change.insert(3, 1);
			const rebased = rebaseOverComposition(
				insert,
				deletes,
				revisionMetadataSourceFromInfo([{ revision: tag1 }, { revision: tag2 }]),
			);

			const expected = [
				Mark.insert(1, {
					localId: brand(0),
					lineage: [
						{ revision: tag2, id: brand(0), count: 1, offset: 1 },
						{ revision: tag1, id: brand(0), count: 2, offset: 2 },
						{ revision: tag2, id: brand(1), count: 1, offset: 0 },
					],
				}),
			];
			assert.deepEqual(rebased, expected);
		});

		it("modify ↷ [delete, delete]", () => {
			const deletes: TestChangeset = shallowCompose([
				tagChange(Change.delete(1, 3), tag1),
				tagChange(Change.delete(0, 2), tag2),
			]);

			const nodeChange = TestChange.mint([], 0);
			const modify = Change.modify(3, nodeChange);
			const rebased = rebaseOverComposition(
				modify,
				deletes,
				revisionMetadataSourceFromInfo([{ revision: tag1 }, { revision: tag2 }]),
			);

			const expected = Change.modifyDetached(0, nodeChange, {
				revision: tag1,
				localId: brand(2),
				adjacentCells: [{ id: brand(0), count: 3 }],
				lineage: [{ revision: tag2, id: brand(0), count: 2, offset: 1 }],
			});
			assert.deepEqual(rebased, expected);
		});
	});
});
