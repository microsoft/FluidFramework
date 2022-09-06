/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";
import { verifyChangeRebaser } from "../../util";

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

const counterRebaser = commutativeRebaser({
    compose: (changes: number[]) => changes.reduce((a, b) => a + b, 0),
    invert: (change: number) => -change,
    rebaseAnchors: (anchor: AnchorSet, over: number) => {},
});

describe("verifyChangeRebaser", () => {
    it("test counter with safe integers", () => {
        const output = verifyChangeRebaser(counterRebaser, new Set([-1, 2, 3, 0, -2, 4]), (a, b) => a === b);
        assert.equal(output.rebaseLeftDistributivity, "PASSED");
        assert.equal(output.composeAssociativity, "PASSED");
        assert.equal(output.rebaseRightDistributivity, "PASSED");
        assert.equal(output.rebaseOverDoUndoPairIsNoOp, "PASSED");
        assert.equal(output.rebaseOverUndoRedoPairIsNoOp, "PASSED");
        assert.equal(output.composeWithInverseIsNoOp, "PASSED");
    });

    it("test counter with unsafe integers", () => {
        const output = verifyChangeRebaser(counterRebaser, new Set([Number.MAX_SAFE_INTEGER, -10, 2]), (a, b) => a === b);
        assert.equal(output.rebaseLeftDistributivity, "PASSED");
        assert.notEqual(output.composeAssociativity, "PASSED");
        assert.equal(output.rebaseRightDistributivity, "PASSED");
        assert.equal(output.rebaseOverDoUndoPairIsNoOp, "PASSED");
        assert.equal(output.rebaseOverUndoRedoPairIsNoOp, "PASSED");
        assert.equal(output.composeWithInverseIsNoOp, "PASSED");
    });

    it("test counter of floats with varying number of digits", () => {
        const output = verifyChangeRebaser(
            counterRebaser,
            new Set([1.0, 1.22, -1.222]),
            (a, b) => a === b,
        );
        assert.equal(output.rebaseLeftDistributivity, "PASSED");
        assert.notEqual(output.composeAssociativity, "PASSED");
        assert.equal(output.rebaseRightDistributivity, "PASSED");
        assert.equal(output.rebaseOverDoUndoPairIsNoOp, "PASSED");
        assert.equal(output.rebaseOverUndoRedoPairIsNoOp, "PASSED");
        assert.equal(output.composeWithInverseIsNoOp, "PASSED");
    });

    // This test case contains all the different "edge case" numbers
    it("test counter with special number types", () => {
        const output = verifyChangeRebaser(
            counterRebaser,
            new Set([
                Number.NaN,
                Number.MAX_VALUE,
                Number.MIN_VALUE,
                Number.POSITIVE_INFINITY,
                Number.NEGATIVE_INFINITY,
                Number.MIN_SAFE_INTEGER,
                Number.MAX_SAFE_INTEGER,
            ]),
            (a, b) => a === b,
        );
        assert.notEqual(output.rebaseLeftDistributivity, "PASSED");
        assert.notEqual(output.composeAssociativity, "PASSED");
        assert.notEqual(output.rebaseRightDistributivity, "PASSED");
        assert.notEqual(output.rebaseOverDoUndoPairIsNoOp, "PASSED");
        assert.equal(output.rebaseOverUndoRedoPairIsNoOp, "PASSED");
        assert.notEqual(output.composeWithInverseIsNoOp, "PASSED");
    });
});
