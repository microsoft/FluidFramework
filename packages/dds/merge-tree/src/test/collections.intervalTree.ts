/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IInterval, IntervalTree } from "../collections";

class TestInterval implements IInterval {
    constructor(
        public start: number,
        public end: number) { }

    public clone() {
        return new TestInterval(this.start, this.end);
    }

    public compare(b: TestInterval) {
        const startResult = this.compareStart(b);
        return startResult === 0 ? this.compareEnd(b) : startResult;
    }

    public compareStart(b: TestInterval) {
        return this.start - b.start;
    }

    public compareEnd(b: TestInterval) {
        return this.end - b.end;
    }

    public overlaps(b: TestInterval) {
        const result = (this.start <= b.end) &&
            (this.end >= b.start);
        return result;
    }

    public union(b: TestInterval) {
        return new TestInterval(Math.min(this.start, b.start),
            Math.max(this.end, b.end));
    }

    public modify(label: string, start: number, end: number) {
        const startPos = start ?? this.start;
        const endPos = end ?? this.end;
        if (this.start === startPos && this.end === endPos) {
            // Return undefined to indicate that no change is necessary.
            return;
        }
        return new TestInterval(startPos, endPos);
    }
}

describe("Collections.IntervalTree", () => {
    let intervalTree: IntervalTree<TestInterval>;

    beforeEach(() => {
        intervalTree = new IntervalTree<TestInterval>();
    });

    describe(".map", () => {
        it("Should run each node through the given function", () => {
            intervalTree.put(new TestInterval(1, 5));
            intervalTree.put(new TestInterval(4, 8));
            intervalTree.put(new TestInterval(1, 10));

            let range1Pass = false;
            let range2Pass = false;
            let range3Pass = false;

            const map = (interval: TestInterval) => {
                if (interval.start === 1 && interval.end === 5) {
                    range1Pass = true;
                } else if (interval.start === 4 && interval.end === 8) {
                    range2Pass = true;
                } else if (interval.start === 1 && interval.end === 10) {
                    range3Pass = true;
                }
                return true;
            };

            intervalTree.map(map);

            const fullWalk = range1Pass && range2Pass && range3Pass;
            assert.equal(fullWalk, true, "Full walk of the interval tree did not occur");
        });
    });
});
