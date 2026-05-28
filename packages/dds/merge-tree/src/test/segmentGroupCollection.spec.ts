/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	assignChild,
	MergeBlock,
	type ISegmentLeaf,
	type ISegmentPrivate,
	type SegmentGroup,
} from "../mergeTreeNodes.js";
import { SegmentGroupCollection } from "../segmentGroupCollection.js";
import { type IHasInsertionInfo, overwriteInfo } from "../segmentInfos.js";
import { TextSegment } from "../textSegment.js";

describe("segmentGroupCollection", () => {
	let parent: MergeBlock;
	let segment: ISegmentPrivate;
	let segmentGroups: SegmentGroupCollection;
	beforeEach(() => {
		parent = new MergeBlock(1);
		const newSeg = (segment = overwriteInfo<IHasInsertionInfo>(TextSegment.make("abc"), {
			insert: {
				type: "insert",
				clientId: 0,
				seq: 1,
			},
		}));
		assignChild(parent, newSeg, 0);

		segmentGroups = segment.segmentGroups = new SegmentGroupCollection(newSeg);
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

	describe(".previousPropsForSegment", () => {
		it("returns undefined when the group has no previousProps", () => {
			const segmentGroup: SegmentGroup = { segments: [], localSeq: 1, refSeq: 0 };
			segmentGroups.enqueue(segmentGroup);

			assert.equal(segmentGroups.previousPropsForSegment(segmentGroup), undefined);
		});

		it("returns undefined when the segment has no entry in previousProps", () => {
			const otherSegment = overwriteInfo<IHasInsertionInfo>(TextSegment.make("xyz"), {
				insert: {
					type: "insert",
					clientId: 0,
					seq: 1,
				},
			});
			assignChild(parent, otherSegment, parent.childCount++);
			const previousProps = new WeakMap<ISegmentLeaf, { [key: string]: unknown }>();
			const segmentGroup: SegmentGroup = {
				segments: [],
				localSeq: 1,
				refSeq: 0,
				previousProps,
			};
			// Only the unrelated segment has an entry; `segment` does not.
			previousProps.set(otherSegment as ISegmentLeaf, { foo: "bar" });
			segmentGroups.enqueue(segmentGroup);

			assert.equal(segmentGroups.previousPropsForSegment(segmentGroup), undefined);
		});

		it("returns the previousProps entry for the collection's segment", () => {
			const expectedProps = { color: "blue" };
			const previousProps = new WeakMap<ISegmentLeaf, { [key: string]: unknown }>();
			const segmentGroup: SegmentGroup = {
				segments: [],
				localSeq: 1,
				refSeq: 0,
				previousProps,
			};
			previousProps.set(segment as ISegmentLeaf, expectedProps);
			segmentGroups.enqueue(segmentGroup);

			assert.equal(segmentGroups.previousPropsForSegment(segmentGroup), expectedProps);
		});
	});

	it(".copyTo", () => {
		const segmentGroupCount = 6;
		while (segmentGroups.size < segmentGroupCount) {
			segmentGroups.enqueue({ segments: [], localSeq: 1, refSeq: 0 });
		}

		const segmentCopy = overwriteInfo<IHasInsertionInfo>(TextSegment.make(""), {
			insert: {
				type: "insert",
				clientId: 0,
				seq: 1,
			},
		});
		assignChild(parent, segmentCopy, parent.childCount++);

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
