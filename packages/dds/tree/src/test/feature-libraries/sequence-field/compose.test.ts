/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import {
	type ChangeAtomId,
	type ChangesetLocalId,
	type RevisionInfo,
	type RevisionTag,
	makeAnonChange,
} from "../../../core/index.js";
import type { NodeId, SequenceField as SF } from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import { TestNodeId } from "../../testNodeId.js";
import { cases, ChangeMaker as Change, MarkMaker as Mark } from "./testEdits.js";
import {
	areComposable,
	assertChangesetsEqual,
	compose,
	composeNoVerify,
	shallowCompose,
	tagChangeInline,
} from "./utils.js";
import { mintRevisionTag } from "../../utils.js";

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

export function testCompose() {
	describe("Compose", () => {
		describe("associativity of triplets", () => {
			const entries = Object.entries(cases);
			for (const a of entries) {
				const taggedA = tagChangeInline(a[1], tag1);
				for (const b of entries) {
					const taggedB = tagChangeInline(b[1], tag2);
					for (const c of entries) {
						const taggedC = tagChangeInline(c[1], tag3);
						const title = `((${a[0]}, ${b[0]}), ${c[0]}) === (${a[0]}, (${b[0]}, ${c[0]}))`;
						if (
							title.startsWith("((remove, insert), revive)") ||
							title.startsWith("((move, insert), revive)") ||
							!areComposable([taggedA, taggedB, taggedC])
						) {
							// These changes do not form a valid sequence of composable changes
						} else if (
							title.startsWith("((transient_insert, insert), revive)") ||
							title.startsWith("((transient_insert, modify_insert), revive)") ||
							title.startsWith("((move, modify_insert), revive)") ||
							title.startsWith("((remove, modify_insert), revive)")
						) {
							it.skip(title, () => {
								// This test fails due to the revive lacking tombstones about a detach in one of the prior edits
							});
						} else {
							it(title, () => {
								const ab = composeNoVerify([taggedA, taggedB]);
								const left = composeNoVerify([makeAnonChange(ab), taggedC], revInfos);
								const bc = composeNoVerify([taggedB, taggedC]);
								const right = composeNoVerify([taggedA, makeAnonChange(bc)], revInfos);
								assertChangesetsEqual(left, right, true);
							});
						}
					}
				}
			}
		});

		it("no changes", () => {
			const actual = shallowCompose([]);
			assertChangesetsEqual(actual, cases.no_change);
		});

		it("populates cell revision info", () => {
			const tomb = tagChangeInline([Mark.tomb(tag1, brand(0))], tag2);
			const insert = tagChangeInline([Mark.insert(1, brand(0))], tag1);
			const expected = [Mark.insert(1, { revision: tag1, localId: brand(0) })];
			const actual = shallowCompose([tomb, insert]);
			assert.deepEqual(actual, expected);
		});

		it("remove ○ revive => Noop", () => {
			const deletion = tagChangeInline(Change.remove(0, 1, tag1), tag1);
			const insertion = tagChangeInline(
				Change.revive(0, 1, { revision: tag1, localId: brand(0) }, tag1),
				tag2,
				tag1,
			);
			const actual = shallowCompose([deletion, insertion]);
			assertChangesetsEqual(actual, cases.no_change);
		});

		it("insert ○ modify", () => {
			const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const insert = Change.insert(0, 2, tag1, cellId);
			const modify = Change.modify(
				0,
				TestNodeId.create({ localId: brand(0) }, TestChange.mint([], 42)),
			);
			const expected = [
				Mark.insert(1, cellId, {
					changes: TestNodeId.create({ localId: brand(0) }, TestChange.mint([], 42)),
					revision: tag1,
				}),
				Mark.insert(1, { localId: brand(1), revision: tag1 }, { revision: tag1 }),
			];
			const actual = compose([makeAnonChange(insert), makeAnonChange(modify)]);
			assertChangesetsEqual(actual, expected);
		});

		it("insert ○ remove ○ modify", () => {
			const changes = TestNodeId.create(
				{ revision: tag3, localId: brand(0) },
				TestChange.mint([], 42),
			);
			const insertMark = Mark.insert(2, brand(0));
			const insert = tagChangeInline([insertMark], tag1);
			const del = tagChangeInline([Mark.remove(2, brand(1))], tag2);
			const modify = tagChangeInline(
				[Mark.modify(changes, { revision: tag2, localId: brand(1) })],
				tag3,
			);
			const actual = compose([insert, del, modify], revInfos);
			const expected = [
				Mark.remove(1, brand(1), {
					revision: tag2,
					cellId: { revision: tag1, localId: brand(0) },
					changes,
				}),
				Mark.remove(1, brand(2), {
					revision: tag2,
					cellId: { revision: tag1, localId: brand(1) },
				}),
			];
			assertChangesetsEqual(actual, expected);
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
			const changes = TestNodeId.create({ localId: brand(0) }, TestChange.mint([], 42));
			const transientRevive = [Mark.remove(1, outputId, { cellId: inputId })];
			const modify = [Mark.modify(changes, outputId)];
			const expected = [Mark.remove(1, outputId, { cellId: inputId, changes })];
			const actual = compose(
				[makeAnonChange(transientRevive), makeAnonChange(modify)],
				revInfos,
			);
			assertChangesetsEqual(actual, expected);
		});

		it("transient insert ○ revive & modify", () => {
			const cellBeforeAttach: ChangeAtomId = {
				revision: tag1,
				localId: brand(0),
			};
			const transientDetach: ChangeAtomId = {
				revision: tag2,
				localId: brand(1),
			};
			const changes = TestNodeId.create({ localId: brand(0) }, TestChange.mint([], 42));
			const insert = [Mark.remove(1, transientDetach, { cellId: cellBeforeAttach })];
			const revive = [Mark.revive(1, transientDetach, { changes })];
			const expected = [
				Mark.insert(1, cellBeforeAttach, {
					id: transientDetach.localId,
					revision: transientDetach.revision,
					changes,
				}),
			];
			const actual = compose([makeAnonChange(insert), makeAnonChange(revive)], revInfos);
			assertChangesetsEqual(actual, expected);
		});

		it("modify insert ○ modify", () => {
			const childChangeA = TestNodeId.create(
				{ revision: tag1, localId: brand(0) },
				TestChange.mint([0], 1),
			);
			const childChangeB = TestNodeId.create(
				{ revision: tag2, localId: brand(1) },
				TestChange.mint([0, 1], 2),
			);

			const childChangeAB = TestNodeId.composeChild(childChangeA, childChangeB);
			const insert = [
				Mark.insert(
					1,
					{ localId: defaultInsertId, revision: tag1 },
					{ changes: childChangeA },
				),
			];
			const modify = Change.modify(0, childChangeB);
			const expected = [
				Mark.insert(
					1,
					{ localId: defaultInsertId, revision: tag1 },
					{ changes: childChangeAB },
				),
			];
			const actual = compose([tagChangeInline(insert, tag1), tagChangeInline(modify, tag2)]);
			assertChangesetsEqual(actual, expected);
		});

		it("remove ○ modify", () => {
			const deletion = Change.remove(0, 3, tag1);
			const childChange = TestNodeId.create({ localId: brand(1) }, TestChange.mint([0, 1], 2));

			const modify = Change.modify(0, childChange);
			const expected = [
				Mark.remove(3, { localId: brand(0), revision: tag1 }),
				Mark.modify(childChange),
			];
			const actual = shallowCompose([makeAnonChange(deletion), makeAnonChange(modify)]);
			assertChangesetsEqual(actual, expected);
		});

		it("revive ○ modify", () => {
			const revive = Change.revive(0, 3, { revision: tag1, localId: brand(0) }, tag1);
			const changes = TestNodeId.create({ localId: brand(1) }, TestChange.mint([0, 1], 2));

			const modify = Change.modify(0, changes);
			const expected = [
				Mark.revive(1, { revision: tag1, localId: brand(0) }, { changes, revision: tag1 }),
				Mark.revive(2, { revision: tag1, localId: brand(1) }, { revision: tag1 }),
			];
			const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(modify)]);
			assertChangesetsEqual(actual, expected);
		});

		it("revive and modify ○ modify", () => {
			const childChangeA = TestNodeId.create({ localId: brand(0) }, TestChange.mint([0], 1));
			const childChangeB = TestNodeId.create(
				{ localId: brand(1) },
				TestChange.mint([0, 1], 2),
			);

			const childChangeAB = TestNodeId.composeChild(childChangeA, childChangeB);
			const revive = [
				Mark.revive(1, { revision: tag1, localId: brand(0) }, { changes: childChangeA }),
			];
			const modify = Change.modify(0, childChangeB);
			const expected = [
				Mark.revive(1, { revision: tag1, localId: brand(0) }, { changes: childChangeAB }),
			];
			const actual = compose([makeAnonChange(revive), makeAnonChange(modify)]);
			assertChangesetsEqual(actual, expected);
		});

		it("modify ○ modify", () => {
			const childChangeA = TestNodeId.create({ localId: brand(0) }, TestChange.mint([0], 1));
			const childChangeB = TestNodeId.create(
				{ localId: brand(1) },
				TestChange.mint([0, 1], 2),
			);
			const childChangeAB = TestNodeId.composeChild(childChangeA, childChangeB);
			const modifyA = [Mark.modify(childChangeA)];
			const modifyB = [Mark.modify(childChangeB)];
			const expected = [Mark.modify(childChangeAB)];
			const actual = compose([makeAnonChange(modifyA), makeAnonChange(modifyB)]);
			assertChangesetsEqual(actual, expected);
		});

		it("Remove and modify ○ transient revive", () => {
			const changes = TestNodeId.create(
				{ revision: tag1, localId: brand(0) },
				TestChange.mint([0], 1),
			);
			const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const del = tagChangeInline([Mark.remove(1, cellId, { changes })], tag1);
			const transient = tagChangeInline([Mark.remove(1, brand(1), { cellId })], tag2);

			const composed = compose([del, transient]);
			const expected = [Mark.remove(1, { revision: tag2, localId: brand(1) }, { changes })];
			assertChangesetsEqual(composed, expected);
		});

		it("Transient insert ○ transient revive", () => {
			const insert = tagChangeInline(
				[Mark.remove(1, brand(1), { cellId: { localId: brand(0) } })],
				tag1,
			);

			const revive = tagChangeInline(
				[Mark.remove(1, brand(0), { cellId: { revision: tag1, localId: brand(1) } })],
				tag2,
			);

			const composed = compose([insert, revive]);
			const expected = [
				Mark.remove(1, brand(0), {
					revision: tag2,
					cellId: { revision: tag1, localId: brand(0) },
				}),
			];

			assertChangesetsEqual(composed, expected);
		});

		it("insert ○ remove (within insert)", () => {
			const insert = tagChangeInline(
				Change.insert(0, 3, tag1, { localId: brand(1), revision: tag1 }),
				tag1,
			);
			const deletion = tagChangeInline(Change.remove(1, 1, tag2), tag2);
			const actual = shallowCompose([insert, deletion]);
			const expected = [
				Mark.insert(1, { localId: brand(1), revision: tag1 }, { revision: tag1 }),
				Mark.remove(1, brand(0), {
					revision: tag2,
					cellId: { localId: brand(2), revision: tag1 },
				}),
				Mark.insert(1, { localId: brand(3), revision: tag1 }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("insert ○ move (within insert)", () => {
			const insert = Change.insert(0, 3, tag1, { localId: brand(1), revision: tag1 });
			const move = Change.move(1, 1, 0, tag2);
			const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(move)]);
			const expected = [
				Mark.moveIn(1, { localId: brand(0), revision: tag2 }, { revision: tag2 }),
				Mark.insert(1, { localId: brand(1), revision: tag1 }, { revision: tag1 }),
				Mark.moveOut(1, brand(0), {
					cellId: { localId: brand(2), revision: tag1 },
					revision: tag2,
				}),
				Mark.insert(1, { localId: brand(3), revision: tag1 }, { revision: tag1 }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("insert ○ remove (across inserts)", () => {
			const insert = [
				Mark.insert(2, { localId: brand(1), revision: tag1 }),
				Mark.insert(2, { localId: brand(3), revision: tag2 }),
				Mark.insert(2, { localId: brand(5), revision: tag1 }),
			];
			const deletion = tagChangeInline(Change.remove(1, 4, tag2), tag2);
			const actual = shallowCompose([makeAnonChange(insert), deletion], revInfos);
			const expected = [
				Mark.insert(1, { localId: brand(1), revision: tag1 }),
				Mark.remove(1, brand(0), {
					revision: tag2,
					cellId: { localId: brand(2), revision: tag1 },
				}),
				Mark.remove(2, brand(1), {
					revision: tag2,
					cellId: { localId: brand(3), revision: tag2 },
				}),
				Mark.remove(1, brand(3), {
					revision: tag2,
					cellId: { localId: brand(5), revision: tag1 },
				}),
				Mark.insert(1, { localId: brand(6), revision: tag1 }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("insert ○ move (across inserts)", () => {
			const insert = [
				Mark.insert(2, { localId: brand(1), revision: tag1 }),
				Mark.insert(2, { localId: brand(3), revision: tag2 }),
				Mark.insert(2, { localId: brand(5), revision: tag1 }),
			];
			const move = Change.move(1, 4, 0, tag3);
			const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(move)], revInfos);

			const expected = [
				Mark.moveIn(4, { localId: brand(0), revision: tag3 }, { revision: tag3 }),
				Mark.insert(1, { localId: brand(1), revision: tag1 }),
				Mark.moveOut(1, brand(0), {
					cellId: { localId: brand(2), revision: tag1 },
					revision: tag3,
				}),
				Mark.moveOut(2, brand(1), {
					cellId: { localId: brand(3), revision: tag2 },
					revision: tag3,
				}),
				Mark.moveOut(1, brand(3), {
					cellId: { localId: brand(5), revision: tag1 },
					revision: tag3,
				}),
				Mark.insert(1, { localId: brand(6), revision: tag1 }, { revision: tag1 }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("modify ○ remove", () => {
			const changes = TestNodeId.create({ localId: brand(1) }, TestChange.mint([0, 1], 2));

			const modify = Change.modify(0, changes);
			const deletion = Change.remove(0, 1, tag1);
			const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(deletion)]);
			const expected = [Mark.remove(1, brand(0), { changes, revision: tag1 })];
			assertChangesetsEqual(actual, expected);
		});

		it("remove ○ remove", () => {
			// Removes ABC-----IJKLM
			const removeA = [Mark.remove(3, brand(0)), { count: 5 }, Mark.remove(5, brand(3))];
			// Removes DEFG--OP
			const removeB = [Mark.remove(4, brand(0)), { count: 2 }, Mark.remove(2, brand(4))];
			const actual = shallowCompose([
				tagChangeInline(removeA, tag1),
				tagChangeInline(removeB, tag2),
			]);
			// Removes ABCDEFG-IJKLM-OP
			const expected = [
				Mark.remove(3, brand(0), { revision: tag1 }),
				Mark.remove(4, brand(0), { revision: tag2 }),
				{ count: 1 },
				Mark.remove(5, brand(3), { revision: tag1 }),
				{ count: 1 },
				Mark.remove(2, brand(4), { revision: tag2 }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("revive ○ remove", () => {
			// Revive ABCDE
			const revive = Change.revive(0, 5, { revision: tag1, localId: brand(0) }, tag1);
			// Remove _B_DEF
			const deletion = [
				{ count: 1 },
				Mark.remove(1, brand(0)),
				{ count: 1 },
				Mark.remove(3, brand(1)),
			];
			const actual = shallowCompose([makeAnonChange(revive), tagChangeInline(deletion, tag2)]);
			const expected = [
				Mark.revive(1, { revision: tag1, localId: brand(0) }, { revision: tag1 }),
				Mark.remove(
					1,
					{ revision: tag2, localId: brand(0) },
					{ cellId: { revision: tag1, localId: brand(1) }, revision: tag2 },
				),
				Mark.revive(1, { revision: tag1, localId: brand(2) }, { revision: tag1 }),
				Mark.remove(
					2,
					{ revision: tag2, localId: brand(1) },
					{ cellId: { revision: tag1, localId: brand(3) }, revision: tag2 },
				),
				Mark.remove(1, brand(3), { revision: tag2 }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("revive and modify ○ remove", () => {
			const changes = TestNodeId.create(
				{ revision: tag2, localId: brand(0) },
				TestChange.mint([0, 1], 2),
			);
			const detachEvent: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const revive = [Mark.revive(1, detachEvent, { changes })];
			const deletion = [Mark.remove(2, brand(0))];
			const actual = shallowCompose([
				tagChangeInline(revive, tag2),
				tagChangeInline(deletion, tag3),
			]);
			const expected: SF.Changeset = [
				Mark.remove(
					1,
					{ localId: brand(0), revision: tag3 },
					{ cellId: detachEvent, changes },
				),
				Mark.remove(1, { localId: brand(1), revision: tag3 }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("modify ○ insert", () => {
			const childChange = TestNodeId.create({ localId: brand(3) }, TestChange.mint([0, 1], 2));

			const modify = Change.modify(0, childChange);
			const insert = Change.insert(0, 1, tag1, { localId: brand(2), revision: tag1 });
			const expected = [
				Mark.insert(1, { localId: brand(2), revision: tag1 }, { revision: tag1 }),
				Mark.modify(childChange),
			];
			const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(insert)]);
			assertChangesetsEqual(actual, expected);
		});

		it("remove ○ insert", () => {
			const deletion = Change.remove(0, 3, tag1);
			const insert = Change.insert(0, 1, tag2, { localId: brand(2), revision: tag2 });
			// TODO: test with merge-right policy as well
			const expected = [
				Mark.insert(1, { localId: brand(2), revision: tag2 }, { revision: tag2 }),
				Mark.remove(3, brand(0), { revision: tag1 }),
			];
			const actual = shallowCompose([
				tagChangeInline(deletion, tag1),
				tagChangeInline(insert, tag2),
			]);
			assertChangesetsEqual(actual, expected);
		});

		it("revive ○ insert", () => {
			const revive = Change.revive(0, 5, { revision: tag1, localId: brand(0) }, tag1);
			const insert = Change.insert(0, 1, tag2, { localId: brand(2), revision: tag2 });
			// TODO: test with merge-right policy as well
			const expected = [
				Mark.insert(1, { localId: brand(2), revision: tag2 }, { revision: tag2 }),
				Mark.revive(5, { revision: tag1, localId: brand(0) }, { revision: tag1 }),
			];
			const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(insert)]);
			assertChangesetsEqual(actual, expected);
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
			const actual = shallowCompose(
				[makeAnonChange(insertA), makeAnonChange(insertB)],
				revInfos,
			);
			const expected = [
				Mark.insert(1, brand(4), { revision: tag3 }),
				Mark.insert(1, brand(1), { revision: tag1 }),
				{ count: 2 },
				Mark.insert(1, brand(2), { revision: tag2 }),
				Mark.insert(1, brand(5), { revision: tag4 }),
				Mark.insert(1, brand(3), { revision: tag2 }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("modify ○ revive", () => {
			const childChange = TestNodeId.create({ localId: brand(1) }, TestChange.mint([0, 1], 2));

			const modify = Change.modify(0, childChange);
			const revive = Change.revive(0, 2, { revision: tag1, localId: brand(0) }, tag1);
			const expected = [
				Mark.revive(2, { revision: tag1, localId: brand(0) }, { revision: tag1 }),
				Mark.modify(childChange),
			];
			const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(revive)]);
			assertChangesetsEqual(actual, expected);
		});

		it("remove ○ revive (different earlier nodes)", () => {
			const deletion = tagChangeInline(Change.remove(0, 2, tag1), tag1);
			const revive = makeAnonChange([
				Mark.revive(2, { revision: tag2, localId: brand(0) }),
				Mark.tomb(tag1, brand(0), 2),
			]);
			const expected = [
				Mark.revive(2, { revision: tag2, localId: brand(0) }),
				Mark.remove(2, brand(0), { revision: tag1 }),
			];
			const actual = shallowCompose([deletion, revive]);
			assertChangesetsEqual(actual, expected);
		});

		it("remove ○ revive (different in-between nodes)", () => {
			const deletion = tagChangeInline(Change.remove(0, 2, tag1), tag1);
			const revive = makeAnonChange([
				Mark.tomb(tag1),
				Mark.revive(2, { revision: tag2, localId: brand(0) }),
				Mark.tomb(tag1, brand(1)),
			]);
			const expected = [
				Mark.remove(1, brand(0), { revision: tag1 }),
				Mark.revive(2, { revision: tag2, localId: brand(0) }),
				Mark.remove(1, brand(1), { revision: tag1 }),
			];
			const actual = shallowCompose([deletion, revive]);
			assertChangesetsEqual(actual, expected);
		});

		it("remove ○ revive (different later nodes)", () => {
			const deletion = tagChangeInline(Change.remove(0, 2, tag1), tag1);
			const revive = makeAnonChange([
				Mark.tomb(tag1, brand(0), 2),
				Mark.revive(2, { revision: tag2, localId: brand(0) }),
			]);
			const expected = [
				Mark.remove(2, brand(0), { revision: tag1 }),
				Mark.revive(2, { revision: tag2, localId: brand(0) }),
			];
			const actual = shallowCompose([deletion, revive]);
			assertChangesetsEqual(actual, expected);
		});

		it("remove1 ○ remove2 ○ revive (remove1)", () => {
			const remove1 = Change.remove(1, 3, tag1);
			const remove2 = Change.remove(0, 2, tag2);
			const revive = [
				Mark.tomb(tag2),
				Mark.tomb(tag1),
				Mark.revive(1, { revision: tag1, localId: brand(1) }),
				Mark.tomb(tag1, brand(2)),
				Mark.tomb(tag2, brand(1)),
			];
			const expected = [
				Mark.remove(1, brand(0), { revision: tag2 }),
				Mark.remove(1, brand(0), { revision: tag1 }),
				{ count: 1 },
				Mark.remove(1, brand(2), { revision: tag1 }),
				Mark.remove(1, brand(1), { revision: tag2 }),
			];
			const actual = shallowCompose([
				tagChangeInline(remove1, tag1),
				tagChangeInline(remove2, tag2),
				tagChangeInline(revive, tag3),
			]);
			assertChangesetsEqual(actual, expected);
		});

		it("remove1 ○ remove2 ○ revive (remove2)", () => {
			const remove1 = Change.remove(1, 3, tag1);
			const remove2 = Change.remove(0, 2, tag2);
			const revive = [Mark.revive(2, { revision: tag2, localId: brand(0) })];
			const expected = [{ count: 1 }, Mark.remove(3, brand(0), { revision: tag1 })];
			const actual = shallowCompose([
				tagChangeInline(remove1, tag1),
				tagChangeInline(remove2, tag2),
				tagChangeInline(revive, tag3),
			]);
			assertChangesetsEqual(actual, expected);
		});

		it("reviveAA ○ reviveB => BAA", () => {
			const reviveAA = [
				Mark.tomb(tag2),
				Mark.revive(2, { revision: tag1, localId: brand(1) }, { revision: tag2 }),
			];
			const reviveB = Change.revive(0, 1, { revision: tag2, localId: brand(0) }, tag2);
			const expected = [
				Mark.revive(1, { revision: tag2, localId: brand(0) }, { revision: tag2 }),
				Mark.revive(2, { revision: tag1, localId: brand(1) }, { revision: tag2 }),
			];
			const actual = shallowCompose([makeAnonChange(reviveAA), makeAnonChange(reviveB)]);
			assertChangesetsEqual(actual, expected);
		});

		it("reviveA ○ reviveBB => BAB", () => {
			const reviveA = [
				Mark.tomb(tag2),
				Mark.revive(1, { revision: tag1, localId: brand(1) }, { revision: tag2 }),
				Mark.tomb(tag2, brand(1)),
			];
			const reviveB1 = Change.revive(0, 1, { revision: tag2, localId: brand(0) }, tag2);
			const reviveB2 = Change.revive(2, 1, { revision: tag2, localId: brand(1) }, tag2);
			const expected = [
				Mark.revive(1, { revision: tag2, localId: brand(0) }, { revision: tag2 }),
				Mark.revive(1, { revision: tag1, localId: brand(1) }, { revision: tag2 }),
				Mark.revive(1, { revision: tag2, localId: brand(1) }, { revision: tag2 }),
			];
			const actual = shallowCompose([
				makeAnonChange(reviveA),
				makeAnonChange(reviveB1),
				makeAnonChange(reviveB2),
			]);
			assertChangesetsEqual(actual, expected);
		});

		it("reviveAA ○ reviveB => AAB", () => {
			const reviveA = [
				Mark.revive(2, { revision: tag1, localId: brand(0) }, { revision: tag1 }),
				Mark.tomb(tag2),
			];
			const reviveB = Change.revive(2, 1, { revision: tag2, localId: brand(0) }, tag2);
			const expected = [
				Mark.revive(2, { revision: tag1, localId: brand(0) }, { revision: tag1 }),
				Mark.revive(1, { revision: tag2, localId: brand(0) }, { revision: tag2 }),
			];
			const actual = shallowCompose([makeAnonChange(reviveA), makeAnonChange(reviveB)]);
			assertChangesetsEqual(actual, expected);
		});

		it("revive ○ redundant revive", () => {
			const reviveA = Change.revive(0, 2, { revision: tag1, localId: brand(0) }, tag1);
			const reviveB = Change.pin(0, 2, { revision: tag1, localId: brand(0) }, tag1);
			const expected = [
				Mark.revive(2, { revision: tag1, localId: brand(0) }, { revision: tag1 }),
			];
			const actual = shallowCompose([tagChangeInline(reviveA, tag2), makeAnonChange(reviveB)]);
			assertChangesetsEqual(actual, expected);
		});

		it("move ○ modify", () => {
			const move = Change.move(0, 1, 2, tag1);
			const changes = TestNodeId.create({ localId: brand(1) }, TestChange.mint([], 42));
			const modify = Change.modify(1, changes);
			const expected = [
				Mark.moveOut(1, { localId: brand(0), revision: tag1 }, { changes, revision: tag1 }),
				{ count: 1 },
				Mark.moveIn(1, { localId: brand(0), revision: tag1 }, { revision: tag1 }),
			];
			const actual = shallowCompose([makeAnonChange(move), makeAnonChange(modify)]);
			assertChangesetsEqual(actual, expected);
		});

		it("move ○ modify and return", () => {
			const move = [Mark.moveIn(1, brand(0)), { count: 1 }, Mark.moveOut(1, brand(0))];
			const changes = TestNodeId.create(
				{ revision: tag3, localId: brand(1) },
				TestChange.mint([], 42),
			);
			const moveBack = [
				Mark.moveOut(1, brand(0), {
					changes,
					idOverride: { revision: tag1, localId: brand(1) },
				}),
				{ count: 1 },
				Mark.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
			];
			const expected = [Mark.tomb(tag1, brand(1)), { count: 1 }, Mark.modify(changes)];
			const actual = shallowCompose([
				tagChangeInline(move, tag1),
				tagChangeInline(moveBack, tag3, tag1),
			]);
			assertChangesetsEqual(actual, expected);
		});

		it("move ○ remove", () => {
			const move = Change.move(1, 1, 4, tag1, brand(0));
			const deletion = Change.remove(3, 1, tag2, brand(2));
			const expected = [
				{ count: 1 },
				Mark.moveOut(1, brand(0), { revision: tag1 }),
				{ count: 2 },
				Mark.attachAndDetach(
					Mark.moveIn(1, { localId: brand(0), revision: tag1 }, { revision: tag1 }),
					Mark.remove(1, brand(2), { revision: tag2 }),
				),
			];
			const actual = shallowCompose([makeAnonChange(move), makeAnonChange(deletion)]);
			assertChangesetsEqual(actual, expected);
		});

		it("return ○ return (no cell rename)", () => {
			const cellIdA: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const cellIdB: ChangeAtomId = { revision: tag2, localId: brand(1) };
			// Return from B back to A
			const return1 = tagChangeInline(Change.return(0, 1, 4, cellIdB, cellIdA, tag3), tag3);
			// Return from A back to B
			const return2 = tagChangeInline(Change.return(3, 1, 0, cellIdA, cellIdB, tag4), tag4);
			const actual = shallowCompose([return1, return2]);

			const expected = [{ count: 4 }, Mark.tomb(tag2, brand(0))];
			assertChangesetsEqual(actual, expected);
		});

		it("return ○ return (cell rename)", () => {
			const cellIdA: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const cellIdB: ChangeAtomId = { revision: tag2, localId: brand(1) };
			// Return from B back to A
			const return1 = tagChangeInline(Change.return(0, 1, 4, cellIdB, cellIdA, tag3), tag3);
			// Return from A back to B
			const return2 = tagChangeInline(
				[Mark.returnTo(1, brand(0), cellIdB), { count: 3 }, Mark.moveOut(1, brand(0))],
				tag4,
			);
			const actual = shallowCompose([return1, return2]);
			const expected = [
				{ count: 4 },
				Mark.rename(1, cellIdA, { revision: tag4, localId: brand(0) }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("modify ○ return", () => {
			const changes = TestNodeId.create(
				{ revision: tag3, localId: brand(2) },
				TestChange.mint([], 42),
			);
			const modify = tagChangeInline(Change.modify(3, changes), tag3);
			const ret = tagChangeInline(
				Change.return(
					3,
					2,
					0,
					{ revision: tag1, localId: brand(2) },
					{ revision: tag1, localId: brand(0) },
					tag4,
				),
				tag4,
			);
			const actual = shallowCompose([modify, ret]);
			const expected = [
				Mark.returnTo(
					2,
					{ revision: tag4, localId: brand(0) },
					{ revision: tag1, localId: brand(0) },
				),
				{ count: 3 },
				Mark.moveOut(1, brand(0), {
					revision: tag4,
					changes,
					idOverride: { revision: tag1, localId: brand(2) },
				}),
				Mark.moveOut(1, brand(1), {
					revision: tag4,
					idOverride: { revision: tag1, localId: brand(3) },
				}),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("move ○ move with node changes", () => {
			const id1: NodeId = { revision: tag1, localId: brand(0) };
			const id2: NodeId = { revision: tag2, localId: brand(0) };

			const move1 = [
				Mark.moveIn(1, brand(0)),
				{ count: 1 },
				Mark.moveOut(1, brand(0), {
					changes: TestNodeId.create(id1, TestChange.mint([], 0)),
				}),
			];

			const move2 = [
				Mark.moveOut(1, brand(0), {
					changes: TestNodeId.create(id2, TestChange.mint([0], 1)),
				}),
				{ count: 2 },
				Mark.moveIn(1, brand(0)),
			];

			const composed = compose([tagChangeInline(move1, tag1), tagChangeInline(move2, tag2)]);
			const expected = [
				Mark.rename(
					1,
					{ revision: tag1, localId: brand(1) },
					{ revision: tag2, localId: brand(0) },
				),
				{ count: 1 },
				Mark.moveOut(
					1,
					{ revision: tag1, localId: brand(0) },
					{
						changes: TestNodeId.create(id1, TestChange.mint([], [0, 1])),
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

			assertChangesetsEqual(composed, expected);
		});

		it("move ○ move (forward)", () => {
			const move1 = Change.move(0, 1, 2, tag1, brand(0));
			const move2 = Change.move(1, 1, 3, tag2, brand(2));
			const actual = shallowCompose([makeAnonChange(move1), makeAnonChange(move2)]);
			const expected = [
				Mark.moveOut(
					1,
					{ localId: brand(0), revision: tag1 },
					{
						finalEndpoint: { revision: tag2, localId: brand(2) },
					},
				),
				{ count: 1 },
				Mark.rename(
					1,
					{ localId: brand(1), revision: tag1 },
					{ localId: brand(2), revision: tag2 },
				),
				{ count: 1 },
				Mark.moveIn(
					1,
					{ localId: brand(2), revision: tag2 },
					{
						finalEndpoint: { revision: tag1, localId: brand(0) },
					},
				),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("move ○ move (back)", () => {
			const move1 = Change.move(2, 1, 1, tag1, brand(0));
			const move2 = Change.move(1, 1, 0, tag2, brand(2));
			const actual = shallowCompose([makeAnonChange(move1), makeAnonChange(move2)]);
			const expected = [
				Mark.moveIn(
					1,
					{ localId: brand(2), revision: tag2 },
					{
						finalEndpoint: { revision: tag1, localId: brand(0) },
					},
				),
				{ count: 1 },
				Mark.rename(
					1,
					{ localId: brand(1), revision: tag1 },
					{ localId: brand(2), revision: tag2 },
				),
				{ count: 1 },
				Mark.moveOut(
					1,
					{ localId: brand(0), revision: tag1 },
					{
						finalEndpoint: { revision: tag2, localId: brand(2) },
					},
				),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("move ○ move adjacent to starting position (back and forward)", () => {
			const move1 = Change.move(1, 1, 0, tag1);
			const move2 = Change.move(0, 1, 2, tag2);
			const actual = shallowCompose([
				tagChangeInline(move1, tag1),
				tagChangeInline(move2, tag2),
			]);
			const expected = [
				Mark.rename(
					1,
					{ revision: tag1, localId: brand(1) },
					{ revision: tag2, localId: brand(0) },
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
			assertChangesetsEqual(actual, expected);
		});

		it("move ○ move adjacent to starting position (forward and back)", () => {
			const move1 = Change.move(0, 1, 2, tag1);
			const move2 = Change.move(1, 1, 0, tag2);
			const actual = shallowCompose([
				tagChangeInline(move1, tag1),
				tagChangeInline(move2, tag2),
			]);
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
				Mark.rename(
					1,
					{ revision: tag1, localId: brand(1) },
					{ revision: tag2, localId: brand(0) },
				),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("adjacent detached modifies 1", () => {
			// Starting state [A B]
			// Revision 1 removes A
			// Revision 2 removes B
			// Revision 3 modifies A
			// Revision 4 modifies B
			const nodeChange1: NodeId = { revision: tag3, localId: brand(1) };
			const nodeChange2: NodeId = { revision: tag4, localId: brand(2) };
			const detach1: SF.CellId = { revision: tag1, localId: brand(0) };
			const detach2: SF.CellId = { revision: tag2, localId: brand(0) };

			const modify1 = [Mark.modify(nodeChange1, detach1), Mark.tomb(tag2)];
			const modify2 = [Mark.modify(nodeChange2, detach2)];
			const actual = shallowCompose([
				tagChangeInline(modify1, tag3),
				tagChangeInline(modify2, tag4),
			]);

			const expected = [Mark.modify(nodeChange1, detach1), Mark.modify(nodeChange2, detach2)];

			assertChangesetsEqual(actual, expected);
		});

		it("adjacent detached modifies 2", () => {
			// Starting state [A B]
			// Revision 1 removes B
			// Revision 2 removes A
			// Revision 3 modifies B
			// Revision 4 modifies A
			const nodeChange1: NodeId = { revision: tag3, localId: brand(2) };
			const nodeChange2: NodeId = { revision: tag4, localId: brand(3) };
			const detach1: SF.CellId = { revision: tag1, localId: brand(1) };
			const detach2: SF.CellId = { revision: tag2, localId: brand(0) };

			const modify1 = [Mark.tomb(tag2), Mark.modify(nodeChange1, detach1)];
			const modify2 = [Mark.modify(nodeChange2, detach2)];
			const actual = shallowCompose([
				tagChangeInline(modify1, tag3),
				tagChangeInline(modify2, tag4),
			]);

			const expected = [Mark.modify(nodeChange2, detach2), Mark.modify(nodeChange1, detach1)];

			assertChangesetsEqual(actual, expected);
		});

		it("adjacent detached modifies 3", () => {
			// Starting state [A B]
			// Revision 1 removes A
			// Revision 2 removes B
			// Revision 3 modifies B
			// Revision 4 modifies A
			const nodeChange1: NodeId = { revision: tag3, localId: brand(2) };
			const nodeChange2: NodeId = { revision: tag4, localId: brand(3) };
			const detach1: SF.CellId = { revision: tag1, localId: brand(0) };
			const detach2: SF.CellId = { revision: tag2, localId: brand(0) };

			const modify1 = [Mark.modify(nodeChange1, detach2)];
			const modify2 = [Mark.modify(nodeChange2, detach1), Mark.tomb(tag2)];
			const actual = shallowCompose([
				tagChangeInline(modify1, tag3),
				tagChangeInline(modify2, tag4),
			]);

			const expected = [Mark.modify(nodeChange2, detach1), Mark.modify(nodeChange1, detach2)];

			assertChangesetsEqual(actual, expected);
		});

		it("adjacent detached modifies 4", () => {
			// Starting state [A B]
			// Revision 1 removes B
			// Revision 2 removes A
			// Revision 3 modifies A
			// Revision 4 modifies B
			const nodeChange1: NodeId = { revision: tag3, localId: brand(2) };
			const nodeChange2: NodeId = { revision: tag4, localId: brand(3) };

			const detach1: SF.CellId = { revision: tag1, localId: brand(1) };
			const detach2: SF.CellId = { revision: tag2, localId: brand(0) };

			const modify1 = [Mark.modify(nodeChange1, detach2)];
			const modify2 = [Mark.tomb(tag2), Mark.modify(nodeChange2, detach1)];
			const actual = shallowCompose([
				tagChangeInline(modify1, tag3),
				tagChangeInline(modify2, tag4),
			]);

			const expected = [Mark.modify(nodeChange1, detach2), Mark.modify(nodeChange2, detach1)];

			assertChangesetsEqual(actual, expected);
		});

		it("move, remove, revive", () => {
			const move = tagChangeInline(Change.move(1, 1, 0, tag1), tag1);
			const del = tagChangeInline(Change.remove(0, 1, tag2), tag2);
			const revive = tagChangeInline(
				Change.revive(0, 1, { revision: tag2, localId: brand(0) }, tag3),
				tag3,
			);
			const actual = shallowCompose([move, del, revive]);
			const expected = shallowCompose([move]);
			assertChangesetsEqual(actual, expected);
		});

		it("return-to, remove, move-out", () => {
			const returnTo = tagChangeInline(
				[
					Mark.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
					{ count: 1 },
					Mark.moveOut(1, brand(0), {
						idOverride: { revision: tag1, localId: brand(1) },
					}),
				],
				tag3,
				tag1,
			);
			const del = tagChangeInline([Mark.remove(1, brand(0))], tag2);
			const move = tagChangeInline(
				[
					Mark.moveOut(1, brand(0), { cellId: { revision: tag2, localId: brand(0) } }),
					{ count: 1 },
					Mark.moveIn(1, brand(0)),
				],
				tag1,
			);
			const actual = shallowCompose([returnTo, del, move]);
			const expected = [Mark.tomb(tag1, brand(0))];
			assertChangesetsEqual(actual, expected);
		});

		it("move1, move2, return2", () => {
			for (const [a, b, c] of [
				[0, 1, 2],
				[2, 1, 0],
			]) {
				const move1 = tagChangeInline(Change.move(a, 1, b > a ? b + 1 : b, tag1), tag1);
				const move2 = tagChangeInline(Change.move(b, 1, c > b ? c + 1 : c, tag2), tag2);
				const return2 = tagChangeInline(
					Change.return(
						c,
						1,
						b > c ? b + 1 : b,
						{ revision: tag2, localId: brand(1) },
						{ revision: tag2, localId: brand(0) },
						tag3,
					),
					tag3,
					tag2,
				);

				const composed = shallowCompose([move1, move2, return2]);
				const expected = shallowCompose(
					a < b
						? [
								move1,
								makeAnonChange([
									Mark.tomb(tag1),
									Mark.skip(1),
									Mark.pin(1, { revision: tag2, localId: brand(0) }, { revision: tag3 }),
									Mark.skip(1),
									Mark.tomb(tag2, brand(1)),
								]),
							]
						: [
								move1,
								makeAnonChange([
									Mark.tomb(tag2, brand(1)),
									Mark.skip(1),
									Mark.pin(1, { revision: tag2, localId: brand(0) }, { revision: tag3 }),
									Mark.skip(1),
									Mark.tomb(tag1),
								]),
							],
				);
				assertChangesetsEqual(composed, expected, true);
			}
		});

		it("rename ○ return", () => {
			const cellId1: SF.CellId = { revision: tag1, localId: brand(1) };
			const cellId2: SF.CellId = { revision: tag2, localId: brand(2) };
			const ad = tagChangeInline(
				[Mark.pin(1, brand(2)), Mark.rename(1, cellId1, brand(2))],
				tag2,
			);
			const ret = tagChangeInline(
				[
					Mark.moveOut(1, brand(3), { revision: tag3 }),
					Mark.returnTo(1, brand(3), cellId2, { revision: tag3 }),
				],
				tag3,
			);
			const expected = [
				Mark.moveOut(1, brand(3), { revision: tag3 }),
				Mark.returnTo(1, brand(3), cellId1, { revision: tag3 }),
			];
			const actual = shallowCompose([ad, ret]);
			assertChangesetsEqual(actual, expected);
		});

		it("move1 ○ [return1, move2]", () => {
			const leg1Id: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const leg3Id: ChangeAtomId = { revision: tag3, localId: brand(0) };
			for (const [a, b, c] of [
				[0, 1, 2],
				[2, 1, 0],
			]) {
				const move1 = tagChangeInline(Change.move(a, 1, b > a ? b + 1 : b, tag1), tag1);
				const return1 = tagChangeInline(
					Change.return(
						b,
						1,
						a > b ? a + 1 : a,
						{ ...leg1Id, localId: brand(1) },
						leg1Id,
						tag1,
					),
					tag2,
					tag1,
				);
				const move2 = tagChangeInline(Change.move(a, 1, c > a ? c + 1 : c, tag3), tag3);
				const part2 = shallowCompose([return1, move2]);
				const composed = shallowCompose(
					[move1, makeAnonChange(part2)],
					[{ revision: tag1 }, { revision: tag2, rollbackOf: tag1 }, { revision: tag3 }],
				);

				const expectedMoveOut = Mark.moveOut(1, leg1Id, {
					idOverride: leg3Id,
					finalEndpoint: leg3Id,
				});
				const expectedMoveIn = Mark.moveIn(1, leg3Id, { finalEndpoint: leg1Id });
				const expected =
					a < b
						? [
								expectedMoveOut,
								Mark.skip(1),
								Mark.tomb(tag1, brand(1)),
								Mark.skip(1),
								expectedMoveIn,
							]
						: [
								expectedMoveIn,
								Mark.skip(1),
								Mark.tomb(tag1, brand(1)),
								Mark.skip(1),
								expectedMoveOut,
							];
				assertChangesetsEqual(composed, expected);
			}
		});

		it("move1 ○ [return1, move2, move3]", () => {
			const move1 = tagChangeInline(Change.move(3, 1, 2, tag1), tag1);
			const return1 = tagChangeInline(
				[
					Mark.skip(2),
					Mark.moveOut(1, brand(0), {
						idOverride: { revision: tag1, localId: brand(1) },
					}),
					Mark.skip(1),
					Mark.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
				],
				tag2,
				tag1,
			);
			const move2 = tagChangeInline(Change.move(3, 1, 1, tag3), tag3);
			const move3 = tagChangeInline(Change.move(1, 1, 0, tag4), tag4);
			const part2 = shallowCompose([return1, move2, move3]);

			const composed = shallowCompose(
				[move1, makeAnonChange(part2)],
				[
					{ revision: tag1 },
					{ revision: tag2, rollbackOf: tag1 },
					{ revision: tag3 },
					{ revision: tag4 },
				],
			);

			const leg1Id: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const leg3Id: ChangeAtomId = { revision: tag3, localId: brand(0) };
			const leg4Id: ChangeAtomId = { revision: tag4, localId: brand(0) };

			const expected = [
				Mark.moveIn(1, leg4Id, { finalEndpoint: leg1Id }),
				Mark.skip(1),
				Mark.rename(1, { revision: tag3, localId: brand(1) }, leg4Id),
				Mark.skip(1),
				Mark.tomb(tag1, brand(1)),
				Mark.skip(1),
				Mark.moveOut(1, leg1Id, {
					finalEndpoint: leg4Id,
					idOverride: leg3Id,
				}),
			];

			assertChangesetsEqual(composed, expected);
		});

		it("[move1, move2] ○ [return2, move3]", () => {
			for (const [a, b, c, d] of [
				[0, 1, 2, 3],
				[3, 2, 1, 0],
			]) {
				const move1 = tagChangeInline(Change.move(a, 1, b > a ? b + 1 : b, tag1), tag1);
				const move2 = tagChangeInline(Change.move(b, 1, c > b ? c + 1 : c, tag2), tag2);
				const part1 = shallowCompose([move1, move2]);
				const return2 = tagChangeInline(
					Change.return(
						c,
						1,
						b > c ? b + 1 : b,
						{ revision: tag2, localId: brand(1) },
						{
							revision: tag2,
							localId: brand(0),
						},
						tag3,
					),
					tag3,
					tag2,
				);
				const move3 = tagChangeInline(Change.move(b, 1, d > b ? d + 1 : d, tag4), tag4);
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
				const expected = shallowCompose(
					a < b
						? [
								move1,
								move3,
								makeAnonChange([
									Mark.tomb(tag1), // a
									Mark.skip(1),
									Mark.tomb(tag4), // b
									Mark.skip(1),
									Mark.tomb(tag2, brand(1)), // c
								]),
							]
						: [
								move1,
								move3,
								makeAnonChange([
									Mark.skip(1), // d
									Mark.skip(1),
									Mark.tomb(tag2, brand(1)), // c
									Mark.skip(1),
									Mark.tomb(tag4), // b
									Mark.skip(1),
									Mark.tomb(tag1), // a
								]),
							],
				);
				assertChangesetsEqual(composed, expected, true);
			}
		});

		it("[move1, move2] ○ return1", () => {
			const move1 = tagChangeInline(Change.move(0, 1, 2, tag1), tag1);
			const move2 = tagChangeInline(Change.move(1, 1, 3, tag2), tag2);
			const return1 = tagChangeInline(
				Change.return(
					2,
					1,
					0,
					{ revision: tag2, localId: brand(1) },
					{ revision: tag1, localId: brand(0) },
					tag3,
				),
				tag3,
			);

			const composed = shallowCompose([move1, move2, return1]);
			const expected = [
				{ count: 2 },
				Mark.rename(
					1,
					{ revision: tag1, localId: brand(1) },
					{ revision: tag2, localId: brand(0) },
				),
				{ count: 1 },
				Mark.tomb(tag2, brand(1)),
			];

			assertChangesetsEqual(composed, expected);
		});

		it("move1 (back) ○ [return1, move2 (forward)]", () => {
			const move1 = tagChangeInline(Change.move(2, 1, 0, tag1), tag1);
			const return1 = tagChangeInline(
				[
					Mark.moveOut(1, brand(0), {
						idOverride: { revision: tag1, localId: brand(1) },
					}),
					Mark.skip(2),
					Mark.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
				],
				tag2,
			);

			const move2 = tagChangeInline(Change.move(2, 1, 1, tag3), tag3);

			const returnAndMove = makeAnonChange(shallowCompose([return1, move2]));
			const composed = shallowCompose([move1, returnAndMove]);

			const moveId1: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const moveId3: ChangeAtomId = { revision: tag3, localId: brand(0) };
			const expected = [
				Mark.tomb(tag1, brand(1)),
				Mark.skip(1),
				Mark.moveIn(1, moveId3, { finalEndpoint: moveId1 }),
				Mark.skip(1),
				Mark.moveOut(1, moveId1, { finalEndpoint: moveId3, idOverride: moveId3 }),
			];

			assertChangesetsEqual(composed, expected);
		});

		it("remove (rollback) ○ insert", () => {
			const insertA = tagChangeInline([Mark.insert(1, brand(0))], tag1);
			const removeB = tagChangeInline(
				[Mark.remove(1, brand(0), { idOverride: { revision: tag2, localId: brand(0) } })],
				tag3,
				tag2,
			);
			const composed = shallowCompose([removeB, insertA]);

			// B is the inverse of a new attach that is sequenced after insertA.
			// Since that new attach comes after A (temporally),
			// its tiebreak policy causes the cell to come before A's insert (spatially).
			// When composing the rollback with A's insert, the remove should come before the insert,
			// even though A's insert has a tiebreak policy which puts it before other new cells.
			const expected = [
				Mark.remove(
					1,
					{ revision: tag3, localId: brand(0) },
					{ idOverride: { revision: tag2, localId: brand(0) } },
				),
				Mark.insert(1, { revision: tag1, localId: brand(0) }),
			];

			assertChangesetsEqual(composed, expected);
		});

		it("move-in+remove ○ modify", () => {
			const changes = TestNodeId.create(
				{ revision: tag3, localId: brand(5) },
				TestChange.mint([], 42),
			);
			const [mo, mi] = Mark.move(1, { revision: tag1, localId: brand(1) });
			const attachDetach = Mark.attachAndDetach(
				mi,
				Mark.remove(1, { revision: tag2, localId: brand(2) }),
			);
			const base = makeAnonChange([mo, attachDetach]);
			const modify = tagChangeInline(
				[Mark.modify(changes, { revision: tag2, localId: brand(2) })],
				tag3,
			);
			const actual = shallowCompose([base, modify]);
			const expected = [{ ...mo, changes }, attachDetach];
			assertChangesetsEqual(actual, expected);
		});

		it("effect management for [move, modify, move]", () => {
			const changes = TestNodeId.create(
				{ revision: tag2, localId: brand(0) },
				TestChange.mint([], 42),
			);
			const [mo, mi] = Mark.move(1, brand(0));
			const move = tagChangeInline([mo, mi], tag1);
			const modify = tagChangeInline([Mark.modify(changes)], tag2);
			const moveBack = tagChangeInline([mi, mo], tag3);
			const childComposer = (
				change1: NodeId | undefined,
				change2: NodeId | undefined,
			): NodeId => {
				assert(change1 === undefined || change2 === undefined);
				const nodeChange = change1 ?? change2 ?? fail("Expected a node change");
				assert.deepEqual(nodeChange, changes);
				return nodeChange;
			};
			compose([move, modify, moveBack], undefined, childComposer);
		});

		it("move & remove ○ revive & move", () => {
			const moveId1: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const cellId: ChangeAtomId = { revision: tag1, localId: brand(1) };
			const removeId: ChangeAtomId = { revision: tag1, localId: brand(2) };
			const moveId2: ChangeAtomId = { revision: tag2, localId: brand(0) };

			const moveAndRemove = tagChangeInline(
				[
					Mark.moveOut(1, moveId1),
					Mark.attachAndDetach(Mark.moveIn(1, moveId1, { cellId }), Mark.remove(1, removeId)),
				],
				tag1,
			);

			const reviveAndMove = tagChangeInline(
				[
					Mark.tomb(moveId1.revision, moveId1.localId),
					Mark.moveOut(1, moveId2, { cellId: removeId }),
					Mark.moveIn(1, moveId2),
				],
				tag2,
			);

			const composed = shallowCompose([moveAndRemove, reviveAndMove]);
			const expected = [
				Mark.moveOut(1, moveId1, { finalEndpoint: moveId2 }),
				Mark.rename(1, cellId, moveId2),
				Mark.moveIn(1, moveId2, { finalEndpoint: moveId1 }),
			];

			assertChangesetsEqual(composed, expected);
		});

		describe("empty cell ordering", () => {
			const tombA = Mark.tomb(tag1, brand(1));
			const tombB = Mark.tomb(tag1, brand(2));
			const tombC = Mark.tomb(tag1, brand(3));

			const nodeIdA: NodeId = { revision: tag1, localId: brand(4) };
			const nodeIdB: NodeId = { revision: tag1, localId: brand(5) };
			const nodeIdC: NodeId = { revision: tag1, localId: brand(6) };

			describe("cells named in the same earlier revision", () => {
				it("A ○ A", () => {
					const id1: NodeId = { revision: tag2, localId: brand(0) };
					const id2: NodeId = { revision: tag3, localId: brand(1) };

					const markA = Mark.modify(TestNodeId.create(id1, TestChange.mint([], 1)), {
						revision: tag1,
						localId: brand(1),
					});
					const markB = Mark.modify(TestNodeId.create(id2, TestChange.mint([1], 2)), {
						revision: tag1,
						localId: brand(1),
					});

					const changeX = tagChangeInline([markA], tag2);
					const changeY = tagChangeInline([markB], tag3);
					const composedAB = compose([changeX, changeY]);

					const expected = [
						Mark.modify(TestNodeId.create(id1, TestChange.mint([], [1, 2])), {
							revision: tag1,
							localId: brand(1),
						}),
					];
					assertChangesetsEqual(composedAB, expected);
				});

				it("A ○ B", () => {
					const markA = Mark.modify(nodeIdA, { revision: tag1, localId: brand(1) });
					const markB = Mark.modify(nodeIdB, { revision: tag1, localId: brand(2) });

					const changeA = tagChangeInline([markA, tombB], tag2);
					const changeB = tagChangeInline([tombA, markB], tag3);
					const composedAB = shallowCompose([changeA, changeB]);

					const expected = [markA, markB];
					assertChangesetsEqual(composedAB, expected);
				});

				it("B ○ A", () => {
					const markA = Mark.modify(nodeIdA, { revision: tag1, localId: brand(1) });
					const markB = Mark.modify(nodeIdB, { revision: tag1, localId: brand(2) });

					const changeA = tagChangeInline([markA, tombB], tag2);
					const changeB = tagChangeInline([tombA, markB], tag3);
					const composedBA = shallowCompose([changeB, changeA]);

					const expected = [markA, markB];
					assertChangesetsEqual(composedBA, expected);
				});
			});

			describe("cells named in different earlier revisions", () => {
				it("older A ○ newer B", () => {
					const markA = Mark.modify(nodeIdA, { revision: tag1, localId: brand(1) });
					const markB = Mark.modify(nodeIdB, {
						revision: tag2,
						localId: brand(2),
					});

					const changeX = tagChangeInline([markA, Mark.tomb(tag2, brand(2))], tag3);
					const changeY = tagChangeInline([markB], tag4);
					const composedXY = shallowCompose([changeX, changeY]);

					const expected = [markA, markB];
					assertChangesetsEqual(composedXY, expected);
				});

				it("newer A ○ older B", () => {
					const markA = Mark.modify(nodeIdA, {
						revision: tag2,
						localId: brand(1),
					});
					const markB = Mark.modify(nodeIdB, { revision: tag1, localId: brand(2) });

					const changeX = tagChangeInline([markA], tag3);
					const changeY = tagChangeInline([Mark.tomb(tag2, brand(1)), markB], tag4);
					const composedXY = shallowCompose([changeX, changeY]);

					const expected = [markA, markB];
					assertChangesetsEqual(composedXY, expected);
				});

				it("older B ○ newer A", () => {
					const markB = Mark.modify(nodeIdB, { revision: tag1, localId: brand(2) });
					const markA = Mark.modify(nodeIdA, {
						revision: tag2,
						localId: brand(1),
					});

					const changeX = tagChangeInline([Mark.tomb(tag2, brand(1)), markB], tag3);
					const changeY = tagChangeInline([markA], tag4);
					const composedXY = shallowCompose([changeX, changeY]);

					const expected = [markA, markB];
					assertChangesetsEqual(composedXY, expected);
				});

				it("newer B ○ older A", () => {
					const markB = Mark.modify(nodeIdB, {
						revision: tag2,
						localId: brand(2),
					});
					const markA = Mark.modify(nodeIdA, { revision: tag1, localId: brand(1) });

					const changeX = tagChangeInline([markB], tag3);
					const changeY = tagChangeInline([markA, Mark.tomb(tag2, brand(2))], tag4);
					const composedXY = shallowCompose([changeX, changeY]);

					const expected = [markA, markB];
					assertChangesetsEqual(composedXY, expected);
				});
			});

			describe("cell for later change named in base", () => {
				it("ABC ○ B", () => {
					const changeX = tagChangeInline(
						[
							Mark.modify(nodeIdA, { revision: tag1, localId: brand(1) }),
							Mark.remove(
								1,
								{ revision: tag2, localId: brand(2) },
								{ cellId: { revision: tag1, localId: brand(2) } },
							),
							Mark.modify(nodeIdC, { revision: tag1, localId: brand(3) }),
						],
						tag2,
					);
					const markB = Mark.modify(nodeIdB, { revision: tag2, localId: brand(2) });

					const changeY = tagChangeInline([tombA, markB, tombC], tag3);
					const composedXY = shallowCompose([changeX, changeY]);

					const expected = [
						Mark.modify(nodeIdA, { revision: tag1, localId: brand(1) }),
						Mark.remove(
							1,
							{ revision: tag2, localId: brand(2) },
							{ cellId: { revision: tag1, localId: brand(2) }, changes: nodeIdB },
						),
						Mark.modify(nodeIdC, { revision: tag1, localId: brand(3) }),
					];
					assertChangesetsEqual(composedXY, expected);
				});
			});

			describe("both cells named in their own change", () => {
				it("B ○ A - no tombs", () => {
					const cellA = Mark.insert(1, {
						revision: tag1,
						localId: brand(1),
					});
					const cellB = Mark.insert(1, {
						revision: tag2,
						localId: brand(2),
					});

					const composed = shallowCompose(
						[makeAnonChange([cellB]), makeAnonChange([cellA])],
						[{ revision: tag2 }, { revision: tag2 }],
					);

					const expected = [cellA, cellB];
					assertChangesetsEqual(composed, expected);
				});

				it("A ○ C - with tombs for B on both changesets", () => {
					const cellA = Mark.remove(
						1,
						{
							revision: tag3,
							localId: brand(1),
						},
						{
							cellId: { revision: tag1, localId: brand(1) },
						},
					);
					const cellC = Mark.insert(1, { revision: tag4, localId: brand(3) });

					const composed = shallowCompose(
						[makeAnonChange([cellA, tombB]), makeAnonChange([tombB, cellC])],
						[{ revision: tag3 }, { revision: tag4 }],
					);

					const expected = [cellA, tombB, cellC];
					assertChangesetsEqual(composed, expected);
				});

				it("C ○ A - with tombs for B on both changesets", () => {
					const cellA = Mark.insert(1, { revision: tag4, localId: brand(1) });
					const cellC = Mark.remove(
						1,
						{
							revision: tag3,
							localId: brand(1),
						},
						{
							cellId: { revision: tag1, localId: brand(1) },
						},
					);

					const composed = shallowCompose(
						[makeAnonChange([tombB, cellC]), makeAnonChange([cellA, tombB])],
						[{ revision: tag3 }, { revision: tag4 }],
					);

					const expected = [cellA, tombB, cellC];
					assertChangesetsEqual(composed, expected);
				});

				it("A ○ C - with tomb for B", () => {
					const cellA = Mark.remove(1, { revision: tag2, localId: brand(1) });
					const cellC = Mark.insert(1, { revision: tag3, localId: brand(3) });

					const composed = shallowCompose(
						[makeAnonChange([cellA]), makeAnonChange([tombB, cellC])],
						[{ revision: tag2 }, { revision: tag3 }],
					);

					const expected = [cellA, tombB, cellC];
					assertChangesetsEqual(composed, expected);
				});

				it("C ○ A - with tomb for B", () => {
					const cellA = Mark.modify(nodeIdA, { revision: tag2, localId: brand(1) });
					const cellC = Mark.insert(1, { revision: tag3, localId: brand(3) });

					const composed = shallowCompose(
						[makeAnonChange([tombB, cellC]), makeAnonChange([cellA])],
						[{ revision: tag2 }, { revision: tag3 }],
					);

					const expected = [cellA, tombB, cellC];
					assertChangesetsEqual(composed, expected);
				});
			});

			describe("both cells named in earlier change", () => {
				// This is the only test that makes sense because the earlier change must include marks
				// for all the cells that it names.
				it("ABC ○ B", () => {
					const markABC = Mark.remove(3, { revision: tag1, localId: brand(1) });
					const markB = Mark.modify(nodeIdB, { revision: tag1, localId: brand(2) });

					const changeX = tagChangeInline([markABC], tag1);
					const changeY = tagChangeInline([tombA, markB, tombC], tag2);
					const composedXY = shallowCompose([changeX, changeY]);

					const expected = [
						Mark.remove(1, { revision: tag1, localId: brand(1) }),
						Mark.remove(1, { revision: tag1, localId: brand(2) }, { changes: nodeIdB }),
						Mark.remove(1, { revision: tag1, localId: brand(3) }),
					];
					assertChangesetsEqual(composedXY, expected);
				});
			});

			describe("cell for earlier change named earlier - cell for later change named in later change", () => {
				// This case requires Tiebreak.Right to be supported.
				it.skip("A ○ B", () => {
					const markA = Mark.modify(nodeIdA, {
						revision: tag1,
						localId: brand(1),
					});
					const markB = Mark.insert(1, {
						revision: tag3,
						localId: brand(2),
						// tiebreak: Tiebreak.Right,
					});

					const changeX = tagChangeInline([markA], tag2);
					const changeY = tagChangeInline([markB], tag3);
					const composedXY = shallowCompose([changeX, changeY]);

					const expected = [markA, markB];
					assertChangesetsEqual(composedXY, expected);
				});
				it("B ○ A", () => {
					const markB = Mark.modify(nodeIdB, {
						revision: tag1,
						localId: brand(2),
					});
					const markA = Mark.insert(1, {
						revision: tag3,
						localId: brand(1),
					});

					const changeX = tagChangeInline([markB], tag2);
					const changeY = tagChangeInline([markA], tag3);
					const composedXY = shallowCompose([changeX, changeY]);

					const expected = [markA, markB];
					assertChangesetsEqual(composedXY, expected);
				});
			});

			describe("cell for earlier change named earlier - cell for later change named after earlier change", () => {
				describe("cell for later change named through removal", () => {
					it("A ○ B", () => {
						const markA = Mark.modify(nodeIdA, {
							revision: tag1,
							localId: brand(1),
						});
						const markNamesB = Mark.remove(1, {
							revision: tag3,
							localId: brand(2),
						});
						const markB = Mark.modify(nodeIdB, {
							revision: tag3,
							localId: brand(2),
						});

						const change2 = tagChangeInline([markA], tag2);
						const change3 = tagChangeInline([markNamesB], tag3);
						const change4 = tagChangeInline([markB], tag4);
						const composedXY = shallowCompose([change2, change3, change4]);

						const expected = [markA, { ...markNamesB, changes: nodeIdB }];
						assertChangesetsEqual(composedXY, expected);
					});

					it("B ○ A", () => {
						const markB = Mark.modify(nodeIdB, {
							revision: tag1,
							localId: brand(2),
						});
						const markNamesA = Mark.remove(1, {
							revision: tag3,
							localId: brand(1),
						});
						const markA = Mark.modify(nodeIdA, {
							revision: tag3,
							localId: brand(1),
						});

						const change2 = tagChangeInline([Mark.skip(1), markB], tag2);
						const change3 = tagChangeInline([markNamesA], tag3);
						const change4 = tagChangeInline([markA], tag4);
						const composedXY = shallowCompose([change2, change3, change4]);

						const expected = [{ ...markNamesA, changes: nodeIdA }, markB];
						assertChangesetsEqual(composedXY, expected);
					});
				});

				describe("cell for later change named through insert", () => {
					// This case requires Tiebreak.Right to be supported.
					it.skip("A ○ B", () => {
						const markA = Mark.modify(nodeIdA, {
							revision: tag1,
							localId: brand(1),
						});
						const markNamesB = Mark.remove(
							1,
							{ revision: tag3, localId: brand(2) },
							{
								cellId: {
									revision: tag3,
									localId: brand(2),
									// tiebreak: Tiebreak.Right,
								},
							},
						);
						const markB = Mark.modify(nodeIdB, {
							revision: tag3,
							localId: brand(2),
						});

						const change2 = tagChangeInline([markA], tag2);
						const change3 = tagChangeInline([markNamesB], tag3);
						const change4 = tagChangeInline([markB], tag4);
						const composedXY = shallowCompose([change2, change3, change4]);

						const expected = [markA, { ...markNamesB, changes: nodeIdB }];
						assertChangesetsEqual(composedXY, expected);
					});

					it("B ○ A", () => {
						const markB = Mark.modify(nodeIdB, {
							revision: tag1,
							localId: brand(2),
						});
						const markNamesA = Mark.remove(
							1,
							{ revision: tag3, localId: brand(1) },
							{ cellId: { revision: tag3, localId: brand(1) } },
						);
						const markA = Mark.modify(nodeIdA, {
							revision: tag3,
							localId: brand(1),
						});

						const change2 = tagChangeInline([markB], tag2);
						const change3 = tagChangeInline([markNamesA], tag3);
						const change4 = tagChangeInline([markA], tag4);
						const composedXY = shallowCompose([change2, change3, change4]);

						// The remove effect from `markNamesA` is dropped due to the mark settling process.
						const expected = [markA, markB];
						assertChangesetsEqual(composedXY, expected);
					});
				});
			});

			describe("cell for earlier change named in earlier change - cell for later change named before earlier change", () => {
				it("A ○ B", () => {
					const markA = Mark.remove(
						1,
						{ revision: tag2, localId: brand(1) },
						{ cellId: { revision: tag2, localId: brand(1) } },
					);
					const markB = Mark.modify(nodeIdB, { localId: brand(2), revision: tag1 });

					const changeX = tagChangeInline([markA], tag2);
					const changeY = tagChangeInline([Mark.tomb(tag2, brand(1)), markB], tag3);
					const composedXY = shallowCompose([changeX, changeY]);

					// The remove effect from `markA` is dropped due to the mark settling process.
					const expected = [Mark.tomb(tag2, brand(1)), markB];
					assertChangesetsEqual(composedXY, expected);
				});
				it("B ○ A", () => {
					const markB = Mark.remove(
						1,
						{ revision: tag2, localId: brand(2) },
						{ cellId: { revision: tag2, localId: brand(2) } },
					);
					const markA = Mark.modify(nodeIdA, { localId: brand(1), revision: tag1 });

					const changeX = tagChangeInline([markB], tag2);
					const changeY = tagChangeInline([markA, Mark.tomb(tag2, brand(2))], tag3);
					const composedXY = shallowCompose([changeX, changeY]);

					// The remove effect from `markB` is dropped due to the mark settling process.
					const expected = [markA, Mark.tomb(tag2, brand(2))];
					assertChangesetsEqual(composedXY, expected);
				});
			});
		});
	});
}
