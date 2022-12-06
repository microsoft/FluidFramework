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
    CursorLocationType,
    rootFieldKeySymbol,
    symbolFromKey,
    setGenericTreeField,
    isLocalKey,
    UpPath,
    compareUpPaths,
    compareFieldUpPaths,
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
 *
 * @typeParam TData - Format which the cursor reads. Must be JSON compatible.
 * @typeParam TCursor - Type of the cursor being tested.
 */
export function testSpecializedCursor<TData, TCursor extends ITreeCursor>(config: {
    cursorName: string;
    builders: SpecialCaseBuilder<TData>;
    cursorFactory: (data: TData) => TCursor;
    dataFromCursor: (cursor: ITreeCursor) => TData;
    testData: readonly { name: string; data: TData; reference?: JsonableTree }[];
}): Mocha.Suite {
    return testTreeCursor(config);
}

const unusedKey: FieldKey = symbolFromKey(brand("unusedKey"));
const testGlobalKey = symbolFromKey(brand("testGlobalKey"));
const testKeys: readonly FieldKey[] = [
    // keys likely to cause issues due to JS object non-own keys
    brand("__proto__"),
    brand("toString"),
    brand("toFixed"),
    brand("hasOwnProperty"),
    // numeric keys, which can be problematic for array like node and/or due to implicit conversions.
    brand("0"),
    brand("-1"),
    brand("0.0"),
    // Misc test keys
    EmptyKey,
    testGlobalKey,
    rootFieldKeySymbol,
    unusedKey,
];

/**
 * Tests a cursor implementation.
 * Prefer using `testGeneralPurposeTreeCursor` when possible:
 * `testTreeCursor` should only be used when testing a cursor that is not truly general purpose (can not be build from any arbitrary tree).
 *
 * If neither `dataFromCursor` nor  `(data: JsonableTree) => TData` builders, no round trip testing will be performed.
 *
 * @param cursorName - The name of the cursor used as part of the test suite name.
 * @param builders - `TData` builders. `(data: JsonableTree) => TData` is ideal and supports all tests.
 * @param cursorFactory - Creates the cursor to be tested from the provided `TData`.
 * @param dataFromCursor - Constructs a `TData` from the provided cursor `TCursor`. This is tested by round tripping data.
 * @param testData - A collection of test cases to evaluate the cursor with. Actual content of the tree is only validated if a `reference` is provided:
 * otherwise only basic traversal and API consistency will be checked.
 * @param extraRoot - setting this to `true` makes the tests expect that `cursorFactory` includes a dummy node above the root,
 * with the data under {@link rootFieldKeySymbol}.
 *
 * @typeParam TData - Format which the cursor reads. Must be JSON compatible.
 * @typeParam TCursor - Type of the cursor being tested.
 */
