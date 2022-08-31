/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet, FieldKey } from "../../tree";
import { brand, changeCombinator, generateRandomChange, generateRandomUpPaths } from "../../util";

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

describe("Test randomSequenceBuilder", () => {
    it("consistency of generateRandomUpPaths with same seed", () => {
        const fooKey = brand<FieldKey>("foo");
        const upPaths1 = generateRandomUpPaths(fooKey, testSeed, 10);
        const upPaths2 = generateRandomUpPaths(fooKey, testSeed, 10);
        assert.deepStrictEqual(upPaths1, upPaths2);
    });
    it("consistency of the generateRandomChange with the same seed.", () => {
        const fooKey = brand<FieldKey>("foo");
        const upPaths = generateRandomUpPaths(fooKey, testSeed, 10);

        const change1 = generateRandomChange(upPaths, testSeed);
        const change2 = generateRandomChange(upPaths, testSeed);
        assert.deepStrictEqual(change1, change2);
    });
    it("consistency of the changeCombinator using counter field kind.", () => {
        const change1 = changeCombinator(
            counterRebaser,
            (seed) => generateRandomCounterChange(seed),
            testSeed,
            10,
        );
        const change2 = changeCombinator(
            counterRebaser,
            (seed) => generateRandomCounterChange(seed),
            testSeed,
            10,
        );
        assert.deepStrictEqual(change1, change2);
    });
});
