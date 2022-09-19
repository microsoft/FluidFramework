/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EmptyKey, ITreeCursor, TreeNavigationResult } from "../../..";
import { FieldKey } from "../../../tree";
// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { cursorToJsonObject, JsonCursor } from "../../../domains/json/jsonCursor";
import { brand } from "../../../util";
import { testCursors } from "../../cursorLegacy.spec";

const testCases = [
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

describe("JsonCursor", () => {
    // This tests that test data roundtrips via extract.
    // This tests a lot of the API, but does not include some things (like "keys" on non-object nodes).
    describe("extract roundtrip", () => {
        for (const [name, testValues] of testCases) {
            for (const expected of testValues) {
                it(`${name}: ${JSON.stringify(expected)}`, () => {
                    const cursor = new JsonCursor(expected);

                    assert.deepEqual(cursorToJsonObject(cursor), expected,
                        "JsonCursor results must match source.");

                    // Read tree a second time to verify that the previous traversal returned the cursor's
                    // internal state machine to the root (i.e., stacks should be empty.)
                    assert.deepEqual(cursorToJsonObject(cursor), expected,
                        "JsonCursor must return same results on second traversal.");
                });
            }
        }
    });

    describe("keys", () => {
        it("object", () => {
            assert.deepEqual([...new JsonCursor({}).keys], []);
            assert.deepEqual([...new JsonCursor({ x: {} }).keys], ["x"]);
            assert.deepEqual(new Set(new JsonCursor({ x: {}, test: 6 }).keys), new Set(["x", "test"]));
        });

        it("array", () => {
            // TODO: should empty arrays report this key?
            assert.deepEqual([...new JsonCursor([]).keys], [EmptyKey]);
            assert.deepEqual([...new JsonCursor([0]).keys], [EmptyKey]);
            assert.deepEqual([...new JsonCursor(["test", {}]).keys], [EmptyKey]);
        });

        it("string", () => {
            assert.deepEqual([...new JsonCursor("").keys], []);
            assert.deepEqual([...new JsonCursor("test").keys], []);
        });

        it("number", () => {
            assert.deepEqual([...new JsonCursor(0).keys], []);
            assert.deepEqual([...new JsonCursor(6.5).keys], []);
        });

        it("boolean", () => {
            assert.deepEqual([...new JsonCursor(false).keys], []);
            assert.deepEqual([...new JsonCursor(true).keys], []);
        });
    });

    describe("seek()", () => {
        describe("with map-like node", () => {
            const tests: [string, FieldKey][] = [
                ["non-empty", brand("key")],
                ["empty", EmptyKey],
            ];

            tests.forEach(([name, key]) => {
                it(`permits offset of zero with ${name} map key`, () => {
                    const cursor = new JsonCursor({ [key as string]: 0 });
                    assert.equal(cursor.down(key, 0), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seek(0), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                });

                it(`disallows non-zero offset with ${name} map key`, () => {
                    const cursor = new JsonCursor({ [key as string]: 0 });
                    assert.equal(cursor.down(key, 0), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seek(1), TreeNavigationResult.NotFound);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seek(-1), TreeNavigationResult.NotFound);
                    assert.equal(cursor.value, 0);
                });
            });
        });

        describe("with array-like node", () => {
            it(`can seek forward`, () => {
                const cursor = new JsonCursor([0, 1]);
                assert.equal(cursor.down(EmptyKey, 0), TreeNavigationResult.Ok);
                assert.equal(cursor.value, 0);
                assert.deepEqual(cursor.seek(1), TreeNavigationResult.Ok);
                assert.equal(cursor.value, 1);
            });

            it(`can seek backward`, () => {
                const cursor = new JsonCursor([0, 1]);
                assert.equal(cursor.down(EmptyKey, 1), TreeNavigationResult.Ok);
                assert.equal(cursor.value, 1);
                assert.deepEqual(cursor.seek(-1), TreeNavigationResult.Ok);
                assert.equal(cursor.value, 0);
            });

            it(`can not seek past end of array`, () => {
                const cursor = new JsonCursor([0, 1]);
                assert.equal(cursor.down(EmptyKey, 1), TreeNavigationResult.Ok);
                assert.equal(cursor.value, 1);
                assert.deepEqual(cursor.seek(1), TreeNavigationResult.NotFound);
                assert.equal(cursor.value, 1);
            });

            it(`can not seek before beginning of array`, () => {
                const cursor = new JsonCursor([0, 1]);
                assert.equal(cursor.down(EmptyKey, 0), TreeNavigationResult.Ok);
                assert.equal(cursor.value, 0);
                assert.deepEqual(cursor.seek(-1), TreeNavigationResult.NotFound);
                assert.equal(cursor.value, 0);
            });
        });
    });

    describe("TreeNavigationResult", () => {
        const notFoundKey: FieldKey = brand("notFound");
        const foundKey: FieldKey = brand("found");

        function expectFound(cursor: ITreeCursor, key: FieldKey, index = 0) {
            assert(0 <= index && index < cursor.length(key),
                `.length() must include index of existing child '${String(key)}[${index}]'.`);

            assert.equal(cursor.down(key, index), TreeNavigationResult.Ok,
                `Must navigate to child '${String(key)}[${index}]'.`);
        }

        function expectNotFound(cursor: ITreeCursor, key: FieldKey, index = 0) {
            assert(!(index >= 0) || index >= cursor.length(key),
                `.length() must exclude index of missing child '${String(key)}[${index}]'.`);

            assert.equal(cursor.down(key, index), TreeNavigationResult.NotFound,
                `Must return 'NotFound' for missing child '${String(key)}[${index}]'`);
        }

        it("Missing key in map returns NotFound", () => {
            const cursor = new JsonCursor({ [foundKey as string]: true });
            expectNotFound(cursor, notFoundKey);

            // A failed navigation attempt should leave the cursor in a valid state.  Verify
            // by subsequently moving to an existing key.
            expectFound(cursor, foundKey);
        });

        it("Out of bounds map index returns NotFound", () => {
            const cursor = new JsonCursor({ [foundKey as string]: true });
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

const cursors: { cursorName: string; cursor: ITreeCursor; }[] = [];

for (const [name, testValues] of testCases) {
    for (const data of testValues) {
        cursors.push({
            cursorName: `${name}: ${JSON.stringify(data)}`,
            cursor: new JsonCursor(data),
        });
    }
}

testCursors("JsonCursor", cursors);
