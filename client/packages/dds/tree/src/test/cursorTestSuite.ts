/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonableTreeFromCursor, singleTextCursor } from "../feature-libraries";
import { GlobalFieldKey, LocalFieldKey } from "../schema-stored";

import {
    EmptyKey,
    FieldKey,
    JsonableTree,
    ITreeCursor,
    mapCursorFields,
    CursorLocationType,
    rootFieldKeySymbol,
    symbolFromKey,
    setGenericTreeField,
} from "../tree";
import { brand } from "../util";

export const cursorTestCases: [string, JsonableTree][] = [
    ["minimal", { type: brand("Foo") }],
    ["true boolean", { type: brand("Foo"), value: true }],
    ["false boolean", { type: brand("Foo"), value: false }],
    ["integer", { type: brand("Foo"), value: Number.MIN_SAFE_INTEGER - 1 }],
    ["string", { type: brand("Foo"), value: "test" }],
    ["string with escaped characters", { type: brand("Foo"), value: '\\"\b\f\n\r\t' }],
    ["string with emoticon", { type: brand("Foo"), value: "😀" }],
    [
        "local field",
        {
            type: brand("Foo"),
            fields: { x: [{ type: brand("Bar") }, { type: brand("Foo"), value: 6 }] },
        },
    ],
    [
        "global field",
        {
            type: brand("Foo"),
            globalFields: { x: [{ type: brand("Bar") }] },
        },
    ],
    [
        "multiple local fields",
        {
            type: brand("Foo"),
            fields: {
                a: [{ type: brand("Bar") }],
                b: [{ type: brand("Baz") }],
            },
        },
    ],
    [
        "global and local fields",
        {
            type: brand("Foo"),
            fields: {
                a: [{ type: brand("Bar") }],
            },
            globalFields: { a: [{ type: brand("Baz") }] },
        },
    ],
    [
        "double nested",
        {
            type: brand("Foo"),
            fields: {
                a: [
                    {
                        type: brand("Bar"),
                        fields: { b: [{ type: brand("Baz") }] },
                    },
                ],
            },
        },
    ],
    [
        "complex",
        {
            type: brand("Foo"),
            fields: {
                a: [{ type: brand("Bar") }],
                b: [
                    {
                        type: brand("Bar"),
                        fields: {
                            c: [{ type: brand("Bar"), value: 6 }],
                        },
                    },
                ],
            },
        },
    ],
    [
        "siblings restored on up",
        {
            type: brand("Foo"),
            fields: {
                X: [
                    {
                        type: brand("a"),
                        // Inner node so that when navigating up from it,
                        // The cursor's siblings value needs to be restored.
                        fields: { q: [{ type: brand("b") }] },
                    },
                    { type: brand("c") },
                ],
            },
        },
    ],
];

/**
 * Tests the provided cursor factory with JsonableTree data. The cursor must be JSON compatible.
 * @param cursorName - The name of the cursor used as part of the test suite name.
 * @param factory - Creates the cursor to be tested with or without provided data.
 * @param dataFromCursor - Gets a JsonableTree from the provided cursor.
 */
