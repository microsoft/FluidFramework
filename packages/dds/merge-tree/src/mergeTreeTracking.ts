/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalReferencePosition } from "./localReference";
import { ISegment } from "./mergeTree";
import { SortedSegmentSet } from "./sortedSegmentSet";

export type Trackable = ISegment | LocalReferencePosition;

export class TrackingGroup {
    private readonly segmentSet: SortedSegmentSet<Trackable>;

    constructor() {
        this.segmentSet = new SortedSegmentSet();
    }

    public get segments(): readonly Trackable[] {
        return this.segmentSet.items;
    }

    public get size(): number {
        return this.segmentSet.size;
    }

    public has(segment: Trackable): boolean {
        return this.segmentSet.has(segment);
    }

    public link(segment: Trackable) {
        if (!this.segmentSet.has(segment)) {
            this.segmentSet.addOrUpdate(segment);
            segment.trackingCollection?.link(this);
        }
    }

    public unlink(segment: Trackable) {
        if (this.segmentSet.remove(segment)) {
            segment.trackingCollection?.unlink(this);
        }
    }
}

export class TrackingGroupCollection {
    public readonly trackingGroups: Set<TrackingGroup>;

    constructor(private readonly trackable: Trackable) {
        this.trackingGroups = new Set<TrackingGroup>();
    }

    public link(trackingGroup: TrackingGroup) {
        if (trackingGroup) {
            if (!this.trackingGroups.has(trackingGroup)) {
                this.trackingGroups.add(trackingGroup);
            }

            if (!trackingGroup.has(this.trackable)) {
                trackingGroup.link(this.trackable);
            }
        }
    }

    public unlink(trackingGroup: TrackingGroup) {
        if (trackingGroup.has(this.trackable)) {
            trackingGroup.unlink(this.trackable);
        }
        this.trackingGroups.delete(trackingGroup);
    }

    public copyTo(segment: Trackable) {
        this.trackingGroups.forEach(
            (sg) => segment.trackingCollection?.link(sg));
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
