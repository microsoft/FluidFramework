/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITreeCursor, TreeNavigationResult } from "../forest";
import { EmptyKey, FieldKey, JsonableTree } from "../tree";
import { brand } from "../util";
import { cursorTestCases } from "./cursor.spec";

/**
 * Tests the provided cursor factory with JsonableTree data. The cursor must be JSON compatible.
 * @param cursorName - The name of the cursor used as part of the test suite name.
 * @param factory - Creates the cursor to be tested with or without provided data.
 * @param dataFromCursor - Gets a JsonableTree from the provided cursor.
 */
export function testJsonableTreeCursor(
    cursorName: string,
    factory: (data: JsonableTree) => ITreeCursor,
    dataFromCursor: (cursor: ITreeCursor) => JsonableTree,
): void {
    describe(`${cursorName} cursor implementation`, () => {
        describe("extract roundtrip", () => {
            for (const [name, data] of cursorTestCases) {
                it(`${name}: ${JSON.stringify(data)}`, () => {
                    const cursor = factory(data);
                    const clone = dataFromCursor(cursor);
                    assert.deepEqual(clone, data);
                    // Check objects are actually json compatible
                    const text = JSON.stringify(clone);
                    const parsed = JSON.parse(text);
                    assert.deepEqual(parsed, data);
                });
            }
        });

        it("up from root", () => {
            const cursor = factory({ type: brand("Foo") });
            assert.equal(cursor.up(), TreeNavigationResult.NotFound);
        });

        describe("keys", () => {
            it("object", () => {
                assert.deepEqual([...factory({ type: brand("Foo") }).keys], []);
                assert.deepEqual(
                    [
                        ...factory({
                            type: brand("Foo"),
                            fields: { x: [{ type: brand("Bar") }] },
                        }).keys,
                    ],
                    ["x"],
                );
                assert.deepEqual(
                    new Set(
                        factory({
                            type: brand("Foo"),
                            fields: {
                                x: [{ type: brand("Bar") }],
                                test: [{ type: brand("Bar"), value: 6 }],
                            },
                        }).keys,
                    ),
                    new Set(["x", "test"]),
                );
            });

            it("array", () => {
                assert.deepEqual(
                    [
                        ...factory({
                            type: brand("Foo"),
                            fields: { [EmptyKey]: [{ type: brand("Bar"), value: 0 }] },
                        }).keys,
                    ],
                    [EmptyKey],
                );
                assert.deepEqual(
                    [
                        ...factory({
                            type: brand("Foo"),
                            fields: {
                                [EmptyKey]: [
                                    { type: brand("Bar"), value: "test" },
                                    { type: brand("Bar") },
                                ],
                            },
                        }).keys,
                    ],
                    [EmptyKey],
                );
            });

            it("string", () => {
                assert.deepEqual([...factory({ type: brand("Foo"), value: "" }).keys], []);
                assert.deepEqual([...factory({ type: brand("Foo"), value: "test" }).keys], []);
            });

            it("number", () => {
                assert.deepEqual([...factory({ type: brand("Foo"), value: 0 }).keys], []);
                assert.deepEqual([...factory({ type: brand("Foo"), value: 6.5 }).keys], []);
            });

            it("boolean", () => {
                assert.deepEqual([...factory({ type: brand("Foo"), value: false }).keys], []);
                assert.deepEqual([...factory({ type: brand("Foo"), value: true }).keys], []);
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
                        const cursor = factory({
                            type: brand("Foo"),
                            fields: { [key as string]: [{ type: brand("Bar"), value: 0 }] },
                        });
                        assert.equal(cursor.down(key, 0), TreeNavigationResult.Ok);
                        assert.equal(cursor.value, 0);
                        assert.deepEqual(cursor.seek(0), TreeNavigationResult.Ok);
                        assert.equal(cursor.value, 0);
                    });

                    it(`disallows non-zero offset with ${name} map key`, () => {
                        const cursor = factory({
                            type: brand("Foo"),
                            fields: { [key as string]: [{ type: brand("Bar"), value: 0 }] },
                        });
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
                    const cursor = factory({
                        type: brand("Foo"),
                        fields: {
                            [EmptyKey]: [
                                { type: brand("Bar"), value: 0 },
                                { type: brand("Bar"), value: 1 },
                            ],
                        },
                    });
                    assert.equal(cursor.down(EmptyKey, 0), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seek(1), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 1);
                });

                it(`can seek backward`, () => {
                    const cursor = factory({
                        type: brand("Foo"),
                        fields: {
                            [EmptyKey]: [
                                { type: brand("Bar"), value: 0 },
                                { type: brand("Bar"), value: 1 },
                            ],
                        },
                    });
                    assert.equal(cursor.down(EmptyKey, 1), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 1);
                    assert.deepEqual(cursor.seek(-1), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                });

                it(`can not seek past end of array`, () => {
                    const cursor = factory({
                        type: brand("Foo"),
                        fields: {
                            [EmptyKey]: [
                                { type: brand("Bar"), value: 0 },
                                { type: brand("Bar"), value: 1 },
                            ],
                        },
                    });
                    assert.equal(cursor.down(EmptyKey, 1), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 1);
                    assert.deepEqual(cursor.seek(1), TreeNavigationResult.NotFound);
                    assert.equal(cursor.value, 1);
                });

                it(`can not seek before beginning of array`, () => {
                    const cursor = factory({
                        type: brand("Foo"),
                        fields: {
                            [EmptyKey]: [
                                { type: brand("Bar"), value: 0 },
                                { type: brand("Bar"), value: 1 },
                            ],
                        },
                    });
                    assert.equal(cursor.down(EmptyKey, 0), TreeNavigationResult.Ok);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.seek(-1), TreeNavigationResult.NotFound);
                    assert.equal(cursor.value, 0);
                });

                it(`can get a length of array from within the field`, () => {
                    const cursor = factory({
                        type: brand("Foo"),
                        fields: {
                            [EmptyKey]: [
                                { type: brand("Bar"), value: 0 },
                                { type: brand("Bar"), value: 1 },
                            ],
                        },
                    });
                    const length = cursor.childFieldLength(EmptyKey);
                    assert.equal(cursor.down(EmptyKey, 0), TreeNavigationResult.Ok);
                    assert.equal(cursor.currentFieldLength(), length);
                });
            });
        });

        describe("TreeNavigationResult", () => {
            const notFoundKey: FieldKey = brand("notFound");
            const foundKey: FieldKey = brand("found");

            function expectFound(
                cursor: ITreeCursor,
                key: FieldKey,
                index = 0,
                childFieldLength = 1,
            ) {
                assert(
                    0 <= index && index < cursor.childFieldLength(key),
                    `.length() must include index of existing child '${String(key)}[${index}]'.`,
                );

                assert.equal(
                    cursor.down(key, index),
                    TreeNavigationResult.Ok,
                    `Must navigate to child '${String(key)}[${index}]'.`,
                );

                assert.equal(
                    cursor.currentFieldLength(),
                    childFieldLength,
                    `A field with existing child '${String(
                        key,
                    )}[${index}]' must have a length '${childFieldLength}'.`,
                );
            }

            function expectNotFound(
                cursor: ITreeCursor,
                key: FieldKey,
                index = 0,
                currentFieldLength = 1,
            ) {
                assert(
                    !(index >= 0) || index >= cursor.childFieldLength(key),
                    `.length() must exclude index of missing child '${String(key)}[${index}]'.`,
                );

                assert.equal(
                    cursor.down(key, index),
                    TreeNavigationResult.NotFound,
                    `Must return 'NotFound' for missing child '${String(key)}[${index}]'`,
                );

                assert.equal(
                    cursor.currentFieldLength(),
                    currentFieldLength,
                    `Must stay at parent field with length '${currentFieldLength}' if 'NotFound'.`,
                );
            }

            it("Missing key in map returns NotFound", () => {
                const cursor = factory({
                    type: brand("Foo"),
                    fields: { [foundKey as string]: [{ type: brand("Bar"), value: true }] },
                });
                expectNotFound(cursor, notFoundKey);

                // A failed navigation attempt should leave the cursor in a valid state.  Verify
                // by subsequently moving to an existing key.
                expectFound(cursor, foundKey);
            });

            it("Out of bounds map index returns NotFound", () => {
                const cursor = factory({
                    type: brand("Foo"),
                    fields: { [foundKey as string]: [{ type: brand("Bar"), value: true }] },
                });
                expectNotFound(cursor, foundKey, 1);

                // A failed navigation attempt should leave the cursor in a valid state.  Verify
                // by subsequently moving to an existing key.
                expectFound(cursor, foundKey);
            });

            it("Empty array must not contain 0th item", () => {
                const cursor = factory({ type: brand("Foo"), fields: { [EmptyKey]: [] } });
                expectNotFound(cursor, EmptyKey, 0);
            });

            it("Out of bounds array index returns NotFound", () => {
                const cursor = factory({
                    type: brand("Foo"),
                    fields: {
                        [EmptyKey]: [
                            { type: brand("Bar"), value: 0 },
                            { type: brand("Bar"), value: 1 },
                        ],
                    },
                });
                expectNotFound(cursor, EmptyKey, -1);
                expectNotFound(cursor, EmptyKey, 2);

                // A failed navigation attempt should leave the cursor in a valid state.  Verify
                // by subsequently moving to an existing key.
                expectFound(cursor, EmptyKey, 1, 2);
            });
        });
    });
}

function traverseNode(cursor: ITreeCursor) {
    // Keep track of current node value to check it during ascent
    const originalNodeValue = cursor.value;

    for (const key of cursor.keys) {
        const expectedKeyLength = cursor.childFieldLength(key);
        let actualChildNodesTraversed = 0;

        const initialResult = cursor.down(key, 0);
        if (initialResult !== TreeNavigationResult.Ok) {
            break;
        }

        for (
            let result: TreeNavigationResult = initialResult;
            result === TreeNavigationResult.Ok;
            result = cursor.seek(1)
        ) {
            actualChildNodesTraversed++;
            traverseNode(cursor);
        }

        cursor.up();
        assert.equal(cursor.value, originalNodeValue);
        assert.equal(
            actualChildNodesTraversed,
            expectedKeyLength,
            "Could not traverse expected number of children",
        );
    }
}

export function testCursors(
    suiteName: string,
    cursors: { cursorName: string; cursor: ITreeCursor }[],
) {
    describe(`${suiteName} cursor functionality`, () => {
        for (const { cursorName, cursor } of cursors) {
            describe(`${cursorName}`, () => {
                it("tree can be traversed", () => {
                    traverseNode(cursor);
                });
            });
        }
    });
}
