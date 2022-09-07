/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";
import { generateFuzzyCombinedChange } from "./fuzz";

const testSeed = 432167897;

type TestChange = TestChange[] | { I: TestChange; } | { C: TestChange; O: TestChange; } | number;

const testRebaser: ChangeRebaser<TestChange> = {
    compose: (changes: TestChange[]) => changes,
    invert: (change: TestChange) => ({ I: change }),
    rebase: (change: TestChange, over: TestChange) => ({ C: change, O: over }),
    rebaseAnchors: (anchor: AnchorSet, over: TestChange) => {},
};

function generateRandomChange(seed: number) {
    return seed;
}

describe("generateFuzzyCombinedChange", () => {
    it("consistent given the same seed", () => {
        const change1 = generateFuzzyCombinedChange(
            testRebaser,
            generateRandomChange,
            testSeed,
            10,
        );
        const change2 = generateFuzzyCombinedChange(
            testRebaser,
            generateRandomChange,
            testSeed,
            10,
        );
        assert.deepStrictEqual(change1, change2);
    });

    it("generates random combination of changes", () => {
        const change1 = generateFuzzyCombinedChange(
            testRebaser,
            generateRandomChange,
            testSeed,
            15,
        );
        const expected = {
            C: {
                C: {
                    C: [
                        {
                            I: 432167897,
                        },
                        0.9933325823949589,
                    ],
                    O: 0.6981920829135596,
                },
                O: 0.013476674234232933,
            },
            O: 0.9375291806987182,
        };
        assert.deepStrictEqual(change1, expected);
    });
});
