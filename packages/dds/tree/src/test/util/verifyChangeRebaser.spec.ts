/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";
import { verifyChangeRebaser } from "../../util";

const counterRebaser: ChangeRebaser<number> = {
    compose: (changes: number[]) => changes.reduce((a, b) => a + b, 0),
    invert: (change: number) => -change,
    rebase: (change: number, over: number) => change,
    rebaseAnchors: (anchor: AnchorSet, over: number) => {},
};

describe("verifyChangeRebaser", () => {
    it("test counter with safe integers", () => {
        const output = verifyChangeRebaser(
            counterRebaser,
            new Set([-1, 2, 3, 0, -2, 4]),
            (a, b) => a === b || (isNaN(a) && isNaN(b)),
        );
        assert.equal(output.rebaseLeftDistributivity, "Passed");
        assert.equal(output.composeAssociativity, "Passed");
        assert.equal(output.rebaseRightDistributivity, "Passed");
        assert.equal(output.rebaseOverDoUndoPairIsNoOp, "Passed");
        assert.equal(output.rebaseOverUndoRedoPairIsNoOp, "Passed");
        assert.equal(output.composeWithInverseIsNoOp, "Passed");
    });

    it("test counter with unsafe integers", () => {
        const output = verifyChangeRebaser(
            counterRebaser,
            new Set([Number.MAX_SAFE_INTEGER, -10, 2]),
            (a, b) => a === b || (isNaN(a) && isNaN(b)),
        );
        assert.equal(output.rebaseLeftDistributivity, "Passed");
        assert.notEqual(output.composeAssociativity, "Passed");
        assert.equal(output.rebaseRightDistributivity, "Passed");
        assert.equal(output.rebaseOverDoUndoPairIsNoOp, "Passed");
        assert.equal(output.rebaseOverUndoRedoPairIsNoOp, "Passed");
        assert.equal(output.composeWithInverseIsNoOp, "Passed");
    });

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
            (a, b) => a === b || (isNaN(a) && isNaN(b)),
        );
        assert.equal(output.rebaseLeftDistributivity, "Passed");
        assert.notEqual(output.composeAssociativity, "Passed");
        assert.equal(output.rebaseRightDistributivity, "Passed");
        assert.equal(output.rebaseOverDoUndoPairIsNoOp, "Passed");
        assert.equal(output.rebaseOverUndoRedoPairIsNoOp, "Passed");
        assert.notEqual(output.composeWithInverseIsNoOp, "Passed");
    });
});
