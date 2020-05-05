/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { List, ListMakeHead } from "./collections";
import { ISegment, SegmentGroup } from "./mergeTree";

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

    public dequeue(): SegmentGroup {
        return this.segmentGroups.dequeue();
    }

    public clear() {
        this.segmentGroups.clear();
    }

    public copyTo(segment: ISegment) {
        this.segmentGroups.walk((sg) => segment.segmentGroups.enqueue(sg));
    }
}
