/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { List, ListMakeHead } from "./collections";
import { ISegment, SegmentGroup } from "./mergeTreeNodes";

export class SegmentGroupCollection {
    private readonly segmentGroups: List<SegmentGroup>;

    constructor(private readonly segment: ISegment) {
        this.segmentGroups = ListMakeHead<SegmentGroup>();
    }

    public get size() {
        return this.segmentGroups.count();
    }

    public get empty() {
        return this.segmentGroups.empty();
    }

    public enqueue(segmentGroup: SegmentGroup) {
        this.segmentGroups.enqueue(segmentGroup);
        segmentGroup.segments.push(this.segment);
    }

    public dequeue(): SegmentGroup | undefined {
        return this.segmentGroups.dequeue();
    }

    public pop?(): SegmentGroup | undefined {
        return this.segmentGroups.pop ? this.segmentGroups.pop() : undefined;
    }

    public clear() {
        this.segmentGroups.clear();
    }

    public copyTo(segment: ISegment) {
        this.segmentGroups.walk((sg) => segment.segmentGroups.enqueue(sg));
    }
}
