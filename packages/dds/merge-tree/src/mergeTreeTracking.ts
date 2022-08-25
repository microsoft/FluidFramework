/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "./mergeTreeNodes";
import { SortedSegmentSet } from "./sortedSegmentSet";

export class TrackingGroup {
    private readonly segmentSet: SortedSegmentSet;

    constructor() {
        this.segmentSet = new SortedSegmentSet();
    }

    public get segments(): readonly ISegment[] {
        return this.segmentSet.items;
    }

    public get size(): number {
        return this.segmentSet.size;
    }

    public has(segment: ISegment): boolean {
        return this.segmentSet.has(segment);
    }

    public link(segment: ISegment) {
        if (!this.segmentSet.has(segment)) {
            this.segmentSet.addOrUpdate(segment);
            segment.trackingCollection.link(this);
        }
    }

    public unlink(segment: ISegment) {
        if (this.segmentSet.remove(segment)) {
            segment.trackingCollection.unlink(this);
        }
    }
}

export class TrackingGroupCollection {
    public readonly trackingGroups: Set<TrackingGroup>;

    constructor(private readonly segment: ISegment) {
        this.trackingGroups = new Set<TrackingGroup>();
    }

    public link(trackingGroup: TrackingGroup) {
        if (trackingGroup) {
            if (!this.trackingGroups.has(trackingGroup)) {
                this.trackingGroups.add(trackingGroup);
            }

            if (!trackingGroup.has(this.segment)) {
                trackingGroup.link(this.segment);
            }
        }
    }

    public unlink(trackingGroup: TrackingGroup) {
        if (trackingGroup.has(this.segment)) {
            trackingGroup.unlink(this.segment);
        }
        this.trackingGroups.delete(trackingGroup);
    }

    public copyTo(segment: ISegment) {
        this.trackingGroups.forEach(
            (sg) => segment.trackingCollection.link(sg));
    }

    public get empty(): boolean {
        return this.trackingGroups.size === 0;
    }

    public matches(trackingCollection: TrackingGroupCollection): boolean {
        if (!trackingCollection
            || this.trackingGroups.size !== trackingCollection.trackingGroups.size) {
            return false;
        }
        for (const tg of this.trackingGroups.values()) {
            if (!trackingCollection.trackingGroups.has(tg)) {
                return false;
            }
        }
        return true;
    }
}
