/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import * as assert from "assert";
// eslint-disable-next-line import/no-unassigned-import
import "mocha";
// eslint-disable-next-line import/no-internal-modules
import { areStringsEquivalent } from "../src/string";

function test(left: string, right: string) {
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
            // tslint:disable-next-line:mocha-no-side-effect-code
            test(left, right);
        }
    }
});
