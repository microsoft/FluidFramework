/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
// eslint-disable-next-line import/no-unassigned-import
import "mocha";
// eslint-disable-next-line import/no-internal-modules
import { lis } from "../src/lis";
import { lis as patience } from "./patience";
import { randomSequence } from "./sequence";

function isIS(seq: number[], sub: number[]) {
    let i = 0;
    for (const k of sub) {
        const next = seq.indexOf(k, i);
        if (!(next >= 0)) {
            return false;
        }
        i = next + 1;
    }

    return true;
}

function expectedLis(seq: number[]) {
    const expected = patience(seq);
    assert(isIS(seq, expected),
        `expectedLis() must return a subsequence of ${JSON.stringify(seq)}, but got ${JSON.stringify(expected)}.`);
    return expected;
}

function checkLis(seq: number[], sub: number[]) {
    const expected = expectedLis(seq);
    const expectedLen = expected.length;

    assert.equal(sub.length, expectedLen,
        // eslint-disable-next-line max-len
        `Subsequence ${JSON.stringify(sub)} of ${JSON.stringify(seq)} must have ${expectedLen} items (like ${JSON.stringify(expected)}), but has ${sub.length}.`);

    assert(isIS(seq, expected),
        `lis() must return a subsequence of ${JSON.stringify(seq)}, but got ${JSON.stringify(expected)}.`);
}

const tests = [
    { seq: [], lis: [] },
    { seq: [4], lis: [4] },
    { seq: [3, 3], lis: [3] },
    { seq: [0, 8, 0], lis: [0, 8] },
];

describe("Longest increasing subsequence", () => {
    for (const test of tests) {
        it(`of ${test.seq}`, () => {
            const seq = test.seq;
            const expected = test.lis;
            checkLis(seq, expected);
            const actual = lis(test.seq);
            checkLis(seq, actual);
            assert.deepStrictEqual(actual, expected);
        });
    }

    for (let i = 1; i < 100; i++) {
        const seq = randomSequence(i);
        it(`of ${seq}`, () => {
            checkLis(seq, lis(seq));
        });
    }
});
