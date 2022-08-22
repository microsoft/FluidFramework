/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

    public enqueue(segmentGroup: SegmentGroup) {
        this.segmentGroups.push(segmentGroup);
        segmentGroup.segments.push(this.segment);
    }

    public dequeue(): SegmentGroup | undefined {
        return this.segmentGroups.shift()?.data;
    }

    public pop?(): SegmentGroup | undefined {
        return this.segmentGroups.pop ? this.segmentGroups.pop()?.data : undefined;
    }

    /**
     * @deprecated - method is unused and will be removed.
     */
    public clear() {
        while (!this.segmentGroups.empty) {
            this.segmentGroups.remove(this.segmentGroups.first);
        }
    }

    public copyTo(segment: ISegment) {
        walkList(
            this.segmentGroups,
            (sg) => segment.segmentGroups.enqueue(sg.data),
        );
    }
}
