/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ChangeAtomId,
	ChangesetLocalId,
	RevisionTag,
	tagChange,
	tagRollbackInverse,
} from "../../../core/index.js";
// eslint-disable-next-line import/no-internal-modules
import { CellId } from "../../../feature-libraries/sequence-field/index.js";
import { SequenceField as SF } from "../../../feature-libraries/index.js";
import { TestChange } from "../../testChange.js";
import { mintRevisionTag } from "../../utils.js";
import { brand } from "../../../util/index.js";
import {
	invert as invertChange,
	describeForBothConfigs,
	withOrderingMethod,
	assertChangesetsEqual,
} from "./utils.js";
import { ChangeMaker as Change, MarkMaker as Mark, TestChangeset } from "./testEdits.js";

function invert(change: TestChangeset, tag?: RevisionTag): TestChangeset {
	return invertChange(tagChange(change, tag ?? tag1));
}

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();

const childChange1 = TestChange.mint([0], 1);
const childChange2 = TestChange.mint([1], 2);
const inverseChildChange1 = TestChange.invert(childChange1);
const inverseChildChange2 = TestChange.invert(childChange2);

export function testInvert() {
	describeForBothConfigs("Invert", (config) => {
		const withConfig = (fn: () => void) => withOrderingMethod(config.cellOrdering, fn);
		it("no changes", () =>
			withConfig(() => {
				const input: TestChangeset = [];
				const expected: TestChangeset = [];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("tombstones", () =>
			withConfig(() => {
				const input: TestChangeset = [Mark.tomb(tag1, brand(0))];
				const expected: TestChangeset = [Mark.tomb(tag1, brand(0))];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("child changes", () =>
			withConfig(() => {
				const input = Change.modify(0, childChange1);
				const expected = Change.modify(0, inverseChildChange1);
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("child changes of removed content", () =>
			withConfig(() => {
				const detachEvent = { revision: tag1, localId: brand<ChangesetLocalId>(0) };
				const input = Change.modifyDetached(0, childChange1, detachEvent);
				const actual = invert(input);
				const expected = Change.modifyDetached(0, inverseChildChange1, detachEvent);
				assertChangesetsEqual(actual, expected);
			}));

		it("insert => remove", () =>
			withConfig(() => {
				const idOverride: SF.DetachIdOverride = {
					type: SF.DetachIdOverrideType.Unattach,
					id: { revision: tag1, localId: brand(0) },
				};
				const input = Change.insert(0, 2);
				const expected = [Mark.remove(2, brand(0), { idOverride })];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("insert & modify => modify & remove", () =>
			withConfig(() => {
				const idOverride: SF.DetachIdOverride = {
					type: SF.DetachIdOverrideType.Unattach,
					id: { revision: tag1, localId: brand(0) },
				};
				const input = [Mark.insert(1, brand(0), { changes: childChange1 })];
				const expected = [
					Mark.remove(1, brand(0), {
						changes: inverseChildChange1,
						idOverride,
					}),
				];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("remove => revive", () =>
			withConfig(() => {
				const input = [
					Mark.remove(1, brand(0), { changes: childChange1 }),
					Mark.remove(1, brand(1)),
				];
				const expected = [
					Mark.revive(
						1,
						{ revision: tag1, localId: brand(0) },
						{ changes: inverseChildChange1 },
					),
					Mark.revive(1, { revision: tag1, localId: brand(1) }),
				];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("remove => revive (with rollback ID)", () =>
			withConfig(() => {
				const detachId: ChangeAtomId = { revision: tag2, localId: brand(0) };
				const input = tagRollbackInverse([Mark.remove(2, brand(0))], tag1, tag2);
				const expected = [Mark.revive(2, detachId)];
				const actual = invertChange(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("remove => revive (with override ID)", () =>
			withConfig(() => {
				const idOverride: SF.DetachIdOverride = {
					type: SF.DetachIdOverrideType.Redetach,
					id: { revision: tag2, localId: brand(0) },
				};
				const input: TestChangeset = [Mark.remove(2, brand(5), { idOverride })];
				const expected = [Mark.revive(2, idOverride.id, { id: brand(5) })];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("active revive => remove", () =>
			withConfig(() => {
				const cellId: CellId = {
					revision: tag1,
					localId: brand(0),
					lineage: [{ revision: tag2, id: brand(42), count: 2, offset: 1 }],
				};
				const input = Change.revive(0, 2, cellId);
				const idOverride: SF.DetachIdOverride = {
					type: SF.DetachIdOverrideType.Redetach,
					id: cellId,
				};
				const expected: TestChangeset = [Mark.remove(2, brand(0), { idOverride })];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("move => return", () =>
			withConfig(() => {
				const input = [
					Mark.moveOut(1, brand(0), { changes: childChange1 }),
					Mark.skip(3),
					Mark.moveIn(1, brand(0)),
				];
				const idOverride: SF.DetachIdOverride = {
					type: SF.DetachIdOverrideType.Unattach,
					id: { revision: tag1, localId: brand(0) },
				};
				const expected = [
					Mark.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
					Mark.skip(3),
					Mark.moveOut(1, brand(0), {
						changes: inverseChildChange1,
						idOverride,
					}),
				];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("move backward => return", () =>
			withConfig(() => {
				const input = [
					Mark.moveIn(1, brand(0)),
					Mark.skip(3),
					Mark.moveOut(1, brand(0), { changes: childChange1 }),
				];
				const idOverride: SF.DetachIdOverride = {
					type: SF.DetachIdOverrideType.Unattach,
					id: { revision: tag1, localId: brand(0) },
				};
				const expected = [
					Mark.moveOut(1, brand(0), {
						changes: inverseChildChange1,
						idOverride,
					}),
					Mark.skip(3),
					Mark.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
				];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("return => return", () =>
			withConfig(() => {
				const cellId: ChangeAtomId = { revision: tag2, localId: brand(0) };
				const input = [
					Mark.moveOut(1, brand(42), { changes: childChange1 }),
					Mark.moveOut(1, brand(43)),
					Mark.skip(3),
					Mark.returnTo(2, brand(42), cellId),
				];

				const idOverride: SF.DetachIdOverride = {
					type: SF.DetachIdOverrideType.Redetach,
					id: cellId,
				};
				const expected: TestChangeset = [
					Mark.returnTo(2, brand(42), { revision: tag1, localId: brand(42) }),
					{ count: 3 },
					Mark.moveOut(1, brand(42), {
						idOverride,
						changes: inverseChildChange1,
					}),
					Mark.moveOut(1, brand(43), {
						idOverride: { ...idOverride, id: { ...cellId, localId: brand(1) } },
					}),
				];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("pin live nodes => skip", () =>
			withConfig(() => {
				const input = [Mark.pin(1, brand(0), { changes: childChange1 })];
				const expected: TestChangeset = [Mark.modify(inverseChildChange1)];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("pin removed nodes => remove", () =>
			withConfig(() => {
				const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
				const input = [Mark.pin(1, brand(0), { cellId, changes: childChange1 })];
				const expected: TestChangeset = [
					Mark.remove(1, brand(0), {
						idOverride: {
							type: SF.DetachIdOverrideType.Redetach,
							id: cellId,
						},
						changes: inverseChildChange1,
					}),
				];
				const actual = invert(input);
				assertChangesetsEqual(actual, expected);
			}));

		it("insert & remove => revive & remove", () =>
			withConfig(() => {
				const transient = [
					Mark.attachAndDetach(Mark.insert(1, brand(1)), Mark.remove(1, brand(0)), {
						changes: childChange1,
					}),
				];

				const inverse = invert(transient);
				const idOverride: SF.DetachIdOverride = {
					type: SF.DetachIdOverrideType.Unattach,
					id: { revision: tag1, localId: brand(1) },
				};
				const expected = [
					Mark.remove(1, brand(1), {
						cellId: { revision: tag1, localId: brand(0) },
						changes: inverseChildChange1,
						idOverride,
					}),
				];

				assertChangesetsEqual(inverse, expected);
			}));

		it("revive & remove => revive & remove", () =>
			withConfig(() => {
				const startId: ChangeAtomId = { revision: tag1, localId: brand(1) };
				const detachId: ChangeAtomId = { revision: tag1, localId: brand(2) };
				const transient = [
					Mark.remove(1, detachId.localId, {
						cellId: { localId: startId.localId },
						changes: childChange1,
					}),
				];

				const inverse = invertChange(tagChange(transient, startId.revision));
				const expected = [
					Mark.remove(1, detachId.localId, {
						cellId: detachId,
						changes: inverseChildChange1,
						idOverride: {
							type: SF.DetachIdOverrideType.Redetach,
							id: startId,
						},
					}),
				];
				assertChangesetsEqual(inverse, expected);
			}));

		it("Insert and move => move and remove", () =>
			withConfig(() => {
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
						Mark.remove(1, brand(0), {
							idOverride: {
								type: SF.DetachIdOverrideType.Unattach,
								id: { revision: tag1, localId: brand(0) },
							},
						}),
					),
					{ count: 1 },
					Mark.moveOut(1, brand(1), {
						changes: inverseChildChange1,
						idOverride: {
							type: SF.DetachIdOverrideType.Unattach,
							id: { revision: tag1, localId: brand(1) },
						},
					}),
				];

				assertChangesetsEqual(inverse, expected);
			}));

		it("revive & move => return & remove", () =>
			withConfig(() => {
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
						Mark.remove(1, detachId.localId, {
							idOverride: {
								type: SF.DetachIdOverrideType.Redetach,
								id: startId,
							},
						}),
					),
					{ count: 1 },
					Mark.moveOut(1, detachId.localId, {
						changes: inverseChildChange1,
						idOverride: {
							type: SF.DetachIdOverrideType.Unattach,
							id: detachId,
						},
					}),
				];
				assertChangesetsEqual(inverse, expected);
			}));

		it("Move and remove => revive and return", () =>
			withConfig(() => {
				const moveAndRemove = [
					Mark.moveOut(1, brand(0), { changes: childChange1 }),
					{ count: 1 },
					Mark.attachAndDetach(Mark.moveIn(1, brand(0)), Mark.remove(1, brand(1))),
				];

				const inverse = invert(moveAndRemove);
				const expected = [
					Mark.returnTo(1, brand(0), { revision: tag1, localId: brand(0) }),
					{ count: 1 },
					Mark.moveOut(1, brand(0), {
						cellId: { revision: tag1, localId: brand(1) },
						idOverride: {
							type: SF.DetachIdOverrideType.Unattach,
							id: { revision: tag1, localId: brand(0) },
						},
						changes: inverseChildChange1,
					}),
				];

				assertChangesetsEqual(inverse, expected);
			}));

		it("Move chain => return chain", () =>
			withConfig(() => {
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
						Mark.moveOut(1, brand(0), {
							idOverride: {
								type: SF.DetachIdOverrideType.Unattach,
								id: { revision: tag1, localId: brand(0) },
							},
						}),
					),
					{ count: 1 },
					Mark.moveOut(1, brand(1), {
						changes: inverseChildChange1,
						finalEndpoint: { localId: brand(0) },
						idOverride: {
							type: SF.DetachIdOverrideType.Unattach,
							id: { revision: tag1, localId: brand(1) },
						},
					}),
				];

				assertChangesetsEqual(inverse, expected);
			}));

		describe("Redundant changes", () => {
			it("remove (same detach ID)", () =>
				withConfig(() => {
					const cellId = { revision: tag1, localId: brand<ChangesetLocalId>(0) };
					const input = [
						Mark.onEmptyCell(
							cellId,
							Mark.remove(1, brand(0), { changes: childChange1 }),
						),
					];

					const actual = invert(input, tag1);
					const expected = Change.modifyDetached(0, inverseChildChange1, cellId);
					assertChangesetsEqual(actual, expected);
				}));

			it("remove (same detach ID through metadata)", () =>
				withConfig(() => {
					const cellId: ChangeAtomId = { revision: tag1, localId: brand(0) };
					const input = [
						Mark.onEmptyCell(
							cellId,
							Mark.remove(1, brand(0), { changes: childChange1 }),
						),
					];

					const actual = invertChange(tagRollbackInverse(input, tag2, tag1));
					const expected = Change.modifyDetached(0, inverseChildChange1, cellId);
					assertChangesetsEqual(actual, expected);
				}));

			it("remove (different detach ID)", () =>
				withConfig(() => {
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
							changes: inverseChildChange1,
							cellId: endId,
							idOverride: {
								type: SF.DetachIdOverrideType.Redetach,
								id: startId,
							},
						}),
					];
					assertChangesetsEqual(actual, expected);
				}));

			it("redundant revive => skip", () =>
				withConfig(() => {
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
					assertChangesetsEqual(actual, expected);
				}));
		});
	});
}
