/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { ChangeRebaser } from "../rebase";
import { AnchorSet } from "../tree";
import { generateFuzzyCombinedChange } from ".";

const testSeed = 432167897;

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

function generateRandomCounterChange(seed: number) {
    return makeRandom(seed).integer(-1000, 1000);
}

describe("Test generateFuzzyCombinedChange function", () => {
    it("consistency of the generateFuzzyCombinedChange using counter field kind.", () => {
        const change1 = generateFuzzyCombinedChange(
            counterRebaser,
            generateRandomCounterChange,
            testSeed,
            10,
        );
        const change2 = generateFuzzyCombinedChange(
            counterRebaser,
            generateRandomCounterChange,
            testSeed,
            10,
        );
        assert.deepStrictEqual(change1, change2);
    });
});
