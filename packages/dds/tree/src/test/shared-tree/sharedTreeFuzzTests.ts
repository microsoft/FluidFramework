/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	AsyncGenerator,
    makeRandom,
	describeFuzz,
	performFuzzActionsAsync as performFuzzActionsBase,
} from '@fluid-internal/stochastic-test-utils';
import {
    FieldKinds,
    singleTextCursor,
    namedTreeSchema,
} from "../../feature-libraries";
import { brand, fail } from "../../util";
import { TestTreeProvider } from "../utils";
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
} from "../../core";
import { FuzzChange, FuzzTestState, makeEditGenerator, Operation } from "./generator";

export async function performFuzzActions(
	generator: AsyncGenerator<Operation, FuzzTestState>,
	seed: number,
	saveInfo?: { saveAt?: number; saveOnFailure: boolean; filepath: string }
): Promise<Required<FuzzTestState>> {
	const random = makeRandom(seed);
    const provider = await TestTreeProvider.create(1)

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
	const initialState: FuzzTestState = {
        random,
        testTreeProvider: provider,
        numberOfEdits: 0
    };
	const finalState = await performFuzzActionsBase(
		generator,
		{
			edit: async (state, operation) => {
				const { index, contents } = operation;
                const tree = state.testTreeProvider.trees[index]
				applyFuzzChange(tree, contents);
				return state;
			}
		},
		initialState,
		saveInfo
	);

	return finalState as Required<FuzzTestState>;
}

function applyFuzzChange(tree: ISharedTree, contents: FuzzChange): void {
    const index = contents.index;
    const nodeField = contents.field;
	switch (contents.fuzzType) {
		case 'insert':
            if (index !== undefined && nodeField !== undefined) {
                tree.runTransaction((forest, editor) => {
                    const field = editor.sequenceField(contents.path, nodeField);
                    field.insert(
                        index,
                        singleTextCursor({ type: brand("Test"), value: contents.value }),
                    );
                    return TransactionResult.Apply;
                });
            }
			break;
        case 'delete':
            if (index !== undefined && nodeField !== undefined) {
                const parent = contents.path?.parent;
                const delField = contents.path?.parentField
                if(delField !== undefined){
                    tree.runTransaction((forest, editor) => {
                        const field = editor.sequenceField(parent, delField);
                        field.delete(index, 1);
                        return TransactionResult.Apply;
                    });
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
			saveOnFailure?: boolean
		): void {
			it(`with seed ${seed}`, async () => {
				await performFuzzActions(generatorFactory(), seed);
			}).timeout(10000);
		}
        describe('with no-history summarization', () => {
            const generatorFactory = () => makeEditGenerator()

            describe('using only version 0.1.1', () => {
				for (let seed = 0; seed < 1; seed++) {
					runTest(generatorFactory, seed);
				}
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
