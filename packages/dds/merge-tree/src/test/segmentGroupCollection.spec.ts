/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type ISegmentPrivate } from "../mergeTreeNodes.js";
import { SegmentGroupCollection } from "../segmentGroupCollection.js";
import { TextSegment } from "../textSegment.js";

describe("segmentGroupCollection", () => {
	let segment: ISegmentPrivate;
	let segmentGroups: SegmentGroupCollection;
	beforeEach(() => {
		segment = TextSegment.make("abc");
		segmentGroups = segment.segmentGroups = new SegmentGroupCollection(segment);
	});
	it(".empty", () => {
		assert(segmentGroups.empty);
	});

	it(".size", () => {
		assert.equal(segmentGroups.size, 0);
	});

	it(".enqueue", () => {
		const segmentGroup = { segments: [], localSeq: 1, refSeq: 0 };
		segmentGroups.enqueue(segmentGroup);

		assert(!segmentGroups.empty);
		assert.equal(segmentGroups.size, 1);
		assert.equal(segmentGroup.segments.length, 1);
		assert.equal(segmentGroup.segments[0], segment);
	});

	it(".dequeue", () => {
		const segmentGroup = { segments: [], localSeq: 1, refSeq: 0 };
		segmentGroups.enqueue(segmentGroup);
		const segmentGroupCount = 6;
		while (segmentGroups.size < segmentGroupCount) {
			segmentGroups.enqueue({ segments: [], localSeq: 1, refSeq: 0 });
		}

		const dequeuedSegmentGroup = segmentGroups.dequeue();

		assert.equal(segmentGroups.size, segmentGroupCount - 1);
		assert.equal(dequeuedSegmentGroup?.segments.length, 1);
		assert.equal(dequeuedSegmentGroup.segments[0], segment);
		assert.equal(dequeuedSegmentGroup, segmentGroup);
	});

	it(".copyTo", () => {
		const segmentGroupCount = 6;
		while (segmentGroups.size < segmentGroupCount) {
			segmentGroups.enqueue({ segments: [], localSeq: 1, refSeq: 0 });
		}

		const segmentCopy = TextSegment.make("");
		const segmentGroupCopy = new SegmentGroupCollection(segmentCopy);
		segmentGroups.copyTo(segmentGroupCopy);

		assert.equal(segmentGroups.size, segmentGroupCount);
		assert.equal(segmentGroupCopy.size, segmentGroupCount);

		while (!segmentGroups.empty || !segmentGroupCopy.empty) {
			const segmentGroup = segmentGroups.dequeue();
			const copySegmentGroup = segmentGroupCopy.dequeue();

			assert.equal(segmentGroup, copySegmentGroup);
			assert.equal(segmentGroup?.segments.length, 2);
			assert.equal(segmentGroup.segments[0], segment);
			assert.equal(segmentGroup.segments[1], segmentCopy);
		}
	});
});
