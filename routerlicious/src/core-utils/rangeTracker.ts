import * as assert from "assert";
// tslint:disable-next-line:no-var-requires
const cloneDeep = require("lodash/cloneDeep");

export interface IRange {
    primary: number;
    secondary: number;
    length: number;
}

export interface IRangeTrackerSnapshot {
    ranges: IRange[];
    lastPrimary: number;
    lastSecondary: number;
}

/**
 * Helper class that keeps track of the relation between two ranges in a 1:N fashion. Primary
 * is continuous and always maps to a single value in secondary above the base value. The range
 * defines an increasing step function.
 */
export class RangeTracker {
    private ranges: IRange[];
    private lastPrimary: number;
    private lastSecondary: number;

    get base() {
        return this.ranges[0].primary;
    }

    get primaryHead() {
        return this.lastPrimary;
    }

    get secondaryHead() {
        return this.lastSecondary;
    }

    constructor(primary: IRangeTrackerSnapshot)
    constructor(primary: number, secondary: number)
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

    // primary is time - secondary is the MSN
    public add(primary: number, secondary: number) {
        // Both values must continuously be increasing - we won't always track the last value we saw so we do so
        // below to check invariants
        assert(primary >= this.lastPrimary);
        assert(secondary >= this.lastSecondary);
        this.lastPrimary = primary;
        this.lastSecondary = secondary;

        // Get quicker references to the head of the range
        const head = this.ranges[this.ranges.length - 1];
        const primaryHead = head.primary + head.length;
        const secondaryHead = head.secondary + head.length;

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
                // extend the length if both increase by the same amount
                head.length++;
            } else {
                // Insert a new node
                this.ranges.push({ length: 0, primary, secondary });
            }
        }
    }

    public get(primary: number) {
        assert(primary >= this.ranges[0].primary);

        // Find the first range where the starting position is greater than the primary. Our target range is
        // the one before it.
        let index = 1;
        for (; index < this.ranges.length; index++) {
            if (primary < this.ranges[index].primary) {
                break;
            }
        }
        assert(primary >= this.ranges[index - 1].primary);

        // If the difference is within the stored range use it - otherwise add in the length - 1 as the highest
        // stored secondary value to use.
        const closestRange = this.ranges[index - 1];
        return Math.min(primary - closestRange.primary, closestRange.length) + closestRange.secondary;
    }

    public updateBase(primary: number) {
        assert(primary >= this.ranges[0].primary);

        // Walk the ranges looking for the first one that is greater than the primary. Primary is then within the
        // previous index by definition (since it's less than the current index's primary but greather than the
        // previous index's primary) and we know primary must be greater than the base.
        let index = 1;
        for (; index < this.ranges.length; index++) {
            if (primary < this.ranges[index].primary) {
                break;
            }
        }
        assert(primary >= this.ranges[index - 1].primary);

        // Update the last range values
        const range = this.ranges[index - 1];
        const delta = primary - range.primary;
        range.secondary = range.secondary + Math.min(delta, range.length);
        range.length = Math.max(range.length - delta, 0);
        range.primary = primary;

        // And remove unnecessary ranges
        this.ranges = index - 1 > 0 ? this.ranges.slice(index - 1) : this.ranges;

        // assert that the lowest value is now the input to this method
        assert.equal(primary, this.ranges[0].primary);
    }
}
