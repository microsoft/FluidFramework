/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";
import { testChangeRebaser } from "../../util";

function commutativeRebaser<TChange>(data: {
    compose: (changes: TChange[]) => TChange;
    invert: (changes: TChange) => TChange;
    rebaseAnchors: (anchor: AnchorSet, over: TChange) => void;
}): ChangeRebaser<TChange> {
    return {
        rebase: (change: TChange, over: TChange) => change,
        ...data,
    };
}

const rebaser = commutativeRebaser({
    compose: (changes: number[]) => changes.reduce((a, b) => a + b, 0),
    invert: (change: number) => -change,
    rebaseAnchors: (anchor: AnchorSet, over: number) => {},
});

describe("testChangeRebaser", () => {
    it("test counter with safe integers", () => {
        const output = testChangeRebaser(rebaser, new Set([-1, 2, 3, 0, -2, 4]), (a, b) => a === b);
        assert.equal(output.requirement1, "PASSED");
        assert.equal(output.requirement2, "PASSED");
        assert.equal(output.requirement3, "PASSED");
        assert.equal(output.doUndoPair, "PASSED");
        assert.equal(output.requirement3, "PASSED");
    });

    it("test counter with unsafe integers", () => {
        const output = testChangeRebaser(rebaser, new Set([Number.MAX_SAFE_INTEGER, -10, 2]), (a, b) => a === b);
        assert.equal(output.requirement1, "PASSED");
        assert.notEqual(output.requirement2, "PASSED");
        assert.equal(output.requirement3, "PASSED");
        assert.equal(output.doUndoPair, "PASSED");
        assert.equal(output.sandwichRebase, "PASSED");
    });

    it("test counter of floats with same number of digits", () => {
        const output = testChangeRebaser(
            rebaser,
            new Set([1.1, 1.2]),
            (a, b) => a === b,
        );
        assert.equal(output.requirement1, "PASSED");
        assert.notEqual(output.requirement2, "PASSED");
        assert.equal(output.requirement3, "PASSED");
        assert.equal(output.doUndoPair, "PASSED");
        assert.equal(output.sandwichRebase, "PASSED");
    });

    it("test counter of floats with varying number of digits", () => {
        const output = testChangeRebaser(
            rebaser,
            new Set([1.0, 1.22, -1.222]),
            (a, b) => a === b,
        );
        assert.equal(output.requirement1, "PASSED");
        assert.notEqual(output.requirement2, "PASSED");
        assert.equal(output.requirement3, "PASSED");
        assert.equal(output.doUndoPair, "PASSED");
        assert.equal(output.sandwichRebase, "PASSED");
    });

    // This test case contains all the different "edge case" numbers
    it("test counter with all number types", () => {
        const output = testChangeRebaser(
            rebaser,
            new Set([
                1.0,
                1.22,
                -1.222,
                -0.0,
                0,
                10,
                Number.MAX_VALUE,
                Number.MIN_VALUE,
                Number.POSITIVE_INFINITY,
                Number.NEGATIVE_INFINITY,
                Number.NaN,
                Number.MIN_SAFE_INTEGER,
                Number.MAX_SAFE_INTEGER,
            ]),
            (a, b) => a === b,
        );
        assert.equal(output.requirement1, "PASSED");
        assert.notEqual(output.requirement2, "PASSED");
        assert.equal(output.requirement3, "PASSED");
        assert.equal(output.doUndoPair, "PASSED");
        assert.equal(output.sandwichRebase, "PASSED");
    });
});
