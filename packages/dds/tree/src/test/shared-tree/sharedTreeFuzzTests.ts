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
    IRandom,
} from '@fluid-internal/stochastic-test-utils';
import {
    FieldKinds,
    singleTextCursor,
    namedTreeSchema,
    jsonableTreeFromCursor,
} from "../../feature-libraries";
import { brand, fail } from "../../util";
import { ITestTreeProvider, SummarizeType, TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import {
    JsonableTree,
    rootFieldKey,
    rootFieldKeySymbol,
    TreeValue,
    moveToDetachedField,
    TransactionResult,
    fieldSchema,
    GlobalFieldKey,
    SchemaData,
    mapCursorField,
    UpPath,
    compareUpPaths,
} from "../../core";
import { FuzzChange, FuzzTestState, makeOpGenerator, Operation } from "./generator";
import { topDownPath } from "../../tree/pathTree";

export async function performFuzzActions(
	generator: AsyncGenerator<Operation, FuzzTestState>,
	seed: number,
	saveInfo?: { saveAt?: number; saveOnFailure: boolean; filepath: string }
): Promise<Required<FuzzTestState>> {
	const random = makeRandom(seed);
    const provider = await TestTreeProvider.create(2, SummarizeType.onDemand)

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
        edits:[],
    };
	const finalState = await performFuzzActionsBase(
		generator,
		{
			edit: async (state, operation) => {
				const { index, contents } = operation;
                const tree = state.testTreeProvider.trees[index]
				await applyFuzzChange(tree, contents);
				return state;
			},
            synchronize: async (state) => {
                const { testTreeProvider } = state;
                if (testTreeProvider === undefined) {
                    fail('Attempted to synchronize with undefined testObjectProvider');
                }
                await testTreeProvider.ensureSynchronized();
                return state;
            },
		},
		initialState,
		saveInfo
	);
    await finalState.testTreeProvider.ensureSynchronized();
    const readCursor = finalState.testTreeProvider.trees[0].forest.allocateCursor();
    moveToDetachedField(finalState.testTreeProvider.trees[0].forest, readCursor);
    const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
    readCursor.free();

	return finalState as Required<FuzzTestState>;
}

export async function performFuzzActionsAbort(
	generator: AsyncGenerator<Operation, FuzzTestState>,
	seed: number,
    validateAnchor?: boolean,
	saveInfo?: { saveAt?: number; saveOnFailure: boolean; filepath: string }
): Promise<Required<FuzzTestState>> {
	const random = makeRandom(seed);
    const provider = await TestTreeProvider.create(1, SummarizeType.onDemand)

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
    validateTree(provider.trees[0], [initialTreeState])

    // building the anchor for anchor stability test
    const cursor = tree.forest.allocateCursor();
    moveToDetachedField(tree.forest, cursor);
    cursor.enterNode(0)
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
        edits: [],
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
                    fail('Attempted to synchronize with undefined testObjectProvider');
                }
                await testTreeProvider.ensureSynchronized();
                return state;
            },
		},
		initialState,
		saveInfo
	);

    await finalState.testTreeProvider.ensureSynchronized();
    validateTree(provider.trees[0], [initialTreeState])

    if (validateAnchor){
        const expectedPath: UpPath = {
            parent: {
                parent: undefined,
                parentIndex: 0,
                parentField: rootFieldKeySymbol,
            },
            parentField: brand("foo"),
            parentIndex: 1
        }
        const anchorPath = tree.locate(firstAnchor)
        assert(compareUpPaths(expectedPath, anchorPath))
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
		case 'insert':
            if (index !== undefined && nodeField !== undefined) {
                try {
                    const testPath = topDownPath(contents.path);
                    const readCursor = tree.forest.allocateCursor();
                    moveToDetachedField(tree.forest, readCursor);
                    const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                    readCursor.free();
                    tree.runTransaction((forest, editor) => {
                        const field = editor.sequenceField(contents.path, nodeField);
                        field.insert(
                            index,
                            singleTextCursor({ type: brand("Test"), value: contents.value }),
                        );
                        return TransactionResult.Abort;
                    });
                    const readCursor2 = tree.forest.allocateCursor();
                    moveToDetachedField(tree.forest, readCursor2);
                    const actual2 = mapCursorField(readCursor2, jsonableTreeFromCursor);
                    readCursor2.free();
                } catch (error) {
                    const testPath = topDownPath(contents.path);
                    const readCursor = tree.forest.allocateCursor();
                    moveToDetachedField(tree.forest, readCursor);
                    const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                    readCursor.free();
                }
            }
			break;
        case 'delete':
            if (index !== undefined && nodeField !== undefined) {
                const parent = contents.path?.parent;
                const delField = contents.path?.parentField
                if(delField !== undefined && parent !== undefined){
                    try {
                        const testPath = topDownPath(contents.path);
                        const readCursor = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor);
                        const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                        readCursor.free();
                        tree.runTransaction((forest, editor) => {
                            const field = editor.sequenceField(parent, delField);
                            field.delete(0, 1); // set index to 0 for now for testing purposes.
                            return TransactionResult.Abort;
                        });
                        const readCursor2 = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor2);
                        const actual2 = mapCursorField(readCursor2, jsonableTreeFromCursor);
                        readCursor2.free();
                    } catch (error) {
                        const testPath = topDownPath(contents.path);
                        const readCursor = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor);
                        const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                        readCursor.free();
                    }

                }
            }
            break;
        case 'setPayload':
            if (index !== undefined && nodeField !== undefined) {
                const path = contents.path;
                if(path !== undefined){
                    try {
                        const testPath = topDownPath(contents.path);
                        const readCursor = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor);
                        const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                        readCursor.free();
                        tree.runTransaction((forest, editor) => {
                            editor.setValue(path, contents.value);
                            return TransactionResult.Abort;
                        });
                        const readCursor2 = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor2);
                        const actual2 = mapCursorField(readCursor2, jsonableTreeFromCursor);
                        readCursor2.free();
                    } catch (error) {
                        const testPath = topDownPath(contents.path);
                        const readCursor = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor);
                        const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                        readCursor.free();
                    }

                }
            }
            break;
		default:
			fail('Invalid edit.');
	}
}

