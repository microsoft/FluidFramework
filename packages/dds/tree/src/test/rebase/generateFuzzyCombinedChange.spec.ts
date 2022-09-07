/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ChangeRebaser } from "../../rebase";
import { AnchorSet } from "../../tree";
import { generateFuzzyCombinedChange } from "./fuzz";

const testSeed = 432167897;

type TChange = TChange[] | { I: TChange; } | { C: TChange; O: TChange; } | string;

const testStringRebaser: ChangeRebaser<TChange> = {
    compose: (changes: TChange[]) => changes,
    invert: (change: TChange) => ({ I: change }),
    rebase: (change: TChange, over: TChange) => ({ C: change, O: over }),
    rebaseAnchors: (anchor: AnchorSet, over: TChange) => {},
};

function generateRandomChange(seed: number) {
    return String(seed);
}

describe("Test generateFuzzyCombinedChange function", () => {
    it("consistency of the generateFuzzyCombinedChange using counter field kind.", () => {
        const change1 = generateFuzzyCombinedChange(
            testStringRebaser,
            generateRandomChange,
            testSeed,
            10,
        );
        const change2 = generateFuzzyCombinedChange(
            testStringRebaser,
            generateRandomChange,
            testSeed,
            10,
        );
        assert.deepStrictEqual(change1, change2);
    });
});
