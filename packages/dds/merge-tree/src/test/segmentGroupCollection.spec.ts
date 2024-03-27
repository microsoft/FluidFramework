/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISegment } from "../mergeTreeNodes.js";
import { TextSegment } from "../textSegment.js";

describe("segmentGroupCollection", () => {
	let segment: ISegment;
	beforeEach(() => {
		segment = TextSegment.make("abc");
	});
	it(".empty", () => {
		assert(segment.segmentGroups.empty);
	});

	it(".size", () => {
		assert.equal(segment.segmentGroups.size, 0);
	});

	it(".enqueue", () => {
		const segmentGroup = { segments: [], localSeq: 1, refSeq: 0 };
		segment.segmentGroups.enqueue(segmentGroup);

		assert(!segment.segmentGroups.empty);
		assert.equal(segment.segmentGroups.size, 1);
		assert.equal(segmentGroup.segments.length, 1);
		assert.equal(segmentGroup.segments[0], segment);
	});

	it(".dequeue", () => {
		const segmentGroup = { segments: [], localSeq: 1, refSeq: 0 };
		segment.segmentGroups.enqueue(segmentGroup);
		const segmentGroupCount = 6;
		while (segment.segmentGroups.size < segmentGroupCount) {
			segment.segmentGroups.enqueue({ segments: [], localSeq: 1, refSeq: 0 });
		}

		const dequeuedSegmentGroup = segment.segmentGroups.dequeue();

		assert.equal(segment.segmentGroups.size, segmentGroupCount - 1);
		assert.equal(dequeuedSegmentGroup?.segments.length, 1);
		assert.equal(dequeuedSegmentGroup.segments[0], segment);
		assert.equal(dequeuedSegmentGroup, segmentGroup);
	});

	it(".copyTo", () => {
		const segmentGroupCount = 6;
		while (segment.segmentGroups.size < segmentGroupCount) {
			segment.segmentGroups.enqueue({ segments: [], localSeq: 1, refSeq: 0 });
		}

		const segmentCopy = TextSegment.make("");
		segment.segmentGroups.copyTo(segmentCopy);

		assert.equal(segment.segmentGroups.size, segmentGroupCount);
		assert.equal(segmentCopy.segmentGroups.size, segmentGroupCount);

		while (!segment.segmentGroups.empty || !segmentCopy.segmentGroups.empty) {
			const segmentGroup = segment.segmentGroups.dequeue();
			const copySegmentGroup = segmentCopy.segmentGroups.dequeue();

			assert.equal(segmentGroup, copySegmentGroup);
			assert.equal(segmentGroup?.segments.length, 2);
			assert.equal(segmentGroup.segments[0], segment);
			assert.equal(segmentGroup.segments[1], segmentCopy);
		}
	});
});
