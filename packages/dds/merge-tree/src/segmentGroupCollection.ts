/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DoublyLinkedList, walkList } from "@fluidframework/core-utils/internal";

import type { SegmentGroup, ISegmentLeaf } from "./mergeTreeNodes.js";

export class SegmentGroupCollection {
	private readonly segmentGroups: DoublyLinkedList<SegmentGroup>;

	constructor(private readonly segment: ISegmentLeaf) {
		this.segmentGroups = new DoublyLinkedList<SegmentGroup>();
	}

	public get size(): number {
		return this.segmentGroups.length;
	}

	public get empty(): boolean {
		return this.segmentGroups.empty;
	}

	public enqueue(segmentGroup: SegmentGroup): void {
		this.segmentGroups.push(segmentGroup);
		segmentGroup.segments.push(this.segment);
	}

	public dequeue(): SegmentGroup | undefined {
		return this.segmentGroups.shift()?.data;
	}

	public remove(segmentGroup: SegmentGroup): boolean {
		const found = this.segmentGroups.find((v) => v.data === segmentGroup);
		if (found === undefined) {
			return false;
		}
		this.segmentGroups.remove(found);
		return true;
	}

	public pop(): SegmentGroup | undefined {
		return this.segmentGroups.pop ? this.segmentGroups.pop()?.data : undefined;
	}

	public copyTo(segmentGroups: SegmentGroupCollection): void {
		walkList(this.segmentGroups, (sg) => segmentGroups.enqueueOnCopy(sg.data, this.segment));
	}

	/**
	 * Returns the set of property keys touched by annotate ops on this segment with a `localSeq`
	 * strictly greater than the given `localSeq`. Used by the squash resubmit path to filter
	 * out keys that have been overridden by later staged annotates — those values must not be
	 * carried on the wire by the older op.
	 *
	 * For each later segment-group that contains this segment, the per-segment entry in
	 * `previousProps` records the property values that were in effect before the annotate
	 * applied; its keys are therefore the keys the annotate touched.
	 */
	public keysAnnotatedLaterThan(localSeq: number): Set<string> {
		const keys = new Set<string>();
		walkList(this.segmentGroups, (node) => {
			const group = node.data;
			if (
				group.localSeq === undefined ||
				group.localSeq <= localSeq ||
				group.previousProps === undefined
			) {
				return;
			}
			const idx = group.segments.indexOf(this.segment);
			if (idx < 0) {
				return;
			}
			const props = group.previousProps[idx];
			if (props === undefined) {
				return;
			}
			for (const k of Object.keys(props)) {
				keys.add(k);
			}
		});
		return keys;
	}

	private enqueueOnCopy(segmentGroup: SegmentGroup, sourceSegment: ISegmentLeaf): void {
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
