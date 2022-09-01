/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalReferencePosition } from "./localReference";
import { ISegment } from "./mergeTreeNodes";
import { SortedSegmentSet } from "./sortedSegmentSet";

export type Trackable = ISegment | LocalReferencePosition;

export class TrackingGroup {
    private readonly segmentSet: SortedSegmentSet<Trackable>;

    constructor() {
        this.segmentSet = new SortedSegmentSet<Trackable>();
    }

    /**
     * @deprecated - use tracked instead.
     * For references positions this will return the underlying segment,
     * which may not match the intention
     */
    public get segments(): readonly ISegment[] {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.segmentSet.items.map((v) => v.isLeaf() ? v : v.getSegment()!);
    }

    public get tracked(): readonly Trackable[] {
        return this.segmentSet.items;
    }

    public get size(): number {
        return this.segmentSet.size;
    }

    public has(trackable: Trackable): boolean {
        return this.segmentSet.has(trackable);
    }

    public link(trackable: Trackable) {
        if (!this.segmentSet.has(trackable)) {
            this.segmentSet.addOrUpdate(trackable);
            trackable.trackingCollection.link(this);
        }
    }

    public unlink(segment: Trackable) {
        if (this.segmentSet.remove(segment)) {
            segment.trackingCollection.unlink(this);
        }
    }
}

export class TrackingGroupCollection {
    public readonly trackingGroups: Set<TrackingGroup>;

    constructor(private readonly trackable: Trackable) {
        this.trackingGroups = new Set<TrackingGroup>();
    }

    public link(trackingGroup: TrackingGroup): void {
        if (trackingGroup) {
            if (!this.trackingGroups.has(trackingGroup)) {
                this.trackingGroups.add(trackingGroup);
            }

            if (!trackingGroup.has(this.trackable)) {
                trackingGroup.link(this.trackable);
            }
        }
    }

    public unlink(trackingGroup: TrackingGroup): void {
        if (trackingGroup.has(this.trackable)) {
            trackingGroup.unlink(this.trackable);
        }
        this.trackingGroups.delete(trackingGroup);
    }

    public copyTo(trackable: Trackable) {
        this.trackingGroups.forEach(
            (sg) => {
                trackable.trackingCollection.link(sg);
            });
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
