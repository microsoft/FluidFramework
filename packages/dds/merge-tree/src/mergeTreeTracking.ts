/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalReferencePosition } from "./localReference.js";
import { ISegment } from "./mergeTreeNodes.js";
import { SortedSegmentSet } from "./sortedSegmentSet.js";

/**
 * @legacy
 * @alpha
 */
export type Trackable = ISegment | LocalReferencePosition;

/**
 * @legacy
 * @alpha
 */
export interface ITrackingGroup {
	tracked: readonly Trackable[];
	size: number;
	has(trackable: Trackable): boolean;
	link(trackable: Trackable): void;
	unlink(trackable: Trackable): boolean;
}

/**
 * @legacy
 * @alpha
 */
export class TrackingGroup implements ITrackingGroup {
	private readonly trackedSet: SortedSegmentSet<Trackable>;

	constructor() {
		this.trackedSet = new SortedSegmentSet<Trackable>();
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

	public get tracked(): readonly Trackable[] {
		return [...this.trackedSet];
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
			trackable.trackingCollection.link(this);
		}
	}

	public unlink(trackable: Trackable): boolean {
		if (this.trackedSet.delete(trackable)) {
			trackable.trackingCollection.unlink(this);
			return true;
		}
		return false;
	}
}

/**
 * A collection of {@link ITrackingGroup}.
 * @legacy
 * @alpha
 */
export class TrackingGroupCollection {
	private readonly _trackingGroups: Set<ITrackingGroup>;

	public get trackingGroups(): Set<TrackingGroup> {
		// Cast here is necessary to avoid a breaking change to
		// `TrackingGroupCollection`. Ideally we could just return
		// `Set<ITrackingGroup>`
		return this._trackingGroups as Set<TrackingGroup>;
	}

	constructor(private readonly trackable: Trackable) {
		this._trackingGroups = new Set<ITrackingGroup>();
	}

	public link(trackingGroup: ITrackingGroup): void {
		if (trackingGroup) {
			if (!this._trackingGroups.has(trackingGroup)) {
				this._trackingGroups.add(trackingGroup);
			}

			if (!trackingGroup.has(this.trackable)) {
				trackingGroup.link(this.trackable);
			}
		}
	}

	public unlink(trackingGroup: ITrackingGroup): boolean {
		if (this._trackingGroups.has(trackingGroup)) {
			if (trackingGroup.has(this.trackable)) {
				trackingGroup.unlink(this.trackable);
			}
			this._trackingGroups.delete(trackingGroup);
			return true;
		}

		return false;
	}

	public copyTo(trackable: Trackable): void {
		for (const sg of this._trackingGroups) {
			trackable.trackingCollection.link(sg);
		}
	}

	public get empty(): boolean {
		return this._trackingGroups.size === 0;
	}

	public matches(trackingCollection: TrackingGroupCollection): boolean {
		if (
			!trackingCollection ||
			this._trackingGroups.size !== trackingCollection._trackingGroups.size
		) {
			return false;
		}
		for (const tg of this._trackingGroups.values()) {
			if (!trackingCollection._trackingGroups.has(tg)) {
				return false;
			}
		}
		return true;
	}
}
