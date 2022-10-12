/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EmptyKey, ITreeCursorNew, singleJsonCursor, cursorToJsonObjectNew } from "../../..";
import { CursorLocationType, FieldKey, mapCursorFields } from "../../../tree";
import { brand } from "../../../util";
import { testCursors } from "../../cursor.spec";

const testCases = [
    ["null", [null]],
    ["boolean", [true, false]],
    ["integer", [Number.MIN_SAFE_INTEGER - 1, 0, Number.MAX_SAFE_INTEGER + 1]],
    ["finite", [-Number.MAX_VALUE, -Number.MIN_VALUE, -0, Number.MIN_VALUE, Number.MAX_VALUE]],
    ["non-finite", [NaN, -Infinity, +Infinity]],
    ["string", ["", '\\"\b\f\n\r\t', "😀"]],
    ["object", [{}, { one: "field" }, { nested: { depth: 1 } }]],
    ["array", [[], ["oneItem"], [["nested depth 1"]]]],
    [
        "composite",
        [
            {
                n: null,
                b: true,
                i: 0,
                s: "",
                a2: [null, true, 0, "", { n: null, b: true, i: 0, s: "", a2: [] }],
            },
            [null, true, 0, "", { n: null, b: true, i: 0, s: "", a2: [null, true, 0, "", {}] }],
        ],
    ],
];

