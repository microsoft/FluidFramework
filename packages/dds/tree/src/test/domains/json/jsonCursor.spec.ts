/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EmptyKey, ITreeCursor, singleJsonCursor, cursorToJsonObject } from "../../..";
import { CursorLocationType, FieldKey, mapCursorFields, rootFieldKeySymbol } from "../../../tree";
import { brand, JsonCompatible } from "../../../util";
import { testTreeCursor } from "../../cursorTestSuite";

const testCases: readonly [string, readonly JsonCompatible[]][] = [
    ["null", [null]],
    ["boolean", [true, false]],
    ["integer", [Number.MIN_SAFE_INTEGER - 1, 0, Number.MAX_SAFE_INTEGER + 1]],
    ["finite", [-Number.MAX_VALUE, -Number.MIN_VALUE, Number.MIN_VALUE, Number.MAX_VALUE]],
    // These cases are not supported by JSON.stringify, and thus excluded from testing here (they fail some tests).
    // TODO: determine where in the API surface these unsupported values should be detected and how they should be handled,
    // and test that it is working properly.
    // ["non-finite", [NaN, -Infinity, +Infinity]],
    // ["minus zero", [-0]],
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
                a2: [null, true, 0, "", { n: null, b: true, i: 0, s: "", a2: [0] }],
            },
            [null, true, 0, "", { n: null, b: true, i: 0, s: "", a2: [null, true, 0, "", {}] }],
        ],
    ],
    [
        "problematic field names",
        [
            {
                ["__proto__"]: 1,
                [""]: 2,
                hasOwnProperty: 3,
                toString: 4,
            },
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
                        cursorToJsonObject(cursor),
                        expected,
                        "JsonCursor results must match source.",
                    );

                    // Read tree a second time to verify that the previous traversal returned the cursor's
                    // internal state machine to the root (i.e., stacks should be empty.)
                    assert.deepEqual(
                        cursorToJsonObject(cursor),
                        expected,
                        "JsonCursor must return same results on second traversal.",
                    );
                });
            }
        }
    });

    describe("keys", () => {
        const getFieldKey = (cursor: ITreeCursor) => cursor.getFieldKey();
        const getKeysAsSet = (cursor: ITreeCursor) => new Set(mapCursorFields(cursor, getFieldKey));

        function doesNotHaveKeys(cursor: ITreeCursor, keys: (string | FieldKey)[]): void {
            const actualKeys = getKeysAsSet(cursor);
            for (const key of keys) {
                assert(!actualKeys.has(key as FieldKey));
                cursor.enterField(key as FieldKey);
                assert(!cursor.firstField());
            }
        }

        const unexpectedKeys = [
            "__proto__",
            rootFieldKeySymbol,
            "hasOwnProperty",
            "toString",
            "toFixed",
        ];

        it("object", () => {
            doesNotHaveKeys(singleJsonCursor({}), unexpectedKeys);
            assert.deepEqual(getKeysAsSet(singleJsonCursor({})), new Set());
            assert.deepEqual(getKeysAsSet(singleJsonCursor({ x: {} })), new Set(["x"]));
            assert.deepEqual(
                getKeysAsSet(singleJsonCursor({ x: {}, test: 6 })),
                new Set(["x", "test"]),
            );
        });

        it("array", () => {
            doesNotHaveKeys(singleJsonCursor([]), unexpectedKeys);
            assert.deepEqual(getKeysAsSet(singleJsonCursor([])), new Set([]));
            assert.deepEqual(getKeysAsSet(singleJsonCursor([0])), new Set([EmptyKey]));
            assert.deepEqual(getKeysAsSet(singleJsonCursor(["test", {}])), new Set([EmptyKey]));
        });

        it("string", () => {
            doesNotHaveKeys(singleJsonCursor("x"), unexpectedKeys);
            assert.deepEqual(getKeysAsSet(singleJsonCursor("")), new Set());
            assert.deepEqual(getKeysAsSet(singleJsonCursor("test")), new Set());
        });

        it("number", () => {
            doesNotHaveKeys(singleJsonCursor(0), unexpectedKeys);
            assert.deepEqual(getKeysAsSet(singleJsonCursor(0)), new Set());
            assert.deepEqual(getKeysAsSet(singleJsonCursor(6.5)), new Set());
        });

        it("boolean", () => {
            doesNotHaveKeys(singleJsonCursor(true), unexpectedKeys);
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

            it(`can get a length of array from within the field`, () => {
                const cursor = singleJsonCursor([0, 1]);
                cursor.enterField(EmptyKey);
                assert.equal(cursor.getFieldLength(), 2);
                assert.equal(cursor.firstNode(), true);
            });
        });
    });

    describe("enterNode", () => {
        const notFoundKey: FieldKey = brand("notFound");
        const foundKey: FieldKey = brand("found");

        function expectError(cursor: ITreeCursor, key: FieldKey, index = 0) {
            cursor.enterField(key);
            assert(
                !(index >= 0) || index >= cursor.getFieldLength(),
                `.getFieldLength() must exclude index of missing child '${String(key)}[${index}]'.`,
            );

            assert.throws(
                () => cursor.enterNode(index),
                `Must error for missing child '${String(key)}[${index}]'`,
            );

            cursor.exitField();
        }

        it("Missing key in map errors", () => {
            const cursor = singleJsonCursor({ [foundKey as string]: true });
            expectError(cursor, notFoundKey);
        });

        it("Out of bounds map index errors", () => {
            const cursor = singleJsonCursor({ [foundKey as string]: true });
            expectError(cursor, foundKey, 1);
        });

        it("Empty array must not contain 0th item", () => {
            const cursor = singleJsonCursor([]);
            expectError(cursor, EmptyKey, 0);
        });

        it("Out of bounds array index errors", () => {
            const cursor = singleJsonCursor([0, 1]);
            expectError(cursor, EmptyKey, -1);
            expectError(cursor, EmptyKey, 2);
        });
    });

    for (const [name, cases] of testCases) {
        const restrictedKeys: FieldKey[] = [
            brand("__proto__"),
            brand("toString"),
            brand("toFixed"),
            brand("hasOwnProperty"),
        ];

        if (name !== "problematic field names") {
            it(`returns no values for restricted keys on "${name}" tree`, () => {
                for (const data of cases) {
                    for (const key of restrictedKeys) {
                        const cursor = singleJsonCursor(data);
                        cursor.enterField(key);
                        assert.equal(cursor.getFieldLength(), 0);
                    }
                }
            });
        }
    }

    it(`returns no values for number keys on a non-empty array`, () => {
        const cursor = singleJsonCursor(["oneItem"]);
        cursor.enterField(brand("0"));
        assert.equal(cursor.getFieldLength(), 0);
    });
});

const cursors: { name: string; data: JsonCompatible }[] = [];

for (const [name, testValues] of testCases) {
    for (const data of testValues) {
        cursors.push({
            name: `${name}: ${JSON.stringify(data)}`,
            data,
        });
    }
}

testTreeCursor({
    cursorName: "JsonCursor",
    cursorFactory: singleJsonCursor,
    dataFromCursor: cursorToJsonObject,
    testData: cursors,
    builders: {
        withLocalKeys: (keys) => {
            const obj = {};
            for (const key of keys) {
                Object.defineProperty(obj, key, {
                    enumerable: true,
                    configurable: true,
                    writable: true,
                    value: 5, // Arbitrary child node value
                });
            }
            return obj;
        },
    },
});