export function testJsonableTreeCursor<T>(
    cursorName: string,
    cursorFactory: (data: T) => ITreeCursor,
    dataFromCursor: (cursor: ITreeCursor) => T,
    testRooted = true,
): void {
    function dataFromJsonableTree(data: JsonableTree): T {
        // Use text cursor to provide input data
        return dataFromCursor(singleTextCursor(data));
    }

    function factory(data: JsonableTree): ITreeCursor {
        return cursorFactory(dataFromJsonableTree(data));
    }
    describe(`${cursorName} cursor implementation`, () => {
        describe("extract roundtrip", () => {
            for (const [name, data] of cursorTestCases) {
                it(`${name}: ${JSON.stringify(data)}`, () => {
                    const convertedData = dataFromJsonableTree(data);
                    const cursor = cursorFactory(convertedData);
                    const convertedClone = dataFromCursor(cursor);
                    // This assumes `T` works with deepEqual.
                    assert.deepEqual(convertedClone, convertedData);
                    const clone = jsonableTreeFromCursor(cursor);
                    assert.deepEqual(clone, data);
                    // Check objects are actually json compatible
                    const text = JSON.stringify(clone);
                    const parsed = JSON.parse(text);
                    assert.deepEqual(parsed, data);
                });
            }
        });

        testCursors(
            "default test data cursor testing",
            cursorTestCases.map(([name, data]) => ({
                cursorName: name,
                cursor: factory(data),
            })),
        );

        // TODO: revisit spec for forest cursors and root and clarify what should be tested for them regarding Up from root.
        if (testRooted) {
            it("up from root", () => {
                const cursor = factory({ type: brand("Foo") });
                assert.throws(() => cursor.exitNode());
            });
        }

        describe("keys", () => {
            const getFieldKey = (cursor: ITreeCursor) => cursor.getFieldKey();
            const getKeysAsSet = (cursor: ITreeCursor) =>
                new Set(mapCursorFields(cursor, getFieldKey));

            it("object", () => {
                assert.deepEqual(getKeysAsSet(factory({ type: brand("Foo") })), new Set());
                assert.deepEqual(
                    getKeysAsSet(
                        factory({
                            type: brand("Foo"),
                            fields: { x: [{ type: brand("Bar") }] },
                        }),
                    ),
                    new Set([brand<FieldKey>("x")]),
                );
                assert.deepEqual(
                    getKeysAsSet(
                        factory({
                            type: brand("Foo"),
                            fields: {
                                x: [{ type: brand("Bar") }],
                                test: [{ type: brand("Bar"), value: 6 }],
                            },
                        }),
                    ),
                    new Set([brand<FieldKey>("x"), brand<FieldKey>("test")]),
                );
            });

            it("array", () => {
                assert.deepEqual(
                    getKeysAsSet(
                        factory({
                            type: brand("Foo"),
                            fields: { [EmptyKey]: [{ type: brand("Bar"), value: 0 }] },
                        }),
                    ),
                    new Set([EmptyKey]),
                );
                assert.deepEqual(
                    getKeysAsSet(
                        factory({
                            type: brand("Foo"),
                            fields: {
                                [EmptyKey]: [
                                    { type: brand("Bar"), value: "test" },
                                    { type: brand("Bar") },
                                ],
                            },
                        }),
                    ),
                    new Set([EmptyKey]),
                );
            });

            it("string", () => {
                assert.deepEqual(
                    getKeysAsSet(factory({ type: brand("Foo"), value: "" })),
                    new Set(),
                );
                assert.deepEqual(
                    getKeysAsSet(factory({ type: brand("Foo"), value: "test" })),
                    new Set(),
                );
            });

            it("number", () => {
                assert.deepEqual(
                    getKeysAsSet(factory({ type: brand("Foo"), value: 0 })),
                    new Set(),
                );
                assert.deepEqual(
                    getKeysAsSet(factory({ type: brand("Foo"), value: 6.5 })),
                    new Set(),
                );
            });

            it("boolean", () => {
                assert.deepEqual(
                    getKeysAsSet(factory({ type: brand("Foo"), value: false })),
                    new Set(),
                );
                assert.deepEqual(
                    getKeysAsSet(factory({ type: brand("Foo"), value: true })),
                    new Set(),
                );
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
                        cursor.enterField(key);
                        assert.equal(cursor.firstNode(), true);
                        assert.equal(cursor.value, 0);
                        assert.deepEqual(cursor.seekNodes(0), true);
                        assert.equal(cursor.value, 0);
                    });

                    it(`disallows non-zero offset with ${name} map key`, () => {
                        const cursor = factory({
                            type: brand("Foo"),
                            fields: { [key as string]: [{ type: brand("Bar"), value: 0 }] },
                        });
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
                    const cursor = factory({
                        type: brand("Foo"),
                        fields: {
                            [EmptyKey]: [
                                { type: brand("Bar"), value: 0 },
                                { type: brand("Bar"), value: 1 },
                            ],
                        },
                    });
                    cursor.enterField(EmptyKey);
                    assert.equal(cursor.firstNode(), true);
                    assert.equal(cursor.value, 0);
                    assert.deepEqual(cursor.nextNode(), true);
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
                    cursor.enterField(EmptyKey);
                    cursor.enterNode(1);
                    assert.equal(cursor.value, 1);
                    assert.deepEqual(cursor.seekNodes(-1), true);
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
                    const cursor = factory({
                        type: brand("Foo"),
                        fields: {
                            [EmptyKey]: [
                                { type: brand("Bar"), value: 0 },
                                { type: brand("Bar"), value: 1 },
                            ],
                        },
                    });
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

            function expectFound(cursor: ITreeCursor, key: FieldKey, index = 0) {
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

            function expectError(cursor: ITreeCursor, key: FieldKey, index = 0) {
                cursor.enterField(key);
                assert(
                    !(index >= 0) || index >= cursor.getFieldLength(),
                    `.getFieldLength() must exclude index of missing child '${String(
                        key,
                    )}[${index}]'.`,
                );

                assert.throws(
                    () => cursor.enterNode(index),
                    `Must return 'NotFound' for missing child '${String(key)}[${index}]'`,
                );

                cursor.exitField();
            }

            it("Missing key in map throws", () => {
                const cursor = factory({
                    type: brand("Foo"),
                    fields: { [foundKey as string]: [{ type: brand("Bar"), value: true }] },
                });
                expectError(cursor, notFoundKey);

                // A failed navigation attempt should leave the cursor in a valid state.  Verify
                // by subsequently moving to an existing key.
                expectFound(cursor, foundKey);
            });

            it("Out of bounds map index throws", () => {
                const cursor = factory({
                    type: brand("Foo"),
                    fields: { [foundKey as string]: [{ type: brand("Bar"), value: true }] },
                });
                expectError(cursor, foundKey, 1);

                // A failed navigation attempt should leave the cursor in a valid state.  Verify
                // by subsequently moving to an existing key.
                expectFound(cursor, foundKey);
            });

            it("Empty array must not contain 0th item", () => {
                const cursor = factory({ type: brand("Foo"), fields: { [EmptyKey]: [] } });
                expectError(cursor, EmptyKey, 0);
            });

            it("Out of bounds array index throws", () => {
                const cursor = factory({
                    type: brand("Foo"),
                    fields: {
                        [EmptyKey]: [
                            { type: brand("Bar"), value: 0 },
                            { type: brand("Bar"), value: 1 },
                        ],
                    },
                });
                expectError(cursor, EmptyKey, -1);
                expectError(cursor, EmptyKey, 2);

                // A failed navigation attempt should leave the cursor in a valid state.  Verify
                // by subsequently moving to an existing key.
                expectFound(cursor, EmptyKey, 1);
            });
        });

        describe("getPath() and getFieldPath()", () => {
            const parent = testRooted
                ? undefined
                : {
                      parent: undefined,
                      parentField: rootFieldKeySymbol,
                      parentIndex: 0,
                  };

            it("at root", () => {
                const cursor = factory({
                    type: brand("Foo"),
                });
                assert.deepEqual(cursor.getPath(), parent);
            });

            it("getFieldPath in root field", () => {
                const cursor = factory({
                    type: brand("Foo"),
                });
                cursor.enterField(brand("key"));
                assert.deepEqual(cursor.getFieldPath(), {
                    parent,
                    field: "key",
                });
            });

            it("first node in a root field", () => {
                const cursor = factory({
                    type: brand("Foo"),
                    fields: { key: [{ type: brand("Bar"), value: 0 }] },
                });
                cursor.enterField(brand("key"));
                cursor.firstNode();
                assert.deepEqual(cursor.getPath(), {
                    parent,
                    parentField: brand<FieldKey>("key"),
                    parentIndex: 0,
                });
            });

            it("node in a root field", () => {
                const cursor = factory({
                    type: brand("Foo"),
                    fields: {
                        key: [
                            { type: brand("Bar"), value: 0 },
                            { type: brand("Bar"), value: 1 },
                        ],
                    },
                });
                cursor.enterField(brand("key"));
                cursor.enterNode(1);
                assert.deepEqual(cursor.getPath(), {
                    parent,
                    parentField: brand<FieldKey>("key"),
                    parentIndex: 1,
                });
            });

            it("in a nested field", () => {
                const cursor = factory({
                    type: brand("Foo"),
                    fields: {
                        a: [
                            {
                                type: brand("Bar"),
                                fields: { [EmptyKey]: [{ type: brand("Baz") }] },
                            },
                            {
                                type: brand("Bar"),
                                fields: { [EmptyKey]: [{ type: brand("Baz") }] },
                            },
                        ],
                    },
                });
                cursor.enterField(brand("a"));
                cursor.enterNode(1);
                cursor.enterField(EmptyKey);
                const initialPath = {
                    parent,
                    parentField: "a",
                    parentIndex: 1,
                };
                assert.deepEqual(cursor.getFieldPath(), {
                    parent: initialPath,
                    field: EmptyKey,
                });
                cursor.enterNode(0);
                assert.deepEqual(cursor.getPath(), {
                    parent: initialPath,
                    parentField: EmptyKey,
                    parentIndex: 0,
                });
            });
        });

        describe("key tests", () => {
            const testGlobalKey = symbolFromKey(brand("testGlobalKey"));
            const testKeys: FieldKey[] = [
                brand("__proto__"),
                brand("toString"),
                brand("toFixed"),
                brand("hasOwnProperty"),
                EmptyKey,
                testGlobalKey,
                rootFieldKeySymbol,
            ];
            const unrelatedKey: LocalFieldKey = brand("unrelated");
            const unrelatedGlobalKey: GlobalFieldKey = brand("unrelatedGlobal");
            for (const key of testKeys) {
                it(`returns no values for key: ${key.toString()}`, () => {
                    const trees: JsonableTree[] = [
                        // Test an empty tree, and one with unrelated fields
                        { type: brand("Foo") },
                        {
                            type: brand("Foo"),
                            fields: { [unrelatedKey]: [{ type: brand("Foo") }] },
                            globalFields: { [unrelatedGlobalKey]: [{ type: brand("Foo") }] },
                        },
                    ];
                    for (const data of trees) {
                        const cursor = factory({ type: brand("Foo") });
                        cursor.enterField(key);
                        assert.equal(cursor.getFieldLength(), 0);
                    }
                });

                it(`handles values for key: ${key.toString()}`, () => {
                    const tree: JsonableTree = { type: brand("Foo") };
                    const child: JsonableTree[] = [{ type: brand("Bar") }];
                    setGenericTreeField(tree, key, child);
                    const cursor = factory(tree);
                    cursor.enterField(key);
                    assert.equal(cursor.getFieldLength(), 1);
                    cursor.enterNode(0);
                    assert.equal(cursor.type, "Bar");
                });
            }
        });
    });
}

function traverseNode(cursor: ITreeCursor) {
    // Keep track of current node value to check it during ascent
    const originalNodeValue = cursor.value;

    const firstFieldResult = cursor.firstField();
    if (!firstFieldResult) {
        return;
    }

    for (
        let fieldResult: boolean = firstFieldResult;
        fieldResult;
        fieldResult = cursor.nextField()
    ) {
        const expectedKeyLength = cursor.getFieldLength();
        let actualChildNodesTraversed = 0;

        const firstNodeResult = cursor.firstNode();
        if (!firstNodeResult) {
            cursor.exitField();
            break;
        }

        for (
            let nodeResult: boolean = firstNodeResult;
            nodeResult;
            nodeResult = cursor.nextNode()
        ) {
            actualChildNodesTraversed++;
            traverseNode(cursor);
        }

        assert.equal(
            actualChildNodesTraversed,
            expectedKeyLength,
            "Could not traverse expected number of children",
        );
    }

    assert.equal(cursor.value, originalNodeValue);
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
