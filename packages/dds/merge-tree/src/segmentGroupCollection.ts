/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-deprecated */

import { List, walkList } from "./collections";
import { ISegment, SegmentGroup } from "./mergeTreeNodes";

export class SegmentGroupCollection {
	private readonly segmentGroups: List<SegmentGroup>;

	constructor(private readonly segment: ISegment) {
		this.segmentGroups = new List<SegmentGroup>();
	}

	public get size() {
		return this.segmentGroups.length;
	}

	public get empty() {
		return this.segmentGroups.empty;
	}

	/**
	 * @deprecated This functionality was not meant to be exported and will be removed in a future release
	 */
	public enqueue(segmentGroup: SegmentGroup) {
		this.segmentGroups.push(segmentGroup);
		segmentGroup.segments.push(this.segment);
	}

	/**
	 * @deprecated This functionality was not meant to be exported and will be removed in a future release
	 */
	public dequeue(): SegmentGroup | undefined {
		return this.segmentGroups.shift()?.data;
	}

	/**
	 * @deprecated This functionality was not meant to be exported and will be removed in a future release
	 */
	public pop?(): SegmentGroup | undefined {
		return this.segmentGroups.pop ? this.segmentGroups.pop()?.data : undefined;
	}

	public copyTo(segment: ISegment) {
		walkList(this.segmentGroups, (sg) =>
			segment.segmentGroups.enqueueOnCopy(sg.data, this.segment),
		);
	}

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
