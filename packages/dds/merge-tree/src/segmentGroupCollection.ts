/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DoublyLinkedList, walkList } from "./collections";
// eslint-disable-next-line import/no-deprecated
import { ISegment, SegmentGroup } from "./mergeTreeNodes";

/**
 * @alpha
 */
export class SegmentGroupCollection {
	// eslint-disable-next-line import/no-deprecated
	private readonly segmentGroups: DoublyLinkedList<SegmentGroup>;

	constructor(private readonly segment: ISegment) {
		// eslint-disable-next-line import/no-deprecated
		this.segmentGroups = new DoublyLinkedList<SegmentGroup>();
	}

	public get size() {
		return this.segmentGroups.length;
	}

	public get empty() {
		return this.segmentGroups.empty;
	}

	// eslint-disable-next-line import/no-deprecated
	public enqueue(segmentGroup: SegmentGroup) {
		this.segmentGroups.push(segmentGroup);
		segmentGroup.segments.push(this.segment);
	}

	// eslint-disable-next-line import/no-deprecated
	public dequeue(): SegmentGroup | undefined {
		return this.segmentGroups.shift()?.data;
	}

	// eslint-disable-next-line import/no-deprecated
	public pop?(): SegmentGroup | undefined {
		return this.segmentGroups.pop ? this.segmentGroups.pop()?.data : undefined;
	}

	public copyTo(segment: ISegment) {
		walkList(this.segmentGroups, (sg) =>
			segment.segmentGroups.enqueueOnCopy(sg.data, this.segment),
		);
	}

	// eslint-disable-next-line import/no-deprecated
	private enqueueOnCopy(segmentGroup: SegmentGroup, sourceSegment: ISegment) {
		this.enqueue(segmentGroup);
		if (segmentGroup.previousProps) {
			// duplicate the previousProps for this segment
			const index = segmentGroup.segments.indexOf(sourceSegment);
			if (index !== -1) {
				segmentGroup.previousProps.push(segmentGroup.previousProps[index]);
			}
		}
	}
}
