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
} from "../../../core";
import { ChangesetLocalId, RevisionInfo, SequenceField as SF } from "../../../feature-libraries";
import { brand } from "../../../util";
import { TestChange } from "../../testChange";
import { fakeTaggedRepair as fakeRepair } from "../../utils";
import { cases, ChangeMaker as Change, TestChangeset } from "./testEdits";
import { compose, composeNoVerify, normalizeMoveIds, shallowCompose } from "./utils";

const type: TreeSchemaIdentifier = brand("Node");
const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const tag4: RevisionTag = mintRevisionTag();
const revInfos: RevisionInfo[] = [
	{ revision: tag1 },
	{ revision: tag2 },
	{ revision: tag3 },
	{ revision: tag4 },
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
						it.skip(title, () => {
							// These changes do not form a valid sequence of composable changes
						});
					} else {
						it(title, () => {
							const ab = composeNoVerify([taggedA, taggedB]);
							const left = composeNoVerify([makeAnonChange(ab), taggedC], revInfos);
							const bc = composeNoVerify([taggedB, taggedC]);
							const right = composeNoVerify([taggedA, makeAnonChange(bc)], revInfos);

							normalizeMoveIds(left);
							normalizeMoveIds(right);
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

	it("Does not leave empty mark lists and fields", () => {
		const insertion = Change.insert(0, 1);
		const deletion = Change.delete(0, 1);
		const actual = shallowCompose([makeAnonChange(insertion), makeAnonChange(deletion)]);
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
		const modify = Change.modify(0, { valueChange: { value: 2 } });
		const expected: SF.Changeset = [
			{ type: "Delete", count: 3 },
			{
				type: "Modify",
				changes: { valueChange: { value: 2 } },
			},
		];
		const actual = shallowCompose([makeAnonChange(deletion), makeAnonChange(modify)]);
		assert.deepEqual(actual, expected);
	});

	it("revive ○ modify", () => {
		const revive = Change.revive(0, 3, tag1, 0);
		const modify = Change.modify(0, { valueChange: { value: 2 } });
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachedBy: tag1,
				detachIndex: 0,
				changes: { valueChange: { value: 2 } },
			},
			{
				type: "Revive",
				content: fakeRepair(tag1, 1, 2),
				count: 2,
				detachedBy: tag1,
				detachIndex: 1,
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
				detachedBy: tag1,
				detachIndex: 0,
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
				detachedBy: tag1,
				detachIndex: 0,
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
		const insert = Change.insert(0, 3, 1);
		const deletion = Change.delete(1, 1);
		const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(deletion)]);
		const expected: SF.Changeset = [
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
		const deletion = Change.delete(1, 4);
		const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(deletion)], revInfos);
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
		const modify = Change.modify(0, { valueChange: { value: 1 } });
		const deletion = Change.delete(0, 1);
		const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(deletion)]);
		assert.deepEqual(actual, deletion);
	});

	it("delete ○ delete", () => {
		// Deletes ABC-----IJKLM
		const deleteA: SF.Changeset = [
			{ type: "Delete", count: 3 },
			5,
			{ type: "Delete", count: 5 },
		];
		// Deletes DEFG--OP
		const deleteB: SF.Changeset = [
			{ type: "Delete", count: 4 },
			2,
			{ type: "Delete", count: 2 },
		];
		const actual = shallowCompose([tagChange(deleteA, tag1), tagChange(deleteB, tag2)]);
		// Deletes ABCDEFG-IJKLMNOP
		const expected: SF.Changeset = [
			{ type: "Delete", revision: tag1, count: 3 },
			{ type: "Delete", revision: tag2, count: 4 },
			1,
			{ type: "Delete", revision: tag1, count: 5 },
			1,
			{ type: "Delete", revision: tag2, count: 2 },
		];
		assert.deepEqual(actual, expected);
	});

	it("revive ○ delete", () => {
		const revive = Change.revive(0, 5, tag1, 0);
		const deletion: SF.Changeset = [
			1,
			{ type: "Delete", count: 1 },
			1,
			{ type: "Delete", count: 3 },
		];
		const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(deletion)]);
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachedBy: tag1,
				detachIndex: 0,
			},
			{
				type: "Revive",
				content: fakeRepair(tag1, 2, 1),
				count: 1,
				detachedBy: tag1,
				detachIndex: 2,
			},
			{ type: "Delete", count: 1 },
		];
		assert.deepEqual(actual, expected);
	});

	it("revive and modify ○ delete", () => {
		const revive: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachedBy: tag1,
				detachIndex: 0,
				changes: { valueChange: { value: 1 } },
			},
		];
		const deletion: SF.Changeset = [{ type: "Delete", count: 2 }];
		const actual = shallowCompose([tagChange(revive, tag2), tagChange(deletion, tag3)]);
		const expected: SF.Changeset = [{ type: "Delete", revision: tag3, count: 1 }];
		assert.deepEqual(actual, expected);
	});

	it("modify ○ insert", () => {
		const modify = Change.modify(0, { valueChange: { value: 1 } });
		const insert = Change.insert(0, 1, 2);
		const expected: SF.Changeset = [
			{ type: "Insert", content: [{ type, value: 2 }], id: brand(2) },
			{
				type: "Modify",
				changes: { valueChange: { value: 1 } },
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
			{ type: "Delete", revision: tag1, count: 3 },
		];
		const actual = shallowCompose([tagChange(deletion, tag1), tagChange(insert, tag2)]);
		assert.deepEqual(actual, expected);
	});

	it("revive ○ insert", () => {
		const revive = Change.revive(0, 5, tag1, 0);
		const insert = Change.insert(0, 1, 2);
		// TODO: test with merge-right policy as well
		const expected: SF.Changeset = [
			{ type: "Insert", content: [{ type, value: 2 }], id: brand(2) },
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 5),
				count: 5,
				detachedBy: tag1,
				detachIndex: 0,
			},
		];
		const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(insert)]);
		assert.deepEqual(actual, expected);
	});

	it("insert ○ insert", () => {
		const insertA: SF.Changeset = [
			{ type: "Insert", revision: tag1, content: [{ type, value: 1 }], id: brand(1) },
			2,
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
			4,
			{ type: "Insert", revision: tag4, content: [{ type, value: 5 }], id: brand(5) },
		];
		const actual = shallowCompose([makeAnonChange(insertA), makeAnonChange(insertB)], revInfos);
		const expected: SF.Changeset = [
			{ type: "Insert", revision: tag3, content: [{ type, value: 4 }], id: brand(4) },
			{ type: "Insert", revision: tag1, content: [{ type, value: 1 }], id: brand(1) },
			2,
			{ type: "Insert", revision: tag2, content: [{ type, value: 2 }], id: brand(2) },
			{ type: "Insert", revision: tag4, content: [{ type, value: 5 }], id: brand(5) },
			{ type: "Insert", revision: tag2, content: [{ type, value: 3 }], id: brand(3) },
		];
		assert.deepEqual(actual, expected);
	});

	it("modify ○ revive", () => {
		const modify = Change.modify(0, { valueChange: { value: 1 } });
		const revive = Change.revive(0, 2, tag1, 0);
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 2),
				count: 2,
				detachedBy: tag1,
				detachIndex: 0,
			},
			{
				type: "Modify",
				changes: { valueChange: { value: 1 } },
			},
		];
		const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(revive)]);
		assert.deepEqual(actual, expected);
	});

	it("delete ○ revive (different earlier nodes)", () => {
		const deletion = tagChange(Change.delete(0, 2), tag1);
		const revive = makeAnonChange(
			Change.revive(0, 2, tag2, 0, undefined, undefined, [{ revision: tag1, offset: 0 }]),
		);
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag2, 0, 2),
				count: 2,
				detachedBy: tag2,
				detachIndex: 0,
				lineage: [{ revision: tag1, offset: 0 }],
			},
			{ type: "Delete", count: 2, revision: tag1 },
		];
		const actual = shallowCompose([deletion, revive]);
		assert.deepEqual(actual, expected);
	});

	it("delete ○ revive (different in-between nodes)", () => {
		const deletion = tagChange(Change.delete(0, 2), tag1);
		const revive = makeAnonChange(
			Change.revive(0, 2, tag2, 0, undefined, undefined, [{ revision: tag1, offset: 1 }]),
		);
		const expected: SF.Changeset = [
			{ type: "Delete", count: 1, revision: tag1 },
			{
				type: "Revive",
				content: fakeRepair(tag2, 0, 2),
				count: 2,
				detachedBy: tag2,
				detachIndex: 0,
				lineage: [{ revision: tag1, offset: 1 }],
			},
			{ type: "Delete", count: 1, revision: tag1 },
		];
		const actual = shallowCompose([deletion, revive]);
		assert.deepEqual(actual, expected);
	});

	it("delete ○ revive (different later nodes)", () => {
		const deletion = tagChange(Change.delete(0, 2), tag1);
		const revive = makeAnonChange(
			Change.revive(0, 2, tag2, 0, undefined, undefined, [{ revision: tag1, offset: 2 }]),
		);
		const expected: SF.Changeset = [
			{ type: "Delete", count: 2, revision: tag1 },
			{
				type: "Revive",
				content: fakeRepair(tag2, 0, 2),
				count: 2,
				detachedBy: tag2,
				detachIndex: 0,
				lineage: [{ revision: tag1, offset: 2 }],
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
		const revive = Change.revive(0, 1, tag1, 2, undefined, undefined, [
			{ revision: tag2, offset: 1 },
		]);
		const expected: SF.Changeset = [
			{ type: "Delete", count: 1, revision: tag2 },
			{ type: "Delete", count: 1, revision: tag1 },
			1,
			{ type: "Delete", count: 1, revision: tag1 },
			{ type: "Delete", count: 1, revision: tag2 },
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
		const revive = Change.revive(0, 2, tag2, 0);
		const expected: SF.Changeset = [1, { type: "Delete", count: 3, revision: tag1 }];
		const actual = shallowCompose([
			tagChange(delete1, tag1),
			tagChange(delete2, tag2),
			tagChange(revive, tag3),
		]);
		assert.deepEqual(actual, expected);
	});

	it("reviveAA ○ reviveB => BAA", () => {
		const reviveAA = Change.revive(0, 2, tag1, 1, undefined, undefined, [
			{ revision: tag2, offset: 1 },
		]);
		const reviveB = Change.revive(0, 1, tag2, 0);
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag2, 0, 1),
				count: 1,
				detachedBy: tag2,
				detachIndex: 0,
			},
			{
				type: "Revive",
				content: fakeRepair(tag1, 1, 2),
				count: 2,
				detachedBy: tag1,
				detachIndex: 1,
				lineage: [{ revision: tag2, offset: 1 }],
			},
		];
		const actual = shallowCompose([makeAnonChange(reviveAA), makeAnonChange(reviveB)]);
		assert.deepEqual(actual, expected);
	});

	it("reviveA ○ reviveBB => BAB", () => {
		const reviveA = Change.revive(0, 1, tag1, 1, undefined, undefined, [
			{ revision: tag2, offset: 1 },
		]);
		const reviveB1 = Change.revive(0, 1, tag2, 0);
		const reviveB2 = Change.revive(2, 1, tag2, 1);
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag2, 0, 1),
				count: 1,
				detachedBy: tag2,
				detachIndex: 0,
			},
			{
				type: "Revive",
				content: fakeRepair(tag1, 1, 1),
				count: 1,
				detachedBy: tag1,
				detachIndex: 1,
				lineage: [{ revision: tag2, offset: 1 }],
			},
			{
				type: "Revive",
				content: fakeRepair(tag2, 1, 1),
				count: 1,
				detachedBy: tag2,
				detachIndex: 1,
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
		const reviveA = Change.revive(0, 2, tag1, 0, undefined, undefined, [
			{ revision: tag2, offset: 0 },
		]);
		const reviveB = Change.revive(2, 1, tag2, 0);
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 2),
				count: 2,
				detachedBy: tag1,
				detachIndex: 0,
				lineage: [{ revision: tag2, offset: 0 }],
			},
			{
				type: "Revive",
				content: fakeRepair(tag2, 0, 1),
				count: 1,
				detachedBy: tag2,
				detachIndex: 0,
			},
		];
		const actual = shallowCompose([makeAnonChange(reviveA), makeAnonChange(reviveB)]);
		assert.deepEqual(actual, expected);
	});

	it("revive ○ conflicted revive", () => {
		const reviveA = Change.revive(0, 2, tag1, 0);
		const reviveB = Change.revive(0, 2, tag1, 0, undefined, tag2);
		const expected: SF.Changeset = [
			{
				type: "Revive",
				content: fakeRepair(tag1, 0, 2),
				count: 2,
				detachedBy: tag1,
				detachIndex: 0,
				revision: tag2,
			},
		];
		const actual = shallowCompose([tagChange(reviveA, tag2), makeAnonChange(reviveB)]);
		assert.deepEqual(actual, expected);
	});

	it("insert ○ revive", () => {
		const insert: SF.Changeset = [
			{ type: "Insert", revision: tag1, content: [{ type, value: 1 }], id: brand(1) },
			2,
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
				detachedBy: tag1,
				detachIndex: 0,
			},
			4,
			{
				type: "Revive",
				revision: tag4,
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachedBy: tag1,
				detachIndex: 0,
			},
		];
		const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(revive)], revInfos);
		const expected: SF.Changeset = [
			{
				type: "Revive",
				revision: tag3,
				count: 1,
				content: fakeRepair(tag1, 0, 1),
				detachedBy: tag1,
				detachIndex: 0,
			},
			{ type: "Insert", revision: tag1, content: [{ type, value: 1 }], id: brand(1) },
			2,
			{ type: "Insert", revision: tag2, content: [{ type, value: 2 }], id: brand(2) },
			{
				type: "Revive",
				revision: tag4,
				content: fakeRepair(tag1, 0, 1),
				count: 1,
				detachedBy: tag1,
				detachIndex: 0,
			},
			{ type: "Insert", revision: tag2, content: [{ type, value: 3 }], id: brand(3) },
		];
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
		const return1 = tagChange(Change.return(0, 1, 3, tag2), tag3);
		const return2 = tagChange(Change.return(3, 1, 0, tag3), tag4);
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
			tagChange(Change.move(1, 1, 1), tag2),
			makeAnonChange([]),
		]);
		const actual = shallowCompose([tagChange(move1, tag1), tagChange(move2, tag2)]);
		assert.deepEqual(actual, expected);
	});

	it("move ○ move with no net effect (forward and back)", () => {
		const move1 = Change.move(0, 1, 1);
		const move2 = Change.move(1, 1, 0);
		const expected = shallowCompose([
			tagChange(Change.move(0, 1, 0), tag2),
			makeAnonChange([]),
		]);
		const actual = shallowCompose([tagChange(move1, tag1), tagChange(move2, tag2)]);
		assert.deepEqual(actual, expected);
	});
});