async function applyFuzzChange(tree: ISharedTree, contents: FuzzChange): Promise<void> {
    const index = contents.index;
    const nodeField = contents.field;
	switch (contents.fuzzType) {
		case 'insert':
            if (index !== undefined && nodeField !== undefined) {
                try {
                    const testPath = topDownPath(contents.path);
                    const readCursor = tree.forest.allocateCursor();
                    moveToDetachedField(tree.forest, readCursor);
                    const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                    readCursor.free();
                    tree.runTransaction((forest, editor) => {
                        const field = editor.sequenceField(contents.path, nodeField);
                        field.insert(
                            index,
                            singleTextCursor({ type: brand("Test"), value: contents.value }),
                        );
                        return TransactionResult.Apply;
                    });
                    const readCursor2 = tree.forest.allocateCursor();
                    moveToDetachedField(tree.forest, readCursor2);
                    const actual2 = mapCursorField(readCursor2, jsonableTreeFromCursor);
                    readCursor2.free();
                } catch (error) {
                    const testPath = topDownPath(contents.path);
                    const readCursor = tree.forest.allocateCursor();
                    moveToDetachedField(tree.forest, readCursor);
                    const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                    readCursor.free();
                }
            }
			break;
        case 'delete':
            if (index !== undefined && nodeField !== undefined) {
                const parent = contents.path?.parent;
                const delField = contents.path?.parentField
                if(delField !== undefined && parent !== undefined){
                    try {
                        const testPath = topDownPath(contents.path);
                        const readCursor = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor);
                        const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                        readCursor.free();
                        tree.runTransaction((forest, editor) => {
                            const field = editor.sequenceField(parent, delField);
                            field.delete(0, 1); // set index to 0 for now for testing purposes.
                            return TransactionResult.Apply;
                        });
                        const readCursor2 = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor2);
                        const actual2 = mapCursorField(readCursor2, jsonableTreeFromCursor);
                        readCursor2.free();
                    } catch (error) {
                        const testPath = topDownPath(contents.path);
                        const readCursor = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor);
                        const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                        readCursor.free();
                    }

                }
            }
            break;
        case 'setPayload':
            if (index !== undefined && nodeField !== undefined) {
                const path = contents.path;
                if(path !== undefined){
                    try {
                        const testPath = topDownPath(contents.path);
                        const readCursor = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor);
                        const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                        readCursor.free();
                        tree.runTransaction((forest, editor) => {
                            editor.setValue(path, contents.value);
                            return TransactionResult.Apply;
                        });
                        const readCursor2 = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor2);
                        const actual2 = mapCursorField(readCursor2, jsonableTreeFromCursor);
                        readCursor2.free();
                    } catch (error) {
                        const testPath = topDownPath(contents.path);
                        const readCursor = tree.forest.allocateCursor();
                        moveToDetachedField(tree.forest, readCursor);
                        const actual = mapCursorField(readCursor, jsonableTreeFromCursor);
                        readCursor.free();
                    }

                }
            }
            break;
		default:
			fail('Invalid edit.');
	}
}

export function runSharedTreeFuzzTests(title: string): void {
	describeFuzz(title, ({ testCount }) => {
		function runTest(
			generatorFactory: () => AsyncGenerator<Operation, FuzzTestState>,
			seed: number,
		): void {
			it(`with seed ${seed}`, async () => {
				await performFuzzActions(generatorFactory(), seed);
			}).timeout(20000);
		}
        function runTestAbort(
			generatorFactory: () => AsyncGenerator<Operation, FuzzTestState>,
			seed: number,
		): void {
			it(`with seed ${seed}`, async () => {
				await performFuzzActionsAbort(generatorFactory(), seed);
			}).timeout(20000);
		}
        describe('with no-history summarization', () => {
            const generatorFactory = () => take(
                100,
                makeOpGenerator()
            )
            describe('using TestTreeProvider', () => {
                runTest(generatorFactory, 0);
			});
        });
        describe('abort all edits', () => {
            const generatorFactory = () => take(
                20,
                makeOpGenerator()
            )
            describe('using TestTreeProvider', () => {
                runTestAbort(generatorFactory, 0);
			});
        });
	});
}

const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");

describe("SharedTreeFuzz", () => {
    runSharedTreeFuzzTests("test shared tree fuzz")
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

/**
 * Inserts a single node under the root of the tree with the given value.
 * Use {@link getTestValue} to read the value.
 */
function initializeTestTreeWithValue(tree: ISharedTree, value: TreeValue): void {
    initializeTestTree(tree, { type: brand("TestValue"), value });
}

/**
 * Reads a value in a tree set by {@link initializeTestTreeWithValue} if it exists.
 */
function getTestValue({ forest }: ISharedTree): TreeValue | undefined {
    const readCursor = forest.allocateCursor();
    moveToDetachedField(forest, readCursor);
    if (!readCursor.firstNode()) {
        readCursor.free();
        return undefined;
    }
    const { value } = readCursor;
    readCursor.free();
    return value;
}
