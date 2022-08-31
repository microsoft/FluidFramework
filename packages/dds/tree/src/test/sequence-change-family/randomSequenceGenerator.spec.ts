/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FieldKey } from "../../tree";
import { brand, generateRandomChange, generateRandomUpPaths } from "../../util";

const testSeed = 432167897;

describe("Test randomSequenceBuilder", () => {
    it("consistency of generateRandomUpPaths with same seed.", () => {
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
});
