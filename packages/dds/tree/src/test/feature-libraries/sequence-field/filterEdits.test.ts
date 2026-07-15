/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-internal-modules
import { filterEdits } from "../../../feature-libraries/sequence-field/filterEdits.js";
// eslint-disable-next-line import-x/no-internal-modules
import { EditFilterStatus } from "../../../feature-libraries/modular-schema/index.js";
import {
	areEqualChangeAtomIds,
	offsetChangeAtomId,
	type ChangeAtomId,
} from "../../../core/index.js";
import { brand, type RangeQueryResult } from "../../../util/index.js";
import { MarkMaker } from "./testEdits.js";
import { mintRevisionTag } from "../../utils.js";
import { assertChangesetsEqual } from "./utils.js";

const tag1 = mintRevisionTag();
const tag2 = mintRevisionTag();
const tag3 = mintRevisionTag();
const id1: ChangeAtomId = { revision: tag1, localId: brand(0) };
const id2: ChangeAtomId = { revision: tag1, localId: brand(1) };
const id3: ChangeAtomId = { revision: tag2, localId: brand(0) };
const id4: ChangeAtomId = { revision: tag2, localId: brand(1) };
const id5: ChangeAtomId = { revision: tag3, localId: brand(0) };
const id6: ChangeAtomId = { revision: tag3, localId: brand(1) };
const id7: ChangeAtomId = { revision: tag3, localId: brand(2) };

export function testFilterEdits(): void {
	describe("Filter edits", () => {
		it("Can preserve all", () => {
			const unfiltered = [
				MarkMaker.insert(1, id1),
				MarkMaker.remove(1, id2),
				MarkMaker.rename(1, id3, id4, { changes: id7 }),
				MarkMaker.moveOut(1, id5, { finalEndpoint: id6 }),
				MarkMaker.moveIn(1, id6, { finalEndpoint: id5 }),
				MarkMaker.tomb(tag1, brand(5), 2),
			];
			const filtered = filterEdits(unfiltered, preserveAll, preserveAll, true);

			assertChangesetsEqual(filtered, unfiltered);
		});

		it("Renames removed when preserveOtherEdits is false", () => {
			const unfiltered = [
				MarkMaker.insert(1, id1),
				MarkMaker.remove(1, id2),
				MarkMaker.rename(1, id3, id4, { changes: id7 }),
				MarkMaker.moveOut(1, id5, { finalEndpoint: id6 }),
				MarkMaker.moveIn(1, id6, { finalEndpoint: id5 }),
				MarkMaker.tomb(tag1, brand(5), 2),
			];

			const filtered = filterEdits(unfiltered, preserveAll, preserveAll, false);

			const expected = [
				MarkMaker.insert(1, id1),
				MarkMaker.remove(1, id2),
				MarkMaker.tomb(id3.revision, id3.localId, 1, { changes: id7 }),
				MarkMaker.moveOut(1, id5, { finalEndpoint: id6 }),
				MarkMaker.moveIn(1, id6, { finalEndpoint: id5 }),
				MarkMaker.tomb(tag1, brand(5), 2),
			];

			assertChangesetsEqual(filtered, expected);
		});

		it("Can filter part of a mark range", () => {
			const unfiltered = [MarkMaker.insert(3, id1), MarkMaker.remove(3, id3)];

			const filtered = filterEdits(
				unfiltered,
				(id, count) => ({
					length: 1,
					value: areEqualChangeAtomIds(id, id4)
						? EditFilterStatus.Remove
						: EditFilterStatus.Preserve,
				}),
				(id, count) => ({
					length: 1,
					value: areEqualChangeAtomIds(id, id2)
						? EditFilterStatus.Remove
						: EditFilterStatus.Preserve,
				}),
				false,
			);

			const expected = [
				MarkMaker.insert(1, id1),
				MarkMaker.tomb(id2.revision, id2.localId),
				MarkMaker.insert(1, offsetChangeAtomId(id1, 2)),
				MarkMaker.remove(1, id3),
				MarkMaker.skip(1),
				MarkMaker.remove(1, offsetChangeAtomId(id3, 2)),
			];

			assertChangesetsEqual(filtered, expected);
		});

		it("Preserves tombstones", () => {
			const filtered = filterEdits(
				[
					MarkMaker.insert(1, id1),
					MarkMaker.tomb(tag1, brand(5), 2),
					MarkMaker.remove(1, id2),
				],
				removeAll,
				removeAll,
				false,
			);

			assertChangesetsEqual(filtered, [
				MarkMaker.tomb(id1.revision, id1.localId, 1),
				MarkMaker.tomb(tag1, brand(5), 2),
			]);
		});

		it("Can convert move-out to remove", () => {
			const filtered = filterEdits(
				[
					MarkMaker.moveOut(1, id1, { finalEndpoint: id2 }),
					MarkMaker.moveIn(1, id2, { finalEndpoint: id1 }),
				],
				(id, count, endpoint) => ({
					length: 1,
					value: EditFilterStatus.PreserveWithoutMove,
				}),
				removeAll,
				false,
			);

			const moveInCell = offsetChangeAtomId(id2, 1);
			const expected = [
				MarkMaker.remove(1, id1),
				MarkMaker.tomb(moveInCell.revision, moveInCell.localId),
			];

			assertChangesetsEqual(filtered, expected);
		});

		it("Can convert move-in to insert", () => {
			const filtered = filterEdits(
				[
					MarkMaker.moveOut(1, id1, { finalEndpoint: id2 }),
					MarkMaker.moveIn(1, id2, { finalEndpoint: id1 }),
				],
				removeAll,
				(id, count, endpoint) => ({
					length: 1,
					value: EditFilterStatus.PreserveWithoutMove,
				}),
				false,
			);

			const expected = [MarkMaker.skip(1), MarkMaker.insert(1, id2, { cellId: id1 })];

			assertChangesetsEqual(filtered, expected);
		});
	});
}

function preserveAll(
	id: ChangeAtomId,
	count: number,
	endpoint?: ChangeAtomId,
): RangeQueryResult<EditFilterStatus> {
	return { length: count, value: EditFilterStatus.Preserve };
}

function removeAll(
	id: ChangeAtomId,
	count: number,
	endpoint?: ChangeAtomId,
): RangeQueryResult<EditFilterStatus> {
	return { length: count, value: EditFilterStatus.Remove };
}
