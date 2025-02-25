/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import cloneDeep from "lodash/cloneDeep";

import { assert } from "./assert";

/**
 * A range in the {@link RangeTracker}
 *
 * @deprecated No replacement.
 * @internal
 */
export interface IRange {
	primary: number;
	secondary: number | undefined;
	length: number;
}

/**
 * A serialized version of the {@link RangeTracker}
 *
 * @deprecated No replacement.
 * @internal
 */
export interface IRangeTrackerSnapshot {
	ranges: IRange[];
	lastPrimary: number;
	lastSecondary: number | undefined;
}

/**
 * Helper class that keeps track of the relation between two ranges in a 1:N fashion. Primary
 * is continuous and always maps to a single value in secondary above the base value. The range
 * defines an increasing step function.
 *
 * Used by deli to keep track of the branch map
 *
 * @deprecated No replacement.
 * @internal
 */
export class RangeTracker {
	private ranges: IRange[];
	private lastPrimary: number;
	private lastSecondary: number | undefined;

	get base(): number {
		return this.ranges[0].primary;
	}

	/**
	 * Getter for the last primary that was added
	 *
	 * @returns last primary that was added
	 */
	get primaryHead(): number {
		return this.lastPrimary;
	}

	/**
	 * Getter for the last secondary that was added
	 *
	 * @returns last secondary that was added
	 */
	get secondaryHead(): number | undefined {
		return this.lastSecondary;
	}

	constructor(primary: IRangeTrackerSnapshot);
	constructor(primary: number, secondary: number);
	constructor(primary: IRangeTrackerSnapshot | number, secondary?: number) {
		if (typeof primary === "number") {
			this.ranges = [{ length: 0, primary, secondary }];
			this.lastPrimary = primary;
			this.lastSecondary = secondary;
		} else {
			this.ranges = cloneDeep(primary.ranges);
			this.lastPrimary = primary.lastPrimary;
			this.lastSecondary = primary.lastSecondary;
		}
	}

	/**
	 * Returns a serialized form of the RangeTracker
	 */
	public serialize(): IRangeTrackerSnapshot {
		return {
			lastPrimary: this.lastPrimary,
			lastSecondary: this.lastSecondary,
			ranges: cloneDeep(this.ranges),
		};
	}

	/**
	 * Add a primary, secondary pair to the range
	 *
	 * @param primary - the primary number in the range
	 * @param secondary - the secondary number in the range
	 */
	public add(primary: number, secondary: number): void {
		// Both values must continuously be increasing - we won't always track the last value we saw so we do so
		// below to check invariants
		assert(primary >= this.lastPrimary, 0x003 /* "Primary to add to range < last primary!" */);
		if (this.lastSecondary !== undefined) {
			assert(
				secondary >= this.lastSecondary,
				0x004 /* "Secondary to add to range < last secondary!" */,
			);
		}
		this.lastPrimary = primary;
		this.lastSecondary = secondary;

		// Get quicker references to the head of the range
		const head = this.ranges[this.ranges.length - 1];
		const primaryHead = head.primary + head.length;
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const secondaryHead = head.secondary! + head.length;

		// Same secondary indicates this is not a true inflection point - we can ignore it
		if (secondary === secondaryHead) {
			return;
		}

		// New secondary - need to update the ranges
		if (primary === primaryHead) {
			// Technically this code path has us supporting N:N ranges. But we simply overwrite duplicate values to
			// preserve 1:N since you can only lookup from the primary to a secondary
			if (head.length === 0) {
				// No range represented - we can simply update secondary with the overwritten value
				head.secondary = secondary;
			} else {
				// The values in the range before this one are valid - but we need to create a new one for this update
				head.length--;
				this.ranges.push({ length: 0, primary, secondary });
			}
		} else {
			if (primaryHead + 1 === primary && secondaryHead + 1 === secondary) {
				// Extend the length if both increase by the same amount
				head.length++;
			} else {
				// Insert a new node
				this.ranges.push({ length: 0, primary, secondary });
			}
		}
	}

	/**
	 * Get the closest range to the primary
	 *
	 * @param primary - the primary value to look for
	 * @returns the closest range to the primary
	 */
	public get(primary: number): number {
		assert(
			primary >= this.ranges[0].primary,
			0x005 /* "Target primary to retrieve < first range's primary!" */,
		);

		// Find the first range where the starting position is greater than the primary. Our target range is
		// the one before it.
		let index = 1;
		for (; index < this.ranges.length; index++) {
			if (primary < this.ranges[index].primary) {
				break;
			}
		}
		assert(
			primary >= this.ranges[index - 1].primary,
			0x006 /* "Target primary to retrieve < last range's primary!" */,
		);

		// If the difference is within the stored range use it - otherwise add in the length - 1 as the highest
		// stored secondary value to use.
		const closestRange = this.ranges[index - 1];
		return (
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			Math.min(primary - closestRange.primary, closestRange.length) + closestRange.secondary!
		);
	}

	/**
	 * Update the range of primary
	 *
	 * @param primary - the primary value to update
	 */
	public updateBase(primary: number): void {
		assert(
			primary >= this.ranges[0].primary,
			0x007 /* "Target primary to update < first range's primary!" */,
		);

		// Walk the ranges looking for the first one that is greater than the primary. Primary is then within the
		// previous index by definition (since it's less than the current index's primary but greather than the
		// previous index's primary) and we know primary must be greater than the base.
		let index = 1;
		for (; index < this.ranges.length; index++) {
			if (primary < this.ranges[index].primary) {
				break;
			}
		}
		assert(
			primary >= this.ranges[index - 1].primary,
			0x008 /* "Target primary to update < last range's primary!" */,
		);

		// Update the last range values
		const range = this.ranges[index - 1];
		const delta = primary - range.primary;
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		range.secondary = range.secondary! + Math.min(delta, range.length);
		range.length = Math.max(range.length - delta, 0);
		range.primary = primary;

		// And remove unnecessary ranges
		this.ranges = index - 1 > 0 ? this.ranges.slice(index - 1) : this.ranges;

		// Assert that the lowest value is now the input to this method
		assert(
			primary === this.ranges[0].primary,
			0x009 /* "After update, target primary is not first range's primary!" */,
		);
	}
}
