/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
    AsyncGenerator,
    makeRandom,
    describeFuzz,
    performFuzzActionsAsync as performFuzzActionsBase,
    takeAsync as take,
} from "@fluid-internal/stochastic-test-utils";
import {
    FieldKinds,
    singleTextCursor,
    namedTreeSchema,
    jsonableTreeFromCursor,
} from "../../feature-libraries";
import { brand, fail } from "../../util";
import { SummarizeType, TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import {
    JsonableTree,
    rootFieldKey,
    rootFieldKeySymbol,
    moveToDetachedField,
    TransactionResult,
    fieldSchema,
    GlobalFieldKey,
    SchemaData,
    mapCursorField,
    UpPath,
    compareUpPaths,
} from "../../core";
import { FuzzChange, FuzzTestState, makeOpGenerator, Operation } from "./fuzzEditGenerator";

export async function performFuzzActions(
    generator: AsyncGenerator<Operation, FuzzTestState>,
    seed: number,
    saveInfo?: { saveAt?: number; saveOnFailure: boolean; filepath: string },
): Promise<FuzzTestState> {
    const random = makeRandom(seed);
    const provider = await TestTreeProvider.create(4, SummarizeType.onDemand);

    const initialTreeState: JsonableTree = {
        type: brand("Node"),
        fields: {
            foo: [
                { type: brand("Number"), value: 0 },
                { type: brand("Number"), value: 1 },
                { type: brand("Number"), value: 2 },
            ],
            foo2: [
                { type: brand("Number"), value: 0 },
                { type: brand("Number"), value: 1 },
                { type: brand("Number"), value: 2 },
            ],
        },
    };
    initializeTestTree(provider.trees[0], initialTreeState);
    await provider.ensureSynchronized();

    const initialState: FuzzTestState = {
        random,
        testTreeProvider: provider,
        numberOfEdits: 0,
    };
    await initialState.testTreeProvider.ensureSynchronized();

    const finalState = await performFuzzActionsBase(
        generator,
        {
            edit: async (state, operation) => {
                const { index, contents } = operation;
                const tree = state.testTreeProvider.trees[index];
                await applyFuzzChange(tree, contents);
                return state;
            },
            synchronize: async (state) => {
                const { testTreeProvider } = state;
                if (testTreeProvider === undefined) {
                    fail("Attempted to synchronize with undefined testObjectProvider");
                }
                await testTreeProvider.ensureSynchronized();
                return state;
            },
        },
        initialState,
        saveInfo,
    );
    await finalState.testTreeProvider.ensureSynchronized();

    return finalState as Required<FuzzTestState>;
}

export async function performFuzzActionsAbort(
    generator: AsyncGenerator<Operation, FuzzTestState>,
    seed: number,
    validateAnchor?: boolean,
    saveInfo?: { saveAt?: number; saveOnFailure: boolean; filepath: string },
): Promise<Required<FuzzTestState>> {
    const random = makeRandom(seed);
    const provider = await TestTreeProvider.create(4, SummarizeType.onDemand);

    const initialTreeState: JsonableTree = {
        type: brand("Node"),
        fields: {
            foo: [
                { type: brand("Number"), value: 0 },
                { type: brand("Number"), value: 1 },
                { type: brand("Number"), value: 2 },
            ],
            foo2: [
                { type: brand("Number"), value: 0 },
                { type: brand("Number"), value: 1 },
                { type: brand("Number"), value: 2 },
            ],
        },
    };

    const tree = provider.trees[0];

    initializeTestTree(provider.trees[0], initialTreeState);
    validateTree(provider.trees[0], [initialTreeState]);

    // building the anchor for anchor stability test
    const cursor = tree.forest.allocateCursor();
    moveToDetachedField(tree.forest, cursor);
    cursor.enterNode(0);
    cursor.getPath();
    cursor.firstField();
    cursor.getFieldKey();
    cursor.enterNode(1);
    const firstAnchor = cursor.buildAnchor();
    cursor.free();

    const initialState: FuzzTestState = {
        random,
        testTreeProvider: provider,
        numberOfEdits: 0,
    };
    const finalState = await performFuzzActionsBase(
        generator,
        {
            edit: async (state, operation) => {
                const { index, contents } = operation;
                abortFuzzChange(tree, contents);
                return state;
            },
            synchronize: async (state) => {
                const { testTreeProvider } = state;
                if (testTreeProvider === undefined) {
                    fail("Attempted to synchronize with undefined testObjectProvider");
                }
                await testTreeProvider.ensureSynchronized();
                return state;
            },
        },
        initialState,
        saveInfo,
    );

    await finalState.testTreeProvider.ensureSynchronized();
    validateTree(provider.trees[0], [initialTreeState]);

    if (validateAnchor) {
        const expectedPath: UpPath = {
            parent: {
                parent: undefined,
                parentIndex: 0,
                parentField: rootFieldKeySymbol,
            },
            parentField: brand("foo"),
            parentIndex: 1,
        };
        const anchorPath = tree.locate(firstAnchor);
        assert(compareUpPaths(expectedPath, anchorPath));
    }
    return finalState as Required<FuzzTestState>;
}

function validateTree(tree: ISharedTree, expected: JsonableTree[]): void {
    const readCursor = tree.forest.allocateCursor();
    moveToDetachedField(tree.forest, readCursor);
    const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
    readCursor.free();
    assert.deepEqual(actual, expected);
}

function abortFuzzChange(tree: ISharedTree, contents: FuzzChange): void {
    const index = contents.index;
    const nodeField = contents.field;
    switch (contents.fuzzType) {
        case "insert":
            if (index !== undefined && nodeField !== undefined) {
                tree.runTransaction((forest, editor) => {
                    const field = editor.sequenceField(contents.parent, nodeField);
                    field.insert(
                        index,
                        singleTextCursor({ type: brand("Test"), value: contents.value }),
                    );
                    return TransactionResult.Abort;
                });
            }
            break;
        case "delete":
            if (index !== undefined && nodeField !== undefined) {
                const parent = contents.parent?.parent;
                const delField = contents.parent?.parentField;
                const parentIndex = contents.parent?.parentIndex;
                if (delField !== undefined && parent !== undefined && parentIndex !== undefined) {
                    tree.runTransaction((forest, editor) => {
                        const field = editor.sequenceField(parent, delField);
                        field.delete(parentIndex, 1);
                        return TransactionResult.Abort;
                    });
                }
            }
            break;
        case "setPayload":
            if (index !== undefined && nodeField !== undefined) {
                const path = contents.parent;
                if (path !== undefined) {
                    tree.runTransaction((forest, editor) => {
                        editor.setValue(path, contents.value);
                        return TransactionResult.Abort;
                    });
                }
            }
            break;
        default:
            fail("Invalid edit.");
    }
}

async function applyFuzzChange(tree: ISharedTree, contents: FuzzChange): Promise<void> {
    const index = contents.index;
    const nodeField = contents.field;
    switch (contents.fuzzType) {
        case "insert":
            if (index !== undefined && nodeField !== undefined) {
                tree.runTransaction((forest, editor) => {
                    const field = editor.sequenceField(contents.parent, nodeField);
                    field.insert(
                        index,
                        singleTextCursor({ type: brand("Test"), value: contents.value }),
                    );
                    return TransactionResult.Apply;
                });
            }
            break;
        case "delete":
            if (index !== undefined && nodeField !== undefined) {
                const parent = contents.parent?.parent;
                const delField = contents.parent?.parentField;
                const parentIndex = contents.parent?.parentIndex;
                if (delField !== undefined && parent !== undefined && parentIndex !== undefined) {
                    tree.runTransaction((forest, editor) => {
                        const field = editor.sequenceField(parent, delField);
                        field.delete(parentIndex, 1);
                        return TransactionResult.Apply;
                    });
                }
            }
            break;
        case "setPayload":
            if (index !== undefined && nodeField !== undefined) {
                const path = contents.parent;
                if (path !== undefined) {
                    tree.runTransaction((forest, editor) => {
                        editor.setValue(path, contents.value);
                        return TransactionResult.Apply;
                    });
                }
            }
            break;
        default:
            fail("Invalid edit.");
    }
}

export function runSharedTreeFuzzTests(title: string): void {
    describeFuzz(title, ({ testCount }) => {
        function runTest(
            generatorFactory: () => AsyncGenerator<Operation, FuzzTestState>,
            seed: number,
        ): void {
            for (let i = 0; i < 10; i++) {
                it(`with seed ${i}`, async () => {
                    await performFuzzActions(generatorFactory(), i);
                }).timeout(20000);
            }
        }
        function runTestAbort(
            generatorFactory: () => AsyncGenerator<Operation, FuzzTestState>,
            seed: number,
        ): void {
            for (let i = 0; i < 10; i++) {
                it.skip(`with seed ${i}`, async () => {
                    await performFuzzActionsAbort(generatorFactory(), i);
                }).timeout(20000);
            }
        }
        describe("basic convergence", () => {
            const generatorFactory = () => take(200, makeOpGenerator());
            describe("using TestTreeProvider", () => {
                runTest(generatorFactory, 0);
            });
        });
        describe("abort all edits", () => {
            const generatorFactory = () => take(200, makeOpGenerator());
            describe("using TestTreeProvider", () => {
                runTestAbort(generatorFactory, 0);
            });
        });
    });
}

const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");

describe("SharedTreeFuzz", () => {
    runSharedTreeFuzzTests("test shared tree fuzz");
});

const rootFieldSchema = fieldSchema(FieldKinds.value);
const globalFieldSchema = fieldSchema(FieldKinds.value);
const rootNodeSchema = namedTreeSchema({
    name: brand("TestValue"),
    localFields: {
        optionalChild: fieldSchema(FieldKinds.optional, [brand("TestValue")]),
    },
    extraLocalFields: fieldSchema(FieldKinds.sequence),
    globalFields: [globalFieldKey],
});
const testSchema: SchemaData = {
    treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
    globalFieldSchema: new Map([
        [rootFieldKey, rootFieldSchema],
        [globalFieldKey, globalFieldSchema],
    ]),
};

/**
 * Updates the given `tree` to the given `schema` and inserts `state` as its root.
 */
function initializeTestTree(
    tree: ISharedTree,
    state: JsonableTree,
    schema: SchemaData = testSchema,
): void {
    tree.storedSchema.update(schema);

    // Apply an edit to the tree which inserts a node with a value
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor(state);
        const field = editor.sequenceField(undefined, rootFieldKeySymbol);
        field.insert(0, writeCursor);

        return TransactionResult.Apply;
    });
}
