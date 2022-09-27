/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChangeRebaser, noFailure, verifyChangeRebaser } from "../../rebase";
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
        assert.deepEqual(output, noFailure);
    });

    it("test counter with unsafe integers", () => {
        const output = verifyChangeRebaser(
            counterRebaser,
            new Set([Number.MAX_SAFE_INTEGER, -10, 2]),
            isEquivalent,
        );
        assert.deepEqual(output.rebaseLeftDistributivity, []);
        assert(output.composeAssociativity.length > 0);
        assert.deepEqual(output.rebaseRightDistributivity, []);
        assert.deepEqual(output.rebaseOverDoUndoPairIsNoOp, []);
        assert.deepEqual(output.rebaseOverUndoRedoPairIsNoOp, []);
        assert.deepEqual(output.composeWithInverseIsNoOp, []);
        assert.deepEqual(output.composeWithEmptyIsNoOp, []);
        assert.deepEqual(output.rebaseOverEmptyIsNoOp, []);
        assert.deepEqual(output.rebaseEmptyIsEmpty, []);
        assert.deepEqual(output.emptyInverseIsEmpty, []);
    });

    it("test incorrect counter with safe integers", () => {
        const output = verifyChangeRebaser(
            incorrectCounterRebaser,
            new Set([-1, 2, 3, 0, -2, 4]),
            isEquivalent,
        );
        assert(output.rebaseLeftDistributivity.length > 0);
        assert(output.composeAssociativity.length > 0);
        assert(output.rebaseRightDistributivity.length > 0);
        assert(output.rebaseOverDoUndoPairIsNoOp.length > 0);
        assert(output.rebaseOverUndoRedoPairIsNoOp.length > 0);
        assert(output.composeWithInverseIsNoOp.length > 0);
        assert(output.composeWithEmptyIsNoOp.length > 0);
        assert(output.rebaseOverEmptyIsNoOp.length > 0);
        assert(output.rebaseEmptyIsEmpty.length > 0);
        assert(output.emptyInverseIsEmpty.length > 0);
    });
});

function isEquivalent(a: number, b: number): boolean {
    return a === b || (isNaN(a) && isNaN(b));
}
