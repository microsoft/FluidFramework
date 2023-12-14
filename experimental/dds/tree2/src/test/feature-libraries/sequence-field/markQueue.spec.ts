/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import/no-internal-modules
import { MarkQueue } from "../../../feature-libraries/sequence-field/markQueue";
// eslint-disable-next-line import/no-internal-modules
import { MoveEffect, MoveEffectTable } from "../../../feature-libraries/sequence-field";
// eslint-disable-next-line import/no-internal-modules
import { MoveId } from "../../../feature-libraries/sequence-field/types";
// eslint-disable-next-line import/no-internal-modules
import { VestigialEndpointMark } from "../../../feature-libraries/sequence-field/helperTypes";
import { CrossFieldTarget, SequenceField as SF } from "../../../feature-libraries";
import { brand, idAllocatorFromMaxId } from "../../../util";
import { TestChange } from "../../testChange";
import { TaggedChange, mintRevisionTag, tagChange } from "../../../core";

const tag1 = mintRevisionTag();
const tag2 = mintRevisionTag();

describe("SequenceField - MarkQueue", () => {
	it("applies effects to VestigialEndpoint marks", () => {
		const idAllocator = idAllocatorFromMaxId();
		const change1 = TestChange.mint([], 1);
		const change2 = TestChange.mint([], 2);
		const change3 = TestChange.mint([], 3);
		const moveEffects = SF.newCrossFieldTable() as MoveEffectTable<TestChange>;
		const effect1: MoveEffect<TestChange> & { basis: MoveId } = {
			modifyAfter: tagChange(change1, tag2),
			basis: brand(0),
		};
		const effect2: MoveEffect<TestChange> & { basis: MoveId } = {
			modifyAfter: tagChange(change2, tag2),
			basis: brand(0),
		};
		const effect3: MoveEffect<TestChange> & { basis: MoveId } = {
			modifyAfter: tagChange(change3, tag2),
			basis: brand(0),
		};
		moveEffects.set(CrossFieldTarget.Source, tag1, brand(1), 1, effect1, false);
		moveEffects.set(CrossFieldTarget.Source, tag1, brand(2), 1, effect2, false);
		moveEffects.set(CrossFieldTarget.Source, tag1, brand(3), 1, effect3, false);
		const vestige: VestigialEndpointMark<TestChange> = {
			vestigialEndpoint: {
				revision: tag1,
				localId: brand(0),
			},
			count: 4,
		};
		const queue = new MarkQueue<TestChange>(
			[vestige],
			undefined,
			moveEffects,
			true,
			idAllocator,
			(a: TestChange | undefined, b: TaggedChange<TestChange>) => {
				assert.equal(a, undefined);
				assert.equal(b.revision, tag2);
				return b.change;
			},
		);
		const actual = [];
		while (!queue.isEmpty()) {
			actual.push(queue.dequeue());
		}

		const expected: VestigialEndpointMark<TestChange>[] = [
			{
				vestigialEndpoint: {
					revision: tag1,
					localId: brand(0),
				},
				count: 1,
			},
			{
				vestigialEndpoint: {
					revision: tag1,
					localId: brand(1),
				},
				count: 1,
				changes: change1,
			},
			{
				vestigialEndpoint: {
					revision: tag1,
					localId: brand(2),
				},
				count: 1,
				changes: change2,
			},
			{
				vestigialEndpoint: {
					revision: tag1,
					localId: brand(3),
				},
				count: 1,
				changes: change3,
			},
		];
		assert.deepEqual(actual, expected);
	});
});
