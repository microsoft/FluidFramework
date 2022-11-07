/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { FieldKinds, singleTextCursor } from "../../feature-libraries";
import { brand, unreachableCase } from "../../util";
import { JsonableTree, rootFieldKey, rootFieldKeySymbol, TreeValue } from "../../tree";
import { moveToDetachedField } from "../../forest";
import { ITestTreeProvider, TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import { TransactionResult } from "../../checkout";
import { fieldSchema, GlobalFieldKey, namedTreeSchema, SchemaData } from "../../schema-stored";
// eslint-disable-next-line import/no-internal-modules
import { PlacePath } from "../../feature-libraries/sequence-change-family";

const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");

enum TreeShape {
    Wide = 0,
    Deep = 1,
}

// TODO: Once the "BatchTooLarge" error is no longer an issue, extend tests for larger trees.
describe("SharedTree benchmarks", () => {
    describe("Cursors", () => {
        for (let i = 1; i < 100; i += 10) {
            let tree: ISharedTree;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `Deep Tree with cursor: reads with ${i} nodes`,
                before: async () => {
                    tree = await getTestTree(i, TreeShape.Deep);
                },
                benchmarkFn: () => {
                    readTree(tree, i, TreeShape.Deep);
                },
            });
        }
        for (let i = 1; i < 1700; i += 100) {
            let tree: ISharedTree;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `Wide Tree with cursor: reads with ${i} nodes`,
                before: async () => {
                    tree = await getTestTree(i, TreeShape.Wide);
                },
                benchmarkFn: () => {
                    readTree(tree, i, TreeShape.Wide);
                },
            });
        }
    });

    describe("Direct JS Object", () => {
        for (let i = 1; i < 100; i += 10) {
            let tree: ISharedTree;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `Deep Tree as JS Object: reads with ${i} nodes`,
                before: async () => {
                    tree = await getTestTreeAsJSObject(i, TreeShape.Deep);
                },
                benchmarkFn: () => {
                    readTreeAsJSObject(tree);
                },
            });
        }
        for (let i = 1; i < 1700; i += 100) {
            let tree: ISharedTree;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `Wide Tree as JS Object: reads with ${i} nodes`,
                before: async () => {
                    tree = await getTestTreeAsJSObject(i, TreeShape.Wide);
                },
                benchmarkFn: () => {
                    readTreeAsJSObject(tree);
                },
            });
        }
    });
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
        return undefined;
    }
    const { value } = readCursor;
    readCursor.free();
    return value;
}

/**
 * Inserts a single node under the root of the tree with the given value.
 */
function setTestValue(tree: ISharedTree, value: TreeValue, index: number): void {
    // Apply an edit to the tree which inserts a node with a value
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        const field = editor.sequenceField(undefined, rootFieldKeySymbol);
        field.insert(index, writeCursor);

        return TransactionResult.Apply;
    });
}

function setTestValueOnPath(tree: ISharedTree, value: TreeValue, path: PlacePath): void {
    // Apply an edit to the tree which inserts a node with a value.
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
        const field = editor.sequenceField(path, rootFieldKeySymbol);
        field.insert(0, writeCursor);

        return TransactionResult.Apply;
    });
}

async function setTestValuesWide(
    tree: ISharedTree,
    numberOfNodes: number,
    provider: ITestTreeProvider,
): Promise<void> {
    const seed = 0;
    const random = makeRandom(seed);
    for (let j = 0; j < numberOfNodes; j++) {
        setTestValue(tree, random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), j);
        if (j % 1000 === 0) {
            await provider.ensureSynchronized();
        }
    }
}

/**
 *
 * @param numberOfNodes - number of nodes you would like to insert
 * @param shape - TreeShape enum to specify the shape of the tree
 * @returns the byte size of the tree's summary
 */
async function getTestTree(numberOfNodes: number, shape: TreeShape): Promise<ISharedTree> {
    const provider = await TestTreeProvider.create(1, true);
    const tree = provider.trees[0];
    initializeTestTreeWithValue(tree, 1);

    switch (shape) {
        case TreeShape.Deep:
            setTestValuesNarrow(tree, numberOfNodes);
            break;
        case TreeShape.Wide:
            await setTestValuesWide(tree, numberOfNodes, provider);
            break;
        default:
            unreachableCase(shape);
    }
    await provider.ensureSynchronized();
    return tree;
}

function setTestValuesNarrow(tree: ISharedTree, numberOfNodes: number): void {
    const seed = 0;
    const random = makeRandom(seed);
    let path: PlacePath = {
        parent: undefined,
        parentField: rootFieldKeySymbol,
        parentIndex: 0,
    };
    // loop through and update path for the next insert.
    for (let i = 0; i <= numberOfNodes; i++) {
        setTestValueOnPath(
            tree,
            random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
            path,
        );
        path = {
            parent: path,
            parentField: rootFieldKeySymbol,
            parentIndex: 0,
        };
    }
}

function readTree(tree: ISharedTree, numberOfNodes: number, shape: TreeShape) {
    const { forest } = tree;
    const readCursor = forest.allocateCursor();
    moveToDetachedField(forest, readCursor);
    assert(readCursor.firstNode());
    switch (shape) {
        case TreeShape.Deep:
            for (let i = 0; i < numberOfNodes; i++) {
                readCursor.enterField(rootFieldKeySymbol);
                assert(readCursor.firstNode());
            }
            break;
        case TreeShape.Wide:
            for (let j = 0; j < numberOfNodes; j++) {
                readCursor.nextNode();
            }
            break;
        default:
            unreachableCase(shape);
    }
    readCursor.free();
}

async function getTestTreeAsJSObject(
    numberOfNodes: number,
    shape: TreeShape,
): Promise<ISharedTree> {
    const tree = await getTestTree(numberOfNodes, shape);
    const { summary } = tree.getAttachSummary();
    const summaryString = JSON.stringify(summary);
    const summaryJS = JSON.parse(summaryString);
    const treeContent = summaryJS.tree.indexes.tree.Forest.tree.ForestTree.content;
    const parsedContent: ISharedTree = JSON.parse(JSON.parse(treeContent));
    return parsedContent;
}

function readTreeAsJSObject(tree: any) {
    for (const key of Object.keys(tree)) {
        if (typeof tree[key] === "object" && tree[key] !== null) readTreeAsJSObject(tree[key]);
        else if (key === "value") {
            assert(tree[key] !== null);
        }
    }
}
