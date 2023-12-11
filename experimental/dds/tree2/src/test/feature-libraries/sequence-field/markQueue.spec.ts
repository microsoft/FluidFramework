/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import/no-internal-modules
import { MarkQueue } from "../../../feature-libraries/sequence-field/markQueue";
// eslint-disable-next-line import/no-internal-modules
import { MoveEffect, MoveEffectTable } from "../../../feature-libraries/sequence-field";
import {
	CellMark,
	MarkList,
	MoveId,
	MovePlaceholder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/sequence-field/types";
import { CrossFieldTarget, SequenceField as SF } from "../../../feature-libraries";
import { brand, idAllocatorFromMaxId } from "../../../util";
import { TestChange } from "../../testChange";
import { TaggedChange, mintRevisionTag, tagChange } from "../../../core";

const tag1 = mintRevisionTag();
const tag2 = mintRevisionTag();

describe("SequenceField - MarkQueue", () => {
	it("applies effects to Placeholder marks", () => {
		const idAllocator = idAllocatorFromMaxId();
		const changes = TestChange.mint([], 1);
		const moveEffects = SF.newCrossFieldTable() as MoveEffectTable<TestChange>;
		const effect: MoveEffect<TestChange> & { basis: MoveId } = {
			modifyAfter: tagChange(changes, tag2),
			basis: brand(0),
		};
		moveEffects.set(CrossFieldTarget.Source, tag1, brand(1), 1, effect, false);
		const placeholder: CellMark<MovePlaceholder, TestChange> = {
			type: "Placeholder",
			revision: tag1,
			id: brand(0),
			count: 2,
		};
		const queue = new MarkQueue<TestChange>(
			[placeholder],
			undefined,
			moveEffects,
			true,
			idAllocator,
			(a: TestChange | undefined, b: TaggedChange<TestChange>) => {
				assert.equal(a, undefined);
				assert.equal(b.revision, tag2);
				assert.equal(b.change, changes);
				return changes;
			},
		);
		const actual = [];
		while (!queue.isEmpty()) {
			actual.push(queue.dequeue());
		}

		const expected: MarkList<TestChange> = [
			{
				type: "Placeholder",
				revision: tag1,
				id: brand(0),
				count: 1,
			},
			{
				type: "Placeholder",
				revision: tag1,
				id: brand(1),
				count: 1,
				changes,
			},
		];
		assert.deepEqual(actual, expected);
	});
});
