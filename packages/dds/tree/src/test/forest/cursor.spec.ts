/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EmptyKey, ITreeCursor, TreeNavigationResult } from "../..";
import { FieldKey } from "../../tree";
import { JsonCursor, JsonType } from "./jsonCursor";

/**
 * Extract a JS object tree from the contents of the given ITreeCursor.  Assumes that ITreeCursor
 * contains only unaugmented JsonTypes.
 */
export function extract(reader: ITreeCursor): any {
    const type = reader.type;

    switch (type) {
        case JsonType.Number:
        case JsonType.Boolean:
        case JsonType.String:
            return reader.value;
        case JsonType.Array: {
            const length = reader.length(EmptyKey);
            const result = new Array(length);
            for (let index = 0; index < result.length; index++) {
                assert.equal(reader.down(EmptyKey, index), TreeNavigationResult.Ok);
                result[index] = extract(reader);
                assert.equal(reader.up(), TreeNavigationResult.Ok);
            }

            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return result;
        }
        case JsonType.Object: {
            const result: any = {};
            for (const key of reader.keys) {
                assert.equal(reader.down(key, 0), TreeNavigationResult.Ok);
                result[key] = extract(reader);
                assert.equal(reader.up(), TreeNavigationResult.Ok);
            }
            return result;
        }
        default: {
            assert.equal(type, JsonType.Null);
            return null;
        }
    }
}

