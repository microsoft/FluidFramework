/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { Jsonable } from "@fluidframework/datastore-definitions";
import { ITreeCursor, TreeNavigationResult } from "../forest";
import { JsonCursor, cursorToJsonObject, jsonTypeSchema, jsonNumber, jsonObject } from "../domains";
import { recordDependency } from "../dependency-tracking";
import { clonePath, Delta, detachedFieldAsKey, EmptyKey, FieldKey, JsonableTree, UpPath } from "../tree";
import { jsonableTreeFromCursor } from "../..";
import { brand } from "../util";

const testCases = [
    ["null", [null]],
    ["boolean", [true, false]],
    ["integer", [Number.MIN_SAFE_INTEGER - 1, 0, Number.MAX_SAFE_INTEGER + 1]],
    ["finite", [-Number.MAX_VALUE, -Number.MIN_VALUE, -0, Number.MIN_VALUE, Number.MAX_VALUE]],
    ["non-finite", [NaN, -Infinity, +Infinity]],
    ["string", ["", "\\\"\b\f\n\r\t", "😀"]],
    ["object", [
        {},
        { one: "field" },
        { nested: { depth: 1 } },
        { a: {}, b: {} },
        { b: { c: 6 } },
        { a: {}, b: { c: 6 } },
    ]],
    ["array", [[], ["oneItem"], [["nested depth 1"]]]],
    ["composite", [
        { n: null, b: true, i: 0, s: "", a2: [null, true, 0, "", { n: null, b: true, i: 0, s: "", a2: [] }] },
        [null, true, 0, "", { n: null, b: true, i: 0, s: "", a2: [null, true, 0, "", {}] }],
    ]],
    ["siblings restored on up", [{
        X: [
            {
                // Inner node so that when navigating up from it,
                // The cursor's siblings value needs to be restored.
                q: [{}],
            },
            {},
        ],
    }]],
];

interface CursorTestOptions {
    /**
     * Creates the cursor to be tested with or without provided data.
     */
    factory: (data?: Jsonable) => ITreeCursor;
    /**
     * Extract the contents of the given ITreeCursor as the original data type.
     * Assumes that ITreeCursor contains only unaugmented JsonTypes.
     */
    // cursorToExpected: (cursor: ITreeCursor) => Jsonable;
    checkAdditionalRoundTripRequirements?: (clone: Jsonable, expected: Jsonable) => void;
}

export function testJsonCompatibleCursor<T>(suiteName: string, options: CursorTestOptions): void {
    const {
        factory,
        checkAdditionalRoundTripRequirements,
    } = options;

    describe(`${suiteName} cursor implementation`, () => {
        describe("extract roundtrip", () => {
            for (const [name, testValues] of testCases) {
                for (const expected of testValues) {
                    it(`${name}: ${JSON.stringify(expected)}`, () => {
                        const cursor = factory(expected);

                        assert.deepEqual(cursorToJsonObject(cursor), expected,
                            `${suiteName} results must match source.`);

                        // Read tree a second time to verify that the previous traversal returned the cursor's
                        // internal state machine to the root (i.e., stacks should be empty.)
                        const secondResult = cursorToJsonObject(cursor);
                        assert.deepEqual(secondResult, expected,
                            `${suiteName} must return same results on second traversal.`);

                        checkAdditionalRoundTripRequirements?.call(undefined, secondResult, expected);
                    });
                }
            }
        });

        describe("keys", () => {
            it("object", () => {
                assert.deepEqual([...new JsonCursor({}).keys], []);
                assert.deepEqual([...factory({}).keys], []);
                assert.deepEqual([...factory({ x: {} }).keys], ["x"]);
                assert.deepEqual(new Set(factory({ x: {}, test: 6 }).keys), new Set(["x", "test"]));
            });

            it("array", () => {
                // TODO: should empty arrays report this key?
                assert.deepEqual([...factory([]).keys], [EmptyKey]);
                assert.deepEqual([...factory([0]).keys], [EmptyKey]);
                assert.deepEqual([...factory(["test", {}]).keys], [EmptyKey]);
            });

            it("string", () => {
                assert.deepEqual([...factory("").keys], []);
                assert.deepEqual([...factory("test").keys], []);
            });

            it("number", () => {
                assert.deepEqual([...factory(0).keys], []);
                assert.deepEqual([...factory(6.5).keys], []);
            });

            it("boolean", () => {
                assert.deepEqual([...factory(false).keys], []);
                assert.deepEqual([...factory(true).keys], []);
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
                        const cursor = factory({ [key as string]: 0 });
                        assert.equal(cursor.down(key, 0), TreeNavigationResult.Ok);
                        assert.equal(cursor.value, 0);
                        assert.deepEqual(cursor.seek(0), TreeNavigationResult.Ok);
                        assert.equal(cursor.value, 0);
                    });

                    it(`disallows non-zero offset with ${name} map key`, () => {
                        const cursor = factory({ [key as string]: 0 });
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
                    const cursor = factory([0, 1]);
                    assert.equal(cursor.down(EmptyKey, 0), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seek(1), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 1);
                });

                it(`can seek backward`, () => {
                    const cursor = factory([0, 1]);
                    assert.equal(cursor.down(EmptyKey, 1), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 1);
                    assert.deepEqual(cursor.seek(-1), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                });

                it(`can not seek past end of array`, () => {
                    const cursor = factory([0, 1]);
                    assert.equal(cursor.down(EmptyKey, 1), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 1);
                    assert.deepEqual(cursor.seek(1), TreeNavigationResult.NotFound);
                    assert.equal(cursor.value, 1);
                });

                it(`can not seek before beginning of array`, () => {
                    const cursor = factory([0, 1]);
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
                const cursor = factory({ [foundKey as string]: true });
                expectNotFound(cursor, notFoundKey);

                // A failed navigation attempt should leave the cursor in a valid state.  Verify
                // by subsequently moving to an existing key.
                expectFound(cursor, foundKey);
            });

            it("Out of bounds map index returns NotFound", () => {
                const cursor = factory({ [foundKey as string]: true });
                expectNotFound(cursor, foundKey, 1);

                // A failed navigation attempt should leave the cursor in a valid state.  Verify
                // by subsequently moving to an existing key.
                expectFound(cursor, foundKey);
            });

            it("Empty array must not contain 0th item", () => {
                const cursor = factory([]);
                expectNotFound(cursor, EmptyKey, 0);
            });

            it("Out of bounds array index returns NotFound", () => {
                const cursor = factory([0, 1]);
                expectNotFound(cursor, EmptyKey, -1);
                expectNotFound(cursor, EmptyKey, 2);

                // A failed navigation attempt should leave the cursor in a valid state.  Verify
                // by subsequently moving to an existing key.
                expectFound(cursor, EmptyKey, 1);
            });
        });
    });
}

export function testCursors(
    suiteName: string,
    cursors: { cursorName: string; cursor: ITreeCursor; }[]) {
    describe.only(`${suiteName} cursor functionality`, () => {
        for (const { cursorName, cursor } of cursors) {
            describe(`${cursorName}`, () => {
                it("can traverse the tree", () => {
                    const navigationStack = [];

                    while (cursor.keys !== undefined) {
                        navigationStack.push(cursor.value);

                        for (const key of cursor.keys) {
                            for (let index = 0; index < cursor.length(key); index++) {
                                assert.equal(cursor.down(key, index), TreeNavigationResult.Ok);
                            }
                        }
                    }
                });
            });
        }
    });
}
