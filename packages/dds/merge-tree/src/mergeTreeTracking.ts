/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalReferencePosition } from "./localReference";
import { ISegment } from "./mergeTreeNodes";
import { SortedSegmentSet } from "./sortedSegmentSet";

export type Trackable = ISegment | LocalReferencePosition;

export interface ITrackingGroup {
	/**
	 * @deprecated - use tracked instead.
	 * For references positions this will return the underlying segment,
	 * which may not match the intention
	 */
	segments: readonly ISegment[];
	tracked: readonly Trackable[];
	size: number;
	has(trackable: Trackable): boolean;
	link(trackable: Trackable): void;
	unlink(trackable: Trackable): boolean;
}

export class TrackingGroup implements ITrackingGroup {
	private readonly trackedSet: SortedSegmentSet<Trackable>;

	constructor() {
		this.trackedSet = new SortedSegmentSet<Trackable>();
	}

	/**
	 * @deprecated - use tracked instead.
	 * For references positions this will return the underlying segment,
	 * which may not match the intention
	 */
	public get segments(): readonly ISegment[] {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.trackedSet.items.map((v) => (v.isLeaf() ? v : v.getSegment()!));
	}

	public get tracked(): readonly Trackable[] {
		return this.trackedSet.items;
	}

	public get size(): number {
		return this.trackedSet.size;
	}

	public has(trackable: Trackable): boolean {
		return this.trackedSet.has(trackable);
	}

	public link(trackable: Trackable): void {
		if (!this.trackedSet.has(trackable)) {
			this.trackedSet.addOrUpdate(trackable);
			trackable.trackingCollection.link(this);
		}
	}

	public unlink(trackable: Trackable): boolean {
		if (this.trackedSet.remove(trackable)) {
			trackable.trackingCollection.unlink(this);
			return true;
		}
		return false;
	}
}

/**
 * Tracking group backed by an unordered set. Lookup, insertion, and deletion are O(1)
 */
export class UnorderedTrackingGroup implements ITrackingGroup {
	private readonly trackedSet: Set<Trackable>;

	constructor() {
		this.trackedSet = new Set<Trackable>();
	}

	/**
	 * @deprecated - use tracked instead.
	 * For references positions this will return the underlying segment,
	 * which may not match the intention
	 */
	public get segments(): readonly ISegment[] {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return Array.from(this.trackedSet.keys(), (v) => (v.isLeaf() ? v : v.getSegment()!));
	}

	public get tracked(): readonly Trackable[] {
		return Array.from(this.trackedSet);
	}

	public get size(): number {
		return this.trackedSet.size;
	}

	public has(trackable: Trackable): boolean {
		return this.trackedSet.has(trackable);
	}

	public link(trackable: Trackable): void {
		if (!this.trackedSet.has(trackable)) {
			this.trackedSet.add(trackable);
			// Unsafe cast here is necessary to avoid a breaking change to
			// `TrackingGroupCollection`. `UnorderedTrackingGroup` and `TrackingGroup`
			// _do_ overlap in every way except for private fields which should
			// be inaccessible.
			//
			// This cast should be removed in a future breaking release
			trackable.trackingCollection.link(this as any as TrackingGroup);
		}
	}

	public unlink(trackable: Trackable): boolean {
		if (this.trackedSet.delete(trackable)) {
			// Unsafe cast here is necessary to avoid a breaking change to
			// `TrackingGroupCollection`. `UnorderedTrackingGroup` and `TrackingGroup`
			// _do_ overlap in every way except for private fields which should
			// be inaccessible.
			//
			// This cast should be removed in a future breaking release
			trackable.trackingCollection.unlink(this as any as TrackingGroup);
			return true;
		}
		return false;
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

	public unlink(trackingGroup: TrackingGroup): boolean {
		if (this.trackingGroups.has(trackingGroup)) {
			if (trackingGroup.has(this.trackable)) {
				trackingGroup.unlink(this.trackable);
			}
			this.trackingGroups.delete(trackingGroup);
			return true;
		}

		return false;
	}

	public copyTo(trackable: Trackable) {
		this.trackingGroups.forEach((sg) => {
			trackable.trackingCollection.link(sg);
		});
	}

	public get empty(): boolean {
		return this.trackingGroups.size === 0;
	}

	public matches(trackingCollection: TrackingGroupCollection): boolean {
		if (
			!trackingCollection ||
			this.trackingGroups.size !== trackingCollection.trackingGroups.size
		) {
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
