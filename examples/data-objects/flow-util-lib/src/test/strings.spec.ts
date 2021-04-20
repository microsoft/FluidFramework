/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import { strict as assert } from "assert";
import { areStringsEquivalent } from "../string";

function test(left: string | undefined | null, right: string | undefined | null) {
    const isLeftEmpty = left === "" || left === null || left === undefined;
    const isRightEmpty = right === "" || right === null || right === undefined;
    const expected = (isLeftEmpty && isRightEmpty) || left === right;

    const leftAsString = typeof left === "string" ? `'${left}'` : `${left}`;
    const rightAsString = typeof right === "string" ? `'${right}'` : `${right}`;

    it(`${leftAsString} ~= ${rightAsString} -> ${expected}`, () => {
        assert.strictEqual(areStringsEquivalent(left, right), expected);
    });
}

describe("areStringsEquivalent", () => {
    const values = [undefined, null, "", "0", "1"];
    for (const left of values) {
        for (const right of values) {
            test(left, right);
        }
    }
});
