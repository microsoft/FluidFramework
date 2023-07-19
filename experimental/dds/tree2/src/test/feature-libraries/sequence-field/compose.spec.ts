/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	RevisionTag,
	makeAnonChange,
	tagChange,
	TreeSchemaIdentifier,
	mintRevisionTag,
	tagRollbackInverse,
} from "../../../core";
import { ChangesetLocalId, RevisionInfo, SequenceField as SF } from "../../../feature-libraries";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { fakeTaggedRepair as fakeRepair } from "../../utils";
// eslint-disable-next-line import/no-internal-modules
import { ChangeAtomId } from "../../../feature-libraries/modular-schema";
import { cases, ChangeMaker as Change, TestChangeset } from "./testEdits";
import { compose, composeNoVerify, shallowCompose } from "./utils";

const type: TreeSchemaIdentifier = brand("Node");
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
					} else if (
						title.startsWith("((insert, move), delete)") ||
						title.startsWith("((revive, move), delete)") ||
						title.startsWith("((modify_insert, move), delete)") ||
						title.startsWith("((insert, return), delete)")
					) {
						it.skip(title, () => {
							// These cases fail because when composing an insert/revive with a move and a delete,
							// we lose any trace of the move and represent the transient insert/revive at inconsistent
							// locations:
							// - It ends up at the destination of the move when composing ((A B) C)
							// - It ends up at the source of the move when composing (A (B C))
							// It is problematic for the transient (or even a simple deletion) to be represented at the
							// source of the move, because that does not match up where the content would be if it
							// were revived.
							// At the same time, we cannot simply represent a deletion at the destination of a move
							// without keeping a trace of the move, because composing that with an earlier change,
							// such as nested changes under the moved/deleted content, would not work.
							// If the changesets are being composed need to be independently rebasable (i.e., one can
							// be considered conflicted without necessarily affecting the others) in their composed
							// form, then all move information needs to be preserved.
							// If, on the other hand, such independent rebasing is not needed (either because the
							// output of the composition is not rebased, or because the output forms a single
							// transaction that is rebased as a whole) then *intermediate* moves can be discarded.
							// E.g., Moving a node from fields A to B and B to C can be represented as a single move
							// from A to C.
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
		const expected: TestChangeset = [
			{
				type: "Insert",
				content: [{ type, value: 0 }],
				changes: TestChange.mint([], 42),
				id: brand(0),
			},
			{ type: "Insert", content: [{ type, value: 1 }], id: brand(1) },
		];
		const actual = compose([makeAnonChange(insert), makeAnonChange(modify)]);
		assert.deepEqual(actual, expected);
	});

	it("transient insert ○ modify", () => {
		const detach: ChangeAtomId = {
			revision: tag2,
			localId: brand(1),
		};
		const insert: SF.Insert<never> = {
			type: "Insert",
			content: [
				{ type, value: 0 },
				{ type, value: 1 },
			],
			id: brand(0),
			transientDetach: detach,
		};
		const modify: SF.Modify<TestChange> = {
			type: "Modify",
			changes: TestChange.mint([], 42),
			detachEvent: detach,
		};
		const actual = compose([makeAnonChange([insert]), makeAnonChange([modify])], revInfos);
		assert.deepEqual(actual, [insert]);
	});

	it("transient revive ○ modify", () => {
		const detach: ChangeAtomId = {
			revision: tag2,
			localId: brand(1),
		};
		const revive: SF.Revive<never> = {
			type: "Revive",
			detachEvent: {
				revision: tag1,
				localId: brand(0),
			},
			count: 2,
			content: [],
			transientDetach: detach,
		};
		const modify: SF.Modify<TestChange> = {
			type: "Modify",
			changes: TestChange.mint([], 42),
			detachEvent: detach,
		};
		const actual = compose([makeAnonChange([revive]), makeAnonChange([modify])], revInfos);
		assert.deepEqual(actual, [revive]);
	});

	it("transient insert ○ revive & modify", () => {
		const detach: ChangeAtomId = {
			revision: tag2,
			localId: brand(1),
		};
		const insert: SF.Insert<never> = {
			type: "Insert",
			content: [{ type, value: 0 }],
			id: brand(0),
			transientDetach: detach,
		};
		const revive: SF.Revive<TestChange> = {
			type: "Revive",
			changes: TestChange.mint([], 42),
			detachEvent: detach,
			count: 1,
			content: fakeRepair(tag2, 0, 1),
		};
		const expected: SF.Insert<TestChange> = {
			type: "Insert",
			id: brand(0),
			changes: TestChange.mint([], 42),
			content: [{ type, value: 0 }],
		};
		const actual = compose([makeAnonChange([insert]), makeAnonChange([revive])], revInfos);
		assert.deepEqual(actual, [expected]);
	});

	it("modify insert ○ modify", () => {
		const childChangeA = TestChange.mint([0], 1);
		const childChangeB = TestChange.mint([0, 1], 2);
		const childChangeAB = TestChange.compose([
			makeAnonChange(childChangeA),
			makeAnonChange(childChangeB),
		]);
		const insert: TestChangeset = [
			{
				type: "Insert",
				revision: tag1,
				content: [{ type, value: 1 }],
				changes: childChangeA,
				id: defaultInsertId,
			},
		];
		const modify = Change.modify(0, childChangeB);
		const expected: TestChangeset = [
			{
				type: "Insert",
				revision: tag1,
				content: [{ type, value: 1 }],
				changes: childChangeAB,
				id: defaultInsertId,
			},
		];
		const actual = compose([tagChange(insert, tag1), tagChange(modify, tag2)]);
		assert.deepEqual(actual, expected);
	});

	it("delete ○ modify", () => {
		const deletion = Change.delete(0, 3);
		const childChange = TestChange.mint([0, 1], 2);
		const modify = Change.modify(0, childChange);
		const expected: TestChangeset = [
			{ type: "Delete", id: brand(0), count: 3 },
			{
				type: "Modify",
				changes: childChange,
			},
		];
		const actual = shallowCompose([makeAnonChange(deletion), makeAnonChange(modify)]);
		assert.deepEqual(actual, expected);
	});

	it("revive ○ modify", () => {
		const revive = Change.revive(0, 3, { revision: tag1, localId: brand(0) });
		const childChange = TestChange.mint([0, 1], 2);
		const modify = Change.modify(0, childChange);
		const expected: TestChangeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachEvent: { revision: tag1, localId: brand(0) },
				changes: childChange,
				inverseOf: tag1,
			},
			{
				type: "Revive",
				content: fakeRepair(tag1, 1, 2),
				count: 2,
				detachEvent: { revision: tag1, localId: brand(1) },
				inverseOf: tag1,
			},
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
		const revive: TestChangeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachEvent: { revision: tag1, localId: brand(0) },
				changes: childChangeA,
			},
		];
		const modify: TestChangeset = [
			{
				type: "Modify",
				changes: childChangeB,
			},
		];
		const expected: TestChangeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachEvent: { revision: tag1, localId: brand(0) },
				changes: childChangeAB,
			},
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
		const modifyA = Change.modify(0, childChangeA);
		const modifyB = Change.modify(0, childChangeB);
		const expected: TestChangeset = [
			{
				type: "Modify",
				changes: childChangeAB,
			},
		];
		const actual = compose([makeAnonChange(modifyA), makeAnonChange(modifyB)]);
		assert.deepEqual(actual, expected);
	});

	it("insert ○ delete (within insert)", () => {
		const insert = tagChange(Change.insert(0, 3, 1), tag1);
		const deletion = tagChange(Change.delete(1, 1), tag2);
		const actual = shallowCompose([insert, deletion]);
		const expected: SF.Changeset = [
			{
				type: "Insert",
				content: [{ type, value: 1 }],
				id: brand(1),
				revision: tag1,
			},
			{
				type: "Insert",
				content: [{ type, value: 2 }],
				id: brand(2),
				revision: tag1,
				transientDetach: { revision: tag2, localId: brand(0) },
			},
			{
				type: "Insert",
				content: [{ type, value: 3 }],
				id: brand(3),
				revision: tag1,
			},
		];
		assert.deepEqual(actual, expected);
	});

	it("insert ○ move (within insert)", () => {
		const insert = Change.insert(0, 3, 1);
		const move = Change.move(1, 1, 0);
		const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(move)]);
		const expected: SF.Changeset = [
			{
				type: "Insert",
				content: [{ type, value: 2 }],
				id: brand(2),
			},
			{
				type: "Insert",
				content: [{ type, value: 1 }],
				id: brand(1),
			},
			{
				type: "Insert",
				content: [{ type, value: 3 }],
				id: brand(3),
			},
		];
		assert.deepEqual(actual, expected);
	});

	it("insert ○ delete (across inserts)", () => {
		const insert: SF.Changeset = [
			{
				type: "Insert",
				revision: tag1,
				content: [
					{ type, value: 1 },
					{ type, value: 2 },
				],
				id: brand(1),
			},
			{
				type: "Insert",
				revision: tag2,
				content: [
					{ type, value: 3 },
					{ type, value: 4 },
				],
				id: brand(3),
			},
			{
				type: "Insert",
				revision: tag1,
				content: [
					{ type, value: 5 },
					{ type, value: 6 },
				],
				id: brand(5),
			},
		];
		const deletion = tagChange(Change.delete(1, 4), tag2);
		const actual = shallowCompose([makeAnonChange(insert), deletion], revInfos);
		const expected: SF.Changeset = [
			{
				type: "Insert",
				revision: tag1,
				content: [{ type, value: 1 }],
				id: brand(1),
			},
			{
				type: "Insert",
				revision: tag1,
				content: [{ type, value: 2 }],
				id: brand(2),
				transientDetach: { revision: tag2, localId: brand(0) },
			},
			{
				type: "Insert",
				revision: tag2,
				content: [
					{ type, value: 3 },
					{ type, value: 4 },
				],
				id: brand(3),
				transientDetach: { revision: tag2, localId: brand(1) },
			},
			{
				type: "Insert",
				revision: tag1,
				content: [{ type, value: 5 }],
				id: brand(5),
				transientDetach: { revision: tag2, localId: brand(3) },
			},
			{
				type: "Insert",
				revision: tag1,
				content: [{ type, value: 6 }],
				id: brand(6),
			},
		];
		assert.deepEqual(actual, expected);
	});

	it("insert ○ move (across inserts)", () => {
		const insert: SF.Changeset = [
			{
				type: "Insert",
				revision: tag1,
				content: [
					{ type, value: 1 },
					{ type, value: 2 },
				],
				id: brand(1),
			},
			{
				type: "Insert",
				revision: tag2,
				content: [
					{ type, value: 3 },
					{ type, value: 4 },
				],
				id: brand(3),
			},
			{
				type: "Insert",
				revision: tag1,
				content: [
					{ type, value: 5 },
					{ type, value: 6 },
				],
				id: brand(5),
			},
		];
		const move = Change.move(1, 4, 0);
		const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(move)], revInfos);

		const expected: SF.Changeset = [
			{
				type: "Insert",
				revision: tag1,
				content: [{ type, value: 2 }],
				id: brand(2),
			},
			{
				type: "Insert",
				revision: tag2,
				content: [
					{ type, value: 3 },
					{ type, value: 4 },
				],
				id: brand(3),
			},
			{
				type: "Insert",
				revision: tag1,
				content: [{ type, value: 5 }],
				id: brand(5),
			},
			{
				type: "Insert",
				revision: tag1,
				content: [{ type, value: 1 }],
				id: brand(1),
			},
			{
				type: "Insert",
				revision: tag1,
				content: [{ type, value: 6 }],
				id: brand(6),
			},
		];
		assert.deepEqual(actual, expected);
	});

	it("modify ○ delete", () => {
		const childChange = TestChange.mint([0, 1], 2);
		const modify = Change.modify(0, childChange);
		const deletion = Change.delete(0, 1);
		const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(deletion)]);
		const expected: TestChangeset = [
			{ type: "Delete", id: brand(0), count: 1, changes: childChange },
		];
		assert.deepEqual(actual, expected);
	});

	it("delete ○ delete", () => {
		// Deletes ABC-----IJKLM
		const deleteA: SF.Changeset = [
			{ type: "Delete", id: brand(0), count: 3 },
			{ count: 5 },
			{ type: "Delete", id: brand(3), count: 5 },
		];
		// Deletes DEFG--OP
		const deleteB: SF.Changeset = [
			{ type: "Delete", id: brand(0), count: 4 },
			{ count: 2 },
			{ type: "Delete", id: brand(4), count: 2 },
		];
		const actual = shallowCompose([tagChange(deleteA, tag1), tagChange(deleteB, tag2)]);
		// Deletes ABCDEFG-IJKLMNOP
		const expected: SF.Changeset = [
			{ type: "Delete", revision: tag1, id: brand(0), count: 3 },
			{ type: "Delete", revision: tag2, id: brand(0), count: 4 },
			{ count: 1 },
			{ type: "Delete", revision: tag1, id: brand(3), count: 5 },
			{ count: 1 },
			{ type: "Delete", revision: tag2, id: brand(4), count: 2 },
		];
		assert.deepEqual(actual, expected);
	});

	it("revive ○ delete", () => {
		const revive = Change.revive(0, 5, { revision: tag1, localId: brand(0) });
		const deletion: SF.Changeset = [
			{ count: 1 },
			{ type: "Delete", id: brand(0), count: 1 },
			{ count: 1 },
			{ type: "Delete", id: brand(1), count: 3 },
		];
		const actual = shallowCompose([makeAnonChange(revive), tagChange(deletion, tag2)]);
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachEvent: { revision: tag1, localId: brand(0) },
				inverseOf: tag1,
			},
			{
				type: "Revive",
				content: fakeRepair(tag1, 1, 1),
				count: 1,
				detachEvent: { revision: tag1, localId: brand(1) },
				inverseOf: tag1,
				transientDetach: { revision: tag2, localId: brand(0) },
			},
			{
				type: "Revive",
				content: fakeRepair(tag1, 2, 1),
				count: 1,
				detachEvent: { revision: tag1, localId: brand(2) },
				inverseOf: tag1,
			},
			{
				type: "Revive",
				content: fakeRepair(tag1, 3, 2),
				count: 2,
				detachEvent: { revision: tag1, localId: brand(3) },
				inverseOf: tag1,
				transientDetach: { revision: tag2, localId: brand(1) },
			},
			{ type: "Delete", id: brand(3), count: 1, revision: tag2 },
		];
		assert.deepEqual(actual, expected);
	});

	it("revive and modify ○ delete", () => {
		const childChange = TestChange.mint([0, 1], 2);
		const detachEvent: ChangeAtomId = { revision: tag1, localId: brand(0) };
		const revive: TestChangeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachEvent,
				changes: childChange,
			},
		];
		const deletion: TestChangeset = [{ type: "Delete", id: brand(0), count: 2 }];
		const actual = shallowCompose([tagChange(revive, tag2), tagChange(deletion, tag3)]);
		const expected: TestChangeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachEvent,
				changes: childChange,
				revision: tag2,
				transientDetach: { revision: tag3, localId: brand(0) },
			},
			{ type: "Delete", revision: tag3, id: brand(1), count: 1 },
		];
		assert.deepEqual(actual, expected);
	});

	it("modify ○ insert", () => {
		const childChange = TestChange.mint([0, 1], 2);
		const modify = Change.modify(0, childChange);
		const insert = Change.insert(0, 1, 2);
		const expected: TestChangeset = [
			{ type: "Insert", content: [{ type, value: 2 }], id: brand(2) },
			{
				type: "Modify",
				changes: childChange,
			},
		];
		const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(insert)]);
		assert.deepEqual(actual, expected);
	});

	it("delete ○ insert", () => {
		const deletion = Change.delete(0, 3);
		const insert = Change.insert(0, 1, 2);
		// TODO: test with merge-right policy as well
		const expected: SF.Changeset = [
			{ type: "Insert", revision: tag2, content: [{ type, value: 2 }], id: brand(2) },
			{ type: "Delete", id: brand(0), revision: tag1, count: 3 },
		];
		const actual = shallowCompose([tagChange(deletion, tag1), tagChange(insert, tag2)]);
		assert.deepEqual(actual, expected);
	});

	it("revive ○ insert", () => {
		const revive = Change.revive(0, 5, { revision: tag1, localId: brand(0) });
		const insert = Change.insert(0, 1, 2);
		// TODO: test with merge-right policy as well
		const expected: SF.Changeset = [
			{ type: "Insert", content: [{ type, value: 2 }], id: brand(2) },
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 5),
				count: 5,
				detachEvent: { revision: tag1, localId: brand(0) },
				inverseOf: tag1,
			},
		];
		const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(insert)]);
		assert.deepEqual(actual, expected);
	});

	it("insert ○ insert", () => {
		const insertA: SF.Changeset = [
			{ type: "Insert", revision: tag1, content: [{ type, value: 1 }], id: brand(1) },
			{ count: 2 },
			{
				type: "Insert",
				revision: tag2,
				content: [
					{ type, value: 2 },
					{ type, value: 3 },
				],
				id: brand(2),
			},
		];

		const insertB: SF.Changeset = [
			{ type: "Insert", revision: tag3, content: [{ type, value: 4 }], id: brand(4) },
			{ count: 4 },
			{ type: "Insert", revision: tag4, content: [{ type, value: 5 }], id: brand(5) },
		];
		const actual = shallowCompose([makeAnonChange(insertA), makeAnonChange(insertB)], revInfos);
		const expected: SF.Changeset = [
			{ type: "Insert", revision: tag3, content: [{ type, value: 4 }], id: brand(4) },
			{ type: "Insert", revision: tag1, content: [{ type, value: 1 }], id: brand(1) },
			{ count: 2 },
			{ type: "Insert", revision: tag2, content: [{ type, value: 2 }], id: brand(2) },
			{ type: "Insert", revision: tag4, content: [{ type, value: 5 }], id: brand(5) },
			{ type: "Insert", revision: tag2, content: [{ type, value: 3 }], id: brand(3) },
		];
		assert.deepEqual(actual, expected);
	});

	it("modify ○ revive", () => {
		const childChange = TestChange.mint([0, 1], 2);
		const modify = Change.modify(0, childChange);
		const revive = Change.revive(0, 2, { revision: tag1, localId: brand(0) });
		const expected: TestChangeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 2),
				count: 2,
				detachEvent: { revision: tag1, localId: brand(0) },
				inverseOf: tag1,
			},
			{
				type: "Modify",
				changes: childChange,
			},
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
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag2, 0, 2),
				count: 2,
				detachEvent: { revision: tag2, localId: brand(0), lineage },
				inverseOf: tag2,
			},
			{ type: "Delete", id: brand(0), count: 2, revision: tag1 },
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
		const expected: SF.Changeset = [
			{ type: "Delete", id: brand(0), count: 1, revision: tag1 },
			{
				type: "Revive",
				content: fakeRepair(tag2, 0, 2),
				count: 2,
				detachEvent: { revision: tag2, localId: brand(0), lineage },
				inverseOf: tag2,
			},
			{ type: "Delete", id: brand(1), count: 1, revision: tag1 },
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
		const expected: SF.Changeset = [
			{ type: "Delete", id: brand(0), count: 2, revision: tag1 },
			{
				type: "Revive",
				content: fakeRepair(tag2, 0, 2),
				count: 2,
				detachEvent: { revision: tag2, localId: brand(0), lineage },
				inverseOf: tag2,
			},
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
		const expected: SF.Changeset = [
			{ type: "Delete", id: brand(0), count: 1, revision: tag2 },
			{ type: "Delete", id: brand(0), count: 1, revision: tag1 },
			{ count: 1 },
			{ type: "Delete", id: brand(2), count: 1, revision: tag1 },
			{ type: "Delete", id: brand(1), count: 1, revision: tag2 },
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
		const expected: SF.Changeset = [
			{ count: 1 },
			{ type: "Delete", id: brand(0), count: 3, revision: tag1 },
		];
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
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag2, 0, 1),
				count: 1,
				detachEvent: { revision: tag2, localId: brand(0) },
				inverseOf: tag2,
			},
			{
				type: "Revive",
				content: fakeRepair(tag1, 1, 2),
				count: 2,
				detachEvent: { revision: tag1, localId: brand(1), lineage },
				inverseOf: tag1,
			},
		];
		const actual = shallowCompose([makeAnonChange(reviveAA), makeAnonChange(reviveB)]);
		assert.deepEqual(actual, expected);
	});

	it("reviveA ○ reviveBB => BAB", () => {
		const lineage: SF.LineageEvent[] = [{ revision: tag2, id: brand(0), count: 2, offset: 1 }];
		const reviveA = Change.revive(0, 1, { revision: tag1, localId: brand(1), lineage });
		const reviveB1 = Change.revive(0, 1, { revision: tag2, localId: brand(0) });
		const reviveB2 = Change.revive(2, 1, { revision: tag2, localId: brand(1) });
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag2, 0, 1),
				count: 1,
				detachEvent: { revision: tag2, localId: brand(0) },
				inverseOf: tag2,
			},
			{
				type: "Revive",
				content: fakeRepair(tag1, 1, 1),
				count: 1,
				detachEvent: { revision: tag1, localId: brand(1), lineage },
				inverseOf: tag1,
			},
			{
				type: "Revive",
				content: fakeRepair(tag2, 1, 1),
				count: 1,
				detachEvent: { revision: tag2, localId: brand(1) },
				inverseOf: tag2,
			},
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
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 2),
				count: 2,
				detachEvent: { revision: tag1, localId: brand(0), lineage },
				inverseOf: tag1,
			},
			{
				type: "Revive",
				content: fakeRepair(tag2, 0, 1),
				count: 1,
				detachEvent: { revision: tag2, localId: brand(0) },
				inverseOf: tag2,
			},
		];
		const actual = shallowCompose([makeAnonChange(reviveA), makeAnonChange(reviveB)]);
		assert.deepEqual(actual, expected);
	});

	it("revive ○ redundant revive", () => {
		const reviveA = Change.revive(0, 2, { revision: tag1, localId: brand(0) });
		const reviveB = Change.redundantRevive(0, 2, { revision: tag1, localId: brand(0) });
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 2),
				count: 2,
				detachEvent: { revision: tag1, localId: brand(0) },
				inverseOf: tag1,
				revision: tag2,
			},
		];
		const actual = shallowCompose([tagChange(reviveA, tag2), makeAnonChange(reviveB)]);
		assert.deepEqual(actual, expected);
	});

	it("insert ○ revive", () => {
		const insert: SF.Changeset = [
			{ type: "Insert", revision: tag1, content: [{ type, value: 1 }], id: brand(1) },
			{ count: 2 },
			{
				type: "Insert",
				revision: tag2,
				content: [
					{ type, value: 2 },
					{ type, value: 3 },
				],
				id: brand(2),
			},
		];
		const revive: SF.Changeset = [
			{
				type: "Revive",
				revision: tag3,
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachEvent: { revision: tag1, localId: brand(0) },
			},
			{ count: 4 },
			{
				type: "Revive",
				revision: tag4,
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachEvent: { revision: tag1, localId: brand(0) },
			},
		];
		const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(revive)], revInfos);
		const expected: SF.Changeset = [
			{
				type: "Revive",
				revision: tag3,
				count: 1,
				content: fakeRepair(tag1, 0, 1),
				detachEvent: { revision: tag1, localId: brand(0) },
			},
			{ type: "Insert", revision: tag1, content: [{ type, value: 1 }], id: brand(1) },
			{ count: 2 },
			{ type: "Insert", revision: tag2, content: [{ type, value: 2 }], id: brand(2) },
			{
				type: "Revive",
				revision: tag4,
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachEvent: { revision: tag1, localId: brand(0) },
			},
			{ type: "Insert", revision: tag2, content: [{ type, value: 3 }], id: brand(3) },
		];
		assert.deepEqual(actual, expected);
	});

	it("move ○ modify", () => {
		const move = Change.move(0, 1, 1);
		const nodeChange = TestChange.mint([], 42);
		const modify = Change.modify(1, nodeChange);
		const expected: SF.Changeset<TestChange> = [
			{ type: "MoveOut", id: brand(0), count: 1, changes: nodeChange },
			{ count: 1 },
			{ type: "MoveIn", id: brand(0), count: 1 },
		];
		const actual = shallowCompose([makeAnonChange(move), makeAnonChange(modify)]);
		assert.deepEqual(actual, expected);
	});

	it("move ○ delete", () => {
		const move = Change.move(1, 1, 3);
		const deletion = Change.delete(3, 1);
		const expected = Change.delete(1, 1);
		const actual = shallowCompose([makeAnonChange(move), makeAnonChange(deletion)]);
		assert.deepEqual(actual, expected);
	});

	it("return ○ return", () => {
		const return1 = tagChange(
			Change.return(0, 1, 3, { revision: tag2, localId: brand(0) }),
			tag3,
		);
		const return2 = tagChange(
			Change.return(3, 1, 0, { revision: tag3, localId: brand(0) }),
			tag4,
		);
		const actual = shallowCompose([return1, return2]);
		assert.deepEqual(actual, []);
	});

	it("move ○ move (forward)", () => {
		const move1 = Change.move(0, 1, 1, brand(0));
		const move2 = Change.move(1, 1, 2, brand(1));
		const expected = Change.move(0, 1, 2, brand(1));
		const actual = shallowCompose([makeAnonChange(move1), makeAnonChange(move2)]);
		assert.deepEqual(actual, expected);
	});

	it("move ○ move (back)", () => {
		const move1 = Change.move(2, 1, 1, brand(0));
		const move2 = Change.move(1, 1, 0, brand(1));
		const expected = Change.move(2, 1, 0, brand(1));
		const actual = shallowCompose([makeAnonChange(move1), makeAnonChange(move2)]);
		assert.deepEqual(actual, expected);
	});

	it("move ○ move with no net effect (back and forward)", () => {
		const move1 = Change.move(1, 1, 0);
		const move2 = Change.move(0, 1, 1);
		const expected = shallowCompose([
			tagChange([], tag1),
			tagChange(Change.move(1, 1, 1), tag2),
		]);
		const actual = shallowCompose([tagChange(move1, tag1), tagChange(move2, tag2)]);
		assert.deepEqual(actual, expected);
	});

	it("move ○ move with no net effect (forward and back)", () => {
		const move1 = Change.move(0, 1, 1);
		const move2 = Change.move(1, 1, 0);
		const expected = shallowCompose([
			tagChange([], tag1),
			tagChange(Change.move(0, 1, 0), tag2),
		]);
		const actual = shallowCompose([tagChange(move1, tag1), tagChange(move2, tag2)]);
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

		const expected: SF.Changeset<string> = [
			{ type: "Modify", changes: nodeChange1, detachEvent: detach1 },
			{ type: "Modify", changes: nodeChange2, detachEvent: detach2 },
		];

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

		const expected: SF.Changeset<string> = [
			{ type: "Modify", changes: nodeChange2, detachEvent: detach2 },
			{ type: "Modify", changes: nodeChange1, detachEvent: detach1 },
		];

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

		const expected: SF.Changeset<string> = [
			{ type: "Modify", changes: nodeChange2, detachEvent: detach1 },
			{ type: "Modify", changes: nodeChange1, detachEvent: detach2 },
		];

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

		const expected: SF.Changeset<string> = [
			{ type: "Modify", changes: nodeChange1, detachEvent: detach2 },
			{ type: "Modify", changes: nodeChange2, detachEvent: detach1 },
		];

		assert.deepEqual(actual, expected);
	});

	it("adjacent blocked revives", () => {
		const lineage: SF.LineageEvent[] = [{ revision: tag2, id: brand(0), count: 1, offset: 1 }];
		const revive1 = Change.blockedRevive(
			0,
			5,
			{ revision: tag1, localId: brand(0) },
			{ revision: tag2, localId: brand(0) },
		);
		const revive2 = Change.blockedRevive(
			0,
			4,
			{ revision: tag3, localId: brand(0) },
			{
				revision: tag4,
				localId: brand(0),
				lineage,
			},
		);
		const actual = shallowCompose([tagChange(revive1, tag5), tagChange(revive2, tag6)]);

		const expected: SF.Changeset<never> = [
			{
				type: "Revive",
				revision: tag5,
				count: 5,
				content: fakeRepair(tag1, 0, 5),
				detachEvent: { revision: tag2, localId: brand(0) },
				inverseOf: tag1,
			},
			{
				type: "Revive",
				revision: tag6,
				count: 4,
				content: fakeRepair(tag3, 0, 4),
				detachEvent: { revision: tag4, localId: brand(0), lineage },
				inverseOf: tag3,
			},
		];

		assert.deepEqual(actual, expected);
	});
});
