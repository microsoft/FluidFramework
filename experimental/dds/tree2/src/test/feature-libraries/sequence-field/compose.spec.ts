/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	RevisionTag,
	makeAnonChange,
	tagChange,
	TreeNodeSchemaIdentifier,
	mintRevisionTag,
	tagRollbackInverse,
	ChangesetLocalId,
	ChangeAtomId,
} from "../../../core";
import { RevisionInfo, SequenceField as SF } from "../../../feature-libraries";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { cases, ChangeMaker as Change, MarkMaker as Mark, TestChangeset } from "./testEdits";
import { compose, composeNoVerify, shallowCompose } from "./utils";

const type: TreeNodeSchemaIdentifier = brand("Node");
const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const tag4: RevisionTag = mintRevisionTag();
const tag5: RevisionTag = mintRevisionTag();
const tag6: RevisionTag = mintRevisionTag();
const revInfos: RevisionInfo[] = [
	{ revision: tag1 },
	{ revision: tag2 },
	{ revision: tag3 },
	{ revision: tag4 },
	{ revision: tag5 },
	{ revision: tag6 },
];

const defaultInsertId: ChangesetLocalId = brand(0);

describe("SequenceField - Compose", () => {
	describe("associativity of triplets", () => {
		const entries = Object.entries(cases);
		for (const a of entries) {
			const taggedA = tagChange(a[1], tag1);
			for (const b of entries) {
				const taggedB = tagChange(b[1], tag2);
				for (const c of entries) {
					const taggedC = tagChange(c[1], tag3);
					const title = `((${a[0]}, ${b[0]}), ${c[0]}) === (${a[0]}, (${b[0]}, ${c[0]}))`;
					if (
						title.startsWith("((delete, insert), revive)") ||
						title.startsWith("((move, insert), revive)") ||
						!SF.areComposable([taggedA, taggedB, taggedC])
					) {
						// These changes do not form a valid sequence of composable changes
					} else if (title.startsWith("((transient_insert, insert), revive)")) {
						it.skip(title, () => {
							// This test fails due to the revive lacking lineage about the delete in the transient insert.
						});
					} else {
						it(title, () => {
							const ab = composeNoVerify([taggedA, taggedB]);
							const left = composeNoVerify([makeAnonChange(ab), taggedC], revInfos);
							const bc = composeNoVerify([taggedB, taggedC]);
							const right = composeNoVerify([taggedA, makeAnonChange(bc)], revInfos);
							assert.deepEqual(left, right);
						});
					}
				}
			}
		}
	});

	it("no changes", () => {
		const actual = shallowCompose([]);
		assert.deepEqual(actual, cases.no_change);
	});

	it("calls composeChild", () => {
		const changes = TestChange.mint([], 1);
		// A changeset with every type of mark, each with nested changes
		// (aside from move-in/return-to marks)
		const edit = [
			Mark.modify(changes),
			Mark.modify(changes, { revision: tag1, localId: brand(0) }),
			Mark.delete(1, { localId: brand(0) }, { changes }),
			Mark.delete(
				1,
				{ localId: brand(1) },
				{ changes, cellId: { revision: tag1, localId: brand(0) } },
			),
			Mark.insert(1, { localId: brand(2) }, { changes }),
			Mark.pin(1, brand(2), { changes }),
			Mark.revive(1, { revision: tag1, localId: brand(1) }, { changes }),
			Mark.moveOut(1, { localId: brand(2) }, { changes }),
			Mark.moveIn(1, { localId: brand(2) }),
			Mark.moveOut(
				1,
				{ localId: brand(3) },
				{ changes, cellId: { revision: tag1, localId: brand(2) } },
			),
			Mark.moveIn(1, { localId: brand(3) }),
			Mark.attachAndDetach(
				Mark.insert(1, { localId: brand(6) }),
				Mark.delete(1, { localId: brand(0) }),
				{ changes },
			),
		];
		let callCount = 0;
		compose([tagChange(edit, tag2)], undefined, (c) => {
			assert.equal(c[0].change, changes);
			callCount += 1;
			return changes;
		});
		assert.equal(callCount, 10);
	});

	it("delete ○ revive => Noop", () => {
		const deletion = tagChange(Change.delete(0, 1), tag1);
		const insertion = tagRollbackInverse(
			Change.revive(0, 1, { revision: tag1, localId: brand(0) }),
			tag2,
			tag1,
		);
		const actual = shallowCompose([deletion, insertion]);
		assert.deepEqual(actual, cases.no_change);
	});

	it("insert ○ modify", () => {
		const insert = Change.insert(0, 2);
		const modify = Change.modify(0, TestChange.mint([], 42));
		const expected = [
			Mark.insert(1, brand(0), { changes: TestChange.mint([], 42) }),
			Mark.insert(1, brand(1)),
		];
		const actual = compose([makeAnonChange(insert), makeAnonChange(modify)]);
		assert.deepEqual(actual, expected);
	});

	it("insert ○ delete ○ modify", () => {
		const changes = TestChange.mint([], 42);
		const insertMark = Mark.insert(2, brand(0));
		const insert = tagChange([insertMark], tag1);
		const del = tagChange([Mark.delete(2, brand(1))], tag2);
		const modify = tagChange(
			[Mark.modify(changes, { revision: tag2, localId: brand(1) })],
			tag3,
		);
		const actual = compose([insert, del, modify], revInfos);
		const expected = [
			Mark.attachAndDetach(
				Mark.insert(1, { revision: tag1, localId: brand(0) }),
				Mark.delete(1, brand(1), { revision: tag2 }),
				{ changes },
			),
			Mark.attachAndDetach(
				Mark.insert(1, { revision: tag1, localId: brand(1) }),
				Mark.delete(1, brand(2), { revision: tag2 }),
			),
		];
		assert.deepEqual(actual, expected);
	});

	it("transient revive ○ modify", () => {
		const inputId: ChangeAtomId = {
			revision: tag1,
			localId: brand(0),
		};
		const outputId: ChangeAtomId = {
			revision: tag2,
			localId: brand(1),
		};
		const changes = TestChange.mint([], 42);
		const transientRevive = [Mark.delete(1, outputId, { cellId: inputId })];
		const modify = [Mark.modify(changes, outputId)];
		const expected = [Mark.delete(1, outputId, { cellId: inputId, changes })];
		const actual = compose([makeAnonChange(transientRevive), makeAnonChange(modify)], revInfos);
		assert.deepEqual(actual, expected);
	});

	it("transient insert ○ revive & modify", () => {
		const transientDetach: ChangeAtomId = {
			revision: tag2,
			localId: brand(1),
		};
		const changes = TestChange.mint([], 42);
		const insert = [
			Mark.attachAndDetach(
				Mark.insert(1, { revision: tag1, localId: brand(0) }),
				Mark.delete(1, brand(1), { revision: tag2 }),
			),
		];
		const revive = [Mark.revive(1, transientDetach, { changes })];
		const expected = [Mark.insert(1, { revision: tag1, localId: brand(0) }, { changes })];
		const actual = compose([makeAnonChange(insert), makeAnonChange(revive)], revInfos);
		assert.deepEqual(actual, expected);
	});

	it("modify insert ○ modify", () => {
		const childChangeA = TestChange.mint([0], 1);
		const childChangeB = TestChange.mint([0, 1], 2);
		const childChangeAB = TestChange.compose([
			makeAnonChange(childChangeA),
			makeAnonChange(childChangeB),
		]);
		const insert = [
			Mark.insert(1, { localId: defaultInsertId, revision: tag1 }, { changes: childChangeA }),
		];
		const modify = Change.modify(0, childChangeB);
		const expected = [
			Mark.insert(
				1,
				{ localId: defaultInsertId, revision: tag1 },
				{ changes: childChangeAB },
			),
		];
		const actual = compose([tagChange(insert, tag1), tagChange(modify, tag2)]);
		assert.deepEqual(actual, expected);
	});

	it("delete ○ modify", () => {
		const deletion = Change.delete(0, 3);
		const childChange = TestChange.mint([0, 1], 2);
		const modify = Change.modify(0, childChange);
		const expected = [Mark.delete(3, brand(0)), Mark.modify(childChange)];
		const actual = shallowCompose([makeAnonChange(deletion), makeAnonChange(modify)]);
		assert.deepEqual(actual, expected);
	});

	it("revive ○ modify", () => {
		const revive = Change.revive(0, 3, { revision: tag1, localId: brand(0) });
		const changes = TestChange.mint([0, 1], 2);
		const modify = Change.modify(0, changes);
		const expected = [
			Mark.revive(1, { revision: tag1, localId: brand(0) }, { changes }),
			Mark.revive(2, { revision: tag1, localId: brand(1) }),
		];
		const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(modify)]);
		assert.deepEqual(actual, expected);
	});

	it("revive and modify ○ modify", () => {
		const childChangeA = TestChange.mint([0], 1);
		const childChangeB = TestChange.mint([0, 1], 2);
		const childChangeAB = TestChange.compose([
			makeAnonChange(childChangeA),
			makeAnonChange(childChangeB),
		]);
		const revive = [
			Mark.revive(1, { revision: tag1, localId: brand(0) }, { changes: childChangeA }),
		];
		const modify = Change.modify(0, childChangeB);
		const expected = [
			Mark.revive(1, { revision: tag1, localId: brand(0) }, { changes: childChangeAB }),
		];
		const actual = compose([makeAnonChange(revive), makeAnonChange(modify)]);
		assert.deepEqual(actual, expected);
	});

	it("modify ○ modify", () => {
		const childChangeA = TestChange.mint([0], 1);
		const childChangeB = TestChange.mint([0, 1], 2);
		const childChangeAB = TestChange.compose([
			makeAnonChange(childChangeA),
			makeAnonChange(childChangeB),
		]);
		const modifyA = [Mark.modify(childChangeA)];
		const modifyB = [Mark.modify(childChangeB)];
		const expected = [Mark.modify(childChangeAB)];
		const actual = compose([makeAnonChange(modifyA), makeAnonChange(modifyB)]);
		assert.deepEqual(actual, expected);
	});

	it("Delete and modify ○ transient revive", () => {
		const changes = TestChange.mint([0], 1);
		const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
		const del = tagChange([Mark.delete(1, cellId, { changes })], tag1);
		const transient = tagChange([Mark.delete(1, brand(1), { cellId })], tag2);

		const composed = compose([del, transient]);
		const expected = [Mark.delete(1, { revision: tag2, localId: brand(1) }, { changes })];
		assert.deepEqual(composed, expected);
	});

	it("Transient insert ○ transient revive", () => {
		const insert = tagChange(
			[Mark.attachAndDetach(Mark.insert(1, brand(0)), Mark.delete(1, brand(1)))],
			tag1,
		);

		const revive = tagChange(
			[Mark.delete(1, brand(0), { cellId: { revision: tag1, localId: brand(1) } })],
			tag2,
		);

		const composed = compose([insert, revive]);
		const expected = [
			Mark.attachAndDetach(
				Mark.insert(1, { revision: tag1, localId: brand(0) }, { revision: tag1 }),
				Mark.delete(1, brand(0), { revision: tag2 }),
			),
		];

		assert.deepEqual(composed, expected);
	});

	it("insert ○ delete (within insert)", () => {
		const insert = tagChange(Change.insert(0, 3, brand(1)), tag1);
		const deletion = tagChange(Change.delete(1, 1), tag2);
		const actual = shallowCompose([insert, deletion]);
		const expected = [
			Mark.insert(1, { localId: brand(1), revision: tag1 }),
			Mark.attachAndDetach(
				Mark.insert(1, { localId: brand(2), revision: tag1 }),
				Mark.delete(1, brand(0), { revision: tag2 }),
			),
			Mark.insert(1, { localId: brand(3), revision: tag1 }),
		];
		assert.deepEqual(actual, expected);
	});

	it("insert ○ move (within insert)", () => {
		const insert = Change.insert(0, 3, brand(1));
		const move = Change.move(1, 1, 0);
		const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(move)]);
		const expected = [
			Mark.moveIn(1, brand(0)),
			Mark.insert(1, { localId: brand(1) }),
			Mark.attachAndDetach(Mark.insert(1, { localId: brand(2) }), Mark.moveOut(1, brand(0))),
			Mark.insert(1, { localId: brand(3) }),
		];
		assert.deepEqual(actual, expected);
	});

	it("insert ○ delete (across inserts)", () => {
		const insert = [
			Mark.insert(2, { localId: brand(1), revision: tag1 }),
			Mark.insert(2, { localId: brand(3), revision: tag2 }),
			Mark.insert(2, { localId: brand(5), revision: tag1 }),
		];
		const deletion = tagChange(Change.delete(1, 4), tag2);
		const actual = shallowCompose([makeAnonChange(insert), deletion], revInfos);
		const expected = [
			Mark.insert(1, { localId: brand(1), revision: tag1 }),
			Mark.attachAndDetach(
				Mark.insert(1, { localId: brand(2), revision: tag1 }),
				Mark.delete(1, brand(0), { revision: tag2 }),
			),
			Mark.attachAndDetach(
				Mark.insert(2, { localId: brand(3), revision: tag2 }),
				Mark.delete(2, brand(1), { revision: tag2 }),
			),
			Mark.attachAndDetach(
				Mark.insert(1, { localId: brand(5), revision: tag1 }),
				Mark.delete(1, brand(3), { revision: tag2 }),
			),
			Mark.insert(1, { localId: brand(6), revision: tag1 }),
		];
		assert.deepEqual(actual, expected);
	});

	it("insert ○ move (across inserts)", () => {
		const insert = [
			Mark.insert(2, { localId: brand(1), revision: tag1 }),
			Mark.insert(2, { localId: brand(3), revision: tag2 }),
			Mark.insert(2, { localId: brand(5), revision: tag1 }),
		];
		const move = Change.move(1, 4, 0);
		const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(move)], revInfos);

		const expected = [
			Mark.moveIn(4, brand(0)),
			Mark.insert(1, { localId: brand(1), revision: tag1 }),
			Mark.attachAndDetach(
				Mark.insert(1, { localId: brand(2), revision: tag1 }),
				Mark.moveOut(1, brand(0)),
			),
			Mark.attachAndDetach(
				Mark.insert(2, { localId: brand(3), revision: tag2 }),
				Mark.moveOut(2, brand(1)),
			),
			Mark.attachAndDetach(
				Mark.insert(1, { localId: brand(5), revision: tag1 }),
				Mark.moveOut(1, brand(3)),
			),
			Mark.insert(1, { localId: brand(6), revision: tag1 }),
		];
		assert.deepEqual(actual, expected);
	});

	it("modify ○ delete", () => {
		const changes = TestChange.mint([0, 1], 2);
		const modify = Change.modify(0, changes);
		const deletion = Change.delete(0, 1);
		const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(deletion)]);
		const expected = [Mark.delete(1, brand(0), { changes })];
		assert.deepEqual(actual, expected);
	});

	it("delete ○ delete", () => {
		// Deletes ABC-----IJKLM
		const deleteA = [Mark.delete(3, brand(0)), { count: 5 }, Mark.delete(5, brand(3))];
		// Deletes DEFG--OP
		const deleteB = [Mark.delete(4, brand(0)), { count: 2 }, Mark.delete(2, brand(4))];
		const actual = shallowCompose([tagChange(deleteA, tag1), tagChange(deleteB, tag2)]);
		// Deletes ABCDEFG-IJKLM-OP
		const expected = [
			Mark.delete(3, brand(0), { revision: tag1 }),
			Mark.delete(4, brand(0), { revision: tag2 }),
			{ count: 1 },
			Mark.delete(5, brand(3), { revision: tag1 }),
			{ count: 1 },
			Mark.delete(2, brand(4), { revision: tag2 }),
		];
		assert.deepEqual(actual, expected);
	});

	it("revive ○ delete", () => {
		// Revive ABCDE
		const revive = Change.revive(0, 5, { revision: tag1, localId: brand(0) });
		// Delete _B_DEF
		const deletion = [
			{ count: 1 },
			Mark.delete(1, brand(0)),
			{ count: 1 },
			Mark.delete(3, brand(1)),
		];
		const actual = shallowCompose([makeAnonChange(revive), tagChange(deletion, tag2)]);
		const expected = [
			Mark.revive(1, { revision: tag1, localId: brand(0) }),
			Mark.delete(
				1,
				{ revision: tag2, localId: brand(0) },
				{ cellId: { revision: tag1, localId: brand(1) } },
			),
			Mark.revive(1, { revision: tag1, localId: brand(2) }),
			Mark.delete(
				2,
				{ revision: tag2, localId: brand(1) },
				{ cellId: { revision: tag1, localId: brand(3) } },
			),
			Mark.delete(1, brand(3), { revision: tag2 }),
		];
		assert.deepEqual(actual, expected);
	});

	it("revive and modify ○ delete", () => {
		const changes = TestChange.mint([0, 1], 2);
		const detachEvent: ChangeAtomId = { revision: tag1, localId: brand(0) };
		const revive = [Mark.revive(1, detachEvent, { changes })];
		const deletion = [Mark.delete(2, brand(0))];
		const actual = shallowCompose([tagChange(revive, tag2), tagChange(deletion, tag3)]);
		const expected: TestChangeset = [
			Mark.delete(1, { localId: brand(0), revision: tag3 }, { cellId: detachEvent, changes }),
			Mark.delete(1, { localId: brand(1), revision: tag3 }),
		];
		assert.deepEqual(actual, expected);
	});

	it("modify ○ insert", () => {
		const childChange = TestChange.mint([0, 1], 2);
		const modify = Change.modify(0, childChange);
		const insert = Change.insert(0, 1, brand(2));
		const expected = [Mark.insert(1, brand(2)), Mark.modify(childChange)];
		const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(insert)]);
		assert.deepEqual(actual, expected);
	});

	it("delete ○ insert", () => {
		const deletion = Change.delete(0, 3);
		const insert = Change.insert(0, 1, brand(2));
		// TODO: test with merge-right policy as well
		const expected = [
			Mark.insert(1, { localId: brand(2), revision: tag2 }),
			Mark.delete(3, brand(0), { revision: tag1 }),
		];
		const actual = shallowCompose([tagChange(deletion, tag1), tagChange(insert, tag2)]);
		assert.deepEqual(actual, expected);
	});

	it("revive ○ insert", () => {
		const revive = Change.revive(0, 5, { revision: tag1, localId: brand(0) });
		const insert = Change.insert(0, 1, brand(2));
		// TODO: test with merge-right policy as well
		const expected = [
			Mark.insert(1, brand(2)),
			Mark.revive(5, { revision: tag1, localId: brand(0) }),
		];
		const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(insert)]);
		assert.deepEqual(actual, expected);
	});

	it("insert ○ insert", () => {
		const insertA = [
			Mark.insert(1, brand(1), { revision: tag1 }),
			{ count: 2 },
			Mark.insert(2, brand(2), { revision: tag2 }),
		];

		const insertB = [
			Mark.insert(1, brand(4), { revision: tag3 }),
			{ count: 4 },
			Mark.insert(1, brand(5), { revision: tag4 }),
		];
		const actual = shallowCompose([makeAnonChange(insertA), makeAnonChange(insertB)], revInfos);
		const expected = [
			Mark.insert(1, brand(4), { revision: tag3 }),
			Mark.insert(1, brand(1), { revision: tag1 }),
			{ count: 2 },
			Mark.insert(1, brand(2), { revision: tag2 }),
			Mark.insert(1, brand(5), { revision: tag4 }),
			Mark.insert(1, brand(3), { revision: tag2 }),
		];
		assert.deepEqual(actual, expected);
	});

	it("modify ○ revive", () => {
		const childChange = TestChange.mint([0, 1], 2);
		const modify = Change.modify(0, childChange);
		const revive = Change.revive(0, 2, { revision: tag1, localId: brand(0) });
		const expected = [
			Mark.revive(2, { revision: tag1, localId: brand(0) }),
			Mark.modify(childChange),
		];
		const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(revive)]);
		assert.deepEqual(actual, expected);
	});

	it("delete ○ revive (different earlier nodes)", () => {
		const deletion = tagChange(Change.delete(0, 2), tag1);
		const lineage: SF.LineageEvent[] = [{ revision: tag1, id: brand(0), count: 2, offset: 0 }];
		const revive = makeAnonChange(
			Change.revive(0, 2, { revision: tag2, localId: brand(0), lineage }),
		);
		const expected = [
			Mark.revive(2, { revision: tag2, localId: brand(0), lineage }),
			Mark.delete(2, brand(0), { revision: tag1 }),
		];
		const actual = shallowCompose([deletion, revive]);
		assert.deepEqual(actual, expected);
	});

	it("delete ○ revive (different in-between nodes)", () => {
		const deletion = tagChange(Change.delete(0, 2), tag1);
		const lineage: SF.LineageEvent[] = [{ revision: tag1, id: brand(0), count: 2, offset: 1 }];
		const revive = makeAnonChange(
			Change.revive(0, 2, { revision: tag2, localId: brand(0), lineage }),
		);
		const expected = [
			Mark.delete(1, brand(0), { revision: tag1 }),
			Mark.revive(2, { revision: tag2, localId: brand(0), lineage }),
			Mark.delete(1, brand(1), { revision: tag1 }),
		];
		const actual = shallowCompose([deletion, revive]);
		assert.deepEqual(actual, expected);
	});

	it("delete ○ revive (different later nodes)", () => {
		const deletion = tagChange(Change.delete(0, 2), tag1);
		const lineage: SF.LineageEvent[] = [{ revision: tag1, id: brand(0), count: 2, offset: 2 }];
		const revive = makeAnonChange(
			Change.revive(0, 2, { revision: tag2, localId: brand(0), lineage }),
		);
		const expected = [
			Mark.delete(2, brand(0), { revision: tag1 }),
			Mark.revive(2, { revision: tag2, localId: brand(0), lineage }),
		];
		const actual = shallowCompose([deletion, revive]);
		assert.deepEqual(actual, expected);
	});

	it("delete1 ○ delete2 ○ revive (delete1)", () => {
		const delete1 = Change.delete(1, 3);
		const delete2 = Change.delete(0, 2);
		// The revive needs lineage to describe the precise gap in which it is reviving the nodes.
		// Such lineage would normally be acquired by rebasing the revive over the second delete.
		const revive = Change.revive(0, 1, {
			revision: tag1,
			localId: brand(1),
			lineage: [{ revision: tag2, id: brand(0), count: 2, offset: 1 }],
		});
		const expected = [
			Mark.delete(1, brand(0), { revision: tag2 }),
			Mark.delete(1, brand(0), { revision: tag1 }),
			{ count: 1 },
			Mark.delete(1, brand(2), { revision: tag1 }),
			Mark.delete(1, brand(1), { revision: tag2 }),
		];
		const actual = shallowCompose([
			tagChange(delete1, tag1),
			tagChange(delete2, tag2),
			tagChange(revive, tag3),
		]);
		assert.deepEqual(actual, expected);
	});

	it("delete1 ○ delete2 ○ revive (delete2)", () => {
		const delete1 = Change.delete(1, 3);
		const delete2 = Change.delete(0, 2);
		const revive = Change.revive(0, 2, { revision: tag2, localId: brand(0) });
		const expected = [{ count: 1 }, Mark.delete(3, brand(0), { revision: tag1 })];
		const actual = shallowCompose([
			tagChange(delete1, tag1),
			tagChange(delete2, tag2),
			tagChange(revive, tag3),
		]);
		assert.deepEqual(actual, expected);
	});

	it("reviveAA ○ reviveB => BAA", () => {
		const lineage: SF.LineageEvent[] = [{ revision: tag2, id: brand(0), count: 1, offset: 1 }];
		const reviveAA = Change.revive(0, 2, { revision: tag1, localId: brand(1), lineage });
		const reviveB = Change.revive(0, 1, { revision: tag2, localId: brand(0) });
		const expected = [
			Mark.revive(1, { revision: tag2, localId: brand(0) }),
			Mark.revive(2, { revision: tag1, localId: brand(1), lineage }),
		];
		const actual = shallowCompose([makeAnonChange(reviveAA), makeAnonChange(reviveB)]);
		assert.deepEqual(actual, expected);
	});

	it("reviveA ○ reviveBB => BAB", () => {
		const lineage: SF.LineageEvent[] = [{ revision: tag2, id: brand(0), count: 2, offset: 1 }];
		const reviveA = Change.revive(0, 1, { revision: tag1, localId: brand(1), lineage });
		const reviveB1 = Change.revive(0, 1, { revision: tag2, localId: brand(0) });
		const reviveB2 = Change.revive(2, 1, { revision: tag2, localId: brand(1) });
		const expected = [
			Mark.revive(1, { revision: tag2, localId: brand(0) }),
			Mark.revive(1, { revision: tag1, localId: brand(1), lineage }),
			Mark.revive(1, { revision: tag2, localId: brand(1) }),
		];
		const actual = shallowCompose([
			makeAnonChange(reviveA),
			makeAnonChange(reviveB1),
			makeAnonChange(reviveB2),
		]);
		assert.deepEqual(actual, expected);
	});

	it("reviveAA ○ reviveB => AAB", () => {
		const lineage: SF.LineageEvent[] = [{ revision: tag2, id: brand(0), count: 1, offset: 0 }];
		const reviveA = Change.revive(0, 2, { revision: tag1, localId: brand(0), lineage });
		const reviveB = Change.revive(2, 1, { revision: tag2, localId: brand(0) });
		const expected = [
			Mark.revive(2, { revision: tag1, localId: brand(0), lineage }),
			Mark.revive(1, { revision: tag2, localId: brand(0) }),
		];
		const actual = shallowCompose([makeAnonChange(reviveA), makeAnonChange(reviveB)]);
		assert.deepEqual(actual, expected);
	});

	it("revive ○ redundant revive", () => {
		const reviveA = Change.revive(0, 2, { revision: tag1, localId: brand(0) });
		const reviveB = Change.redundantRevive(0, 2, { revision: tag1, localId: brand(0) });
		const expected = [
			Mark.revive(2, { revision: tag1, localId: brand(0) }, { revision: tag2 }),
		];
		const actual = shallowCompose([tagChange(reviveA, tag2), makeAnonChange(reviveB)]);
		assert.deepEqual(actual, expected);
	});

	it("insert ○ revive", () => {
		const insert = [
			Mark.insert(1, brand(1), { revision: tag1 }),
			{ count: 2 },
			Mark.insert(2, brand(2), { revision: tag2 }),
		];
		const revive = [
			Mark.revive(1, { revision: tag1, localId: brand(0) }, { revision: tag3 }),
			{ count: 4 },
			Mark.revive(1, { revision: tag1, localId: brand(0) }, { revision: tag4 }),
		];
		const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(revive)], revInfos);
		const expected = [
			Mark.revive(1, { revision: tag1, localId: brand(0) }, { revision: tag3 }),
			Mark.insert(1, brand(1), { revision: tag1 }),
			{ count: 2 },
			Mark.insert(1, brand(2), { revision: tag2 }),
			Mark.revive(1, { revision: tag1, localId: brand(0) }, { revision: tag4 }),
			Mark.insert(1, brand(3), { revision: tag2 }),
		];
		assert.deepEqual(actual, expected);
	});

	it("move ○ modify", () => {
		const move = Change.move(0, 1, 2);
		const changes = TestChange.mint([], 42);
		const modify = Change.modify(1, changes);
		const expected = [
			Mark.moveOut(1, brand(0), { changes }),
			{ count: 1 },
			Mark.moveIn(1, brand(0)),
		];
		const actual = shallowCompose([makeAnonChange(move), makeAnonChange(modify)]);
		assert.deepEqual(actual, expected);
	});

	it("move ○ delete", () => {
		const move = Change.move(1, 1, 4, brand(0));
		const deletion = Change.delete(3, 1, brand(1));
		const expected = [
			{ count: 1 },
			Mark.moveOut(1, brand(0)),
			{ count: 2 },
			Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.delete(1, brand(1))),
		];
		const actual = shallowCompose([makeAnonChange(move), makeAnonChange(deletion)]);
		assert.deepEqual(actual, expected);
	});

	it("return ○ return", () => {
		const cellId1: ChangeAtomId = { revision: tag2, localId: brand(0) };
		const cellId2: ChangeAtomId = { revision: tag3, localId: brand(0) };
		const return1 = tagChange(Change.return(0, 1, 4, cellId1), tag3);
		const return2 = tagChange(Change.return(3, 1, 0, cellId2), tag4);
		const actual = shallowCompose([return1, return2]);

		// We expect vestigial moves to exist to record that the cell's ID was changed.
		const expected = [
			{ count: 4 },
			Mark.attachAndDetach(
				Mark.returnTo(1, { revision: tag3, localId: brand(0) }, cellId1),
				Mark.moveOut(1, { revision: tag4, localId: brand(0) }),
			),
		];
		assert.deepEqual(actual, expected);
	});

	it("modify ○ return", () => {
		const changes = TestChange.mint([], 42);
		const modify = tagChange(Change.modify(3, changes), tag3);
		const ret = tagChange(Change.return(3, 2, 0, { revision: tag1, localId: brand(0) }), tag4);
		const actual = shallowCompose([modify, ret]);
		const expected = [
			Mark.returnTo(
				2,
				{ revision: tag4, localId: brand(0) },
				{ revision: tag1, localId: brand(0) },
			),
			{ count: 3 },
			Mark.moveOut(1, brand(0), { revision: tag4, changes }),
			Mark.moveOut(1, brand(1), { revision: tag4 }),
		];
		assert.deepEqual(actual, expected);
	});

	it("move ○ move with node changes", () => {
		const move1 = [
			Mark.moveIn(1, brand(0)),
			{ count: 1 },
			Mark.moveOut(1, brand(0), { changes: TestChange.mint([], 0) }),
		];

		const move2 = [
			Mark.moveOut(1, brand(0), { changes: TestChange.mint([0], 1) }),
			{ count: 2 },
			Mark.moveIn(1, brand(0)),
		];

		const composed = compose([tagChange(move1, tag1), tagChange(move2, tag2)]);
		const expected = [
			Mark.attachAndDetach(
				Mark.moveIn(1, { revision: tag1, localId: brand(0) }),
				Mark.moveOut(1, { revision: tag2, localId: brand(0) }),
			),
			{ count: 1 },
			Mark.moveOut(
				1,
				{ revision: tag1, localId: brand(0) },
				{
					changes: TestChange.mint([], [0, 1]),
					finalEndpoint: { revision: tag2, localId: brand(0) },
				},
			),
			{ count: 1 },
			Mark.moveIn(
				1,
				{ revision: tag2, localId: brand(0) },
				{ finalEndpoint: { revision: tag1, localId: brand(0) } },
			),
		];

		assert.deepEqual(composed, expected);
	});

	it("move ○ move (forward)", () => {
		const move1 = Change.move(0, 1, 2, brand(0));
		const move2 = Change.move(1, 1, 3, brand(1));
		const actual = shallowCompose([makeAnonChange(move1), makeAnonChange(move2)]);
		const expected = [
			Mark.moveOut(1, brand(0), {
				finalEndpoint: { revision: undefined, localId: brand(1) },
			}),
			{ count: 1 },
			Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.moveOut(1, brand(1))),
			{ count: 1 },
			Mark.moveIn(1, brand(1), { finalEndpoint: { revision: undefined, localId: brand(0) } }),
		];
		assert.deepEqual(actual, expected);
	});

	it("move ○ move (back)", () => {
		const move1 = Change.move(2, 1, 1, brand(0));
		const move2 = Change.move(1, 1, 0, brand(1));
		const actual = shallowCompose([makeAnonChange(move1), makeAnonChange(move2)]);
		const expected = [
			Mark.moveIn(1, brand(1), { finalEndpoint: { revision: undefined, localId: brand(0) } }),
			{ count: 1 },
			Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.moveOut(1, brand(1))),
			{ count: 1 },
			Mark.moveOut(1, brand(0), {
				finalEndpoint: { revision: undefined, localId: brand(1) },
			}),
		];
		assert.deepEqual(actual, expected);
	});

	it("move ○ move adjacent to starting position (back and forward)", () => {
		const move1 = Change.move(1, 1, 0);
		const move2 = Change.move(0, 1, 2);
		const actual = shallowCompose([tagChange(move1, tag1), tagChange(move2, tag2)]);
		const expected = [
			Mark.attachAndDetach(
				Mark.moveIn(1, { revision: tag1, localId: brand(0) }),
				Mark.moveOut(1, { revision: tag2, localId: brand(0) }),
			),
			{ count: 1 },
			Mark.moveIn(
				1,
				{ revision: tag2, localId: brand(0) },
				{
					finalEndpoint: { revision: tag1, localId: brand(0) },
				},
			),
			Mark.moveOut(
				1,
				{ revision: tag1, localId: brand(0) },
				{
					finalEndpoint: { revision: tag2, localId: brand(0) },
				},
			),
		];
		assert.deepEqual(actual, expected);
	});

	it("move ○ move adjacent to starting position (forward and back)", () => {
		const move1 = Change.move(0, 1, 2);
		const move2 = Change.move(1, 1, 0);
		const actual = shallowCompose([tagChange(move1, tag1), tagChange(move2, tag2)]);
		const expected = [
			Mark.moveIn(
				1,
				{ revision: tag2, localId: brand(0) },
				{
					finalEndpoint: { revision: tag1, localId: brand(0) },
				},
			),
			Mark.moveOut(
				1,
				{ revision: tag1, localId: brand(0) },
				{
					finalEndpoint: { revision: tag2, localId: brand(0) },
				},
			),
			{ count: 1 },
			Mark.attachAndDetach(
				Mark.moveIn(1, { revision: tag1, localId: brand(0) }),
				Mark.moveOut(1, { revision: tag2, localId: brand(0) }),
			),
		];
		assert.deepEqual(actual, expected);
	});

	it("adjacent detached modifies 1", () => {
		// Starting state [A B]
		// Revision 1 deletes A
		// Revision 2 deletes B
		// Revision 3 modifies A
		// Revision 4 modifies B
		const nodeChange1 = "Change1";
		const nodeChange2 = "Change2";
		const lineage: SF.LineageEvent[] = [{ revision: tag2, id: brand(0), count: 1, offset: 0 }];
		const detach1: SF.CellId = { revision: tag1, localId: brand(0), lineage };
		const detach2: SF.CellId = { revision: tag2, localId: brand(0) };

		const modify1 = Change.modifyDetached(0, nodeChange1, detach1);
		const modify2 = Change.modifyDetached(0, nodeChange2, detach2);
		const actual = shallowCompose([tagChange(modify1, tag3), tagChange(modify2, tag4)]);

		const expected = [Mark.modify(nodeChange1, detach1), Mark.modify(nodeChange2, detach2)];

		assert.deepEqual(actual, expected);
	});

	it("adjacent detached modifies 2", () => {
		// Starting state [A B]
		// Revision 1 deletes B
		// Revision 2 deletes A
		// Revision 3 modifies B
		// Revision 4 modifies A
		const nodeChange1 = "Change1";
		const nodeChange2 = "Change2";
		const lineage: SF.LineageEvent[] = [{ revision: tag2, id: brand(0), count: 1, offset: 1 }];
		const detach1: SF.CellId = { revision: tag1, localId: brand(1), lineage };
		const detach2: SF.CellId = { revision: tag2, localId: brand(0) };

		const modify1 = Change.modifyDetached(0, nodeChange1, detach1);
		const modify2 = Change.modifyDetached(0, nodeChange2, detach2);
		const actual = shallowCompose([tagChange(modify1, tag3), tagChange(modify2, tag4)]);

		const expected = [Mark.modify(nodeChange2, detach2), Mark.modify(nodeChange1, detach1)];

		assert.deepEqual(actual, expected);
	});

	it("adjacent detached modifies 3", () => {
		// Starting state [A B]
		// Revision 1 deletes A
		// Revision 2 deletes B
		// Revision 3 modifies B
		// Revision 4 modifies A
		const nodeChange1 = "Change1";
		const nodeChange2 = "Change2";
		const lineage: SF.LineageEvent[] = [{ revision: tag2, id: brand(0), count: 1, offset: 0 }];
		const detach1: SF.CellId = { revision: tag1, localId: brand(0), lineage };
		const detach2: SF.CellId = { revision: tag2, localId: brand(0) };

		const modify1 = Change.modifyDetached(0, nodeChange1, detach2);
		const modify2 = Change.modifyDetached(0, nodeChange2, detach1);
		const actual = shallowCompose([tagChange(modify1, tag3), tagChange(modify2, tag4)]);

		const expected = [Mark.modify(nodeChange2, detach1), Mark.modify(nodeChange1, detach2)];

		assert.deepEqual(actual, expected);
	});

	it("adjacent detached modifies 4", () => {
		// Starting state [A B]
		// Revision 1 deletes B
		// Revision 2 deletes A
		// Revision 3 modifies A
		// Revision 4 modifies B
		const nodeChange1 = "Change1";
		const nodeChange2 = "Change2";

		const lineage: SF.LineageEvent[] = [{ revision: tag2, id: brand(0), count: 1, offset: 1 }];
		const detach1: SF.CellId = { revision: tag1, localId: brand(1), lineage };
		const detach2: SF.CellId = { revision: tag2, localId: brand(0) };

		const modify1 = Change.modifyDetached(0, nodeChange1, detach2);
		const modify2 = Change.modifyDetached(0, nodeChange2, detach1);
		const actual = shallowCompose([tagChange(modify1, tag3), tagChange(modify2, tag4)]);

		const expected = [Mark.modify(nodeChange1, detach2), Mark.modify(nodeChange2, detach1)];

		assert.deepEqual(actual, expected);
	});

	it("move, delete, revive", () => {
		const move = tagChange(Change.move(1, 1, 0), tag1);
		const del = tagChange(Change.delete(0, 1), tag2);
		const revive = tagChange(Change.revive(0, 1, { revision: tag2, localId: brand(0) }), tag3);
		const actual = shallowCompose([move, del, revive]);
		const expected = shallowCompose([move]);
		assert.deepEqual(actual, expected);
	});

	// This test leads compose to output a Placeholder mark.
	it.skip("return-to, delete, move-out", () => {
		const returnTo = tagRollbackInverse(
			[
				Mark.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
				{ count: 1 },
				Mark.moveOut(1, brand(0), {
					detachIdOverride: { revision: tag1, localId: brand(0) },
				}),
			],
			tag3,
			tag1,
		);
		const del = tagChange([Mark.delete(1, brand(0))], tag2);
		const move = tagChange(
			[
				Mark.moveOut(1, brand(0), { cellId: { revision: tag2, localId: brand(0) } }),
				{ count: 1 },
				Mark.moveIn(1, brand(0)),
			],
			tag1,
		);
		const actual = shallowCompose([returnTo, del, move]);
		assert.deepEqual(actual, []);
	});

	it("move1, move2, return2", () => {
		for (const [a, b, c] of [
			[0, 1, 2],
			[2, 1, 0],
		]) {
			const move1 = tagChange(Change.move(a, 1, b > a ? b + 1 : b), tag1);
			const move2 = tagChange(Change.move(b, 1, c > b ? c + 1 : c), tag2);
			const return2 = tagRollbackInverse(
				Change.return(c, 1, b > c ? b + 1 : b, { revision: tag2, localId: brand(0) }),
				tag3,
				tag2,
			);

			const composed = shallowCompose([move1, move2, return2]);
			const expected = shallowCompose([move1]);
			assert.deepEqual(composed, expected);
		}
	});

	it("move1 ○ [return1, move2]", () => {
		for (const [a, b, c] of [
			[0, 1, 2],
			[2, 1, 0],
		]) {
			const move1 = tagChange(Change.move(a, 1, b > a ? b + 1 : b), tag1);
			const return1 = tagRollbackInverse(
				Change.return(b, 1, a > b ? a + 1 : a, { revision: tag1, localId: brand(0) }),
				tag2,
				tag1,
			);
			const move2 = tagChange(Change.move(a, 1, c > a ? c + 1 : c), tag3);
			const part2 = shallowCompose([return1, move2]);
			const composed = shallowCompose(
				[move1, makeAnonChange(part2)],
				[{ revision: tag1 }, { revision: tag2, rollbackOf: tag1 }, { revision: tag3 }],
			);
			const expected = shallowCompose([move2]);
			assert.deepEqual(composed, expected);
		}
	});

	it("[move1, move2] ○ [return2, move3]", () => {
		for (const [a, b, c, d] of [
			[0, 1, 2, 3],
			[3, 2, 1, 0],
		]) {
			const move1 = tagChange(Change.move(a, 1, b > a ? b + 1 : b), tag1);
			const move2 = tagChange(Change.move(b, 1, c > b ? c + 1 : c), tag2);
			const part1 = shallowCompose([move1, move2]);
			const return2 = tagRollbackInverse(
				Change.return(c, 1, b > c ? b + 1 : b, { revision: tag2, localId: brand(0) }),
				tag3,
				tag2,
			);
			const move3 = tagChange(Change.move(b, 1, d > b ? d + 1 : d), tag4);
			const part2 = shallowCompose([return2, move3]);
			const composed = shallowCompose(
				[makeAnonChange(part1), makeAnonChange(part2)],
				[
					{ revision: tag1 },
					{ revision: tag2 },
					{ revision: tag3, rollbackOf: tag2 },
					{ revision: tag4 },
				],
			);
			const expected = shallowCompose([move1, move3]);
			assert.deepEqual(composed, expected);
		}
	});

	it("[move1, move2] ○ return1", () => {
		const move1 = tagChange(Change.move(0, 1, 2), tag1);
		const move2 = tagChange(Change.move(1, 1, 3), tag2);
		const return1 = tagChange(
			Change.return(2, 1, 0, { revision: tag1, localId: brand(0) }),
			tag3,
		);

		const composed = shallowCompose([move1, move2, return1]);
		const expected = [
			{ count: 2 },
			Mark.attachAndDetach(
				Mark.moveIn(1, { revision: tag1, localId: brand(0) }),
				Mark.moveOut(1, { revision: tag2, localId: brand(0) }),
			),
			{ count: 1 },
			Mark.attachAndDetach(
				Mark.moveIn(1, { revision: tag2, localId: brand(0) }),
				Mark.moveOut(1, { revision: tag3, localId: brand(0) }),
			),
		];

		assert.deepEqual(composed, expected);
	});
});
