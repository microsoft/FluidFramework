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
    isLocalKey,
} from "../tree";
import { brand } from "../util";

export const testTrees: readonly (readonly [string, JsonableTree])[] = [
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
 * Tests a cursor implementation.
 * This test suite has a built in set of test cases (based on `testTrees`), so the provided cursor implementation must support all tree contents
 * (not just some specific domain).
 * More specialized cursor implementations should use `testTreeCursor` instead.
 *
 * @param cursorName - The name of the cursor used as part of the test suite name.
 * @param cursorFactory - Creates the cursor to be tested from the provided `TData`.
 * @param dataFromCursor - Constructs a `TData` from the provided cursor (which might not be a `TCursor`).
 * @param extraRoot - setting this to `true` makes the tests expect that `cursorFactory` includes a dummy node above the root,
 * with the data under {@link rootFieldKeySymbol}.
 *
 * @typeParam TData - Format which the cursor reads. Must be JSON compatible.
 * @typeParam TCursor - Type of the cursor being tested.
 */
export function testGeneralPurposeTreeCursor<TData, TCursor extends ITreeCursor>(
    cursorName: string,
    cursorFactory: (data: TData) => TCursor,
    dataFromCursor: (cursor: ITreeCursor) => TData,
    extraRoot?: true,
): void {
    function dataFromJsonableTree(data: JsonableTree): TData {
        // Use text cursor to provide input data
        return dataFromCursor(singleTextCursor(data));
    }

    testTreeCursor<TData, TCursor>({
        cursorName,
        cursorFactory,
        builders: dataFromJsonableTree,
        dataFromCursor,
        testData: testTrees.map(([name, data]) => ({
            name,
            data: dataFromJsonableTree(data),
            expected: data,
        })),
        extraRoot,
    });
}

/**
 * Collection of builders for special cases.
 */
export interface SpecialCaseBuilder<TData> {
    /**
     * Build data for a tree which has the provided keys on its root node.
     * The content of the tree under these keys is arbitrary and up to the implementation.
     */
    withLocalKeys?(keys: LocalFieldKey[]): TData;
    /**
     * Build data for a tree which has the provided keys on its root node.
     * The content of the tree under these keys is arbitrary and up to the implementation.
     */
    withKeys?(keys: FieldKey[]): TData;
}

/**
 * Test suite for cursor implementations.
 * Much of this functionality depends on dataFromJsonableTree, but basic testing can function without it.
 */
/**
 * Tests a cursor implementation.
 * Prefer using `testGeneralPurposeTreeCursor` when possible:
 * `testTreeCursor` should only be used when testing a cursor that is not truly general purpose (can not be build from any arbitrary tree).
 *
 * @param cursorName - The name of the cursor used as part of the test suite name.
 * @param builders - a collection of optional `TData` builders. The more of these are provided, the larger the test suite will be.
 * @param cursorFactory - Creates the cursor to be tested from the provided `TData`.
 * @param dataFromCursor - Constructs a `TData` from the provided cursor (which might not be a `TCursor`).
 * @param testData - A collection of test cases to evaluate the cursor with. Actual content of the tree is only validated if a `reference` is provided:
 * otherwise only basic traversal and API consistency will be checked.
 * @param extraRoot - setting this to `true` makes the tests expect that `cursorFactory` includes a dummy node above the root,
 * with the data under {@link rootFieldKeySymbol}.
 *
 * @typeParam TData - Format which the cursor reads. Must be JSON compatible.
 * @typeParam TCursor - Type of the cursor being tested.
 */
export function testTreeCursor<TData, TCursor extends ITreeCursor>(config: {
    cursorName: string;
    builders: SpecialCaseBuilder<TData> | ((data: JsonableTree) => TData);
    cursorFactory: (data: TData) => TCursor;
    dataFromCursor: (cursor: ITreeCursor) => TData;
    testData: readonly { name: string; data: TData; reference?: JsonableTree }[];
    extraRoot?: true;
}): Mocha.Suite {
    const {
        cursorName,
        cursorFactory,
        dataFromCursor,
        testData,
        extraRoot,
        builders: builder,
    } = config;

    const dataFromJsonableTree = typeof builder === "object" ? undefined : builder;
    const withKeys: undefined | ((keys: FieldKey[]) => TData) =
        typeof builder === "object"
            ? builder.withKeys?.bind
            : (keys: FieldKey[]) => {
                  const root: JsonableTree = {
                      type: brand("Foo"),
                  };
                  for (const key of keys) {
                      const child: JsonableTree = {
                          type: brand("Foo"),
                      };
                      setGenericTreeField(root, key, [child]);
                  }
                  return builder(root);
              };
    const withLocalKeys =
        withKeys ?? (typeof builder === "object" ? builder.withLocalKeys : undefined);

    return describe(`${cursorName} cursor implementation`, () => {
        describe("extract roundtrip", () => {
            for (const { name, data, reference } of testData) {
                if (reference !== undefined) {
                    it(`equals reference ${name}`, () => {
                        if (dataFromJsonableTree !== undefined) {
                            const dataClone = dataFromJsonableTree(reference);
                            // This assumes `TData` works with deepEqual.
                            assert.deepEqual(data, dataClone);
                        }

                        const clone = jsonableTreeFromCursor(cursorFactory(data));
                        assert.deepEqual(reference, clone);
                    });
                }

                it(`${name}`, () => {
                    const cursor = cursorFactory(data);
                    const cursorClonedData = dataFromCursor(cursor);
                    // This assumes `T` works with deepEqual.
                    assert.deepEqual(cursorClonedData, data);
                    const jsonableClone = jsonableTreeFromCursor(cursor);
                    if (dataFromJsonableTree !== undefined) {
                        const dataClone = dataFromJsonableTree(jsonableClone);
                        assert.deepEqual(data, dataClone);
                    }
                    // Check jsonable objects are actually json compatible
                    const text = JSON.stringify(jsonableClone);
                    const parsed = JSON.parse(text);
                    assert.deepEqual(parsed, jsonableClone);
                });
            }
        });

        testCursors(
            "default test data cursor testing",
            testData.map((data) => ({
                name: data.name,
                cursorFactory: () => cursorFactory(data.data),
                expected: data.reference,
            })),
        );

        if (dataFromJsonableTree !== undefined) {
            const factory = (data: JsonableTree): ITreeCursor => {
                return cursorFactory(dataFromJsonableTree(data));
            };

            // TODO: revisit spec for forest cursors and root and clarify what should be tested for them regarding Up from root.
            if (!extraRoot) {
                it("up from root", () => {
                    const cursor = factory({ type: brand("Foo") });
                    assert.throws(() => cursor.exitNode());
                });
            }

            // TODO: these tests seem pretty repetitive: values are unrelated to keys, so most of these seem unnecessary, and the rest could be covered with test cases.
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
                const parent = !extraRoot
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
        }
        if (withLocalKeys !== undefined) {
            // TODO: with keys builder helper.
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
                        // Test an empty tree, and one with unrelated fields
                        const trees: TData[] = [withLocalKeys([]), withLocalKeys([unrelatedKey])];
                        // If we have a builder for global keys, use to make a tree with unrelatedGlobalKey.
                        if (withKeys !== undefined) {
                            trees.push(withKeys([unrelatedKey, symbolFromKey(unrelatedGlobalKey)]));
                        }

                        for (const data of trees) {
                            const cursor = cursorFactory(data);
                            cursor.enterField(key);
                            assert.equal(cursor.getFieldLength(), 0);
                        }
                    });

                    const dataWithKey = isLocalKey(key) ? withLocalKeys([key]) : withKeys?.([key]);
                    if (dataWithKey !== undefined) {
                        it(`handles values for key: ${key.toString()}`, () => {
                            const cursor = cursorFactory(dataWithKey);
                            cursor.enterField(key);
                            assert.equal(cursor.getFieldLength(), 1);
                            cursor.enterNode(0);
                        });
                    }
                }
            });
        }
    });
}

