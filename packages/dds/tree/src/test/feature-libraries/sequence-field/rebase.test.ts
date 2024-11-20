/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mintRevisionTag } from "../../utils.js";
import type { NodeId, SequenceField as SF } from "../../../feature-libraries/index.js";
import { type ChangeAtomId, type RevisionTag, makeAnonChange } from "../../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import { TestNodeId } from "../../testNodeId.js";
import {
	type RebaseConfig,
	assertChangesetsEqual,
	checkDeltaEquality,
	rebase as rebaseI,
	rebaseOverChanges,
	rebaseOverComposition,
	rebaseTagged,
	shallowCompose,
	tagChangeInline,
	withoutTombstones,
} from "./utils.js";
import { ChangeMaker as Change, MarkMaker as Mark, cases } from "./testEdits.js";
import { brand } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const tag4: RevisionTag = mintRevisionTag();

function rebase(
	change: SF.Changeset,
	base: SF.Changeset,
	baseRev?: RevisionTag,
	config?: RebaseConfig,
): SF.Changeset {
	return rebaseI(makeAnonChange(change), tagChangeInline(base, baseRev ?? tag1), config);
}

export function testRebase() {
	describe("Rebase", () => {
		describe("no changes ↷ *", () => {
			for (const [name, testCase] of Object.entries(cases)) {
				it(`no changes ↷ ${name}`, () => {
					const actual = rebase([], testCase);
					assertChangesetsEqual(withoutTombstones(actual), cases.no_change);
				});
			}
		});

		describe("* ↷ no changes", () => {
			for (const [name, testCase] of Object.entries(cases)) {
				it(`${name} ↷ no changes`, () => {
					const actual = rebase(testCase, cases.no_change);
					assertChangesetsEqual(actual, testCase);
				});
			}
		});

		describe("* ↷ pin", () => {
			for (const [name, testCase] of Object.entries(cases)) {
				it(`${name} ↷ pin`, () => {
					const actual = rebase(testCase, cases.pin);
					assertChangesetsEqual(actual, testCase);
				});
			}
		});

		it("modify ↷ modify", () => {
			const child1 = TestNodeId.create({ localId: brand(0) }, TestChange.mint([0], 1));
			const child2 = TestNodeId.create({ localId: brand(1) }, TestChange.mint([0], 2));
			const child3 = TestNodeId.create({ localId: brand(1) }, TestChange.mint([0, 1], 2));

			const change1 = Change.modify(0, child1);
			const change2 = Change.modify(0, child2);
			const expected = Change.modify(0, child3);
			const actual = rebase(change2, change1);
			assertChangesetsEqual(actual, expected);
		});

		it("insert ↷ modify", () => {
			const actual = rebase(cases.insert, cases.modify);
			assertChangesetsEqual(actual, cases.insert);
		});

		it("modify insert ↷ modify", () => {
			const actual = rebase(cases.modify_insert, cases.modify);
			assertChangesetsEqual(actual, cases.modify_insert);
		});

		it("remove ↷ modify", () => {
			const actual = rebase(cases.remove, cases.modify);
			assertChangesetsEqual(actual, cases.remove);
		});

		it("revive ↷ modify", () => {
			const child1 = TestNodeId.create({ localId: brand(0) }, TestChange.mint([0], 1));
			const child2 = TestNodeId.create({ localId: brand(1) }, TestChange.mint([0], 2));
			const child3 = TestNodeId.create({ localId: brand(2) }, TestChange.mint([0], 3));

			const revive = [
				Mark.revive(2, { revision: tag1, localId: brand(0) }),
				Mark.skip(2),
				Mark.revive(2, { revision: tag1, localId: brand(2) }),
				Mark.skip(4),
				Mark.revive(2, { revision: tag1, localId: brand(4) }),
			];
			const mods = [
				Mark.modify(child1),
				Mark.skip(2),
				Mark.modify(child2),
				Mark.skip(5),
				Mark.modify(child3),
			];
			const actual = rebase(revive, mods);
			assertChangesetsEqual(actual, revive);
		});

		it("modify ↷ remove", () => {
			const child1 = TestNodeId.create({ localId: brand(0) }, TestChange.mint([0], 1));
			const child2 = TestNodeId.create({ localId: brand(1) }, TestChange.mint([0], 2));
			const child3 = TestNodeId.create({ localId: brand(2) }, TestChange.mint([0], 3));

			const mods = [
				Mark.modify(child1),
				{ count: 2 },
				Mark.modify(child2),
				{ count: 2 },
				Mark.modify(child3),
			];
			const deletion = [{ count: 2 }, Mark.remove(3, brand(0))];
			const actual = rebase(mods, deletion, tag1);
			const expected = [
				Mark.modify(child1),
				{ count: 1 },
				Mark.modify(child2, { revision: tag1, localId: brand(1) }),
				{ count: 1 },
				Mark.modify(child3),
			];
			checkDeltaEquality(actual, expected);
		});

		it("insert ↷ remove", () => {
			const insert = [
				Mark.insert(1, brand(1)),
				Mark.skip(2),
				Mark.insert(1, brand(2)),
				Mark.skip(6),
				Mark.insert(1, brand(3)),
			];
			const deletion = Change.remove(1, 3, tag1);
			const actual = rebase(insert, deletion);
			const expected = [
				Mark.insert(1, brand(1)),
				Mark.skip(1),
				Mark.insert(1, brand(2)),
				Mark.skip(4),
				Mark.insert(1, brand(3)),
			];
			checkDeltaEquality(actual, expected);
		});

		it("revive ↷ remove", () => {
			const revive = [
				Mark.revive(1, { revision: tag1, localId: brand(0) }),
				Mark.skip(2),
				Mark.revive(1, { revision: tag1, localId: brand(1) }),
				Mark.skip(4),
				Mark.revive(1, { revision: tag1, localId: brand(2) }),
			];
			const deletion = Change.remove(1, 3, tag2);
			const actual = rebase(revive, deletion, tag2);
			const expected = [
				Mark.revive(1, { revision: tag1, localId: brand(0) }),
				Mark.skip(1),
				Mark.tomb(tag2, brand(0)),
				Mark.revive(1, { revision: tag1, localId: brand(1) }),
				Mark.tomb(tag2, brand(1), 2),
				Mark.skip(2),
				Mark.revive(1, { revision: tag1, localId: brand(2) }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("pin ↷ related remove", () => {
			const pin = [Mark.pin(3, brand(0))];
			const deletion = Change.remove(1, 1, tag2);
			const actual = rebase(pin, deletion, tag2);
			const expected = [
				// Earlier revive is unaffected
				Mark.pin(1, brand(0)),
				// Overlapping pin is now a revive
				Mark.revive(1, { revision: tag2, localId: brand(0) }, { id: brand(1) }),
				// Later revive is unaffected
				Mark.pin(1, brand(2)),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("remove ↷ overlapping remove", () => {
			// Removes ---DEFGH--
			const removeA = [{ count: 3 }, Mark.remove(5, brand(0))];
			// Removes --CD-F-HI
			const removeB = [
				{ count: 2 },
				Mark.remove(2, brand(0)),
				{ count: 1 },
				Mark.remove(1, brand(2)),
				{ count: 1 },
				Mark.remove(2, brand(3)),
			];
			const actual = rebase(removeA, removeB, tag1);
			// Removes --dEfGh--
			// Where lowercase letters denote nodes that are already removed
			const expected = [
				{ count: 2 },
				Mark.tomb(tag1, brand(0), 1),
				Mark.onEmptyCell({ revision: tag1, localId: brand(1) }, Mark.remove(1, brand(0))),
				Mark.remove(1, brand(1)),
				Mark.onEmptyCell({ revision: tag1, localId: brand(2) }, Mark.remove(1, brand(2))),
				Mark.remove(1, brand(3)),
				Mark.onEmptyCell({ revision: tag1, localId: brand(3) }, Mark.remove(1, brand(4))),
				Mark.tomb(tag1, brand(4), 1),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("remove ↷ earlier remove", () => {
			// Removes ---DE
			const removeA = Change.remove(3, 2, tag2);
			// Removes AB--
			const removeB = Change.remove(0, 2, tag1);
			const actual = rebase(removeA, removeB);
			// Removes -DE
			const expected = [
				Mark.tomb(tag1, brand(0), 2),
				Mark.skip(1),
				Mark.remove(2, brand(0), { revision: tag2 }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("remove ↷ later remove", () => {
			// Removes AB--
			const removeA = Change.remove(0, 2, tag2);
			// Removes ---DE
			const removeB = Change.remove(3, 2, tag1);
			const actual = rebase(removeA, removeB);
			const expected = [
				Mark.remove(2, brand(0), { revision: tag2 }),
				Mark.skip(1),
				Mark.tomb(tag1, brand(0), 2),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("return ↷ rename", () => {
			const cellId1: SF.CellId = { revision: tag1, localId: brand(1) };
			const cellId2: SF.CellId = { revision: tag2, localId: brand(2) };
			const ret = [
				Mark.moveOut(1, brand(3), { revision: tag3 }),
				Mark.returnTo(1, brand(3), cellId1, { revision: tag3 }),
			];
			const ad = [
				Mark.skip(1),
				Mark.rename(1, cellId1, { revision: tag2, localId: brand(2) }),
			];
			const actual = rebase(ret, ad);
			const expected = [
				Mark.moveOut(1, brand(3), { revision: tag3 }),
				Mark.returnTo(1, brand(3), cellId2, { revision: tag3 }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("move ↷ overlapping remove", () => {
			// Moves ---DEFGH--
			const move = [Mark.moveIn(5, brand(0)), { count: 3 }, Mark.moveOut(5, brand(0))];
			// Removes --CD-F-HI
			const deletion = [
				{ count: 2 },
				Mark.remove(2, brand(0)),
				{ count: 1 },
				Mark.remove(1, brand(2)),
				{ count: 1 },
				Mark.remove(2, brand(3)),
			];
			const actual = rebase(move, deletion, tag1);
			// Moves --dEfGh--
			// Where lowercase letters denote nodes that are removed
			const expected = [
				Mark.moveIn(5, brand(0)),
				{ count: 2 },
				Mark.tomb(tag1, brand(0)),
				Mark.onEmptyCell({ revision: tag1, localId: brand(1) }, Mark.moveOut(1, brand(0))),
				Mark.moveOut(1, brand(1)),
				Mark.onEmptyCell({ revision: tag1, localId: brand(2) }, Mark.moveOut(1, brand(2))),
				Mark.moveOut(1, brand(3)),
				Mark.onEmptyCell({ revision: tag1, localId: brand(3) }, Mark.moveOut(1, brand(4))),
				Mark.tomb(tag1, brand(4)),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("modify ↷ insert", () => {
			const child1 = TestNodeId.create({ localId: brand(0) }, TestChange.mint([0], 1));
			const child2 = TestNodeId.create({ localId: brand(1) }, TestChange.mint([0], 2));

			const mods = [Mark.modify(child1), Mark.skip(2), Mark.modify(child2)];
			const insert = Change.insert(2, 1, tag1, { localId: brand(2), revision: tag1 });
			const expected = [Mark.modify(child1), Mark.skip(3), Mark.modify(child2)];
			const actual = rebase(mods, insert);
			assertChangesetsEqual(actual, expected);
		});

		it("remove ↷ insert", () => {
			// Removes A-CD-E
			const deletion = [
				Mark.remove(1, brand(0)),
				Mark.skip(1),
				Mark.remove(2, brand(1)),
				Mark.skip(1),
				Mark.remove(1, brand(3)),
			];
			// Inserts between C and D
			const insert = Change.insert(3, 1, tag1, { localId: brand(2), revision: tag1 });
			const expected = [
				Mark.remove(1, brand(0)),
				Mark.skip(1),
				Mark.remove(1, brand(1)),
				Mark.skip(1), // <- insert
				Mark.remove(1, brand(2)),
				Mark.skip(1),
				Mark.remove(1, brand(3)),
			];
			const actual = rebase(deletion, insert);
			assertChangesetsEqual(actual, expected);
		});

		it("insert ↷ insert", () => {
			const insertA = [Mark.insert(1, brand(1)), Mark.skip(2), Mark.insert(1, brand(2))];
			const insertB = Change.insert(1, 1, tag1, { localId: brand(3), revision: tag1 });
			const actual = rebase(insertA, insertB);
			const expected = [Mark.insert(1, brand(1)), Mark.skip(3), Mark.insert(1, brand(2))];
			assertChangesetsEqual(actual, expected);
		});

		it("revive ↷ insert", () => {
			const revive = [
				Mark.revive(1, { revision: tag1, localId: brand(0) }),
				Mark.skip(2),
				Mark.revive(2, { revision: tag1, localId: brand(1) }),
			];
			// TODO: test both tiebreak policies
			const insert = Change.insert(2, 1, tag2);
			const actual = rebase(revive, insert, tag2);
			const expected = [
				Mark.revive(1, { revision: tag1, localId: brand(0) }),
				Mark.skip(3),
				Mark.revive(2, { revision: tag1, localId: brand(1) }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("redundant revive ↷ insert", () => {
			const revive = Change.pin(0, 3, { revision: tag2, localId: brand(0) }, tag2);
			const insert = Change.insert(1, 1, tag1);
			const actual = rebase(revive, insert);
			const expected = [
				Mark.pin(1, brand(0), { revision: tag2 }),
				Mark.skip(1),
				Mark.pin(2, brand(1), { revision: tag2 }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("modify ↷ revive", () => {
			const child1 = TestNodeId.create({ localId: brand(0) }, TestChange.mint([0], 1));
			const child2 = TestNodeId.create({ localId: brand(1) }, TestChange.mint([0], 2));
			const mods = [Mark.modify(child1), Mark.skip(2), Mark.modify(child2)];
			const revive = Change.revive(2, 1, { revision: tag1, localId: brand(0) }, tag1);
			const expected = [
				// Modify at earlier index is unaffected
				Mark.modify(child1),
				// Modify at later index has its index increased
				Mark.skip(3),
				Mark.modify(child2),
			];
			const actual = rebase(mods, revive);
			assertChangesetsEqual(actual, expected);
		});

		it("remove ↷ revive", () => {
			// Removes A-CD-E
			const deletion = [
				Mark.remove(1, brand(0)),
				Mark.skip(1),
				Mark.remove(2, brand(1)),
				Mark.skip(1),
				Mark.remove(1, brand(3)),
			];
			// Revives content between C and D
			const revive = Change.revive(3, 1, { revision: tag1, localId: brand(0) }, tag1);
			const expected = [
				Mark.remove(1, brand(0)),
				Mark.skip(1),
				Mark.remove(1, brand(1)),
				Mark.skip(1),
				Mark.remove(1, brand(2)),
				Mark.skip(1),
				Mark.remove(1, brand(3)),
			];
			const actual = rebase(deletion, revive);
			assertChangesetsEqual(actual, expected);
		});

		it("insert ↷ revive", () => {
			const insert = [Mark.insert(1, brand(1)), Mark.skip(2), Mark.insert(1, brand(2))];
			const revive = Change.revive(1, 1, { revision: tag1, localId: brand(0) }, tag1);
			const actual = rebase(insert, revive);
			const expected = [Mark.insert(1, brand(1)), Mark.skip(3), Mark.insert(1, brand(2))];
			assertChangesetsEqual(actual, expected);
		});

		it("reviveAA ↷ reviveB => BAA", () => {
			const reviveAA = [
				Mark.tomb(tag2),
				Mark.revive(2, { revision: tag1, localId: brand(0) }),
			];
			const reviveB = [Mark.revive(1, { revision: tag2, localId: brand(0) })];
			const expected = [Mark.skip(1), Mark.revive(2, { revision: tag1, localId: brand(0) })];
			const actual = rebase(reviveAA, reviveB);
			assertChangesetsEqual(actual, expected);
		});

		it("reviveAA ↷ reviveB => AAB", () => {
			const reviveAA = [
				Mark.revive(2, { revision: tag1, localId: brand(0) }),
				Mark.tomb(tag2),
			];
			const reviveB = [Mark.revive(1, { revision: tag2, localId: brand(0) })];
			const expected = [Mark.revive(2, { revision: tag1, localId: brand(0) })];
			const actual = rebase(reviveAA, reviveB);
			assertChangesetsEqual(actual, expected);
		});

		it("reviveBB ↷ reviveA => BBA", () => {
			const reviveBB = [Mark.revive(2, { revision: tag2, localId: brand(0) })];
			const reviveA = [
				Mark.tomb(tag2, brand(0), 2),
				Mark.revive(1, { revision: tag1, localId: brand(1) }),
			];
			const expected = [Mark.revive(2, { revision: tag2, localId: brand(0) })];
			const actual = rebase(reviveBB, reviveA);
			assertChangesetsEqual(actual, expected);
		});

		it("reviveBB ↷ reviveA => ABB", () => {
			const reviveBB = Change.revive(5, 2, { revision: tag2, localId: brand(0) }, tag2);
			const reviveA = [
				Mark.skip(5),
				Mark.revive(1, { revision: tag1, localId: brand(0) }),
				Mark.tomb(tag2, brand(0), 2),
			];
			const expected = [
				Mark.skip(6),
				Mark.revive(2, { revision: tag2, localId: brand(0) }, { revision: tag2 }),
			];
			const actual = rebase(reviveBB, reviveA);
			assertChangesetsEqual(actual, expected);
		});

		it("reviveA ↷ reviveBB => BAB", () => {
			const reviveA = [
				Mark.skip(5),
				Mark.tomb(tag2, brand(5)),
				Mark.revive(1, { revision: tag1, localId: brand(6) }),
				Mark.tomb(tag2, brand(6)),
			];
			const reviveBB = [Mark.skip(5), Mark.revive(2, { revision: tag2, localId: brand(5) })];
			const expected = [Mark.skip(6), Mark.revive(1, { revision: tag1, localId: brand(6) })];
			const actual = rebase(reviveA, reviveBB);
			assertChangesetsEqual(actual, expected);
		});

		it("reviveAA ↷ reviveCB => CBAA", () => {
			const reviveAA = [
				Mark.tomb(tag2),
				Mark.tomb(tag3),
				Mark.revive(2, { revision: tag1, localId: brand(0) }),
			];
			const reviveB = [
				Mark.revive(1, { revision: tag2, localId: brand(0) }),
				Mark.revive(1, { revision: tag3, localId: brand(0) }),
			];
			const expected = [Mark.skip(2), Mark.revive(2, { revision: tag1, localId: brand(0) })];
			const actual = rebase(reviveAA, reviveB);
			assertChangesetsEqual(actual, expected);
		});

		it("revive ↷ same revive (base within curr)", () => {
			const reviveABC = [Mark.revive(3, { revision: tag1, localId: brand(1) })];
			const reviveB = [
				Mark.tomb(tag1, brand(1)),
				Mark.revive(1, { revision: tag1, localId: brand(2) }),
				Mark.tomb(tag1, brand(3)),
			];
			const actual = rebase(reviveABC, reviveB, tag2);
			const expected = [
				Mark.revive(1, { revision: tag1, localId: brand(1) }),
				Mark.pin(1, brand(2)),
				Mark.revive(1, { revision: tag1, localId: brand(3) }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("revive ↷ same revive (curr within base)", () => {
			const reviveB = [
				Mark.tomb(tag1, brand(1)),
				Mark.revive(1, { revision: tag1, localId: brand(2) }),
				Mark.tomb(tag1, brand(3)),
			];
			const reviveABC = [Mark.revive(3, { revision: tag1, localId: brand(1) })];
			const actual = rebase(reviveB, reviveABC, tag2);
			const expected = [Mark.skip(1), Mark.pin(1, brand(2))];
			assertChangesetsEqual(actual, expected);
		});

		it("concurrent inserts ↷ remove", () => {
			const tagA = mintRevisionTag();
			const tagB = mintRevisionTag();
			const tagC = mintRevisionTag();
			const delA = tagChangeInline(Change.remove(0, 1, tagA), tagA);
			const insertB = tagChangeInline(Change.insert(0, 1, tagB), tagB);
			const insertC = tagChangeInline(Change.insert(1, 1, tagC), tagC);
			const insertB2 = rebaseTagged(insertB, delA);
			const insertC2 = rebaseOverChanges(insertC, [delA, insertB2]);
			const expected = tagChangeInline(Change.insert(1, 1, tagC), tagC);
			checkDeltaEquality(insertC2.change, expected.change);
		});

		it("concurrent inserts ↷ connected remove", () => {
			const tagA = mintRevisionTag();
			const tagB = mintRevisionTag();
			const tagC = mintRevisionTag();
			const delA = tagChangeInline(Change.remove(0, 1, tagA), tagA);
			const delB = tagChangeInline(Change.remove(1, 1, tagB), tagB);
			const delC = tagChangeInline(Change.remove(0, 1, tagC), tagC);

			const tagD = mintRevisionTag();
			const insertD = tagChangeInline(Change.insert(0, 1, tagD), tagD);

			const tagE = mintRevisionTag();
			const insertE = tagChangeInline(Change.insert(3, 1, tagE), tagE);
			const insertD2 = rebaseOverChanges(insertD, [delA, delB, delC]);
			const insertE2 = rebaseOverChanges(insertE, [delA, delB, delC, insertD2]);
			const expected = tagChangeInline(Change.insert(1, 1, tagE), tagE);
			checkDeltaEquality(insertE2.change, expected.change);
		});

		it("concurrent insert and move ↷ remove", () => {
			const tagA = mintRevisionTag();
			const tagB = mintRevisionTag();
			const tagC = mintRevisionTag();
			const delA = tagChangeInline(Change.remove(0, 1, tagA), tagA);
			const insertB = tagChangeInline(Change.insert(0, 1, tagB), tagB);
			const moveC = tagChangeInline(Change.move(2, 1, 1, tagC), tagC);
			const insertB2 = rebaseTagged(insertB, delA);
			const moveC2 = rebaseOverChanges(moveC, [delA, insertB2]);
			const expected = tagChangeInline(Change.move(2, 1, 1, tagC), tagC);
			checkDeltaEquality(moveC2.change, expected.change);
		});

		it("modify ↷ move right", () => {
			const inner = TestNodeId.create({ localId: brand(0) }, TestChange.mint([0], 1));
			const modify = [Mark.modify(inner)];
			const [moveOut, moveIn] = Mark.move(1, brand(0));
			const move = [moveOut, Mark.skip(3), moveIn];
			const expected = [Mark.tomb(tag1), Mark.skip(3), Mark.modify(inner)];
			const rebased = rebase(modify, move);
			assertChangesetsEqual(rebased, expected);
		});

		it("modify ↷ move left", () => {
			const inner = TestNodeId.create({ localId: brand(0) }, TestChange.mint([0], 1));
			const modify = [Mark.skip(3), Mark.modify(inner)];
			const [moveOut, moveIn] = Mark.move(1, brand(0));
			const move = [moveIn, Mark.skip(3), moveOut];
			const expected = [Mark.modify(inner), Mark.skip(3), Mark.tomb(tag1)];
			const rebased = rebase(modify, move);
			assertChangesetsEqual(rebased, expected);
		});

		it("modify ↷ move left + modify", () => {
			const nodeId: NodeId = { localId: brand(0) };
			const baseNodeId: NodeId = { revision: tag1, localId: brand(1) };

			const inputChildChange = TestNodeId.create(nodeId, TestChange.mint([], 2));
			const baseChildChange = TestNodeId.create(baseNodeId, TestChange.mint([], 1));
			const modify = [Mark.skip(3), Mark.modify(inputChildChange)];
			const [moveOut, moveIn] = Mark.move(1, brand(0), {
				changes: baseChildChange,
			});
			const move = [moveIn, Mark.skip(3), moveOut];
			const expected = [
				Mark.modify(TestNodeId.create(nodeId, TestChange.mint([1], 2))),
				Mark.skip(3),
				Mark.tomb(tag1),
			];
			const childRebaser = (
				change: NodeId | undefined,
				over: NodeId | undefined,
			): NodeId | undefined => {
				// These checks ensure that we don't attempt to rebase output of `inputChildChange ↷ baseChildChange`.
				// This may happen if the inputChildChange is rebased then sent as an effect that is then treated
				// as nested change to be rebased when the effect is consumed.
				assert.equal(change, inputChildChange);
				assert.equal(over, baseChildChange);
				return TestNodeId.rebaseChild(change, over);
			};
			const rebased = rebase(modify, move, undefined, { childRebaser });
			assertChangesetsEqual(rebased, expected);
		});

		it("rename ↷ return = move-out + idOverride", () => {
			const nodeId: NodeId = { localId: brand(0) };
			const baseNodeId: NodeId = { revision: tag1, localId: brand(1) };
			const startCellId: SF.CellId = { revision: tag2, localId: brand(1) };
			const endCellId: SF.CellId = { revision: tag3, localId: brand(0) };

			const inputChildChange = TestNodeId.create(nodeId, TestChange.mint([], 2));
			const baseChildChange = TestNodeId.create(baseNodeId, TestChange.mint([], 1));
			const rename = [
				Mark.moveOut(
					1,
					{ revision: tag2, localId: brand(0) },
					{ changes: inputChildChange, finalEndpoint: endCellId },
				),
				Mark.rename(1, startCellId, endCellId),
				Mark.moveIn(1, endCellId, {
					finalEndpoint: { revision: tag2, localId: brand(0) },
				}),
			];
			const move = [
				Mark.moveOut(1, { revision: tag4, localId: brand(4) }, { changes: baseChildChange }),
				Mark.returnTo(1, { revision: tag4, localId: brand(4) }, startCellId),
			];
			const expectedChildChange = TestNodeId.create(nodeId, TestChange.mint([1], 2));
			const expected = [
				Mark.tomb(tag4, brand(4)),
				Mark.moveOut(
					1,
					{ revision: tag2, localId: brand(0) },
					{ changes: expectedChildChange, idOverride: endCellId, finalEndpoint: endCellId },
				),
				Mark.moveIn(1, endCellId, {
					finalEndpoint: { revision: tag2, localId: brand(0) },
				}),
			];
			const childRebaser = (
				change: NodeId | undefined,
				over: NodeId | undefined,
			): NodeId | undefined => {
				// These checks ensure that we don't attempt to rebase output of `inputChildChange ↷ baseChildChange`.
				// This may happen if the inputChildChange is rebased then sent as an effect that is then treated
				// as nested change to be rebased when the effect is consumed.
				assert.equal(change, inputChildChange);
				assert.equal(over, baseChildChange);
				return TestNodeId.rebaseChild(change, over);
			};
			const rebased = rebase(rename, move, undefined, { childRebaser });
			assertChangesetsEqual(rebased, expected);
		});

		it("move-out + idOverride ↷ move-out = rename", () => {
			const nodeId: NodeId = { localId: brand(0) };
			const baseNodeId: NodeId = { revision: tag1, localId: brand(1) };
			const startCellId: SF.CellId = { revision: tag2, localId: brand(1) };
			const endCellId: SF.CellId = { revision: tag3, localId: brand(0) };

			const inputChildChange = TestNodeId.create(nodeId, TestChange.mint([], 2));
			const baseChildChange = TestNodeId.create(baseNodeId, TestChange.mint([], 1));
			const rebasee = [
				Mark.moveOut(
					1,
					{ revision: tag2, localId: brand(0) },
					{ changes: inputChildChange, idOverride: endCellId, finalEndpoint: endCellId },
				),
				Mark.skip(1),
				Mark.moveIn(1, endCellId, {
					finalEndpoint: { revision: tag2, localId: brand(0) },
				}),
			];
			const move = [
				Mark.moveOut(1, { revision: tag4, localId: brand(4) }, { changes: baseChildChange }),
				Mark.moveIn(1, { revision: tag4, localId: brand(4) }),
			];
			const expectedChildChange = TestNodeId.create(nodeId, TestChange.mint([1], 2));
			const expected = [
				Mark.rename(1, { revision: tag4, localId: brand(4) }, endCellId),
				Mark.moveOut(
					1,
					{ revision: tag2, localId: brand(0) },
					{ changes: expectedChildChange, finalEndpoint: endCellId },
				),
				Mark.skip(1),
				Mark.moveIn(1, endCellId, {
					finalEndpoint: { revision: tag2, localId: brand(0) },
				}),
			];
			const childRebaser = (
				change: NodeId | undefined,
				over: NodeId | undefined,
			): NodeId | undefined => {
				// These checks ensure that we don't attempt to rebase output of `inputChildChange ↷ baseChildChange`.
				// This may happen if the inputChildChange is rebased then sent as an effect that is then treated
				// as nested change to be rebased when the effect is consumed.
				assert.equal(change, inputChildChange);
				assert.equal(over, baseChildChange);
				return TestNodeId.rebaseChild(change, over);
			};
			const rebased = rebase(rebasee, move, undefined, { childRebaser });
			assertChangesetsEqual(rebased, expected);
		});

		it("remove ↷ move", () => {
			const deletion = [Mark.skip(2), Mark.remove(2, brand(0))];
			const move = Change.move(1, 3, 0, tag1);
			const expected = [
				Mark.skip(1),
				Mark.remove(2, brand(0)),
				Mark.skip(1),
				Mark.tomb(tag1, brand(0), 3),
			];
			const rebased = rebase(deletion, move);
			assertChangesetsEqual(rebased, expected);
		});

		it("move ↷ move", () => {
			const [moveOut, moveIn] = Mark.move(2, brand(0));
			const moveA = [moveIn, Mark.skip(2), moveOut, Mark.skip(1)];
			const moveB = [Mark.skip(2), moveOut, Mark.skip(1), moveIn];
			const expected = [
				moveOut,
				Mark.skip(2),
				Mark.tomb(tag1, brand(0), 2),
				Mark.skip(1),
				moveIn,
			];
			const rebased = rebase(moveB, moveA);
			assertChangesetsEqual(rebased, expected);
		});

		it("return ↷ return (same destination, <=)", () => {
			const cellId: ChangeAtomId = {
				revision: tag3,
				localId: brand(0),
			};
			const move = [
				Mark.returnTo(1, brand(0), cellId),
				{ count: 2 },
				Mark.moveOut(1, brand(0)),
			];
			const expected = [Mark.pin(1, brand(0)), { count: 2 }, Mark.tomb(tag1, brand(0))];
			const rebased = rebase(move, move);
			assertChangesetsEqual(rebased, expected);
		});

		it("return ↷ return (same destination, =>)", () => {
			const cellId: ChangeAtomId = {
				revision: tag3,
				localId: brand(0),
			};
			const move = [
				Mark.moveOut(1, brand(0)),
				{ count: 2 },
				Mark.returnTo(1, brand(0), cellId),
			];
			const expected = [Mark.tomb(tag1, brand(0)), { count: 2 }, Mark.pin(1, brand(0))];
			const rebased = rebase(move, move);
			assertChangesetsEqual(rebased, expected);
		});

		it("return ↷ return (other destination)", () => {
			const return1 = [
				Mark.returnTo(1, brand(0), {
					revision: tag3,
					localId: brand(0),
				}),
				{ count: 2 },
				Mark.moveOut(1, brand(0)),
			];
			const return2 = [
				{ count: 2 },
				Mark.moveOut(1, brand(0)),
				{ count: 2 },
				Mark.returnTo(1, brand(0), {
					revision: tag3,
					localId: brand(42),
				}),
			];
			const expected = [
				Mark.moveOut(1, brand(0)),
				{ count: 2 },
				Mark.tomb(tag1, brand(0)),
				{ count: 2 },
				Mark.returnTo(1, brand(0), {
					revision: tag3,
					localId: brand(42),
				}),
			];
			const rebased = rebase(return2, return1);
			assertChangesetsEqual(rebased, expected);
		});

		it("pin ↷ move", () => {
			const move = [Mark.moveIn(2, brand(0)), { count: 2 }, Mark.moveOut(2, brand(0))];
			const pin = [{ count: 2 }, Mark.pin(2, brand(0))];
			const expected = [
				Mark.moveOut(2, brand(0)),
				{ count: 2 },
				Mark.returnTo(2, brand(0), { revision: tag1, localId: brand(0) }),
			];
			const rebased = rebase(pin, move);
			assertChangesetsEqual(rebased, expected);
		});

		it("remove ↷ composite move", () => {
			const [mo1, mi1] = Mark.move(1, brand(1));
			const [mo2, mi2] = Mark.move(1, brand(10));
			const [mo3, mi3] = Mark.move(1, brand(20));
			const src: SF.CellMark<SF.MoveOut> = { ...mo1, finalEndpoint: { localId: brand(20) } };
			const dst: SF.CellMark<SF.MoveIn> = { ...mi3, finalEndpoint: { localId: brand(1) } };
			const move = [
				src,
				Mark.skip(1),
				Mark.rename(1, brand(2), brand(10)),
				Mark.skip(1),
				Mark.rename(1, brand(11), brand(20)),
				Mark.skip(1),
				dst,
			];
			const del = [Mark.remove(1, brand(0))];
			const rebased = rebase(del, move);
			const expected = [
				Mark.tomb(tag1, brand(1)),
				Mark.skip(1),
				Mark.tomb(tag1, brand(10)),
				Mark.skip(1),
				Mark.tomb(tag1, brand(20)),
				Mark.skip(1),
				Mark.remove(1, brand(0)),
			];
			assertChangesetsEqual(rebased, expected);
		});

		it("rebasing over transient revive changes cell ID", () => {
			const change = TestNodeId.create({ localId: brand(0) }, TestChange.mint([0], 1));
			const modify = Change.modifyDetached(0, change, {
				revision: tag1,
				localId: brand(0),
			});

			const revive = [
				Mark.remove(1, brand(2), { cellId: { revision: tag1, localId: brand(0) } }),
			];

			const rebased = rebase(modify, revive, tag2);
			const expected = Change.modifyDetached(0, change, {
				revision: tag2,
				localId: brand(2),
			});
			assertChangesetsEqual(rebased, expected);
		});

		it("rebasing over transient adds tombstones", () => {
			const insert = Change.insert(0, 1, tag2);
			const transient = [
				Mark.remove(2, brand(2), { cellId: { localId: brand(0), revision: tag1 } }),
			];
			const rebased = rebase(insert, transient, tag1, {
				metadata: rebaseRevisionMetadataFromInfo(
					[{ revision: tag1 }, { revision: tag2 }],
					tag2,
					[tag1],
				),
			});
			const expected = [
				Mark.insert(1, { localId: brand(0), revision: tag2 }, { revision: tag2 }),
				Mark.tomb(tag1, brand(2), 2),
			];

			assertChangesetsEqual(rebased, expected);
		});

		it("remove ↷ [move, remove]", () => {
			const moveAndRemove = [
				Mark.moveOut(1, brand(0)),
				{ count: 1 },
				Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.remove(1, brand(1))),
			];

			const del = Change.remove(0, 1, tag2);
			const rebased = rebase(del, moveAndRemove);
			const expected = [
				Mark.tomb(tag1, brand(0)),
				{ count: 1 },
				Mark.remove(1, brand(0), {
					cellId: { revision: tag1, localId: brand(1) },
					revision: tag2,
				}),
			];

			assertChangesetsEqual(rebased, expected);
		});

		it("remove ↷ [move, remove] (reverse move direction)", () => {
			const moveAndRemove = [
				Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.remove(1, brand(1))),
				{ count: 1 },
				Mark.moveOut(1, brand(0)),
			];

			const del = Change.remove(1, 1, tag2);
			const rebased = rebase(del, moveAndRemove);
			const expected = [
				Mark.remove(1, brand(0), {
					cellId: { revision: tag1, localId: brand(1) },
					revision: tag2,
				}),
				{ count: 1 },
				Mark.tomb(tag1, brand(0)),
			];

			assertChangesetsEqual(rebased, expected);
		});

		it("move ↷ move and remove", () => {
			const [moveOut1, moveIn1] = Mark.move(1, { localId: brand(0), revision: tag1 });
			const moveAndRemove = [
				{ count: 1 },
				Mark.attachAndDetach(moveIn1, Mark.remove(1, { revision: tag1, localId: brand(2) })),
				{ count: 1 },
				moveOut1,
			];

			const [moveOut2, moveIn2] = Mark.move(1, { localId: brand(0), revision: tag2 });
			const move2 = [moveIn2, { count: 2 }, moveOut2];
			const rebased = rebase(move2, moveAndRemove);
			const expected = [
				moveIn2,
				{ count: 1 },
				Mark.moveOut(1, brand(0), {
					cellId: { revision: tag1, localId: brand(2) },
					revision: tag2,
				}),
				{ count: 1 },
				Mark.tomb(tag1, brand(0)),
			];

			assertChangesetsEqual(rebased, expected);
		});

		it("move and remove ↷ same", () => {
			const moveCellId: SF.CellId = { revision: tag1, localId: brand(0) };
			const removeCellId: SF.CellId = { revision: tag1, localId: brand(1) };
			const returnCellId: SF.CellId = { revision: tag2, localId: brand(0) };
			const moveAndRemove = [
				{ count: 1 },
				Mark.attachAndDetach(
					Mark.returnTo(1, returnCellId, moveCellId),
					Mark.remove(1, removeCellId),
				),
				{ count: 1 },
				Mark.moveOut(1, returnCellId),
			];
			const rebased = rebase(moveAndRemove, moveAndRemove);
			const expected = [
				{ count: 1 },
				Mark.remove(1, removeCellId, { cellId: removeCellId }),
				{ count: 1 },
				Mark.tomb(returnCellId.revision, returnCellId.localId),
			];

			assertChangesetsEqual(rebased, expected);
		});

		it("revive ↷ [revive, move]", () => {
			const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const reviveAndMove = [
				Mark.moveOut(1, brand(1), { cellId }),
				{ count: 1 },
				Mark.moveIn(1, brand(1)),
			];
			const revive = [Mark.revive(1, cellId)];
			const rebased = rebase(revive, reviveAndMove, tag2);
			const expected = [
				Mark.returnTo(1, brand(0), { revision: tag2, localId: brand(1) }),
				{ count: 1 },
				Mark.moveOut(1, brand(0)),
			];
			assertChangesetsEqual(rebased, expected);
		});

		it("revive ↷ [revive, move, remove]", () => {
			const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const reviveMoveRemove = [
				Mark.moveOut(1, brand(1), { cellId }),
				{ count: 1 },
				Mark.attachAndDetach(Mark.moveIn(1, brand(1)), Mark.remove(1, brand(2))),
			];
			const revive = [Mark.revive(1, cellId)];
			const rebased = rebase(revive, reviveMoveRemove, tag2);
			const expected = [
				Mark.returnTo(1, brand(0), { revision: tag2, localId: brand(1) }),
				{ count: 1 },
				Mark.onEmptyCell({ revision: tag2, localId: brand(2) }, Mark.moveOut(1, brand(0))),
			];
			assertChangesetsEqual(rebased, expected);
		});

		it("move chain ↷ remove", () => {
			const del = Change.remove(0, 1, tag1);
			const move = [
				Mark.moveOut(1, brand(0), {
					finalEndpoint: { localId: brand(10) },
				}),
				{ count: 1 },
				Mark.rename(1, brand(1), brand(10)),
				{ count: 1 },
				Mark.moveIn(1, brand(10), { finalEndpoint: { localId: brand(0) } }),
			];

			const rebased = rebase(move, del);
			const expected = [
				Mark.moveOut(1, brand(0), {
					cellId: { revision: tag1, localId: brand(0) },
					finalEndpoint: { localId: brand(10) },
				}),
				{ count: 1 },
				Mark.rename(1, brand(1), brand(10)),
				{ count: 1 },
				Mark.moveIn(1, brand(10), {
					finalEndpoint: { localId: brand(0) },
				}),
			];

			assertChangesetsEqual(rebased, expected);
		});

		it("[revive, move] ↷ [revive, move]", () => {
			const cellId: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const reviveAndMove1 = [
				Mark.moveOut(1, brand(0), { cellId }),
				{ count: 1 },
				Mark.moveIn(1, brand(0)),
			];
			const reviveAndMove2 = [
				Mark.moveOut(1, brand(1), { cellId }),
				{ count: 2 },
				Mark.moveIn(1, brand(1)),
			];
			const rebased = rebase(reviveAndMove2, reviveAndMove1, tag3);
			const expected = [
				Mark.tomb(tag3),
				{ count: 1 },
				Mark.moveOut(1, brand(1)),
				{ count: 1 },
				Mark.moveIn(1, brand(1)),
			];
			assertChangesetsEqual(rebased, expected);
		});

		it("[revive, return] ↷ [revive, return] (same destination)", () => {
			const cellSrc: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const cellDst: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const reviveAndMove = [
				Mark.moveOut(1, brand(0), { cellId: cellSrc }),
				{ count: 2 },
				Mark.returnTo(1, brand(0), cellDst),
			];
			const rebased = rebase(reviveAndMove, reviveAndMove, tag3);
			const expected = [Mark.tomb(tag3), { count: 2 }, Mark.pin(1, brand(0))];
			assertChangesetsEqual(rebased, expected);
		});

		it("[revive, return] ↷ [revive, return] (other destination)", () => {
			const cellSrc: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const cellDst1: ChangeAtomId = { revision: tag2, localId: brand(1) };
			const cellDst2: ChangeAtomId = { revision: tag2, localId: brand(2) };
			const reviveAndMove1 = [
				Mark.moveOut(1, brand(0), { cellId: cellSrc }),
				{ count: 2 },
				Mark.returnTo(1, brand(0), cellDst1),
			];
			const reviveAndMove2 = [
				Mark.moveOut(1, brand(1), { cellId: cellSrc }),
				{ count: 4 },
				Mark.returnTo(1, brand(1), cellDst2),
			];
			const rebased = rebase(reviveAndMove2, reviveAndMove1, tag3);
			const expected = [
				Mark.tomb(tag3),
				{ count: 2 },
				Mark.moveOut(1, brand(1)),
				{ count: 2 },
				Mark.returnTo(1, brand(1), cellDst2),
			];
			assertChangesetsEqual(rebased, expected);
		});

		it("remove ↷ move with multiple destinations", () => {
			const del = [Mark.remove(2, brand(0))];
			const move = [
				Mark.moveOut(2, brand(0)),
				{ count: 1 },
				Mark.moveIn(1, brand(0)),
				{ count: 1 },
				Mark.moveIn(1, brand(1)),
			];

			const rebased = rebase(del, move);
			const expected = [
				Mark.tomb(tag1, brand(0), 2),
				{ count: 1 },
				Mark.remove(1, brand(0)),
				{ count: 1 },
				Mark.remove(1, brand(1)),
			];
			assertChangesetsEqual(rebased, expected);
		});

		it("insert ↷ insert within remove", () => {
			const insertAndRemove = [
				Mark.remove(1, brand(0)),
				Mark.insert(1, brand(1)),
				Mark.remove(1, brand(2)),
			];

			const insert = [{ count: 1 }, Mark.insert(1, brand(0))];
			const rebased = rebase(insert, insertAndRemove);
			const expected = [
				Mark.tomb(tag1, brand(0)),
				Mark.insert(1, { localId: brand(0) }),
				Mark.skip(1),
				Mark.tomb(tag1, brand(2)),
			];
			assertChangesetsEqual(rebased, expected);
		});

		it("insert ↷ [remove, insert]", () => {
			// Because B does not have a tombstone for A, we should use B's insertion's tiebreak policy
			// and consider the cell it inserts into to be before the cell emptied by A
			// Although B and C's inserts appear to be at adjacent positions when rebasing C over B,
			// we should use C's tombstones to deduce that it must come after B.
			const removeA = [Mark.remove(1, brand(0))];
			const insertB = [Mark.insert(1, brand(0))];
			const insertC = [{ count: 1 }, Mark.insert(1, brand(0))];

			const c2 = rebase(insertC, removeA, tag1);
			const c3 = rebase(c2, insertB, tag2);
			const expected = [
				{ count: 1 }, // Insert B
				Mark.tomb(tag1), // Remove A
				Mark.insert(1, { localId: brand(0) }),
			];
			assertChangesetsEqual(c3, expected);
		});

		describe("Over composition", () => {
			it("insert ↷ [remove, remove]", () => {
				const removes: SF.Changeset = shallowCompose([
					tagChangeInline(Change.remove(1, 2, tag1), tag1),
					tagChangeInline(Change.remove(0, 2, tag2), tag2),
				]);

				const insert = Change.insert(3, 1, tag3);
				const rebased = rebaseOverComposition(
					insert,
					removes,
					rebaseRevisionMetadataFromInfo([{ revision: tag1 }, { revision: tag2 }], undefined, [
						tag1,
						tag2,
					]),
				);

				const expected = [
					Mark.tomb(tag2),
					Mark.tomb(tag1, brand(0), 2),
					Mark.insert(1, { localId: brand(0), revision: tag3 }, { revision: tag3 }),
					Mark.tomb(tag2, brand(1)),
				];
				assertChangesetsEqual(rebased, expected);
			});

			it("modify ↷ [remove, remove]", () => {
				const removes: SF.Changeset = shallowCompose([
					tagChangeInline(Change.remove(1, 3, tag1), tag1),
					tagChangeInline(Change.remove(0, 2, tag2), tag2),
				]);

				const nodeChange = TestNodeId.create({ localId: brand(0) }, TestChange.mint([], 0));
				const modify = Change.modify(3, nodeChange);
				const rebased = rebaseOverComposition(
					modify,
					removes,
					rebaseRevisionMetadataFromInfo([{ revision: tag1 }, { revision: tag2 }], undefined, [
						tag1,
						tag2,
					]),
				);

				const expected = [
					Mark.tomb(tag2),
					Mark.tomb(tag1, brand(0), 2),
					Mark.modify(nodeChange, { revision: tag1, localId: brand(2) }),
					Mark.tomb(tag2, brand(1)),
				];
				assertChangesetsEqual(rebased, expected);
			});
		});
	});
}
