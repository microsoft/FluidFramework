/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:no-eval
import * as assert from "assert";
import "mocha";
import { compile } from "../src/compiler";

const A1 = 3;
const A2 = 5;

const cells = new Map<string, number>([
    ["A1", A1],
    ["A2", A2],
]);

// Simple cell resolver that just looks up the cell address in a map.
const cellResolver = ($: RegExpExecArray) => `_.get("${$[1]}")`;

describe("compiler", () => {
    function test(testCase: string) {
        const expected = eval(testCase);
        const formula = `=${testCase}`;
        it(`${formula} -> ${expected}`, () => {
            const actual = compile(formula, cellResolver)(cells);
            assert.strictEqual(actual, expected);
        });
    }

    [
        "A1",
        "A2",
        "A1 + A2",
        "A1 - A2",
        "A1 * A2",
        "A1 / A2",
        "(A1 + A2) / A1",
        "A1 / (A2 - A1)",
    ].map(test);
});
