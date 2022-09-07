/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChangeRebaser, verifyChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";

const counterRebaser: ChangeRebaser<number> = {
    compose: (changes: number[]) => changes.reduce((a, b) => a + b, 0),
    invert: (change: number) => -change,
    rebase: (change: number, over: number) => change,
    rebaseAnchors: (anchor: AnchorSet, over: number) => {},
};

const incorrectCounterRebaser: ChangeRebaser<number> = {
    compose: (changes: number[]) => changes.reduce((a, b) => a + b - 1, 0),
    invert: (change: number) => -change + 1,
    rebase: (change: number, over: number) => change + 1,
    rebaseAnchors: (anchor: AnchorSet, over: number) => {},
};

describe("verifyChangeRebaser", () => {
    it("test counter with safe integers", () => {
        const output = verifyChangeRebaser(
            counterRebaser,
            new Set([-1, 2, 3, 0, -2, 4]),
            isEquivalent,
        );
        assert.equal(output.rebaseLeftDistributivity, "Passed");
        assert.equal(output.composeAssociativity, "Passed");
        assert.equal(output.rebaseRightDistributivity, "Passed");
        assert.equal(output.rebaseOverDoUndoPairIsNoOp, "Passed");
        assert.equal(output.rebaseOverUndoRedoPairIsNoOp, "Passed");
        assert.equal(output.composeWithInverseIsNoOp, "Passed");
        assert.equal(output.composeWithEmptyIsNoOp, "Passed");
        assert.equal(output.rebaseOverEmptyIsNoOp, "Passed");
        assert.equal(output.rebaseEmptyIsEmpty, "Passed");
        assert.equal(output.emptyInverseIsEmpty, "Passed");
    });

    it("test counter with unsafe integers", () => {
        const output = verifyChangeRebaser(
            counterRebaser,
            new Set([Number.MAX_SAFE_INTEGER, -10, 2]),
            isEquivalent,
        );
        assert.equal(output.rebaseLeftDistributivity, "Passed");
        assert.notEqual(output.composeAssociativity, "Passed");
        assert.equal(output.rebaseRightDistributivity, "Passed");
        assert.equal(output.rebaseOverDoUndoPairIsNoOp, "Passed");
        assert.equal(output.rebaseOverUndoRedoPairIsNoOp, "Passed");
        assert.equal(output.composeWithInverseIsNoOp, "Passed");
        assert.equal(output.composeWithEmptyIsNoOp, "Passed");
        assert.equal(output.rebaseOverEmptyIsNoOp, "Passed");
        assert.equal(output.rebaseEmptyIsEmpty, "Passed");
        assert.equal(output.emptyInverseIsEmpty, "Passed");
    });

    it("test incorrect counter with safe integers", () => {
        const output = verifyChangeRebaser(
            incorrectCounterRebaser,
            new Set([-1, 2, 3, 0, -2, 4]),
            isEquivalent,
        );
        assert.notEqual(output.rebaseLeftDistributivity, "Passed");
        assert.notEqual(output.composeAssociativity, "Passed");
        assert.notEqual(output.rebaseRightDistributivity, "Passed");
        assert.notEqual(output.rebaseOverDoUndoPairIsNoOp, "Passed");
        assert.notEqual(output.rebaseOverUndoRedoPairIsNoOp, "Passed");
        assert.notEqual(output.composeWithInverseIsNoOp, "Passed");
        assert.notEqual(output.composeWithEmptyIsNoOp, "Passed");
        assert.notEqual(output.rebaseOverEmptyIsNoOp, "Passed");
        assert.notEqual(output.rebaseEmptyIsEmpty, "Passed");
        assert.notEqual(output.emptyInverseIsEmpty, "Passed");
    });
});

function isEquivalent(a: number, b: number): boolean {
    return a === b || (isNaN(a) && isNaN(b));
}
