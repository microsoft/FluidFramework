/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalReference } from "./localReference";
import { ISegment } from "./mergeTree";
import { SortedSegmentSet } from "./sortedSegmentSet";

// GH #1009 support reference positions in tracking groups here
// likely all segments become ISegment | ReferencePosition
// (ransomr) The references need to be associated with segments
export class SegmentAndReference {
    constructor(readonly segment: ISegment, readonly reference?: LocalReference) {}
}

export class TrackingGroup {
    private readonly segmentSet: SortedSegmentSet<SegmentAndReference>;

    constructor() {
        this.segmentSet = new SortedSegmentSet();
    }

    public get segments(): readonly ISegment[] {
        return this.segmentSet.items.map((item) => item.segment);
    }

    public get segmentAndReferences(): readonly SegmentAndReference[] {
        return this.segmentSet.items;
    }

    public get size(): number {
        return this.segmentSet.size;
    }

    public has(segment: ISegment): boolean {
        return this.segmentSet.has({segment});
    }

    public link(segment: ISegment, reference?: LocalReference) {
        // TODO:ransomr We need to support adding reference to segment already in the group
        if (!this.segmentSet.has({segment})) {
            this.segmentSet.addOrUpdate({segment, reference});
            segment.trackingCollection.link(this);
        }
    }

    public unlink(segment: ISegment) {
        if (this.segmentSet.remove({segment})) {
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
