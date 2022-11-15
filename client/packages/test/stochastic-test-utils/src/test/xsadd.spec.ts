/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { XSadd } from "..";

describe("XSadd (PRNG)", () => {
    it("produces expected values", () => {
        const src = new XSadd(0);
        assert.equal(src.float64(), 0.1471811873526141);
        assert.equal(src.uint32(), 2705912313);
        assert.equal(src.uint53(), 3331857606703893);
    });

    it("matches reference implementation", () => {
        // After scrambling the seed, results in an initial state of:
        // [1208447044, 2481403967, 821779568, 4026114934]
        const src = new XSadd(0);

        // Check that the first 10 results match the original 'C' implementation.
        const actual = [...new Array(10)].map(src.uint32);
        const expected = [
            0x25adaa92,
            0x49104f14,
            0xa148f1f9,
            0x5eb27472,
            0xa2df62bb,
            0xa30fe176,
            0x8eb7f176,
            0xd18f1191,
            0xd3fdea23,
            0x3c834b7d,
        ];

        assert.deepEqual(actual, expected);
    });

    it("Unspecified seed numbers default to zero", () => {
        const same = [
            new XSadd(0),
            new XSadd(0, 0),
            new XSadd(0, 0, 0),
            new XSadd(0, 0, 0, 0),
        ].map((src) => src.uint53());

        for (let i = 1; i < same.length; i++) {
            assert.equal(same[0], same[i]);
        }
    });

    it("Seed is randomly initialized if not specified", () => {
        assert.notEqual(new XSadd().uint53(), new XSadd().uint53());
    });
});