describe("JsonCursor", () => {
    // This tests that test data roundtrips via extract.
    // This tests a lot of the API, but does not include some things (like "keys" on non-object nodes).
    describe("extract roundtrip", () => {
        for (const [name, testValues] of testCases) {
            for (const expected of testValues) {
                it(`${name}: ${JSON.stringify(expected)}`, () => {
                    const cursor = singleJsonCursor(expected);

                    assert.deepEqual(
                        cursorToJsonObjectNew(cursor),
                        expected,
                        "JsonCursor results must match source.",
                    );

                    // Read tree a second time to verify that the previous traversal returned the cursor's
                    // internal state machine to the root (i.e., stacks should be empty.)
                    assert.deepEqual(
                        cursorToJsonObjectNew(cursor),
                        expected,
                        "JsonCursor must return same results on second traversal.",
                    );
                });
            }
        }
    });

    describe("keys", () => {
        const getFieldKey = (cursor: ITreeCursorNew) => cursor.getFieldKey();
        const getKeysAsSet = (cursor: ITreeCursorNew) =>
            new Set(mapCursorFields(cursor, getFieldKey));

        it("object", () => {
            assert.deepEqual(getKeysAsSet(singleJsonCursor({})), new Set());
            assert.deepEqual(getKeysAsSet(singleJsonCursor({ x: {} })), new Set(["x"]));
            assert.deepEqual(
                getKeysAsSet(singleJsonCursor({ x: {}, test: 6 })),
                new Set(["x", "test"]),
            );
        });

        it("array", () => {
            // TODO: should empty arrays report this key?
            assert.deepEqual(getKeysAsSet(singleJsonCursor([])), new Set([EmptyKey]));
            assert.deepEqual(getKeysAsSet(singleJsonCursor([0])), new Set([EmptyKey]));
            assert.deepEqual(getKeysAsSet(singleJsonCursor(["test", {}])), new Set([EmptyKey]));
        });

        it("string", () => {
            assert.deepEqual(getKeysAsSet(singleJsonCursor("")), new Set());
            assert.deepEqual(getKeysAsSet(singleJsonCursor("test")), new Set());
        });

        it("number", () => {
            assert.deepEqual(getKeysAsSet(singleJsonCursor(0)), new Set());
            assert.deepEqual(getKeysAsSet(singleJsonCursor(6.5)), new Set());
        });

        it("boolean", () => {
            assert.deepEqual(getKeysAsSet(singleJsonCursor(false)), new Set());
            assert.deepEqual(getKeysAsSet(singleJsonCursor(true)), new Set());
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
                    const cursor = singleJsonCursor({ [key as string]: 0 });
                    cursor.enterField(key);
                    assert.equal(cursor.firstNode(), true);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seekNodes(0), true);
                    assert.equal(cursor.value, 0);
                });

                it(`disallows non-zero offset with ${name} map key`, () => {
                    const cursor = singleJsonCursor({ [key as string]: 0 });
                    cursor.enterField(key);
                    assert.equal(cursor.firstNode(), true);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seekNodes(1), false);
                    assert.equal(
                        cursor.mode,
                        CursorLocationType.Fields,
                        "A failed seek will exit the node",
                    );
                    assert.equal(cursor.firstNode(), true);
                    assert.deepEqual(cursor.seekNodes(-1), false);
                    assert.equal(
                        cursor.mode,
                        CursorLocationType.Fields,
                        "A failed seek will exit the node",
                    );
                });
            });
        });

        describe("with array-like node", () => {
            it(`can seek forward`, () => {
                const cursor = singleJsonCursor([0, 1]);
                cursor.enterField(EmptyKey);
                assert.equal(cursor.firstNode(), true);
                assert.equal(cursor.value, 0);
                assert.deepEqual(cursor.nextNode(), true);
                assert.equal(cursor.value, 1);
            });

            it(`can seek backward`, () => {
                const cursor = singleJsonCursor([0, 1]);
                cursor.enterField(EmptyKey);
                cursor.enterNode(1);
                assert.equal(cursor.value, 1);
                assert.deepEqual(cursor.seekNodes(-1), true);
                assert.equal(cursor.value, 0);
            });

            it(`can not seek past end of array`, () => {
                const cursor = singleJsonCursor([0, 1]);
                cursor.enterField(EmptyKey);
                cursor.enterNode(1);
                assert.equal(cursor.value, 1);
                assert.deepEqual(cursor.seekNodes(1), false);
                assert.equal(
                    cursor.mode,
                    CursorLocationType.Fields,
                    "A failed seek will exit the node",
                );
            });

            it(`can not seek before beginning of array`, () => {
                const cursor = singleJsonCursor([0, 1]);
                cursor.enterField(EmptyKey);
                assert.equal(cursor.firstNode(), true);
                assert.equal(cursor.value, 0);
                assert.deepEqual(cursor.seekNodes(-1), false);
                assert.equal(
                    cursor.mode,
                    CursorLocationType.Fields,
                    "A failed seek will exit the node",
                );
            });
        });
    });

    describe("enterNode", () => {
        const notFoundKey: FieldKey = brand("notFound");
        const foundKey: FieldKey = brand("found");

        function expectFound(cursor: ITreeCursorNew, key: FieldKey, index = 0) {
            cursor.enterField(key);
            assert(
                0 <= index && index < cursor.getFieldLength(),
                `.getFieldLength() must include index of existing child '${String(
                    key,
                )}[${index}]'.`,
            );

            assert.doesNotThrow(
                () => cursor.enterNode(index),
                `Must navigate to child '${String(key)}[${index}]'.`,
            );

            cursor.exitNode();
            cursor.exitField();
        }

        function expectError(cursor: ITreeCursorNew, key: FieldKey, index = 0) {
            cursor.enterField(key);
            assert(
                !(index >= 0) || index >= cursor.getFieldLength(),
                `.getFieldLength() must exclude index of missing child '${String(key)}[${index}]'.`,
            );

            assert.throws(
                () => cursor.enterNode(index),
                `Must return 'NotFound' for missing child '${String(key)}[${index}]'`,
            );

            cursor.exitField();
        }

        it("Missing key in map returns NotFound", () => {
            const cursor = singleJsonCursor({ [foundKey as string]: true });
            expectError(cursor, notFoundKey);

            // A failed navigation attempt should leave the cursor in a valid state.  Verify
            // by subsequently moving to an existing key.
            expectFound(cursor, foundKey);
        });

        it("Out of bounds map index returns NotFound", () => {
            const cursor = singleJsonCursor({ [foundKey as string]: true });
            expectError(cursor, foundKey, 1);

            // A failed navigation attempt should leave the cursor in a valid state.  Verify
            // by subsequently moving to an existing key.
            expectFound(cursor, foundKey);
        });

        it("Empty array must not contain 0th item", () => {
            const cursor = singleJsonCursor([]);
            expectError(cursor, EmptyKey, 0);
        });

        it("Out of bounds array index returns NotFound", () => {
            const cursor = singleJsonCursor([0, 1]);
            expectError(cursor, EmptyKey, -1);
            expectError(cursor, EmptyKey, 2);

            // A failed navigation attempt should leave the cursor in a valid state.  Verify
            // by subsequently moving to an existing key.
            expectFound(cursor, EmptyKey, 1);
        });
    });

    for (const [name, data] of testCases) {
        const restrictedKeys: FieldKey[] = [
            brand("__proto__"),
            brand("toString"),
            brand("toFixed"),
            brand("hasOwnProperty"),
        ];

        it(`returns no values for retricted keys on ${name} tree`, () => {
            for (const key of restrictedKeys) {
                const cursor = singleJsonCursor(data);
                cursor.enterField(key);
                assert.equal(cursor.getFieldLength(), 0);
            }
        });
    }
});

const cursors: { cursorName: string; cursor: ITreeCursorNew }[] = [];

for (const [name, testValues] of testCases) {
    for (const data of testValues) {
        cursors.push({
            cursorName: `${name}: ${JSON.stringify(data)}`,
            cursor: singleJsonCursor(data),
        });
    }
}

testCursors("JsonCursor", cursors);
