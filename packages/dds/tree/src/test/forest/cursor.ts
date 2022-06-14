/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { strict as assert } from "node:assert";
import { ITreeCursor, TreeKey, TreeNavigationResult } from "../..";
import { JsonCursor, JsonType } from "./jsonCursor";

/**
 * Construct a JS object tree from the contents of the given ITreeCursor.
 * Assumes that ITreeCursor contains only unaugmented JsonTypes.
 */
export function extract(reader: ITreeCursor): any {
    const type = reader.type;

    switch (type) {
        case JsonType.JsonNumber:
        case JsonType.JsonBoolean:
        case JsonType.JsonString:
            return reader.value;
        case JsonType.JsonArray: {
            const length = reader.length("" as TreeKey);
            const result = new Array(length);
            for (let index = 0; index < result.length; index++) {
                assert.equal(reader.down("" as TreeKey, index), TreeNavigationResult.Ok);
                result[index] = extract(reader);
                assert.equal(reader.up(), TreeNavigationResult.Ok);
            }
            return result;
        }
        case JsonType.JsonObject: {
            const result: any = {};
            for (const key of reader.keys) {
                assert.equal(reader.down(key, 0), TreeNavigationResult.Ok);
                result[key] = extract(reader);
                assert.equal(reader.up(), TreeNavigationResult.Ok);
            }
            return result;
        }
        default: {
            assert.equal(type, JsonType.JsonNull);
            return null;
        }
    }
}

describe("ITreeCursor", () => {
    const tests = [
        ["null", [null]],
        ["boolean", [true, false]],
        ["integer", [Number.MIN_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER + 1]],
        ["finite", [-Number.MAX_VALUE, -Number.MIN_VALUE, -0, 0, Number.MIN_VALUE, Number.MAX_VALUE]],
        ["non-finite", [NaN, -Infinity, +Infinity]],
        ["string", ["", "\\\"\b\f\n\r\t", "😀"]],
        ["object", [{}, { one: "field" }, { nested: { depth: 1 } }]],
        ["array", [[], ["oneItem"], [["nested depth 1"]]]],
    ];

    for (const [name, testValues] of tests) {
        for (const expected of testValues) {
            it(`${name}: ${JSON.stringify(expected)}`, () => {
                const reader = new JsonCursor(expected);
                assert.deepEqual(extract(reader), expected,
                    "JsonCursor results must match source.");

                // Verify that traversing the full tree returned the cursor's internal
                // state machine to it's initial state (i.e., stacks should be empty.)
                assert.deepEqual(extract(reader), expected,
                    "JsonCursor must return same results on second traversal.");
            });
        }
    }
});
