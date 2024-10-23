/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ChangeAtomId,
	type ChangesetLocalId,
	type RevisionTag,
	offsetChangeAtomId,
} from "../../../core/index.js";
import type { NodeId, SequenceField as SF } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { CellId } from "../../../feature-libraries/sequence-field/index.js";
import { TestChange } from "../../testChange.js";
import { mintRevisionTag } from "../../utils.js";
import { brand } from "../../../util/index.js";
import { TestNodeId } from "../../testNodeId.js";
import { invert as invertChange, assertChangesetsEqual, tagChangeInline } from "./utils.js";
import { ChangeMaker as Change, MarkMaker as Mark } from "./testEdits.js";

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const tag3: RevisionTag = mintRevisionTag();
const tagForInvert: RevisionTag = mintRevisionTag();

const nodeId1: NodeId = { localId: brand(1) };
const nodeId2: NodeId = { localId: brand(2) };

const childChange1 = TestNodeId.create(nodeId1, TestChange.mint([0], 1));
const childChange2 = TestNodeId.create(nodeId2, TestChange.mint([1], 2));

function invert(change: SF.Changeset, tag: RevisionTag = tag1): SF.Changeset {
	return invertChange(tagChangeInline(change, tag), tagForInvert);
}

export function testInvert() {
	describe("Invert", () => {
		it("no changes", () => {
			const input: SF.Changeset = [];
			const expected: SF.Changeset = [];
			const actual = invert(input);
			assertChangesetsEqual(actual, expected);
		});

		it("tombstones", () => {
			const input: SF.Changeset = [Mark.tomb(tag1, brand(0))];
			const expected: SF.Changeset = [Mark.tomb(tag1, brand(0))];
			const actual = invert(input);
			assertChangesetsEqual(actual, expected);
		});

		it("child changes", () => {
			const input = Change.modify(0, nodeId1);
			const expected = Change.modify(0, { ...nodeId1, revision: tag1 });
			const actual = invert(input);
			assertChangesetsEqual(actual, expected);
		});

		it("child changes of removed content", () => {
			const detachEvent = { revision: tag1, localId: brand<ChangesetLocalId>(0) };
			const input = Change.modifyDetached(0, childChange1, detachEvent);
			const actual = invert(input);
			const expected = Change.modifyDetached(
				0,
				{ ...childChange1, revision: tag1 },
				detachEvent,
			);
			assertChangesetsEqual(actual, expected);
		});

		it("insert => remove", () => {
			const cellId: SF.CellId = { revision: tag1, localId: brand(0) };
			const input = Change.insert(0, 2, tag1, cellId);
			const actual = invert(input, tag2);
			const expected = [
				Mark.remove(2, brand(0), { idOverride: cellId, revision: tagForInvert }),
			];
			assertChangesetsEqual(actual, expected);
		});

		it("insert & modify => modify & remove", () => {
			const cellId: SF.CellId = { revision: tag1, localId: brand(0) };
			const input = [Mark.insert(1, brand(0), { changes: childChange1 })];
			const expected = [
				Mark.remove(1, cellId, {
					changes: { ...childChange1, revision: tag1 },
					idOverride: cellId,
					revision: tagForInvert,
				}),
			];
			const actual = invert(input);
			assertChangesetsEqual(actual, expected);
		});

		it("remove => revive", () => {
			const input = [
				Mark.remove(1, brand(0), { changes: childChange1 }),
				Mark.remove(1, brand(1)),
			];
			const expected = [
				Mark.revive(
					1,
					{ revision: tag1, localId: brand(0) },
					{ changes: { ...childChange1, revision: tag1 }, revision: tagForInvert },
				),
				Mark.revive(1, { revision: tag1, localId: brand(1) }, { revision: tagForInvert }),
			];
			const actual = invert(input);
			assertChangesetsEqual(actual, expected);
		});

		it("remove => revive (with rollback ID)", () => {
			const detachId: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const input = tagChangeInline(
				[Mark.remove(2, brand(0), { idOverride: detachId })],
				tag1,
				tag3, // This ID should be ignored
			);
			const expected = [Mark.revive(2, detachId, { revision: tag3 })];
			const actual = invertChange(input, tag3);
			assertChangesetsEqual(actual, expected);
		});

		it("remove => revive (with override ID)", () => {
			const cellId: SF.CellId = { revision: tag2, localId: brand(0) };
			const input: SF.Changeset = [
				Mark.remove(2, { localId: brand(5) }, { idOverride: cellId }),
			];
			const expected = [Mark.revive(2, cellId, { id: brand(5), revision: tagForInvert })];
			const actual = invert(input);
			assertChangesetsEqual(actual, expected);
		});

		it("active revive => remove", () => {
			const cellId: CellId = { revision: tag1, localId: brand(0) };
			const input = Change.revive(0, 2, cellId, tag1);
			const expected: SF.Changeset = [
				Mark.remove(
					2,
					{ localId: brand(0), revision: tag2 },
					{ idOverride: cellId, revision: tagForInvert },
				),
			];
			const actual = invert(input, tag2);
			assertChangesetsEqual(actual, expected);
		});

		it("move => return", () => {
			const input = [
				Mark.moveOut(1, brand(0), { changes: childChange1 }),
				Mark.skip(3),
				Mark.moveIn(1, brand(0)),
			];
			const expected = [
				Mark.returnTo(
					1,
					brand(0),
					{ revision: tag1, localId: brand(0) },
					{ revision: tagForInvert },
				),
				Mark.skip(3),
				Mark.moveOut(1, brand(0), {
					changes: { ...childChange1, revision: tag1 },
					idOverride: { revision: tag1, localId: brand(1) },
					revision: tagForInvert,
				}),
			];
			const actual = invert(input, tag1);
			assertChangesetsEqual(actual, expected);
		});

		it("move backward => return", () => {
			const input = [
				Mark.moveIn(1, brand(0)),
				Mark.skip(3),
				Mark.moveOut(1, brand(0), { changes: childChange1 }),
			];
			const expected = [
				Mark.moveOut(1, brand(0), {
					changes: { ...childChange1, revision: tag1 },
					idOverride: { revision: tag1, localId: brand(1) },
					revision: tagForInvert,
				}),
				Mark.skip(3),
				Mark.returnTo(
					1,
					brand(0),
					{ revision: tag1, localId: brand(0) },
					{ revision: tagForInvert },
				),
			];
			const actual = invert(input, tag1);
			assertChangesetsEqual(actual, expected);
		});

		it("return => return", () => {
			const cellId: ChangeAtomId = { revision: tag2, localId: brand(0) };
			const input = [
				Mark.moveOut(1, brand(42), { changes: childChange1 }),
				Mark.moveOut(1, brand(43)),
				Mark.skip(3),
				Mark.returnTo(2, brand(42), cellId),
			];

			const expected: SF.Changeset = [
				Mark.returnTo(
					2,
					brand(42),
					{ revision: tag1, localId: brand(42) },
					{ revision: tagForInvert },
				),
				{ count: 3 },
				Mark.moveOut(1, brand(42), {
					idOverride: cellId,
					changes: { ...childChange1, revision: tag1 },
					revision: tagForInvert,
				}),
				Mark.moveOut(1, brand(43), {
					idOverride: { revision: tag2, localId: brand(1) },
					revision: tagForInvert,
				}),
			];
			const actual = invert(input, tag1);
			assertChangesetsEqual(actual, expected);
		});

		it("pin live nodes => skip", () => {
			const input = [Mark.pin(1, brand(0), { changes: childChange1 })];
			const expected: SF.Changeset = [Mark.modify({ ...childChange1, revision: tag1 })];
			const actual = invert(input);
			assertChangesetsEqual(actual, expected);
		});

		it("pin removed nodes => remove", () => {
			const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
			const input = [Mark.pin(1, brand(0), { cellId, changes: childChange1 })];
			const expected: SF.Changeset = [
				Mark.remove(1, brand(0), {
					idOverride: cellId,
					changes: { ...childChange1, revision: tag2 },
					revision: tagForInvert,
				}),
			];
			const actual = invert(input, tag2);
			assertChangesetsEqual(actual, expected);
		});

		it("insert & remove => revive & remove", () => {
			const transient = [
				Mark.remove(1, brand(0), { cellId: { localId: brand(1) }, changes: childChange1 }),
			];

			const inverse = invert(transient, tag1);
			const idOverride: SF.CellId = { revision: tag1, localId: brand(1) };
			const expected = [
				Mark.remove(1, brand(0), {
					cellId: { revision: tag1, localId: brand(0) },
					changes: { ...childChange1, revision: tag1 },
					idOverride,
					revision: tagForInvert,
				}),
			];

			assertChangesetsEqual(inverse, expected);
		});

		it("revive & remove => revive & remove", () => {
			const startId: ChangeAtomId = { revision: tag1, localId: brand(1) };
			const detachId: ChangeAtomId = { revision: tag1, localId: brand(2) };
			const transient = [
				Mark.remove(1, detachId.localId, {
					cellId: { localId: startId.localId },
					changes: childChange1,
				}),
			];

			const inverse = invert(transient, tag1);
			const expected = [
				Mark.remove(1, detachId.localId, {
					cellId: detachId,
					changes: { ...childChange1, revision: tag1 },
					idOverride: startId,
					revision: tagForInvert,
				}),
			];
			assertChangesetsEqual(inverse, expected);
		});

		it("Insert and move => move and remove", () => {
			const insertAndMove = [
				Mark.moveOut(1, brand(1), {
					changes: childChange1,
					cellId: { localId: brand(0) },
				}),
				{ count: 1 },
				Mark.moveIn(1, brand(1)),
			];

			const inverse = invert(insertAndMove, tag1);
			const expected = [
				Mark.attachAndDetach(
					Mark.returnTo(
						1,
						brand(1),
						{ revision: tag1, localId: brand(1) },
						{ revision: tagForInvert },
					),
					Mark.remove(1, brand(1), {
						idOverride: { revision: tag1, localId: brand(0) },
						revision: tagForInvert,
					}),
				),
				{ count: 1 },
				Mark.moveOut(1, brand(1), {
					changes: { ...childChange1, revision: tag1 },
					idOverride: { revision: tag1, localId: brand(2) },
					revision: tagForInvert,
				}),
			];

			assertChangesetsEqual(inverse, expected);
		});

		it("revive & move => return & remove", () => {
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

			const inverse = invert(transient, tag1);
			const expected = [
				Mark.attachAndDetach(
					Mark.returnTo(1, detachId.localId, detachId, { revision: tagForInvert }),
					Mark.remove(1, detachId.localId, {
						idOverride: startId,
						revision: tagForInvert,
					}),
				),
				{ count: 1 },
				Mark.moveOut(1, detachId.localId, {
					changes: { ...childChange1, revision: tag1 },
					idOverride: offsetChangeAtomId(detachId, 1),
					revision: tagForInvert,
				}),
			];
			assertChangesetsEqual(inverse, expected);
		});

		it("Move and remove => revive and return", () => {
			const moveAndRemove = [
				Mark.moveOut(1, brand(0), { changes: childChange1 }),
				{ count: 1 },
				Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.remove(1, brand(2))),
			];

			const inverse = invert(moveAndRemove);
			const expected = [
				Mark.returnTo(
					1,
					brand(0),
					{ revision: tag1, localId: brand(0) },
					{ revision: tagForInvert },
				),
				{ count: 1 },
				Mark.moveOut(1, brand(0), {
					cellId: { revision: tag1, localId: brand(2) },
					idOverride: { revision: tag1, localId: brand(1) },
					changes: { ...childChange1, revision: tag1 },
					revision: tagForInvert,
				}),
			];

			assertChangesetsEqual(inverse, expected);
		});

		it("Move chain => return chain", () => {
			const moves = [
				Mark.moveOut(1, brand(0), {
					changes: childChange1,
					finalEndpoint: { localId: brand(2) },
				}),
				{ count: 1 },
				Mark.rename(1, brand(1), brand(2)),
				{ count: 1 },
				Mark.moveIn(1, brand(2), { finalEndpoint: { localId: brand(0) } }),
			];

			const inverse = invert(moves, tag1);
			const expected = [
				Mark.returnTo(
					1,
					brand(0),
					{ revision: tag1, localId: brand(0) },
					{ finalEndpoint: { localId: brand(2), revision: tag1 }, revision: tagForInvert },
				),
				{ count: 1 },
				Mark.rename(
					1,
					{ revision: tag1, localId: brand(2) },
					{ revision: tag1, localId: brand(1) },
				),
				{ count: 1 },
				Mark.moveOut(1, brand(2), {
					changes: { ...childChange1, revision: tag1 },
					finalEndpoint: { localId: brand(0), revision: tag1 },
					idOverride: { revision: tag1, localId: brand(3) },
					revision: tagForInvert,
				}),
			];

			assertChangesetsEqual(inverse, expected);
		});

		describe("Redundant changes", () => {
			it("remove (same detach ID)", () => {
				const cellId = { revision: tag1, localId: brand<ChangesetLocalId>(0) };
				const input = [
					Mark.onEmptyCell(
						cellId,
						Mark.remove(1, brand(0), {
							changes: childChange1,
						}),
					),
				];

				const actual = invert(input, tag1);
				const expected = Change.modifyDetached(0, { ...childChange1, revision: tag1 }, cellId);
				assertChangesetsEqual(actual, expected);
			});

			it("remove (same detach ID through metadata)", () => {
				const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
				const input = [
					Mark.onEmptyCell(
						cellId,
						Mark.remove(1, brand(0), { changes: childChange1, idOverride: cellId }),
					),
				];

				const actual = invertChange(tagChangeInline(input, tag2, tag3 /* <= ignored */), tag3);
				const expected = Change.modifyDetached(0, { ...childChange1, revision: tag2 }, cellId);
				assertChangesetsEqual(actual, expected);
			});

			it("remove (different detach ID)", () => {
				const startId: ChangeAtomId = { revision: tag1, localId: brand(0) };
				const endId: ChangeAtomId = { revision: tag2, localId: brand(0) };
				const input = [
					Mark.remove(1, endId, {
						changes: childChange1,
						cellId: startId,
					}),
				];

				const actual = invert(input, tag2);
				const expected = [
					Mark.remove(1, brand(0), {
						changes: { ...childChange1, revision: tag2 },
						cellId: endId,
						idOverride: startId,
						revision: tagForInvert,
					}),
				];
				assertChangesetsEqual(actual, expected);
			});

			it("redundant revive => skip", () => {
				const input = [
					Mark.modify(childChange1),
					Mark.pin(1, brand(0), { revision: tag1 }),
					Mark.modify(childChange2),
				];
				const expected = [
					Mark.modify({ ...childChange1, revision: tag1 }),
					Mark.skip(1),
					Mark.modify({ ...childChange2, revision: tag1 }),
				];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			});
		});
	});
}