describe("ITreeCursor", () => {
    describe("down(),up(),keys(),length(),value", () => {
        const tests = [
            ["null", [null]],
            ["boolean", [true, false]],
            ["integer", [Number.MIN_SAFE_INTEGER - 1, 0, Number.MAX_SAFE_INTEGER + 1]],
            ["finite", [-Number.MAX_VALUE, -Number.MIN_VALUE, -0, Number.MIN_VALUE, Number.MAX_VALUE]],
            ["non-finite", [NaN, -Infinity, +Infinity]],
            ["string", ["", "\\\"\b\f\n\r\t", "😀"]],
            ["object", [{}, { one: "field" }, { nested: { depth: 1 } }]],
            ["array", [[], ["oneItem"], [["nested depth 1"]]]],
            ["composite", [
                { n: null, b: true, i: 0, s: "", a2: [null, true, 0, "", { n: null, b: true, i: 0, s: "", a2: [] }] },
                [null, true, 0, "", { n: null, b: true, i: 0, s: "", a2: [null, true, 0, "", {}] }],
            ]],
        ];

        for (const [name, testValues] of tests) {
            for (const expected of testValues) {
                it(`${name}: ${JSON.stringify(expected)}`, () => {
                    const cursor = new JsonCursor(expected);

                    assert.deepEqual(extract(cursor), expected,
                        "JsonCursor results must match source.");

                    // Read tree a second time to verify that the previous traversal returned the cursor's
                    // internal state machine to the root (i.e., stacks should be empty.)
                    assert.deepEqual(extract(cursor), expected,
                        "JsonCursor must return same results on second traversal.");
                });
            }
        }
    });

    describe("seek()", () => {
        describe("with map-like node", () => {
            const tests: [string, FieldKey][] = [
                ["non-empty", "key" as const as FieldKey],
                ["empty", EmptyKey],
            ];

            tests.forEach(([name, key]) => {
                it(`permits offset of zero with ${name} map key`, () => {
                    const cursor = new JsonCursor({ [key]: 0 });
                    assert.equal(cursor.down(key, 0), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seek(0), { result: TreeNavigationResult.Ok, moved: 0 });
                    assert.equal(cursor.value, 0);
                });

                it(`disallows non-zero offset with ${name} map key`, () => {
                    const cursor = new JsonCursor({ [key]: 0 });
                    assert.equal(cursor.down(key, 0), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seek(1), { result: TreeNavigationResult.NotFound, moved: 0 });
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seek(-1), { result: TreeNavigationResult.NotFound, moved: 0 });
                    assert.equal(cursor.value, 0);
                });
            });
        });

        describe("with array-like node", () => {
            it(`can seek forward`, () => {
                const cursor = new JsonCursor([0, 1]);
                assert.equal(cursor.down(EmptyKey, 0), TreeNavigationResult.Ok);
                assert.equal(cursor.value, 0);
                assert.deepEqual(cursor.seek(1), { result: TreeNavigationResult.Ok, moved: 1 });
                assert.equal(cursor.value, 1);
            });

            it(`can seek backward`, () => {
                const cursor = new JsonCursor([0, 1]);
                assert.equal(cursor.down(EmptyKey, 1), TreeNavigationResult.Ok);
                assert.equal(cursor.value, 1);
                assert.deepEqual(cursor.seek(-1), { result: TreeNavigationResult.Ok, moved: -1 });
                assert.equal(cursor.value, 0);
            });

            it(`can not seek past end of array`, () => {
                const cursor = new JsonCursor([0, 1]);
                assert.equal(cursor.down(EmptyKey, 1), TreeNavigationResult.Ok);
                assert.equal(cursor.value, 1);
                assert.deepEqual(cursor.seek(1), { result: TreeNavigationResult.NotFound, moved: 0 });
                assert.equal(cursor.value, 1);
            });

            it(`can not seek before beginning of array`, () => {
                const cursor = new JsonCursor([0, 1]);
                assert.equal(cursor.down(EmptyKey, 0), TreeNavigationResult.Ok);
                assert.equal(cursor.value, 0);
                assert.deepEqual(cursor.seek(-1), { result: TreeNavigationResult.NotFound, moved: 0 });
                assert.equal(cursor.value, 0);
            });
        });
    });

    describe("TreeNavigationResult", () => {
        const notFoundKey = "notFound" as const as FieldKey;
        const foundKey = "found" as const as FieldKey;

        function expectFound(cursor: ITreeCursor, key: FieldKey, index = 0) {
            assert(0 <= index && index < cursor.length(key),
                `.length() must include index of existing child '${key}[${index}]'.`);

            assert.equal(cursor.down(key, index), TreeNavigationResult.Ok,
                `Must navigate to child '${key}[${index}]'.`);
        }

        function expectNotFound(cursor: ITreeCursor, key: FieldKey, index = 0) {
            assert(!(index >= 0) || index >= cursor.length(key),
                `.length() must exclude index of missing child '${key}[${index}]'.`);

            assert.equal(cursor.down(key, index), TreeNavigationResult.NotFound,
                `Must return 'NotFound' for missing child '${key}[${index}]'`);
        }

        it("Missing key in map returns NotFound", () => {
            const cursor = new JsonCursor({ [foundKey]: true });
            expectNotFound(cursor, notFoundKey);

            // A failed navigation attempt should leave the cursor in a valid state.  Verify
            // by subsequently moving to an existing key.
            expectFound(cursor, foundKey);
        });

        it("Out of bounds map index returns NotFound", () => {
            const cursor = new JsonCursor({ [foundKey]: true });
            expectNotFound(cursor, foundKey, 1);

            // A failed navigation attempt should leave the cursor in a valid state.  Verify
            // by subsequently moving to an existing key.
            expectFound(cursor, foundKey);
        });

        it("Empty array must not contain 0th item", () => {
            const cursor = new JsonCursor([]);
            expectNotFound(cursor, EmptyKey, 0);
        });

        it("Out of bounds array index returns NotFound", () => {
            const cursor = new JsonCursor([0, 1]);
            expectNotFound(cursor, EmptyKey, -1);
            expectNotFound(cursor, EmptyKey, 2);

            // A failed navigation attempt should leave the cursor in a valid state.  Verify
            // by subsequently moving to an existing key.
            expectFound(cursor, EmptyKey, 1);
        });
    });
});
