/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mintRevisionTag } from "../../utils.js";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
import { ChangeAtomId, RevisionTag, tagChange } from "../../../core/index.js";
import { TestChange } from "../../testChange.js";
import { brand } from "../../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { rebaseRevisionMetadataFromInfo } from "../../../feature-libraries/modular-schema/modularChangeFamily.js";
import {
	checkDeltaEquality,
	rebaseTagged,
	rebase as rebaseI,
	shallowCompose,
	rebaseOverComposition,
	rebaseOverChanges,
	describeForBothConfigs,
	assertChangesetsEqual,
	withoutTombstones,
	withOrderingMethod,
} from "./utils.js";
import { cases, ChangeMaker as Change, MarkMaker as Mark, TestChangeset } from "./testEdits.js";

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();

function rebase(change: TestChangeset, base: TestChangeset, baseRev?: RevisionTag): TestChangeset {
	return rebaseI(change, tagChange(base, baseRev ?? tag1));
}

describeForBothConfigs("SequenceField - Rebase", (config) => {
	const withConfig = (fn: () => void) => withOrderingMethod(config.cellOrdering, fn);
	describe("no changes ↷ *", () => {
		for (const [name, testCase] of Object.entries(cases)) {
			it(`no changes ↷ ${name}`, () =>
				withConfig(() => {
					const actual = rebase([], testCase);
					assertChangesetsEqual(withoutTombstones(actual), cases.no_change);
				}));
		}
	});

	describe("* ↷ no changes", () => {
		for (const [name, testCase] of Object.entries(cases)) {
			it(`${name} ↷ no changes`, () =>
				withConfig(() => {
					const actual = rebase(testCase, cases.no_change);
					assertChangesetsEqual(actual, testCase);
				}));
		}
	});

	describe("* ↷ pin", () => {
		for (const [name, testCase] of Object.entries(cases)) {
			it(`${name} ↷ pin`, () =>
				withConfig(() => {
					const actual = rebase(testCase, cases.pin);
					assertChangesetsEqual(actual, testCase);
				}));
		}
	});

	it("modify ↷ modify", () =>
		withConfig(() => {
			const change1 = Change.modify(0, TestChange.mint([0], 1));
			const change2 = Change.modify(0, TestChange.mint([0], 2));
			const expected = Change.modify(0, TestChange.mint([0, 1], 2));
			const actual = rebase(change2, change1);
			assertChangesetsEqual(actual, expected);
		}));

	it("insert ↷ modify", () =>
		withConfig(() => {
			const actual = rebase(cases.insert, cases.modify);
			assertChangesetsEqual(actual, cases.insert);
		}));

	it("modify insert ↷ modify", () =>
		withConfig(() => {
			const actual = rebase(cases.modify_insert, cases.modify);
			assertChangesetsEqual(actual, cases.modify_insert);
		}));

	it("delete ↷ modify", () =>
		withConfig(() => {
			const actual = rebase(cases.delete, cases.modify);
			assertChangesetsEqual(actual, cases.delete);
		}));

	it("revive ↷ modify", () =>
		withConfig(() => {
			const revive = [
				Mark.revive(2, { revision: tag1, localId: brand(0) }),
				Mark.skip(2),
				Mark.revive(2, { revision: tag1, localId: brand(2) }),
				Mark.skip(4),
				Mark.revive(2, { revision: tag1, localId: brand(4) }),
			];
			const mods = [
				Mark.modify(TestChange.mint([0], 1)),
				Mark.skip(2),
				Mark.modify(TestChange.mint([0], 2)),
				Mark.skip(5),
				Mark.modify(TestChange.mint([0], 3)),
			];
			const actual = rebase(revive, mods);
			assertChangesetsEqual(actual, revive);
		}));

	it("modify ↷ delete", () =>
		withConfig(() => {
			const mods = [
				Mark.modify(TestChange.mint([0], 1)),
				{ count: 2 },
				Mark.modify(TestChange.mint([0], 2)),
				{ count: 2 },
				Mark.modify(TestChange.mint([0], 3)),
			];
			const deletion = [{ count: 2 }, Mark.delete(3, brand(0))];
			const actual = rebase(mods, deletion, tag1);
			const expected = [
				Mark.modify(TestChange.mint([0], 1)),
				{ count: 1 },
				Mark.modify(TestChange.mint([0], 2), { revision: tag1, localId: brand(1) }),
				{ count: 1 },
				Mark.modify(TestChange.mint([0], 3)),
			];
			checkDeltaEquality(actual, expected);
		}));

	it("insert ↷ delete", () =>
		withConfig(() => {
			const insert = [
				Mark.insert(1, brand(1)),
				Mark.skip(2),
				Mark.insert(1, brand(2)),
				Mark.skip(6),
				Mark.insert(1, brand(3)),
			];
			const deletion = Change.delete(1, 3);
			const actual = rebase(insert, deletion);
			const expected = [
				Mark.insert(1, brand(1)),
				Mark.skip(1),
				Mark.insert(1, brand(2)),
				Mark.skip(4),
				Mark.insert(1, brand(3)),
			];
			checkDeltaEquality(actual, expected);
		}));

	it("revive ↷ delete", () =>
		withConfig(() => {
			const revive = [
				Mark.revive(1, { revision: tag1, localId: brand(0) }),
				Mark.skip(2),
				Mark.revive(1, { revision: tag1, localId: brand(1) }),
				Mark.skip(4),
				Mark.revive(1, { revision: tag1, localId: brand(2) }),
			];
			const deletion = Change.delete(1, 3);
			const actual = rebase(revive, deletion, tag2);
			const expected = [
				Mark.revive(1, { revision: tag1, localId: brand(0) }),
				Mark.skip(1),
				Mark.tomb(tag2, brand(0)),
				Mark.revive(1, {
					revision: tag1,
					localId: brand(1),
					lineage: [{ revision: tag2, id: brand(0), count: 3, offset: 1 }],
				}),
				Mark.tomb(tag2, brand(1), 2),
				Mark.skip(2),
				Mark.revive(1, { revision: tag1, localId: brand(2) }),
			];
			assertChangesetsEqual(actual, expected);
		}));

	it("pin ↷ related delete", () =>
		withConfig(() => {
			const pin = [Mark.pin(3, brand(0))];
			const deletion = Change.delete(1, 1);
			const actual = rebase(pin, deletion, tag2);
			const expected = [
				// Earlier revive is unaffected
				Mark.pin(1, brand(0)),
				// Overlapping pin is now a revive
				Mark.revive(
					1,
					{
						revision: tag2,
						localId: brand(0),
						adjacentCells: [{ id: brand(0), count: 1 }],
					},
					{ id: brand(1) },
				),
				// Later revive is unaffected
				Mark.pin(1, brand(2)),
			];
			assertChangesetsEqual(actual, expected);
		}));

	it("delete ↷ overlapping delete", () =>
		withConfig(() => {
			// Deletes ---DEFGH--
			const deleteA = [{ count: 3 }, Mark.delete(5, brand(0))];
			// Deletes --CD-F-HI
			const deleteB = [
				{ count: 2 },
				Mark.delete(2, brand(0)),
				{ count: 1 },
				Mark.delete(1, brand(2)),
				{ count: 1 },
				Mark.delete(2, brand(3)),
			];
			const actual = rebase(deleteA, deleteB, tag1);
			// Deletes --dEfGh--
			// Where lowercase letters denote nodes that are already deleted
			const cellsCD: SF.IdRange[] = [{ id: brand(0), count: 2 }];
			const cellsF: SF.IdRange[] = [{ id: brand(2), count: 1 }];
			const cellsHI: SF.IdRange[] = [{ id: brand(3), count: 2 }];
			const expected = [
				{ count: 2 },
				Mark.tomb(tag1, brand(0), 1),
				Mark.onEmptyCell(
					{ revision: tag1, localId: brand(1), adjacentCells: cellsCD },
					Mark.delete(1, brand(0)),
				),
				Mark.delete(1, brand(1)),
				Mark.onEmptyCell(
					{ revision: tag1, localId: brand(2), adjacentCells: cellsF },
					Mark.delete(1, brand(2)),
				),
				Mark.delete(1, brand(3)),
				Mark.onEmptyCell(
					{ revision: tag1, localId: brand(3), adjacentCells: cellsHI },
					Mark.delete(1, brand(4)),
				),
				Mark.tomb(tag1, brand(4), 1),
			];
			assertChangesetsEqual(actual, expected);
		}));

	it("delete ↷ earlier delete", () =>
		withConfig(() => {
			// Deletes ---DE
			const deleteA = Change.delete(3, 2);
			// Deletes AB--
			const deleteB = Change.delete(0, 2);
			const actual = rebase(deleteA, deleteB);
			// Deletes -DE
			const expected = [Mark.tomb(tag1, brand(0), 2), Mark.skip(1), Mark.delete(2, brand(0))];
			assertChangesetsEqual(actual, expected);
		}));

	it("delete ↷ later delete", () =>
		withConfig(() => {
			// Deletes AB--
			const deleteA = Change.delete(0, 2);
			// Deletes ---DE
			const deleteB = Change.delete(3, 2);
			const actual = rebase(deleteA, deleteB);
			const expected = [Mark.delete(2, brand(0)), Mark.skip(1), Mark.tomb(tag1, brand(0), 2)];
			assertChangesetsEqual(actual, expected);
		}));

	it("move ↷ overlapping delete", () =>
		withConfig(() => {
			// Moves ---DEFGH--
			const move = [Mark.moveIn(5, brand(0)), { count: 3 }, Mark.moveOut(5, brand(0))];
			// Deletes --CD-F-HI
			const deletion = [
				{ count: 2 },
				Mark.delete(2, brand(0)),
				{ count: 1 },
				Mark.delete(1, brand(2)),
				{ count: 1 },
				Mark.delete(2, brand(3)),
			];
			const actual = rebase(move, deletion, tag1);
			// Moves --dEfGh--
			// Where lowercase letters denote nodes that are deleted
			const cellsCD: SF.IdRange[] = [{ id: brand(0), count: 2 }];
			const cellsF: SF.IdRange[] = [{ id: brand(2), count: 1 }];
			const cellsHI: SF.IdRange[] = [{ id: brand(3), count: 2 }];
			const expected = [
				Mark.moveIn(5, brand(0)),
				{ count: 2 },
				Mark.tomb(tag1, brand(0)),
				Mark.onEmptyCell(
					{
						revision: tag1,
						localId: brand(1),
						adjacentCells: cellsCD,
					},
					Mark.moveOut(1, brand(0)),
				),
				Mark.moveOut(1, brand(1)),
				Mark.onEmptyCell(
					{ revision: tag1, localId: brand(2), adjacentCells: cellsF },
					Mark.moveOut(1, brand(2)),
				),
				Mark.moveOut(1, brand(3)),
				Mark.onEmptyCell(
					{
						revision: tag1,
						localId: brand(3),
						adjacentCells: cellsHI,
					},
					Mark.moveOut(1, brand(4)),
				),
				Mark.tomb(tag1, brand(4)),
			];
			assertChangesetsEqual(actual, expected);
		}));

	it("modify ↷ insert", () =>
		withConfig(() => {
			const mods = [
				Mark.modify(TestChange.mint([], 1)),
				Mark.skip(2),
				Mark.modify(TestChange.mint([], 2)),
			];
			const insert = Change.insert(2, 1, brand(2));
			const expected = [
				Mark.modify(TestChange.mint([], 1)),
				Mark.skip(3),
				Mark.modify(TestChange.mint([], 2)),
			];
			const actual = rebase(mods, insert);
			assertChangesetsEqual(actual, expected);
		}));

	it("delete ↷ insert", () =>
		withConfig(() => {
			// Deletes A-CD-E
			const deletion = [
				Mark.delete(1, brand(0)),
				Mark.skip(1),
				Mark.delete(2, brand(1)),
				Mark.skip(1),
				Mark.delete(1, brand(3)),
			];
			// Inserts between C and D
			const insert = Change.insert(3, 1, brand(2));
			const expected = [
				Mark.delete(1, brand(0)),
				Mark.skip(1),
				Mark.delete(1, brand(1)),
				Mark.skip(1), // <- insert
				Mark.delete(1, brand(2)),
				Mark.skip(1),
				Mark.delete(1, brand(3)),
			];
			const actual = rebase(deletion, insert);
			assertChangesetsEqual(actual, expected);
		}));

	it("insert ↷ insert", () =>
		withConfig(() => {
			const insertA = [Mark.insert(1, brand(1)), Mark.skip(2), Mark.insert(1, brand(2))];
			const insertB = Change.insert(1, 1, brand(3));
			const actual = rebase(insertA, insertB);
			const expected = [Mark.insert(1, brand(1)), Mark.skip(3), Mark.insert(1, brand(2))];
			assertChangesetsEqual(actual, expected);
		}));

	it("revive ↷ insert", () =>
		withConfig(() => {
			const revive = [
				Mark.revive(1, { revision: tag1, localId: brand(0) }),
				Mark.skip(2),
				Mark.revive(2, { revision: tag1, localId: brand(1) }),
			];
			// TODO: test both tiebreak policies
			const insert = Change.insert(2, 1);
			const actual = rebase(revive, insert, tag2);
			const expected = [
				Mark.revive(1, { revision: tag1, localId: brand(0) }),
				Mark.skip(3),
				Mark.revive(2, { revision: tag1, localId: brand(1) }),
			];
			assertChangesetsEqual(actual, expected);
		}));

	it("redundant revive ↷ insert", () =>
		withConfig(() => {
			const revive = Change.redundantRevive(0, 3, { revision: tag1, localId: brand(0) });
			const insert = Change.insert(1, 1);
			const actual = rebase(revive, insert);
			const expected = [Mark.pin(1, brand(0)), Mark.skip(1), Mark.pin(2, brand(1))];
			assertChangesetsEqual(actual, expected);
		}));

	it("modify ↷ revive", () =>
		withConfig(() => {
			const mods = [
				Mark.modify(TestChange.mint([0], 1)),
				Mark.skip(2),
				Mark.modify(TestChange.mint([0], 2)),
			];
			const revive = Change.revive(2, 1, { revision: tag1, localId: brand(0) });
			const expected = [
				// Modify at earlier index is unaffected
				Mark.modify(TestChange.mint([0], 1)),
				// Modify at later index has its index increased
				Mark.skip(3),
				Mark.modify(TestChange.mint([0], 2)),
			];
			const actual = rebase(mods, revive);
			assertChangesetsEqual(actual, expected);
		}));

	it("delete ↷ revive", () =>
		withConfig(() => {
			// Deletes A-CD-E
			const deletion = [
				Mark.delete(1, brand(0)),
				Mark.skip(1),
				Mark.delete(2, brand(1)),
				Mark.skip(1),
				Mark.delete(1, brand(3)),
			];
			// Revives content between C and D
			const revive = Change.revive(3, 1, { revision: tag1, localId: brand(0) });
			const expected = [
				Mark.delete(1, brand(0)),
				Mark.skip(1),
				Mark.delete(1, brand(1)),
				Mark.skip(1),
				Mark.delete(1, brand(2)),
				Mark.skip(1),
				Mark.delete(1, brand(3)),
			];
			const actual = rebase(deletion, revive);
			assertChangesetsEqual(actual, expected);
		}));

	it("insert ↷ revive", () =>
		withConfig(() => {
			const insert = [Mark.insert(1, brand(1)), Mark.skip(2), Mark.insert(1, brand(2))];
			const revive = Change.revive(1, 1, { revision: tag1, localId: brand(0) });
			const actual = rebase(insert, revive);
			const expected = [Mark.insert(1, brand(1)), Mark.skip(3), Mark.insert(1, brand(2))];
			assertChangesetsEqual(actual, expected);
		}));

	it("reviveAA ↷ reviveB => BAA", () =>
		withConfig(() => {
			const lineage: SF.LineageEvent[] = [
				{ revision: tag2, id: brand(0), count: 1, offset: 1 },
			];
			const reviveAA = [
				Mark.tomb(tag2),
				Mark.revive(2, { revision: tag1, localId: brand(0), lineage }),
			];
			const reviveB = [Mark.revive(1, { revision: tag2, localId: brand(0) })];
			const expected = [
				Mark.skip(1),
				Mark.revive(2, { revision: tag1, localId: brand(0), lineage }),
			];
			const actual = rebase(reviveAA, reviveB);
			assertChangesetsEqual(actual, expected);
		}));

	it("reviveAA ↷ reviveB => AAB", () =>
		withConfig(() => {
			const lineage: SF.LineageEvent[] = [
				{ revision: tag2, id: brand(0), count: 1, offset: 0 },
			];
			const reviveAA = [
				Mark.revive(2, { revision: tag1, localId: brand(0), lineage }),
				Mark.tomb(tag2),
			];
			const reviveB = [Mark.revive(1, { revision: tag2, localId: brand(0) })];
			const expected = [Mark.revive(2, { revision: tag1, localId: brand(0), lineage })];
			const actual = rebase(reviveAA, reviveB);
			assertChangesetsEqual(actual, expected);
		}));

	it("reviveBB ↷ reviveA => BBA", () =>
		withConfig(() => {
			const reviveBB = [Mark.revive(2, { revision: tag2, localId: brand(0) })];
			const reviveA = [
				Mark.tomb(tag2, brand(0), 2),
				Mark.revive(1, {
					revision: tag1,
					localId: brand(1),
					lineage: [{ revision: tag2, id: brand(0), count: 2, offset: 2 }],
				}),
			];
			const expected = [Mark.revive(2, { revision: tag2, localId: brand(0) })];
			const actual = rebase(reviveBB, reviveA);
			assertChangesetsEqual(actual, expected);
		}));

	it("reviveBB ↷ reviveA => ABB", () =>
		withConfig(() => {
			const reviveBB = Change.revive(5, 2, { revision: tag2, localId: brand(0) });
			const reviveA = [
				Mark.skip(5),
				Mark.revive(1, {
					revision: tag1,
					localId: brand(0),
					lineage: [{ revision: tag2, id: brand(0), count: 2, offset: 0 }],
				}),
				Mark.tomb(tag2, brand(0), 2),
			];
			const expected = [Mark.skip(6), Mark.revive(2, { revision: tag2, localId: brand(0) })];
			const actual = rebase(reviveBB, reviveA);
			assertChangesetsEqual(actual, expected);
		}));

	it("reviveA ↷ reviveBB => BAB", () =>
		withConfig(() => {
			const lineage: SF.LineageEvent[] = [
				{ revision: tag2, id: brand(5), count: 2, offset: 1 },
			];
			const reviveA = [
				Mark.skip(5),
				Mark.tomb(tag2, brand(5)),
				Mark.revive(1, { revision: tag1, localId: brand(6), lineage }),
				Mark.tomb(tag2, brand(6)),
			];
			const reviveBB = [Mark.skip(5), Mark.revive(2, { revision: tag2, localId: brand(5) })];
			const expected = [
				Mark.skip(6),
				Mark.revive(1, { revision: tag1, localId: brand(6), lineage }),
			];
			const actual = rebase(reviveA, reviveBB);
			assertChangesetsEqual(actual, expected);
		}));

	it("reviveAA ↷ reviveCB => CBAA", () =>
		withConfig(() => {
			const lineage: SF.LineageEvent[] = [
				{ revision: tag2, id: brand(0), count: 1, offset: 1 },
				{ revision: tag3, id: brand(0), count: 1, offset: 1 },
			];
			const reviveAA = [
				Mark.tomb(tag2),
				Mark.tomb(tag3),
				Mark.revive(2, { revision: tag1, localId: brand(0), lineage }),
			];
			const reviveB = [
				Mark.revive(1, { revision: tag2, localId: brand(0) }),
				Mark.revive(1, { revision: tag3, localId: brand(0) }),
			];
			const expected = [
				Mark.skip(2),
				Mark.revive(2, { revision: tag1, localId: brand(0), lineage }),
			];
			const actual = rebase(reviveAA, reviveB);
			assertChangesetsEqual(actual, expected);
		}));

	it("revive ↷ same revive (base within curr)", () =>
		withConfig(() => {
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
		}));

	it("revive ↷ same revive (curr within base)", () =>
		withConfig(() => {
			const reviveB = [
				Mark.tomb(tag1, brand(1)),
				Mark.revive(1, { revision: tag1, localId: brand(2) }),
				Mark.tomb(tag1, brand(3)),
			];
			const reviveABC = [Mark.revive(3, { revision: tag1, localId: brand(1) })];
			const actual = rebase(reviveB, reviveABC, tag2);
			const expected = [Mark.skip(1), Mark.pin(1, brand(2))];
			assertChangesetsEqual(actual, expected);
		}));

	it("concurrent inserts ↷ delete", () =>
		withConfig(() => {
			const delA = tagChange(Change.delete(0, 1), mintRevisionTag());
			const insertB = tagChange(Change.insert(0, 1), mintRevisionTag());
			const insertC = tagChange(Change.insert(1, 1), mintRevisionTag());
			const insertB2 = rebaseTagged(insertB, delA);
			const insertC2 = rebaseOverChanges(insertC, [delA, insertB2]);
			const expected = Change.insert(1, 1);
			checkDeltaEquality(insertC2.change, expected);
		}));

	it("concurrent inserts ↷ connected delete", () =>
		withConfig(() => {
			const delA = tagChange(Change.delete(0, 1), mintRevisionTag());
			const delB = tagChange(Change.delete(1, 1), mintRevisionTag());
			const delC = tagChange(Change.delete(0, 1), mintRevisionTag());

			const insertD = tagChange(Change.insert(0, 1), mintRevisionTag());
			const insertE = tagChange(Change.insert(3, 1), mintRevisionTag());
			const insertD2 = rebaseOverChanges(insertD, [delA, delB, delC]);
			const insertE2 = rebaseOverChanges(insertE, [delA, delB, delC, insertD2]);
			const expected = Change.insert(1, 1);
			checkDeltaEquality(insertE2.change, expected);
		}));

	it("concurrent insert and move ↷ delete", () =>
		withConfig(() => {
			const delA = tagChange(Change.delete(0, 1), mintRevisionTag());
			const insertB = tagChange(Change.insert(0, 1), mintRevisionTag());
			const moveC = tagChange(Change.move(2, 1, 1), mintRevisionTag());
			const insertB2 = rebaseTagged(insertB, delA);
			const moveC2 = rebaseOverChanges(moveC, [delA, insertB2]);
			const expected = Change.move(2, 1, 1);
			checkDeltaEquality(moveC2.change, expected);
		}));

	it("modify ↷ move", () =>
		withConfig(() => {
			const inner = TestChange.mint([0], 1);
			const modify = [Mark.modify(inner)];
			const move = Change.move(0, 1, 4);
			const expected = [Mark.tomb(tag1), Mark.skip(3), Mark.modify(inner)];
			const rebased = rebase(modify, move);
			assertChangesetsEqual(rebased, expected);
		}));

	it("delete ↷ move", () =>
		withConfig(() => {
			const deletion = [Mark.skip(2), Mark.delete(2, brand(0))];
			const move = Change.move(1, 3, 0);
			const expected = [
				Mark.skip(1),
				Mark.delete(2, brand(0)),
				Mark.skip(1),
				Mark.tomb(tag1, brand(0), 3),
			];
			const rebased = rebase(deletion, move);
			assertChangesetsEqual(rebased, expected);
		}));

	it("move ↷ move", () =>
		withConfig(() => {
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
		}));

	it("return ↷ return (same destination, <=)", () =>
		withConfig(() => {
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
		}));

	it("return ↷ return (same destination, =>)", () =>
		withConfig(() => {
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
		}));

	it("return ↷ return (other destination)", () =>
		withConfig(() => {
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
		}));

	it("pin ↷ move", () =>
		withConfig(() => {
			const move = [Mark.moveIn(2, brand(0)), { count: 2 }, Mark.moveOut(2, brand(0))];
			const pin = [{ count: 2 }, Mark.pin(2, brand(0))];
			const expected = [
				Mark.moveOut(2, brand(0)),
				{ count: 2 },
				Mark.returnTo(2, brand(0), {
					revision: tag1,
					localId: brand(0),
					adjacentCells: [{ count: 2, id: brand(0) }],
				}),
			];
			const rebased = rebase(pin, move);
			assertChangesetsEqual(rebased, expected);
		}));

	it("delete ↷ composite move", () =>
		withConfig(() => {
			const [mo1, mi1] = Mark.move(1, brand(0));
			const [mo2, mi2] = Mark.move(1, brand(1));
			const [mo3, mi3] = Mark.move(1, brand(2));
			const move = [
				mo1,
				Mark.skip(1),
				Mark.attachAndDetach(mi1, mo2),
				Mark.skip(1),
				Mark.attachAndDetach(mi2, mo3),
				Mark.skip(1),
				mi3,
			];
			const del = [Mark.delete(1, brand(0))];
			const rebased = rebase(del, move);
			const expected = [
				Mark.tomb(tag1, brand(0)),
				Mark.skip(1),
				Mark.tomb(tag1, brand(1)),
				Mark.skip(1),
				Mark.tomb(tag1, brand(2)),
				Mark.skip(1),
				Mark.delete(1, brand(0)),
			];
			assertChangesetsEqual(rebased, expected);
		}));

	it("rebasing over transient revive changes cell ID", () =>
		withConfig(() => {
			const change = TestChange.mint([0], 1);
			const modify = Change.modifyDetached(0, change, {
				revision: tag1,
				localId: brand(0),
			});

			const revive = [
				Mark.delete(1, brand(2), { cellId: { revision: tag1, localId: brand(0) } }),
			];

			const rebased = rebase(modify, revive, tag2);
			const expected = Change.modifyDetached(0, change, {
				revision: tag2,
				localId: brand(2),
				adjacentCells: [{ id: brand(2), count: 1 }],
			});
			assertChangesetsEqual(rebased, expected);
		}));

	it("rebasing over transient adds lineage", () =>
		withConfig(() => {
			const insert = Change.insert(0, 1);
			const transient = [
				Mark.attachAndDetach(Mark.insert(2, brand(0)), Mark.delete(2, brand(2))),
			];
			const rebased = rebase(insert, transient);
			const expected = [
				Mark.insert(1, {
					localId: brand(0),
					lineage: [{ revision: tag1, id: brand(2), count: 2, offset: 0 }],
				}),
				Mark.tomb(tag1, brand(2), 2),
			];

			assertChangesetsEqual(rebased, expected);
		}));

	it("delete ↷ [move, delete]", () =>
		withConfig(() => {
			const moveAndDelete = [
				Mark.moveOut(1, brand(0)),
				{ count: 1 },
				Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.delete(1, brand(1))),
			];

			const del = Change.delete(0, 1);
			const rebased = rebase(del, moveAndDelete);
			const expected = [
				Mark.tomb(tag1, brand(0)),
				{ count: 1 },
				Mark.delete(1, brand(0), {
					cellId: {
						revision: tag1,
						localId: brand(1),
						adjacentCells: [{ id: brand(1), count: 1 }],
					},
				}),
			];

			assertChangesetsEqual(rebased, expected);
		}));

	it("delete ↷ [move, delete] (reverse move direction)", () =>
		withConfig(() => {
			const moveAndDelete = [
				Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.delete(1, brand(1))),
				{ count: 1 },
				Mark.moveOut(1, brand(0)),
			];

			const del = Change.delete(1, 1);
			const rebased = rebase(del, moveAndDelete);
			const expected = [
				Mark.delete(1, brand(0), {
					cellId: {
						revision: tag1,
						localId: brand(1),
						adjacentCells: [{ id: brand(1), count: 1 }],
					},
				}),
				{ count: 1 },
				Mark.tomb(tag1, brand(0)),
			];

			assertChangesetsEqual(rebased, expected);
		}));

	it("move ↷ move and delete", () =>
		withConfig(() => {
			const moveAndDelete = [
				{ count: 1 },
				Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.delete(1, brand(1))),
				{ count: 1 },
				Mark.moveOut(1, brand(0)),
			];

			const move = Change.move(2, 1, 0);
			const rebased = rebase(move, moveAndDelete);
			const expected = [
				Mark.moveIn(1, brand(0)),
				{ count: 1 },
				Mark.moveOut(1, brand(0), {
					cellId: {
						revision: tag1,
						localId: brand(1),
						adjacentCells: [{ id: brand(1), count: 1 }],
					},
				}),
				{ count: 1 },
				Mark.tomb(tag1, brand(0)),
			];

			assertChangesetsEqual(rebased, expected);
		}));

	it("revive ↷ [revive, move]", () =>
		withConfig(() => {
			const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const reviveAndMove = [
				Mark.moveOut(1, brand(1), { cellId }),
				{ count: 1 },
				Mark.moveIn(1, brand(1)),
			];
			const revive = [Mark.revive(1, cellId)];
			const rebased = rebase(revive, reviveAndMove, tag2);
			const expected = [
				Mark.returnTo(1, brand(0), {
					revision: tag2,
					localId: brand(1),
					adjacentCells: [{ id: brand(1), count: 1 }],
				}),
				{ count: 1 },
				Mark.moveOut(1, brand(0)),
			];
			assertChangesetsEqual(rebased, expected);
		}));

	it("revive ↷ [revive, move, delete]", () =>
		withConfig(() => {
			const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const reviveMoveDelete = [
				Mark.moveOut(1, brand(1), { cellId }),
				{ count: 1 },
				Mark.attachAndDetach(Mark.moveIn(1, brand(1)), Mark.delete(1, brand(2))),
			];
			const revive = [Mark.revive(1, cellId)];
			const rebased = rebase(revive, reviveMoveDelete, tag2);
			const expected = [
				Mark.returnTo(1, brand(0), {
					revision: tag2,
					localId: brand(1),
					adjacentCells: [{ id: brand(1), count: 1 }],
				}),
				{ count: 1 },
				Mark.onEmptyCell(
					{
						revision: tag2,
						localId: brand(2),
						adjacentCells: [{ id: brand(2), count: 1 }],
					},
					Mark.moveOut(1, brand(0)),
				),
			];
			assertChangesetsEqual(rebased, expected);
		}));

	it("move chain ↷ delete", () =>
		withConfig(() => {
			const del = Change.delete(0, 1);
			const move = [
				Mark.moveOut(1, brand(0), {
					finalEndpoint: { localId: brand(1) },
				}),
				{ count: 1 },
				Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.moveOut(1, brand(1))),
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
				Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.moveOut(1, brand(1))),
				{ count: 1 },
				Mark.moveIn(1, brand(1), {
					finalEndpoint: { localId: brand(0) },
				}),
			];

			assertChangesetsEqual(rebased, expected);
		}));

	it("[revive, move] ↷ [revive, move]", () =>
		withConfig(() => {
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
		}));

	it("[revive, return] ↷ [revive, return] (same destination)", () =>
		withConfig(() => {
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
		}));

	it("[revive, return] ↷ [revive, return] (other destination)", () =>
		withConfig(() => {
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
		}));

	it("delete ↷ move with multiple destinations", () =>
		withConfig(() => {
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
				Mark.tomb(tag1, brand(0), 2),
				{ count: 1 },
				Mark.delete(1, brand(0)),
				{ count: 1 },
				Mark.delete(1, brand(1)),
			];
			assertChangesetsEqual(rebased, expected);
		}));

	// Tests that lineage is only added for detaches which are contiguous in the output context of the base changeset.
	it("insert ↷ insert within delete", () =>
		withConfig(() => {
			const insertAndDelete = [
				Mark.delete(1, brand(0)),
				Mark.insert(1, brand(1)),
				Mark.delete(1, brand(2)),
			];

			const insert = [{ count: 1 }, Mark.insert(1, brand(0))];
			const rebased = rebase(insert, insertAndDelete);
			const expected = [
				Mark.tomb(tag1, brand(0)),
				Mark.insert(1, {
					localId: brand(0),
					lineage: [{ revision: tag1, id: brand(0), count: 1, offset: 1 }],
				}),
				Mark.skip(1),
				Mark.tomb(tag1, brand(2)),
			];
			assertChangesetsEqual(rebased, expected);
		}));

	it("insert ↷ [delete, insert]", () =>
		withConfig(() => {
			// Because B does not have lineage for A, we should use B's insertion's tiebreak policy
			// and consider the cell it inserts into to be before the cell emptied by A
			// Although B and C's inserts appear to be at adjacent positions when rebasing C over B,
			// we should use C's lineage to deduce that it must come after B.
			const deleteA = [Mark.delete(1, brand(0))];
			const insertB = [Mark.insert(1, brand(0))];
			const insertC = [{ count: 1 }, Mark.insert(1, brand(0))];

			const c2 = rebase(insertC, deleteA, tag1);
			const c3 = rebase(c2, insertB, tag2);
			const expected = [
				{ count: 1 }, // Insert B
				Mark.tomb(tag1), // Delete A
				Mark.insert(1, {
					localId: brand(0),
					lineage: [{ revision: tag1, id: brand(0), count: 1, offset: 1 }],
				}),
			];
			assertChangesetsEqual(c3, expected);
		}));

	describe("Over composition", () => {
		it("insert ↷ [delete, delete]", () =>
			withConfig(() => {
				const deletes: TestChangeset = shallowCompose([
					tagChange(Change.delete(1, 2), tag1),
					tagChange(Change.delete(0, 2), tag2),
				]);

				const insert = Change.insert(3, 1);
				const rebased = rebaseOverComposition(
					insert,
					deletes,
					rebaseRevisionMetadataFromInfo(
						[{ revision: tag1 }, { revision: tag2 }],
						[tag1, tag2],
					),
				);

				const expected = [
					Mark.tomb(tag2),
					Mark.tomb(tag1, brand(0), 2),
					Mark.insert(1, {
						localId: brand(0),
						lineage: [
							{ revision: tag2, id: brand(0), count: 1, offset: 1 },
							{ revision: tag1, id: brand(0), count: 2, offset: 2 },
							{ revision: tag2, id: brand(1), count: 1, offset: 0 },
						],
					}),
					Mark.tomb(tag2, brand(1)),
				];
				assertChangesetsEqual(rebased, expected);
			}));

		it("modify ↷ [delete, delete]", () =>
			withConfig(() => {
				const deletes: TestChangeset = shallowCompose([
					tagChange(Change.delete(1, 3), tag1),
					tagChange(Change.delete(0, 2), tag2),
				]);

				const nodeChange = TestChange.mint([], 0);
				const modify = Change.modify(3, nodeChange);
				const rebased = rebaseOverComposition(
					modify,
					deletes,
					rebaseRevisionMetadataFromInfo(
						[{ revision: tag1 }, { revision: tag2 }],
						[tag1, tag2],
					),
				);

				const expected = [
					Mark.tomb(tag2),
					Mark.tomb(tag1, brand(0), 2),
					Mark.modify(nodeChange, {
						revision: tag1,
						localId: brand(2),
						adjacentCells: [{ id: brand(0), count: 3 }],
						lineage: [{ revision: tag2, id: brand(0), count: 2, offset: 1 }],
					}),
					Mark.tomb(tag2, brand(1)),
				];
				assertChangesetsEqual(rebased, expected);
			}));
	});
});