function testTreeCursor<TData, TCursor extends ITreeCursor>(config: {
    cursorName: string;
    builders: SpecialCaseBuilder<TData> | ((data: JsonableTree) => TData);
    cursorFactory: (data: TData) => TCursor;
    dataFromCursor?: (cursor: ITreeCursor) => TData;
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

    const parent = !extraRoot
        ? undefined
        : {
              parent: undefined,
              parentField: rootFieldKeySymbol,
              parentIndex: 0,
          };

    return describe(`${cursorName} cursor implementation`, () => {
        describe("test trees", () => {
            for (const { name, data, reference } of testData) {
                describe(name, () => {
                    it("jsonableTreeFromCursor", () => {
                        const cursor = cursorFactory(data);
                        const jsonableClone = jsonableTreeFromCursor(cursor);
                        // Check jsonable objects are actually json compatible
                        const text = JSON.stringify(jsonableClone);
                        const parsed = JSON.parse(text);
                        assert.deepEqual(parsed, jsonableClone);
                    });

                    it("traversal", () => {
                        checkTraversal(cursorFactory(data), parent);
                    });

                    if (reference !== undefined) {
                        it("equals reference", () => {
                            if (dataFromJsonableTree !== undefined) {
                                const dataClone = dataFromJsonableTree(reference);
                                // This assumes `TData` works with deepEqual.
                                assert.deepEqual(data, dataClone);
                            }

                            const clone = jsonableTreeFromCursor(cursorFactory(data));
                            assert.deepEqual(clone, reference);
                        });
                    }

                    if (dataFromCursor !== undefined) {
                        it("roundtrip with dataFromCursor", () => {
                            const cursor = cursorFactory(data);
                            const cursorClonedData = dataFromCursor(cursor);
                            // This assumes `T` works with deepEqual.
                            assert.deepEqual(cursorClonedData, data);
                        });
                    }

                    if (dataFromJsonableTree !== undefined) {
                        it("roundtrip with dataFromJsonableTree", () => {
                            const cursor = cursorFactory(data);
                            const jsonableClone = jsonableTreeFromCursor(cursor);
                            const dataClone = dataFromJsonableTree(jsonableClone);
                            assert.deepEqual(data, dataClone);
                        });
                    }
                });
            }
        });

        // TODO: replace some of these tests with ones that do not require dataFromJsonableTree
        if (dataFromJsonableTree !== undefined) {
            const factory = (data: JsonableTree): ITreeCursor => {
                return cursorFactory(dataFromJsonableTree(data));
            };

            // TODO: revisit spec for forest cursors and root and clarify what should be tested for them regarding Up from root.
            if (!extraRoot) {
                it("up from root", () => {
                    const cursor = factory({ type: brand("Foo") });
                    assert.throws(() => {
                        cursor.exitNode();
                    });
                });
            }
            describe("getPath() and getFieldPath()", () => {
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
            describe("key tests", () => {
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

/**
 * Test that cursor works as a cursor.
 * This does NOT test that the data the cursor exposes is correct,
 * it simply checks that the traversal APIs function, and that a few aspects of them conform with the spec.
 */
function checkTraversal(cursor: ITreeCursor, expectedPath: UpPath | undefined) {
    assert.equal(cursor.mode, CursorLocationType.Nodes);
    assert.equal(cursor.pending, false);
    // Keep track of current node properties to check it during ascent
    const originalNodeValue = cursor.value;
    const originalNodeType = cursor.type;

    const path = cursor.getPath();
    assert(compareUpPaths(path, expectedPath));

    const fieldLengths: Map<FieldKey, number> = new Map();

    for (let inField: boolean = cursor.firstField(); inField; inField = cursor.nextField()) {
        assert.equal(cursor.mode, CursorLocationType.Fields);
        assert.equal(cursor.pending, false);
        const expectedFieldLength = cursor.getFieldLength();
        const key = cursor.getFieldKey();
        assert(!fieldLengths.has(key), "no duplicate keys");
        fieldLengths.set(cursor.getFieldKey(), expectedFieldLength);
        assert(expectedFieldLength > 0, "only non empty fields should show up in field iteration");
        assert(compareFieldUpPaths(cursor.getFieldPath(), { field: key, parent: path }));

        // Check that iterating nodes of this field works as expected.
        let actualChildNodesTraversed = 0;
        for (let inNode = cursor.firstNode(); inNode; inNode = cursor.nextNode()) {
            assert(cursor.chunkStart <= actualChildNodesTraversed);
            assert(cursor.chunkLength > actualChildNodesTraversed - cursor.chunkStart);
            assert(cursor.chunkLength + cursor.chunkStart <= expectedFieldLength);

            // Make sure down+up navigation gets back to where it started.
            // Testing this explicitly here before recursing makes debugging issues with this easier.
            assert.equal(cursor.fieldIndex, actualChildNodesTraversed);
            cursor.enterField(EmptyKey);
            cursor.exitField();
            assert.equal(cursor.fieldIndex, actualChildNodesTraversed);
            if (cursor.firstField()) {
                cursor.enterNode(0);
                cursor.exitNode();
                cursor.exitField();
            }
            assert.equal(cursor.fieldIndex, actualChildNodesTraversed);
            actualChildNodesTraversed++;
        }

        assert.equal(
            actualChildNodesTraversed,
            expectedFieldLength,
            "Did not traverse expected number of children",
        );

        // Check node access by index
        for (let index = 0; index < expectedFieldLength; index++) {
            assert.equal(cursor.mode, CursorLocationType.Fields);
            cursor.enterNode(index);
            assert.equal(cursor.mode, CursorLocationType.Nodes);
            assert(cursor.seekNodes(0));
            assert.equal(cursor.fieldIndex, index);
            cursor.exitNode();
            assert.equal(cursor.mode, CursorLocationType.Fields);

            // Seek to node should work:
            cursor.enterNode(0);
            cursor.seekNodes(index);
            assert.equal(cursor.fieldIndex, index);
            // Seek backwards should be supported
            if (index > 0) {
                assert(cursor.seekNodes(-1));
                assert.equal(cursor.fieldIndex, index - 1);
                // Seek should mix with nextNode
                assert(cursor.nextNode());
                assert.equal(cursor.fieldIndex, index);
            }
            cursor.exitNode();
            assert.equal(cursor.mode, CursorLocationType.Fields);

            // Seek past end should exit
            cursor.enterNode(index);
            assert(!cursor.seekNodes(expectedFieldLength - index));
            cursor.enterNode(index);
            assert(!cursor.seekNodes(Number.POSITIVE_INFINITY));

            // Seek before beginning end should exit
            cursor.enterNode(index);
            assert(!cursor.seekNodes(-(index + 1)));
            cursor.enterNode(index);
            assert(!cursor.seekNodes(Number.NEGATIVE_INFINITY));
        }

        // skipPendingFields should have no effect since not pending
        assert(cursor.skipPendingFields());
        assert.equal(cursor.getFieldKey(), key);

        // Recursively validate.
        actualChildNodesTraversed = 0;
        for (let inNode = cursor.firstNode(); inNode; inNode = cursor.nextNode()) {
            assert.equal(cursor.fieldIndex, actualChildNodesTraversed);
            checkTraversal(cursor, {
                parent: path,
                parentField: key,
                parentIndex: actualChildNodesTraversed,
            });
            assert.equal(cursor.fieldIndex, actualChildNodesTraversed);
            actualChildNodesTraversed++;
        }
    }

    // Add some fields which should be empty to check:
    for (const key of testKeys) {
        if (!fieldLengths.has(key)) {
            fieldLengths.set(key, 0);
        }
    }

    // Cheek field access by key
    for (const [key, length] of fieldLengths) {
        assert.equal(cursor.mode, CursorLocationType.Nodes);
        cursor.enterField(key);
        assert.equal(cursor.mode, CursorLocationType.Fields);
        assert.equal(cursor.getFieldLength(), length);
        assert.equal(cursor.getFieldKey(), key);
        cursor.exitField();

        // nextField should work after enterField (though might just exit since order is not stable):
        cursor.enterField(key);
        if (cursor.nextField()) {
            const newKey = cursor.getFieldKey();
            assert(newKey !== key);
            assert(fieldLengths.get(newKey) ?? 0 > 0);
            cursor.exitField();
        }
    }

    assert.equal(cursor.mode, CursorLocationType.Nodes);
    assert.equal(cursor.value, originalNodeValue);
    assert.equal(cursor.type, originalNodeType);
}