const unusedKey: FieldKey = symbolFromKey(brand("unusedKey"));

/**
 * Test that cursor works as a cursor.
 * This does NOT test that the data the cursor exposes is correct,
 * it simply checks that the traversal APIs function, and that a few aspects of them conform with the spec.
 *
 * TODO: add testing for paths to this, or a second test in testCursors.
 */
function traverseNode(cursor: ITreeCursor) {
    assert.equal(cursor.mode, CursorLocationType.Nodes);
    assert.equal(cursor.pending, false);
    // Keep track of current node properties to check it during ascent
    const originalNodeValue = cursor.value;
    const originalNodeType = cursor.type;

    // Preload with an empty field, so we check accessing an empty field by key below.
    const fieldLengths: Map<FieldKey, number> = new Map([[unusedKey, 0]]);

    for (let inField: boolean = cursor.firstField(); inField; inField = cursor.nextField()) {
        assert.equal(cursor.mode, CursorLocationType.Fields);
        assert.equal(cursor.pending, false);
        const expectedFieldLength = cursor.getFieldLength();
        const key = cursor.getFieldKey();
        assert(!fieldLengths.has(key), "no duplicate keys");
        fieldLengths.set(cursor.getFieldKey(), expectedFieldLength);
        assert(expectedFieldLength > 0, "only non empty fields should show up in field iteration");
        let actualChildNodesTraversed = 0;
        for (let inNode = cursor.firstNode(); inNode; inNode = cursor.nextNode()) {
            assert(cursor.chunkStart <= actualChildNodesTraversed);
            assert(cursor.chunkLength > actualChildNodesTraversed - cursor.chunkStart);
            assert(cursor.chunkLength + cursor.chunkStart <= expectedFieldLength);
            actualChildNodesTraversed++;
            traverseNode(cursor);
        }

        assert.equal(
            actualChildNodesTraversed,
            expectedFieldLength,
            "Did not traverse expected number of children",
        );

        // Cheek field access by index
        for (let index = 0; index < expectedFieldLength; index++) {
            assert.equal(cursor.mode, CursorLocationType.Fields);
            cursor.enterNode(index);
            assert.equal(cursor.mode, CursorLocationType.Nodes);
            assert(cursor.seekNodes(0));
            assert.equal(cursor.fieldIndex, index);
            cursor.exitNode();
            assert.equal(cursor.mode, CursorLocationType.Fields);
            cursor.enterNode(index);
            assert(!cursor.seekNodes(expectedFieldLength - index));
        }

        // skipPendingFields should have no effect since not pending
        assert(cursor.skipPendingFields());
        assert.equal(cursor.getFieldKey(), key);
    }

    // Cheek field access by key
    for (const [key, length] of fieldLengths) {
        assert.equal(cursor.mode, CursorLocationType.Nodes);
        cursor.enterField(key);
        assert.equal(cursor.mode, CursorLocationType.Fields);
        assert.equal(cursor.getFieldLength(), length);
        assert.equal(cursor.getFieldKey(), key);
        cursor.exitField();
    }

    assert.equal(cursor.mode, CursorLocationType.Nodes);
    assert.equal(cursor.value, originalNodeValue);
    assert.equal(cursor.type, originalNodeType);
}

export function testCursors(
    suiteName: string,
    cursors: readonly { name: string; cursorFactory: () => ITreeCursor; expected?: JsonableTree }[],
) {
    describe(`${suiteName} cursor functionality`, () => {
        for (const { name, cursorFactory, expected } of cursors) {
            describe(name, () => {
                it("tree can be traversed", () => {
                    traverseNode(cursorFactory());
                });
                if (expected !== undefined) {
                    it("has expected data", () => {
                        const tree = jsonableTreeFromCursor(cursorFactory());
                        assert.deepEqual(tree, expected);
                    });
                }
            });
        }
    });
}
