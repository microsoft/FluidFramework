/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-internal-modules
import { filterEdits } from "../../../feature-libraries/sequence-field/filterEdits.js";
// eslint-disable-next-line import-x/no-internal-modules
import {
	EditFilterStatus,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/modular-schema/index.js";
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

function preserveAllDetaches(
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<EditFilterStatus> {
	return { length: count, value: EditFilterStatus.Preserve };
}

function preserveAllAttaches(
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<EditFilterStatus> {
	return { length: count, value: EditFilterStatus.Preserve };
}

function removeAllDetaches(
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<EditFilterStatus> {
	return {
		length: count,
		value: EditFilterStatus.Remove,
	};
}

function removeAllAttaches(
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<EditFilterStatus> {
	return { length: count, value: EditFilterStatus.Remove };
}

export function testFilterEdits(): void {
	describe("Filter edits", () => {
		it("Can preserve all", () => {
			const unfiltered = [
				MarkMaker.attach(1, id1),
				MarkMaker.detach(1, id2),
				MarkMaker.rename(1, id3, id4, { changes: id7 }),
				MarkMaker.tomb(tag1, brand(5), 2),
			];
			const filtered = filterEdits(unfiltered, {
				filterDetach: preserveAllDetaches,
				filterAttach: preserveAllAttaches,
				preserveOtherEdits: true,
			});

			assertChangesetsEqual(filtered, unfiltered);
		});

		it("Renames removed when preserveOtherEdits is false", () => {
			const unfiltered = [
				MarkMaker.attach(1, id1),
				MarkMaker.detach(1, id2),
				MarkMaker.rename(1, id3, id4, { changes: id7 }),
				MarkMaker.tomb(tag1, brand(5), 2),
			];

			const filtered = filterEdits(unfiltered, {
				filterDetach: preserveAllDetaches,
				filterAttach: preserveAllAttaches,
				preserveOtherEdits: false,
			});

			const expected = [
				MarkMaker.attach(1, id1),
				MarkMaker.detach(1, id2),
				MarkMaker.tomb(id3.revision, id3.localId, 1, { changes: id7 }),
				MarkMaker.tomb(tag1, brand(5), 2),
			];

			assertChangesetsEqual(filtered, expected);
		});

		it("Can filter part of a mark range", () => {
			const unfiltered = [MarkMaker.attach(3, id1), MarkMaker.detach(3, id3)];

			const filtered = filterEdits(unfiltered, {
				filterDetach: (id, count) => ({
					length: 1,
					value: areEqualChangeAtomIds(id, id4)
						? EditFilterStatus.Remove
						: EditFilterStatus.Preserve,
				}),
				filterAttach: (id, count) => ({
					length: 1,
					value: areEqualChangeAtomIds(id, id2)
						? EditFilterStatus.Remove
						: EditFilterStatus.Preserve,
				}),
				preserveOtherEdits: false,
			});

			const expected = [
				MarkMaker.attach(1, id1),
				MarkMaker.tomb(id2.revision, id2.localId),
				MarkMaker.attach(1, offsetChangeAtomId(id1, 2)),
				MarkMaker.detach(1, id3),
				MarkMaker.skip(1),
				MarkMaker.detach(1, offsetChangeAtomId(id3, 2)),
			];

			assertChangesetsEqual(filtered, expected);
		});

		it("Preserves tombstones", () => {
			const filtered = filterEdits(
				[
					MarkMaker.attach(1, id1),
					MarkMaker.tomb(tag1, brand(5), 2),
					MarkMaker.detach(1, id2),
				],
				{
					filterDetach: removeAllDetaches,
					filterAttach: removeAllAttaches,
					preserveOtherEdits: false,
				},
			);

			assertChangesetsEqual(filtered, [
				MarkMaker.tomb(id1.revision, id1.localId, 1),
				MarkMaker.tomb(tag1, brand(5), 2),
			]);
		});
	});
}
