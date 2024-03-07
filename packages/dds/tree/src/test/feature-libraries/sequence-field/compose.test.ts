/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "assert";
import { mintRevisionTag } from "../../utils.js";
import {
	RevisionTag,
	makeAnonChange,
	tagChange,
	TreeNodeSchemaIdentifier,
	tagRollbackInverse,
	ChangesetLocalId,
	ChangeAtomId,
	RevisionInfo,
} from "../../../core/index.js";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import { cases, ChangeMaker as Change, MarkMaker as Mark, TestChangeset } from "./testEdits.js";
import {
	areComposable,
	assertChangesetsEqual,
	compose,
	composeNoVerify,
	describeForBothConfigs,
	shallowCompose,
	skipOnLineageMethod,
	withOrderingMethod,
} from "./utils.js";

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

export function testCompose() {
	describeForBothConfigs("Compose", (config) => {
		const withConfig = (fn: () => void) => withOrderingMethod(config.cellOrdering, fn);
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
								// This test fails due to the revive lacking lineage about a detach in one of the prior edits
							});
						} else {
							it(title, () =>
								withConfig(() => {
									const ab = composeNoVerify([taggedA, taggedB]);
									const left = composeNoVerify(
										[makeAnonChange(ab), taggedC],
										revInfos,
									);
									const bc = composeNoVerify([taggedB, taggedC]);
									const right = composeNoVerify(
										[taggedA, makeAnonChange(bc)],
										revInfos,
									);
									assertChangesetsEqual(left, right);
								}),
							);
						}
					}
				}
			}
		});

		it("no changes", () =>
			withConfig(() => {
				const actual = shallowCompose([]);
				assertChangesetsEqual(actual, cases.no_change);
			}));

		it("populates cell revision info", () =>
			withConfig(() => {
				const tomb = tagChange([Mark.tomb(tag1, brand(0))], tag2);
				const insert = tagChange([Mark.insert(1, brand(0))], tag1);
				const expected = [Mark.insert(1, { revision: tag1, localId: brand(0) })];
				const actual = shallowCompose([tomb, insert]);
				assert.deepEqual(actual, expected);
			}));

		it("remove ○ revive => Noop", () =>
			withConfig(() => {
				const deletion = tagChange(Change.remove(0, 1), tag1);
				const insertion = tagRollbackInverse(
					Change.revive(0, 1, { revision: tag1, localId: brand(0) }),
					tag2,
					tag1,
				);
				const actual = shallowCompose([deletion, insertion]);
				assertChangesetsEqual(actual, cases.no_change);
			}));

		it("insert ○ modify", () =>
			withConfig(() => {
				const insert = Change.insert(0, 2);
				const modify = Change.modify(0, TestChange.mint([], 42));
				const expected = [
					Mark.insert(1, brand(0), { changes: TestChange.mint([], 42) }),
					Mark.insert(1, brand(1)),
				];
				const actual = compose([makeAnonChange(insert), makeAnonChange(modify)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("insert ○ remove ○ modify", () =>
			withConfig(() => {
				const changes = TestChange.mint([], 42);
				const insertMark = Mark.insert(2, brand(0));
				const insert = tagChange([insertMark], tag1);
				const del = tagChange([Mark.remove(2, brand(1))], tag2);
				const modify = tagChange(
					[Mark.modify(changes, { revision: tag2, localId: brand(1) })],
					tag3,
				);
				const actual = compose([insert, del, modify], revInfos);
				const expected = [
					Mark.attachAndDetach(
						Mark.insert(1, { revision: tag1, localId: brand(0) }),
						Mark.remove(1, brand(1), { revision: tag2 }),
						{ changes },
					),
					Mark.attachAndDetach(
						Mark.insert(1, { revision: tag1, localId: brand(1) }),
						Mark.remove(1, brand(2), { revision: tag2 }),
					),
				];
				assertChangesetsEqual(actual, expected);
			}));

		it("transient revive ○ modify", () =>
			withConfig(() => {
				const inputId: ChangeAtomId = {
					revision: tag1,
					localId: brand(0),
				};
				const outputId: ChangeAtomId = {
					revision: tag2,
					localId: brand(1),
				};
				const changes = TestChange.mint([], 42);
				const transientRevive = [Mark.remove(1, outputId, { cellId: inputId })];
				const modify = [Mark.modify(changes, outputId)];
				const expected = [Mark.remove(1, outputId, { cellId: inputId, changes })];
				const actual = compose(
					[makeAnonChange(transientRevive), makeAnonChange(modify)],
					revInfos,
				);
				assertChangesetsEqual(actual, expected);
			}));

		it("transient insert ○ revive & modify", () =>
			withConfig(() => {
				const transientDetach: ChangeAtomId = {
					revision: tag2,
					localId: brand(1),
				};
				const changes = TestChange.mint([], 42);
				const insert = [
					Mark.attachAndDetach(
						Mark.insert(1, { revision: tag1, localId: brand(0) }),
						Mark.remove(1, brand(1), { revision: tag2 }),
					),
				];
				const revive = [Mark.revive(1, transientDetach, { changes })];
				const expected = [
					Mark.insert(1, { revision: tag1, localId: brand(0) }, { changes }),
				];
				const actual = compose([makeAnonChange(insert), makeAnonChange(revive)], revInfos);
				assertChangesetsEqual(actual, expected);
			}));

		it("modify insert ○ modify", () =>
			withConfig(() => {
				const childChangeA = TestChange.mint([0], 1);
				const childChangeB = TestChange.mint([0, 1], 2);
				const childChangeAB = TestChange.compose(childChangeA, childChangeB);
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
				const actual = compose([tagChange(insert, tag1), tagChange(modify, tag2)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("remove ○ modify", () =>
			withConfig(() => {
				const deletion = Change.remove(0, 3);
				const childChange = TestChange.mint([0, 1], 2);
				const modify = Change.modify(0, childChange);
				const expected = [Mark.remove(3, brand(0)), Mark.modify(childChange)];
				const actual = shallowCompose([makeAnonChange(deletion), makeAnonChange(modify)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("revive ○ modify", () =>
			withConfig(() => {
				const revive = Change.revive(0, 3, { revision: tag1, localId: brand(0) });
				const changes = TestChange.mint([0, 1], 2);
				const modify = Change.modify(0, changes);
				const expected = [
					Mark.revive(1, { revision: tag1, localId: brand(0) }, { changes }),
					Mark.revive(2, { revision: tag1, localId: brand(1) }),
				];
				const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(modify)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("revive and modify ○ modify", () =>
			withConfig(() => {
				const childChangeA = TestChange.mint([0], 1);
				const childChangeB = TestChange.mint([0, 1], 2);
				const childChangeAB = TestChange.compose(childChangeA, childChangeB);
				const revive = [
					Mark.revive(
						1,
						{ revision: tag1, localId: brand(0) },
						{ changes: childChangeA },
					),
				];
				const modify = Change.modify(0, childChangeB);
				const expected = [
					Mark.revive(
						1,
						{ revision: tag1, localId: brand(0) },
						{ changes: childChangeAB },
					),
				];
				const actual = compose([makeAnonChange(revive), makeAnonChange(modify)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("modify ○ modify", () =>
			withConfig(() => {
				const childChangeA = TestChange.mint([0], 1);
				const childChangeB = TestChange.mint([0, 1], 2);
				const childChangeAB = TestChange.compose(childChangeA, childChangeB);
				const modifyA = [Mark.modify(childChangeA)];
				const modifyB = [Mark.modify(childChangeB)];
				const expected = [Mark.modify(childChangeAB)];
				const actual = compose([makeAnonChange(modifyA), makeAnonChange(modifyB)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("Remove and modify ○ transient revive", () =>
			withConfig(() => {
				const changes = TestChange.mint([0], 1);
				const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
				const del = tagChange([Mark.remove(1, cellId, { changes })], tag1);
				const transient = tagChange([Mark.remove(1, brand(1), { cellId })], tag2);

				const composed = compose([del, transient]);
				const expected = [
					Mark.remove(1, { revision: tag2, localId: brand(1) }, { changes }),
				];
				assertChangesetsEqual(composed, expected);
			}));

		it("Transient insert ○ transient revive", () =>
			withConfig(() => {
				const insert = tagChange(
					[Mark.attachAndDetach(Mark.insert(1, brand(0)), Mark.remove(1, brand(1)))],
					tag1,
				);

				const revive = tagChange(
					[Mark.remove(1, brand(0), { cellId: { revision: tag1, localId: brand(1) } })],
					tag2,
				);

				const composed = compose([insert, revive]);
				const expected = [
					Mark.attachAndDetach(
						Mark.insert(1, { revision: tag1, localId: brand(0) }, { revision: tag1 }),
						Mark.remove(1, brand(0), { revision: tag2 }),
					),
				];

				assertChangesetsEqual(composed, expected);
			}));

		it("insert ○ remove (within insert)", () =>
			withConfig(() => {
				const insert = tagChange(Change.insert(0, 3, brand(1)), tag1);
				const deletion = tagChange(Change.remove(1, 1), tag2);
				const actual = shallowCompose([insert, deletion]);
				const expected = [
					Mark.insert(1, { localId: brand(1), revision: tag1 }),
					Mark.attachAndDetach(
						Mark.insert(1, { localId: brand(2), revision: tag1 }),
						Mark.remove(1, brand(0), { revision: tag2 }),
					),
					Mark.insert(1, { localId: brand(3), revision: tag1 }),
				];
				assertChangesetsEqual(actual, expected);
			}));

		it("insert ○ move (within insert)", () =>
			withConfig(() => {
				const insert = Change.insert(0, 3, brand(1));
				const move = Change.move(1, 1, 0);
				const actual = shallowCompose([makeAnonChange(insert), makeAnonChange(move)]);
				const expected = [
					Mark.moveIn(1, brand(0)),
					Mark.insert(1, { localId: brand(1) }),
					Mark.attachAndDetach(
						Mark.insert(1, { localId: brand(2) }),
						Mark.moveOut(1, brand(0)),
					),
					Mark.insert(1, { localId: brand(3) }),
				];
				assertChangesetsEqual(actual, expected);
			}));

		it("insert ○ remove (across inserts)", () =>
			withConfig(() => {
				const insert = [
					Mark.insert(2, { localId: brand(1), revision: tag1 }),
					Mark.insert(2, { localId: brand(3), revision: tag2 }),
					Mark.insert(2, { localId: brand(5), revision: tag1 }),
				];
				const deletion = tagChange(Change.remove(1, 4), tag2);
				const actual = shallowCompose([makeAnonChange(insert), deletion], revInfos);
				const expected = [
					Mark.insert(1, { localId: brand(1), revision: tag1 }),
					Mark.attachAndDetach(
						Mark.insert(1, { localId: brand(2), revision: tag1 }),
						Mark.remove(1, brand(0), { revision: tag2 }),
					),
					Mark.attachAndDetach(
						Mark.insert(2, { localId: brand(3), revision: tag2 }),
						Mark.remove(2, brand(1), { revision: tag2 }),
					),
					Mark.attachAndDetach(
						Mark.insert(1, { localId: brand(5), revision: tag1 }),
						Mark.remove(1, brand(3), { revision: tag2 }),
					),
					Mark.insert(1, { localId: brand(6), revision: tag1 }),
				];
				assertChangesetsEqual(actual, expected);
			}));

		it("insert ○ move (across inserts)", () =>
			withConfig(() => {
				const insert = [
					Mark.insert(2, { localId: brand(1), revision: tag1 }),
					Mark.insert(2, { localId: brand(3), revision: tag2 }),
					Mark.insert(2, { localId: brand(5), revision: tag1 }),
				];
				const move = Change.move(1, 4, 0);
				const actual = shallowCompose(
					[makeAnonChange(insert), makeAnonChange(move)],
					revInfos,
				);

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
				assertChangesetsEqual(actual, expected);
			}));

		it("modify ○ remove", () =>
			withConfig(() => {
				const changes = TestChange.mint([0, 1], 2);
				const modify = Change.modify(0, changes);
				const deletion = Change.remove(0, 1);
				const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(deletion)]);
				const expected = [Mark.remove(1, brand(0), { changes })];
				assertChangesetsEqual(actual, expected);
			}));

		it("remove ○ remove", () =>
			withConfig(() => {
				// Removes ABC-----IJKLM
				const removeA = [Mark.remove(3, brand(0)), { count: 5 }, Mark.remove(5, brand(3))];
				// Removes DEFG--OP
				const removeB = [Mark.remove(4, brand(0)), { count: 2 }, Mark.remove(2, brand(4))];
				const actual = shallowCompose([tagChange(removeA, tag1), tagChange(removeB, tag2)]);
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
			}));

		it("revive ○ remove", () =>
			withConfig(() => {
				// Revive ABCDE
				const revive = Change.revive(0, 5, { revision: tag1, localId: brand(0) });
				// Remove _B_DEF
				const deletion = [
					{ count: 1 },
					Mark.remove(1, brand(0)),
					{ count: 1 },
					Mark.remove(3, brand(1)),
				];
				const actual = shallowCompose([makeAnonChange(revive), tagChange(deletion, tag2)]);
				const expected = [
					Mark.revive(1, { revision: tag1, localId: brand(0) }),
					Mark.remove(
						1,
						{ revision: tag2, localId: brand(0) },
						{ cellId: { revision: tag1, localId: brand(1) } },
					),
					Mark.revive(1, { revision: tag1, localId: brand(2) }),
					Mark.remove(
						2,
						{ revision: tag2, localId: brand(1) },
						{ cellId: { revision: tag1, localId: brand(3) } },
					),
					Mark.remove(1, brand(3), { revision: tag2 }),
				];
				assertChangesetsEqual(actual, expected);
			}));

		it("revive and modify ○ remove", () =>
			withConfig(() => {
				const changes = TestChange.mint([0, 1], 2);
				const detachEvent: ChangeAtomId = { revision: tag1, localId: brand(0) };
				const revive = [Mark.revive(1, detachEvent, { changes })];
				const deletion = [Mark.remove(2, brand(0))];
				const actual = shallowCompose([tagChange(revive, tag2), tagChange(deletion, tag3)]);
				const expected: TestChangeset = [
					Mark.remove(
						1,
						{ localId: brand(0), revision: tag3 },
						{ cellId: detachEvent, changes },
					),
					Mark.remove(1, { localId: brand(1), revision: tag3 }),
				];
				assertChangesetsEqual(actual, expected);
			}));

		it("modify ○ insert", () =>
			withConfig(() => {
				const childChange = TestChange.mint([0, 1], 2);
				const modify = Change.modify(0, childChange);
				const insert = Change.insert(0, 1, brand(2));
				const expected = [Mark.insert(1, brand(2)), Mark.modify(childChange)];
				const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(insert)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("remove ○ insert", () =>
			withConfig(() => {
				const deletion = Change.remove(0, 3);
				const insert = Change.insert(0, 1, brand(2));
				// TODO: test with merge-right policy as well
				const expected = [
					Mark.insert(1, { localId: brand(2), revision: tag2 }),
					Mark.remove(3, brand(0), { revision: tag1 }),
				];
				const actual = shallowCompose([tagChange(deletion, tag1), tagChange(insert, tag2)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("revive ○ insert", () =>
			withConfig(() => {
				const revive = Change.revive(0, 5, { revision: tag1, localId: brand(0) });
				const insert = Change.insert(0, 1, brand(2));
				// TODO: test with merge-right policy as well
				const expected = [
					Mark.insert(1, brand(2)),
					Mark.revive(5, { revision: tag1, localId: brand(0) }),
				];
				const actual = shallowCompose([makeAnonChange(revive), makeAnonChange(insert)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("insert ○ insert", () =>
			withConfig(() => {
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
			}));

		it("modify ○ revive", () =>
			withConfig(() => {
				const childChange = TestChange.mint([0, 1], 2);
				const modify = Change.modify(0, childChange);
				const revive = Change.revive(0, 2, { revision: tag1, localId: brand(0) });
				const expected = [
					Mark.revive(2, { revision: tag1, localId: brand(0) }),
					Mark.modify(childChange),
				];
				const actual = shallowCompose([makeAnonChange(modify), makeAnonChange(revive)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("remove ○ revive (different earlier nodes)", () =>
			withConfig(() => {
				const deletion = tagChange(Change.remove(0, 2), tag1);
				const lineage: SF.LineageEvent[] = [
					{ revision: tag1, id: brand(0), count: 2, offset: 0 },
				];
				const revive = makeAnonChange([
					Mark.revive(2, { revision: tag2, localId: brand(0), lineage }),
					Mark.tomb(tag1, brand(0), 2),
				]);
				const expected = [
					Mark.revive(2, { revision: tag2, localId: brand(0), lineage }),
					Mark.remove(2, brand(0), { revision: tag1 }),
				];
				const actual = shallowCompose([deletion, revive]);
				assertChangesetsEqual(actual, expected);
			}));

		it("remove ○ revive (different in-between nodes)", () =>
			withConfig(() => {
				const deletion = tagChange(Change.remove(0, 2), tag1);
				const lineage: SF.LineageEvent[] = [
					{ revision: tag1, id: brand(0), count: 2, offset: 1 },
				];
				const revive = makeAnonChange([
					Mark.tomb(tag1),
					Mark.revive(2, { revision: tag2, localId: brand(0), lineage }),
					Mark.tomb(tag1, brand(1)),
				]);
				const expected = [
					Mark.remove(1, brand(0), { revision: tag1 }),
					Mark.revive(2, { revision: tag2, localId: brand(0), lineage }),
					Mark.remove(1, brand(1), { revision: tag1 }),
				];
				const actual = shallowCompose([deletion, revive]);
				assertChangesetsEqual(actual, expected);
			}));

		it("remove ○ revive (different later nodes)", () =>
			withConfig(() => {
				const deletion = tagChange(Change.remove(0, 2), tag1);
				const lineage: SF.LineageEvent[] = [
					{ revision: tag1, id: brand(0), count: 2, offset: 2 },
				];
				const revive = makeAnonChange([
					Mark.tomb(tag1, brand(0), 2),
					Mark.revive(2, { revision: tag2, localId: brand(0), lineage }),
				]);
				const expected = [
					Mark.remove(2, brand(0), { revision: tag1 }),
					Mark.revive(2, { revision: tag2, localId: brand(0), lineage }),
				];
				const actual = shallowCompose([deletion, revive]);
				assertChangesetsEqual(actual, expected);
			}));

		it("remove1 ○ remove2 ○ revive (remove1)", () =>
			withConfig(() => {
				const remove1 = Change.remove(1, 3);
				const remove2 = Change.remove(0, 2);
				// The revive needs lineage to describe the precise gap in which it is reviving the nodes.
				// Such lineage would normally be acquired by rebasing the revive over the second remove.
				const revive = [
					Mark.tomb(tag2),
					Mark.tomb(tag1),
					Mark.revive(1, {
						revision: tag1,
						localId: brand(1),
						lineage: [{ revision: tag2, id: brand(0), count: 2, offset: 1 }],
					}),
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
					tagChange(remove1, tag1),
					tagChange(remove2, tag2),
					tagChange(revive, tag3),
				]);
				assertChangesetsEqual(actual, expected);
			}));

		it("remove1 ○ remove2 ○ revive (remove2)", () =>
			withConfig(() => {
				const remove1 = Change.remove(1, 3);
				const remove2 = Change.remove(0, 2);
				const revive = [Mark.revive(2, { revision: tag2, localId: brand(0) })];
				const expected = [{ count: 1 }, Mark.remove(3, brand(0), { revision: tag1 })];
				const actual = shallowCompose([
					tagChange(remove1, tag1),
					tagChange(remove2, tag2),
					tagChange(revive, tag3),
				]);
				assertChangesetsEqual(actual, expected);
			}));

		it("reviveAA ○ reviveB => BAA", () =>
			withConfig(() => {
				const lineage: SF.LineageEvent[] = [
					{ revision: tag2, id: brand(0), count: 1, offset: 1 },
				];
				const reviveAA = [
					Mark.tomb(tag2),
					Mark.revive(2, { revision: tag1, localId: brand(1), lineage }),
				];
				const reviveB = Change.revive(0, 1, { revision: tag2, localId: brand(0) });
				const expected = [
					Mark.revive(1, { revision: tag2, localId: brand(0) }),
					Mark.revive(2, { revision: tag1, localId: brand(1), lineage }),
				];
				const actual = shallowCompose([makeAnonChange(reviveAA), makeAnonChange(reviveB)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("reviveA ○ reviveBB => BAB", () =>
			withConfig(() => {
				const lineage: SF.LineageEvent[] = [
					{ revision: tag2, id: brand(0), count: 2, offset: 1 },
				];
				const reviveA = [
					Mark.tomb(tag2),
					Mark.revive(1, { revision: tag1, localId: brand(1), lineage }),
					Mark.tomb(tag2, brand(1)),
				];
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
				assertChangesetsEqual(actual, expected);
			}));

		it("reviveAA ○ reviveB => AAB", () =>
			withConfig(() => {
				const lineage: SF.LineageEvent[] = [
					{ revision: tag2, id: brand(0), count: 1, offset: 0 },
				];
				const reviveA = [
					Mark.revive(2, { revision: tag1, localId: brand(0), lineage }),
					Mark.tomb(tag2),
				];
				const reviveB = Change.revive(2, 1, { revision: tag2, localId: brand(0) });
				const expected = [
					Mark.revive(2, { revision: tag1, localId: brand(0), lineage }),
					Mark.revive(1, { revision: tag2, localId: brand(0) }),
				];
				const actual = shallowCompose([makeAnonChange(reviveA), makeAnonChange(reviveB)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("revive ○ redundant revive", () =>
			withConfig(() => {
				const reviveA = Change.revive(0, 2, { revision: tag1, localId: brand(0) });
				const reviveB = Change.redundantRevive(0, 2, { revision: tag1, localId: brand(0) });
				const expected = [
					Mark.revive(2, { revision: tag1, localId: brand(0) }, { revision: tag2 }),
				];
				const actual = shallowCompose([tagChange(reviveA, tag2), makeAnonChange(reviveB)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("move ○ modify", () =>
			withConfig(() => {
				const move = Change.move(0, 1, 2);
				const changes = TestChange.mint([], 42);
				const modify = Change.modify(1, changes);
				const expected = [
					Mark.moveOut(1, brand(0), { changes }),
					{ count: 1 },
					Mark.moveIn(1, brand(0)),
				];
				const actual = shallowCompose([makeAnonChange(move), makeAnonChange(modify)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("move ○ modify and return", () =>
			withConfig(() => {
				const move = [Mark.moveIn(1, brand(0)), { count: 1 }, Mark.moveOut(1, brand(0))];
				const changes = TestChange.mint([], 42);
				const moveBack = [
					Mark.moveOut(1, brand(0), { changes }),
					{ count: 1 },
					Mark.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
				];
				const expected = [Mark.tomb(tag1), { count: 1 }, Mark.modify(changes)];
				const actual = shallowCompose([
					tagChange(move, tag1),
					tagRollbackInverse(moveBack, tag3, tag1),
				]);
				assertChangesetsEqual(actual, expected);
			}));

		it("move ○ remove", () =>
			withConfig(() => {
				const move = Change.move(1, 1, 4, brand(0));
				const deletion = Change.remove(3, 1, brand(1));
				const expected = [
					{ count: 1 },
					Mark.moveOut(1, brand(0)),
					{ count: 2 },
					Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.remove(1, brand(1))),
				];
				const actual = shallowCompose([makeAnonChange(move), makeAnonChange(deletion)]);
				assertChangesetsEqual(actual, expected);
			}));

		it("return ○ return", () =>
			withConfig(() => {
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
				assertChangesetsEqual(actual, expected);
			}));

		it("modify ○ return", () =>
			withConfig(() => {
				const changes = TestChange.mint([], 42);
				const modify = tagChange(Change.modify(3, changes), tag3);
				const ret = tagChange(
					Change.return(3, 2, 0, { revision: tag1, localId: brand(0) }),
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
					Mark.moveOut(1, brand(0), { revision: tag4, changes }),
					Mark.moveOut(1, brand(1), { revision: tag4 }),
				];
				assertChangesetsEqual(actual, expected);
			}));

		it("move ○ move with node changes", () =>
			withConfig(() => {
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

				assertChangesetsEqual(composed, expected);
			}));

		it("move ○ move (forward)", () =>
			withConfig(() => {
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
					Mark.moveIn(1, brand(1), {
						finalEndpoint: { revision: undefined, localId: brand(0) },
					}),
				];
				assertChangesetsEqual(actual, expected);
			}));

		it("move ○ move (back)", () =>
			withConfig(() => {
				const move1 = Change.move(2, 1, 1, brand(0));
				const move2 = Change.move(1, 1, 0, brand(1));
				const actual = shallowCompose([makeAnonChange(move1), makeAnonChange(move2)]);
				const expected = [
					Mark.moveIn(1, brand(1), {
						finalEndpoint: { revision: undefined, localId: brand(0) },
					}),
					{ count: 1 },
					Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.moveOut(1, brand(1))),
					{ count: 1 },
					Mark.moveOut(1, brand(0), {
						finalEndpoint: { revision: undefined, localId: brand(1) },
					}),
				];
				assertChangesetsEqual(actual, expected);
			}));

		it("move ○ move adjacent to starting position (back and forward)", () =>
			withConfig(() => {
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
				assertChangesetsEqual(actual, expected);
			}));

		it("move ○ move adjacent to starting position (forward and back)", () =>
			withConfig(() => {
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
				assertChangesetsEqual(actual, expected);
			}));

		it("adjacent detached modifies 1", () =>
			withConfig(() => {
				// Starting state [A B]
				// Revision 1 removes A
				// Revision 2 removes B
				// Revision 3 modifies A
				// Revision 4 modifies B
				const nodeChange1 = "Change1";
				const nodeChange2 = "Change2";
				const lineage: SF.LineageEvent[] = [
					{ revision: tag2, id: brand(0), count: 1, offset: 0 },
				];
				const detach1: SF.CellId = { revision: tag1, localId: brand(0), lineage };
				const detach2: SF.CellId = { revision: tag2, localId: brand(0) };

				const modify1 = [Mark.modify(nodeChange1, detach1), Mark.tomb(tag2)];
				const modify2 = [Mark.modify(nodeChange2, detach2)];
				const actual = shallowCompose([tagChange(modify1, tag3), tagChange(modify2, tag4)]);

				const expected = [
					Mark.modify(nodeChange1, detach1),
					Mark.modify(nodeChange2, detach2),
				];

				assertChangesetsEqual(actual, expected);
			}));

		it("adjacent detached modifies 2", () =>
			withConfig(() => {
				// Starting state [A B]
				// Revision 1 removes B
				// Revision 2 removes A
				// Revision 3 modifies B
				// Revision 4 modifies A
				const nodeChange1 = "Change1";
				const nodeChange2 = "Change2";
				const lineage: SF.LineageEvent[] = [
					{ revision: tag2, id: brand(0), count: 1, offset: 1 },
				];
				const detach1: SF.CellId = { revision: tag1, localId: brand(1), lineage };
				const detach2: SF.CellId = { revision: tag2, localId: brand(0) };

				const modify1 = [Mark.tomb(tag2), Mark.modify(nodeChange1, detach1)];
				const modify2 = [Mark.modify(nodeChange2, detach2)];
				const actual = shallowCompose([tagChange(modify1, tag3), tagChange(modify2, tag4)]);

				const expected = [
					Mark.modify(nodeChange2, detach2),
					Mark.modify(nodeChange1, detach1),
				];

				assertChangesetsEqual(actual, expected);
			}));

		it("adjacent detached modifies 3", () =>
			withConfig(() => {
				// Starting state [A B]
				// Revision 1 removes A
				// Revision 2 removes B
				// Revision 3 modifies B
				// Revision 4 modifies A
				const nodeChange1 = "Change1";
				const nodeChange2 = "Change2";
				const lineage: SF.LineageEvent[] = [
					{ revision: tag2, id: brand(0), count: 1, offset: 0 },
				];
				const detach1: SF.CellId = { revision: tag1, localId: brand(0), lineage };
				const detach2: SF.CellId = { revision: tag2, localId: brand(0) };

				const modify1 = [Mark.modify(nodeChange1, detach2)];
				const modify2 = [Mark.modify(nodeChange2, detach1), Mark.tomb(tag2)];
				const actual = shallowCompose([tagChange(modify1, tag3), tagChange(modify2, tag4)]);

				const expected = [
					Mark.modify(nodeChange2, detach1),
					Mark.modify(nodeChange1, detach2),
				];

				assertChangesetsEqual(actual, expected);
			}));

		it("adjacent detached modifies 4", () =>
			withConfig(() => {
				// Starting state [A B]
				// Revision 1 removes B
				// Revision 2 removes A
				// Revision 3 modifies A
				// Revision 4 modifies B
				const nodeChange1 = "Change1";
				const nodeChange2 = "Change2";

				const lineage: SF.LineageEvent[] = [
					{ revision: tag2, id: brand(0), count: 1, offset: 1 },
				];
				const detach1: SF.CellId = { revision: tag1, localId: brand(1), lineage };
				const detach2: SF.CellId = { revision: tag2, localId: brand(0) };

				const modify1 = [Mark.modify(nodeChange1, detach2)];
				const modify2 = [Mark.tomb(tag2), Mark.modify(nodeChange2, detach1)];
				const actual = shallowCompose([tagChange(modify1, tag3), tagChange(modify2, tag4)]);

				const expected = [
					Mark.modify(nodeChange1, detach2),
					Mark.modify(nodeChange2, detach1),
				];

				assertChangesetsEqual(actual, expected);
			}));

		it("move, remove, revive", () =>
			withConfig(() => {
				const move = tagChange(Change.move(1, 1, 0), tag1);
				const del = tagChange(Change.remove(0, 1), tag2);
				const revive = tagChange(
					Change.revive(0, 1, { revision: tag2, localId: brand(0) }),
					tag3,
				);
				const actual = shallowCompose([move, del, revive]);
				const expected = shallowCompose([move]);
				assertChangesetsEqual(actual, expected);
			}));

		// This test leads compose to output a vestigial endpoint.
		it.skip("return-to, remove, move-out", () => {
			const returnTo = tagRollbackInverse(
				[
					Mark.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
					{ count: 1 },
					Mark.moveOut(1, brand(0), {
						idOverride: {
							type: SF.DetachIdOverrideType.Redetach,
							id: { revision: tag1, localId: brand(0) },
						},
					}),
				],
				tag3,
				tag1,
			);
			const del = tagChange([Mark.remove(1, brand(0))], tag2);
			const move = tagChange(
				[
					Mark.moveOut(1, brand(0), { cellId: { revision: tag2, localId: brand(0) } }),
					{ count: 1 },
					Mark.moveIn(1, brand(0)),
				],
				tag1,
			);
			const actual = shallowCompose([returnTo, del, move]);
			assertChangesetsEqual(actual, []);
		});

		it("move1, move2, return2", () =>
			withConfig(() => {
				for (const [a, b, c] of [
					[0, 1, 2],
					[2, 1, 0],
				]) {
					const move1 = tagChange(Change.move(a, 1, b > a ? b + 1 : b), tag1);
					const move2 = tagChange(Change.move(b, 1, c > b ? c + 1 : c), tag2);
					const return2 = tagRollbackInverse(
						Change.return(c, 1, b > c ? b + 1 : b, {
							revision: tag2,
							localId: brand(0),
						}),
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
										Mark.skip(3),
										Mark.tomb(tag2),
									]),
							  ]
							: [
									move1,
									makeAnonChange([
										Mark.tomb(tag2),
										Mark.skip(3),
										Mark.tomb(tag1),
									]),
							  ],
					);
					assertChangesetsEqual(composed, expected);
				}
			}));

		it("move1 ○ [return1, move2]", () =>
			withConfig(() => {
				for (const [a, b, c] of [
					[0, 1, 2],
					[2, 1, 0],
				]) {
					const move1 = tagChange(Change.move(a, 1, b > a ? b + 1 : b), tag1);
					const return1 = tagRollbackInverse(
						Change.return(b, 1, a > b ? a + 1 : a, {
							revision: tag1,
							localId: brand(0),
						}),
						tag2,
						tag1,
					);
					const move2 = tagChange(Change.move(a, 1, c > a ? c + 1 : c), tag3);
					const part2 = shallowCompose([return1, move2]);
					const composed = shallowCompose(
						[move1, makeAnonChange(part2)],
						[
							{ revision: tag1 },
							{ revision: tag2, rollbackOf: tag1 },
							{ revision: tag3 },
						],
					);
					const expected = shallowCompose(
						a < b
							? [
									move2,
									makeAnonChange([
										Mark.tomb(tag3),
										Mark.skip(1),
										Mark.tomb(tag1),
									]),
							  ]
							: [
									move2,
									makeAnonChange([
										Mark.skip(2),
										Mark.tomb(tag1),
										Mark.skip(1),
										Mark.tomb(tag3),
									]),
							  ],
					);
					assertChangesetsEqual(composed, expected);
				}
			}));

		it("move1 ○ [return1, move2, move3]", () =>
			withConfig(() => {
				const move1 = tagChange(Change.move(3, 1, 2), tag1);
				const return1 = tagRollbackInverse(
					Change.return(2, 1, 4, {
						revision: tag1,
						localId: brand(0),
					}),
					tag2,
					tag1,
				);
				const move2 = tagChange(Change.move(3, 1, 1), tag3);
				const move3 = tagChange(Change.move(1, 1, 0), tag4);
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

				const moveId1: ChangeAtomId = { revision: tag3, localId: brand(0) };
				const moveId2: ChangeAtomId = { revision: tag4, localId: brand(0) };

				const [moveOut1, moveIn1] = Mark.move(1, moveId1);
				moveOut1.finalEndpoint = moveId2;

				const [moveOut2, moveIn2] = Mark.move(1, moveId2);
				moveIn2.finalEndpoint = moveId1;

				const expected = [
					moveIn2,
					Mark.skip(1),
					Mark.attachAndDetach(moveIn1, moveOut2),
					Mark.skip(1),
					Mark.tomb(tag1, brand(0)),
					Mark.skip(1),
					moveOut1,
				];

				assertChangesetsEqual(composed, expected);
			}));

		it("[move1, move2] ○ [return2, move3]", () =>
			withConfig(() => {
				for (const [a, b, c, d] of [
					[0, 1, 2, 3],
					[3, 2, 1, 0],
				]) {
					const move1 = tagChange(Change.move(a, 1, b > a ? b + 1 : b), tag1);
					const move2 = tagChange(Change.move(b, 1, c > b ? c + 1 : c), tag2);
					const part1 = shallowCompose([move1, move2]);
					const return2 = tagRollbackInverse(
						Change.return(c, 1, b > c ? b + 1 : b, {
							revision: tag2,
							localId: brand(0),
						}),
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
										Mark.tomb(tag2), // c
									]),
							  ]
							: [
									move1,
									move3,
									makeAnonChange([
										Mark.skip(1), // d
										Mark.skip(1),
										Mark.tomb(tag2), // c
										Mark.skip(1),
										Mark.tomb(tag4), // b
										Mark.skip(1),
										Mark.tomb(tag1), // a
									]),
							  ],
					);
					assertChangesetsEqual(composed, expected);
				}
			}));

		it("[move1, move2] ○ return1", () =>
			withConfig(() => {
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

				assertChangesetsEqual(composed, expected);
			}));

		it("remove (rollback) ○ insert", () =>
			withConfig(() => {
				const insertA = tagChange([Mark.insert(1, brand(0))], tag1);
				const removeB = tagRollbackInverse([Mark.remove(1, brand(0))], tag3, tag2);
				const composed = shallowCompose([removeB, insertA]);

				// B is the inverse of a new attach. Since that new attach comes after A (temporally),
				// its tiebreak policy causes the cell to come before A's insert (spatially).
				// When composing the rollback with A's insert, the remove should come before the insert,
				// even though A's insert has a tiebreak policy which puts it before other new cells.
				const expected = [
					Mark.remove(1, { revision: tag3, localId: brand(0) }),
					Mark.insert(1, { revision: tag1, localId: brand(0) }),
				];

				assertChangesetsEqual(composed, expected);
			}));

		it("move-in+remove ○ modify", () =>
			withConfig(() => {
				const changes = TestChange.mint([], 42);
				const [mo, mi] = Mark.move(1, { revision: tag1, localId: brand(1) });
				const attachDetach = Mark.attachAndDetach(
					mi,
					Mark.remove(1, { revision: tag2, localId: brand(2) }),
				);
				const base = makeAnonChange([mo, attachDetach]);
				const modify = tagChange(
					[Mark.modify(changes, { revision: tag2, localId: brand(2) })],
					tag3,
				);
				const actual = shallowCompose([base, modify]);
				const expected = [{ ...mo, changes }, attachDetach];
				assertChangesetsEqual(actual, expected);
			}));

		it("effect management for [move, modify, move]", () =>
			withConfig(() => {
				const changes = TestChange.mint([], 42);
				const [mo, mi] = Mark.move(1, brand(0));
				const move = tagChange([mo, mi], tag1);
				const modify = tagChange([Mark.modify(changes)], tag2);
				const moveBack = tagChange([mi, mo], tag3);
				const childComposer = (
					change1: TestChange | undefined,
					change2: TestChange | undefined,
				): TestChange => {
					assert(change1 === undefined || change2 === undefined);
					const nodeChange = change1 ?? change2 ?? fail("Expected a node change");
					assert.deepEqual(nodeChange, changes);
					return nodeChange;
				};
				compose([move, modify, moveBack], undefined, childComposer);
			}));

		describe("empty cell ordering", () => {
			const tombA = Mark.tomb(tag1, brand(1));
			const tombB = Mark.tomb(tag1, brand(2));
			const tombC = Mark.tomb(tag1, brand(3));

			describe("cells named in the same earlier revision", () => {
				it("A ○ A", () =>
					withConfig(() => {
						const adjacentCells: SF.IdRange[] = [{ id: brand(1), count: 1 }];
						const markA = Mark.modify(TestChange.mint([], 1), {
							revision: tag1,
							localId: brand(1),
							adjacentCells,
						});
						const markB = Mark.modify(TestChange.mint([1], 2), {
							revision: tag1,
							localId: brand(1),
							adjacentCells,
						});

						const changeX = tagChange([markA], tag2);
						const changeY = tagChange([markB], tag3);
						const composedAB = compose([changeX, changeY]);

						const expected = [
							Mark.modify(TestChange.mint([], [1, 2]), {
								revision: tag1,
								localId: brand(1),
								adjacentCells,
							}),
						];
						assertChangesetsEqual(composedAB, expected);
					}));

				it("A ○ B", () =>
					withConfig(() => {
						const adjacentCells: SF.IdRange[] = [{ id: brand(1), count: 2 }];
						const markA = Mark.modify("A", {
							revision: tag1,
							localId: brand(1),
							adjacentCells,
						});
						const markB = Mark.modify("B", {
							revision: tag1,
							localId: brand(2),
							adjacentCells,
						});

						const changeA = tagChange([markA, tombB], tag2);
						const changeB = tagChange([tombA, markB], tag3);
						const composedAB = shallowCompose([changeA, changeB]);

						const expected = [markA, markB];
						assertChangesetsEqual(composedAB, expected);
					}));

				it("B ○ A", () =>
					withConfig(() => {
						const adjacentCells: SF.IdRange[] = [{ id: brand(1), count: 2 }];
						const markA = Mark.modify("A", {
							revision: tag1,
							localId: brand(1),
							adjacentCells,
						});
						const markB = Mark.modify("B", {
							revision: tag1,
							localId: brand(2),
							adjacentCells,
						});

						const changeA = tagChange([markA, tombB], tag2);
						const changeB = tagChange([tombA, markB], tag3);
						const composedBA = shallowCompose([changeB, changeA]);

						const expected = [markA, markB];
						assertChangesetsEqual(composedBA, expected);
					}));
			});

			describe("cells named in different earlier revisions", () => {
				it("older A ○ newer B", () =>
					withConfig(() => {
						const markA = Mark.modify("A", {
							revision: tag1,
							localId: brand(1),
							lineage: [{ revision: tag2, id: brand(2), count: 1, offset: 0 }],
						});
						const markB = Mark.modify("B", {
							revision: tag2,
							localId: brand(2),
						});

						const changeX = tagChange([markA, Mark.tomb(tag2, brand(2))], tag3);
						const changeY = tagChange([markB], tag4);
						const composedXY = shallowCompose([changeX, changeY]);

						const expected = [markA, markB];
						assertChangesetsEqual(composedXY, expected);
					}));

				it("newer A ○ older B", () =>
					withConfig(() => {
						const markA = Mark.modify("A", {
							revision: tag2,
							localId: brand(1),
						});
						const markB = Mark.modify("B", {
							revision: tag1,
							localId: brand(2),
							lineage: [{ revision: tag2, id: brand(1), count: 1, offset: 1 }],
						});

						const changeX = tagChange([markA], tag3);
						const changeY = tagChange([Mark.tomb(tag2, brand(1)), markB], tag4);
						const composedXY = shallowCompose([changeX, changeY]);

						const expected = [markA, markB];
						assertChangesetsEqual(composedXY, expected);
					}));

				it("older B ○ newer A", () =>
					withConfig(() => {
						const markB = Mark.modify("B", {
							revision: tag1,
							localId: brand(2),
							lineage: [{ revision: tag2, id: brand(1), count: 1, offset: 1 }],
						});
						const markA = Mark.modify("A", {
							revision: tag2,
							localId: brand(1),
						});

						const changeX = tagChange([Mark.tomb(tag2, brand(1)), markB], tag3);
						const changeY = tagChange([markA], tag4);
						const composedXY = shallowCompose([changeX, changeY]);

						const expected = [markA, markB];
						assertChangesetsEqual(composedXY, expected);
					}));

				it("newer B ○ older A", () =>
					withConfig(() => {
						const markB = Mark.modify("B", {
							revision: tag2,
							localId: brand(2),
						});
						const markA = Mark.modify("A", {
							revision: tag1,
							localId: brand(1),
							lineage: [{ revision: tag2, id: brand(2), count: 1, offset: 0 }],
						});

						const changeX = tagChange([markB], tag3);
						const changeY = tagChange([markA, Mark.tomb(tag2, brand(2))], tag4);
						const composedXY = shallowCompose([changeX, changeY]);

						const expected = [markA, markB];
						assertChangesetsEqual(composedXY, expected);
					}));
			});

			describe("cell for later change named in base", () => {
				it("ABC ○ B", () =>
					withConfig(() => {
						const changeX = tagChange(
							[
								Mark.modify("A", { revision: tag1, localId: brand(1) }),
								Mark.remove(
									1,
									{ revision: tag2, localId: brand(2) },
									{ cellId: { revision: tag1, localId: brand(2) } },
								),
								Mark.modify("C", { revision: tag1, localId: brand(3) }),
							],
							tag2,
						);
						const markB = Mark.modify("B", {
							revision: tag2,
							localId: brand(2),
							adjacentCells: [{ id: brand(2), count: 1 }],
						});

						const changeY = tagChange([tombA, markB, tombC], tag3);
						const composedXY = shallowCompose([changeX, changeY]);

						const expected = [
							Mark.modify("A", { revision: tag1, localId: brand(1) }),
							Mark.remove(
								1,
								{ revision: tag2, localId: brand(2) },
								{ cellId: { revision: tag1, localId: brand(2) }, changes: "B" },
							),
							Mark.modify("C", { revision: tag1, localId: brand(3) }),
						];
						assertChangesetsEqual(composedXY, expected);
					}));
			});

			describe("both cells named in their own change", () => {
				it("B ○ A - no lineage", () =>
					withConfig(() => {
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
					}));

				// TODO: make this pass with CellOrderingMethod.Lineage
				skipOnLineageMethod(config, "A ○ C - with lineage for B on both marks", () =>
					withConfig(() => {
						const cellA = Mark.remove(
							1,
							{
								revision: tag3,
								localId: brand(1),
							},
							{
								cellId: {
									revision: tag1,
									localId: brand(1),
									lineage: [
										{ revision: tag2, id: brand(2), count: 1, offset: 0 },
									],
								},
							},
						);
						const cellC = Mark.insert(1, {
							revision: tag4,
							localId: brand(3),
							lineage: [{ revision: tag2, id: brand(2), count: 1, offset: 1 }],
						});

						const composed = shallowCompose(
							[makeAnonChange([cellA, tombB]), makeAnonChange([tombB, cellC])],
							[{ revision: tag3 }, { revision: tag4 }],
						);

						const expected = [cellA, tombB, cellC];
						assertChangesetsEqual(composed, expected);
					}),
				);

				it("C ○ A - with lineage for B on both marks", () =>
					withConfig(() => {
						const cellA = Mark.insert(1, {
							revision: tag4,
							localId: brand(1),
							lineage: [{ revision: tag2, id: brand(2), count: 1, offset: 0 }],
						});
						const cellC = Mark.remove(
							1,
							{
								revision: tag3,
								localId: brand(1),
							},
							{
								cellId: {
									revision: tag1,
									localId: brand(1),
									lineage: [
										{ revision: tag2, id: brand(2), count: 1, offset: 0 },
									],
								},
							},
						);

						const composed = shallowCompose(
							[makeAnonChange([tombB, cellC]), makeAnonChange([cellA, tombB])],
							[{ revision: tag3 }, { revision: tag4 }],
						);

						const expected = [cellA, tombB, cellC];
						assertChangesetsEqual(composed, expected);
					}));

				// TODO: make this pass with CellOrderingMethod.Lineage
				skipOnLineageMethod(config, "A ○ C - with lineage for B on C", () =>
					withConfig(() => {
						const cellA = Mark.remove(1, { revision: tag2, localId: brand(1) });
						const cellC = Mark.insert(1, {
							revision: tag3,
							localId: brand(3),
							lineage: [{ revision: tag1, id: brand(2), count: 1, offset: 1 }],
						});

						const composed = shallowCompose(
							[makeAnonChange([cellA]), makeAnonChange([tombB, cellC])],
							[{ revision: tag2 }, { revision: tag3 }],
						);

						const expected = [cellA, tombB, cellC];
						assertChangesetsEqual(composed, expected);
					}),
				);

				it("C ○ A - with lineage for B on C", () =>
					withConfig(() => {
						const cellA = Mark.modify("A", { revision: tag2, localId: brand(1) });
						const cellC = Mark.insert(1, {
							revision: tag3,
							localId: brand(3),
							lineage: [{ revision: tag1, id: brand(2), count: 1, offset: 1 }],
						});

						const composed = shallowCompose(
							[makeAnonChange([tombB, cellC]), makeAnonChange([cellA])],
							[{ revision: tag2 }, { revision: tag3 }],
						);

						const expected = [cellA, tombB, cellC];
						assertChangesetsEqual(composed, expected);
					}));
			});

			describe("both cells named in earlier change", () => {
				// This is the only test that makes sense because the earlier change must include marks
				// for all the cells that it names.
				it("ABC ○ B", () =>
					withConfig(() => {
						const markABC = Mark.remove(3, { revision: tag1, localId: brand(1) });
						const markB = Mark.modify("B", {
							revision: tag1,
							localId: brand(2),
							adjacentCells: [{ id: brand(1), count: 3 }],
						});

						const changeX = tagChange([markABC], tag1);
						const changeY = tagChange([tombA, markB, tombC], tag2);
						const composedXY = shallowCompose([changeX, changeY]);

						const expected = [
							Mark.remove(1, { revision: tag1, localId: brand(1) }),
							Mark.remove(1, { revision: tag1, localId: brand(2) }, { changes: "B" }),
							Mark.remove(1, { revision: tag1, localId: brand(3) }),
						];
						assertChangesetsEqual(composedXY, expected);
					}));
			});

			describe("cell for earlier change named earlier - cell for later change named in later change", () => {
				// This case requires Tiebreak.Right to be supported.
				it.skip("A ○ B", () =>
					withConfig(() => {
						const markA = Mark.modify("A", {
							revision: tag1,
							localId: brand(1),
						});
						const markB = Mark.insert(1, {
							revision: tag3,
							localId: brand(2),
							// tiebreak: Tiebreak.Right,
						});

						const changeX = tagChange([markA], tag2);
						const changeY = tagChange([markB], tag3);
						const composedXY = shallowCompose([changeX, changeY]);

						const expected = [markA, markB];
						assertChangesetsEqual(composedXY, expected);
					}));
				it("B ○ A", () =>
					withConfig(() => {
						const markB = Mark.modify("B", {
							revision: tag1,
							localId: brand(2),
						});
						const markA = Mark.insert(1, {
							revision: tag3,
							localId: brand(1),
						});

						const changeX = tagChange([markB], tag2);
						const changeY = tagChange([markA], tag3);
						const composedXY = shallowCompose([changeX, changeY]);

						const expected = [markA, markB];
						assertChangesetsEqual(composedXY, expected);
					}));
			});

			describe("cell for earlier change named earlier - cell for later change named after earlier change", () => {
				describe("cell for later change named through removal", () => {
					it("A ○ B", () =>
						withConfig(() => {
							const markA = Mark.modify("A", {
								revision: tag1,
								localId: brand(1),
							});
							const markNamesB = Mark.remove(1, {
								revision: tag3,
								localId: brand(2),
							});
							const markB = Mark.modify("B", {
								revision: tag3,
								localId: brand(2),
							});

							const change2 = tagChange([markA], tag2);
							const change3 = tagChange([markNamesB], tag3);
							const change4 = tagChange([markB], tag4);
							const composedXY = shallowCompose([change2, change3, change4]);

							const expected = [markA, { ...markNamesB, changes: "B" }];
							assertChangesetsEqual(composedXY, expected);
						}));

					it("B ○ A", () =>
						withConfig(() => {
							const markB = Mark.modify("B", {
								revision: tag1,
								localId: brand(2),
							});
							const markNamesA = Mark.remove(1, {
								revision: tag3,
								localId: brand(1),
							});
							const markA = Mark.modify("A", {
								revision: tag3,
								localId: brand(1),
							});

							const change2 = tagChange([Mark.skip(1), markB], tag2);
							const change3 = tagChange([markNamesA], tag3);
							const change4 = tagChange([markA], tag4);
							const composedXY = shallowCompose([change2, change3, change4]);

							const expected = [{ ...markNamesA, changes: "A" }, markB];
							assertChangesetsEqual(composedXY, expected);
						}));
				});

				describe("cell for later change named through insert", () => {
					// This case requires Tiebreak.Right to be supported.
					it.skip("A ○ B", () =>
						withConfig(() => {
							const markA = Mark.modify("A", {
								revision: tag1,
								localId: brand(1),
							});
							const markNamesB = Mark.attachAndDetach(
								Mark.insert(1, {
									revision: tag3,
									localId: brand(2),
									// tiebreak: Tiebreak.Right,
								}),
								Mark.remove(1, { revision: tag3, localId: brand(2) }),
							);
							const markB = Mark.modify("B", {
								revision: tag3,
								localId: brand(2),
							});

							const change2 = tagChange([markA], tag2);
							const change3 = tagChange([markNamesB], tag3);
							const change4 = tagChange([markB], tag4);
							const composedXY = shallowCompose([change2, change3, change4]);

							const expected = [markA, { ...markNamesB, changes: "B" }];
							assertChangesetsEqual(composedXY, expected);
						}));

					it("B ○ A", () =>
						withConfig(() => {
							const markB = Mark.modify("B", {
								revision: tag1,
								localId: brand(2),
							});
							const markNamesA = Mark.attachAndDetach(
								Mark.insert(1, { revision: tag3, localId: brand(1) }),
								Mark.remove(1, { revision: tag3, localId: brand(1) }),
							);
							const markA = Mark.modify("A", {
								revision: tag3,
								localId: brand(1),
							});

							const change2 = tagChange([markB], tag2);
							const change3 = tagChange([markNamesA], tag3);
							const change4 = tagChange([markA], tag4);
							const composedXY = shallowCompose([change2, change3, change4]);

							const expected = [{ ...markNamesA, changes: "A" }, markB];
							assertChangesetsEqual(composedXY, expected);
						}));
				});
			});

			describe("cell for earlier change named in earlier change - cell for later change named before earlier change", () => {
				it("A ○ B", () =>
					withConfig(() => {
						const markA = Mark.attachAndDetach(
							Mark.insert(1, { revision: tag2, localId: brand(1) }),
							Mark.remove(1, { revision: tag2, localId: brand(1) }),
						);
						const markB = Mark.modify("B", {
							localId: brand(2),
							revision: tag1,
							lineage: [{ revision: tag2, id: brand(1), count: 1, offset: 1 }],
						});

						const changeX = tagChange([markA], tag2);
						const changeY = tagChange([Mark.tomb(tag2, brand(1)), markB], tag3);
						const composedXY = shallowCompose([changeX, changeY]);

						const expected = [markA, markB];
						assertChangesetsEqual(composedXY, expected);
					}));
				it("B ○ A", () =>
					withConfig(() => {
						const markB = Mark.attachAndDetach(
							Mark.insert(1, { revision: tag2, localId: brand(2) }),
							Mark.remove(1, { revision: tag2, localId: brand(2) }),
						);
						const markA = Mark.modify("A", {
							localId: brand(1),
							revision: tag1,
							lineage: [{ revision: tag2, id: brand(2), count: 1, offset: 0 }],
						});

						const changeX = tagChange([markB], tag2);
						const changeY = tagChange([markA, Mark.tomb(tag2, brand(2))], tag3);
						const composedXY = shallowCompose([changeX, changeY]);

						const expected = [markA, markB];
						assertChangesetsEqual(composedXY, expected);
					}));
			});
		});
	});
}
