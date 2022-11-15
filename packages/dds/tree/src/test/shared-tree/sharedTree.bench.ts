/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { emptyField, FieldKinds, singleTextCursor } from "../../feature-libraries";
import { brand, unreachableCase } from "../../util";
import { JsonableTree, rootFieldKey, rootFieldKeySymbol, TreeValue } from "../../tree";
import { moveToDetachedField } from "../../forest";
import { ITestTreeProvider, TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import { TransactionResult } from "../../checkout";
import { fieldSchema, GlobalFieldKey, namedTreeSchema, SchemaData, ValueSchema } from "../../schema-stored";
// eslint-disable-next-line import/no-internal-modules
import { PlacePath } from "../../feature-libraries/sequence-change-family";
// eslint-disable-next-line import/no-internal-modules
import { addressSchema, float32Schema, int32Schema, mapStringSchema, schemaMap, stringSchema } from "../feature-libraries/editable-tree/mockData";

const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");

enum TreeShape {
    Wide = 0,
    Deep = 1,
}

enum TestPrimitives {
    Number = 0,
    String = 1,
    Boolean = 2,
}

// TODO: Once the "BatchTooLarge" error is no longer an issue, extend tests for larger trees.
describe("SharedTree benchmarks", () => {
    describe("Direct JS Object", () => {
        for (let i = 1; i < 100; i += 10) {
            let tree: ISharedTree;
            benchmark({
                type: BenchmarkType.Measurement,
                title: `Deep Tree as JS Object: reads with ${i} nodes`,
                before: async () => {
                    tree = await getTestTreeAsJSObject(i, TreeShape.Deep, TestPrimitives.String);
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
                    tree = await getTestTreeAsJSObject(i, TreeShape.Wide, TestPrimitives.String);
                },
                benchmarkFn: () => {
                    readTreeAsJSObject(tree);
                },
            });
        }
    });
    describe("Cursors", () => {
        for (let dataType=0 as TestPrimitives; dataType <= 2; dataType++) {
            for (let i = 1; i < 100; i += 10) {
                let tree: ISharedTree;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Deep Tree (${TestPrimitives[dataType]} values) with cursor: reads with ${i} nodes`,
                    before: async () => {
                        tree = await generatePersonTestTree(i, TreeShape.Deep, TestPrimitives.String);
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
                    title: `Wide Tree (${TestPrimitives[dataType]} values) with cursor: reads with ${i} nodes`,
                    before: async () => {
                        tree = await generatePersonTestTree(i, TreeShape.Wide, TestPrimitives.String);
                    },
                    benchmarkFn: () => {
                        readTree(tree, i, TreeShape.Wide);
                    },
                });
            }
            for (let i = 1; i < 100; i += 10) {
                let tree: ISharedTree;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Deep Tree (${TestPrimitives[dataType]} values) with cursor: writes ${i} nodes`,
                    before: () => {},
                    benchmarkFn: async () => {
                        tree = await generatePersonTestTree(i, TreeShape.Deep, TestPrimitives.String);
                    },
                });
            }
            for (let i = 1; i < 1700; i += 100) {
                let tree: ISharedTree;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Wide Tree (${TestPrimitives[dataType]} values) with cursor: writes ${i} nodes`,
                    before: () => {},
                    benchmarkFn: async () => {
                        tree = await generatePersonTestTree(i, TreeShape.Wide, TestPrimitives.String);
                    },
                });
            }
        }
    });
});

async function generatePersonTestTree(
    numberOfNodes:number,
    shape:TreeShape,
    dataType:TestPrimitives
): Promise<ISharedTree> {
    const provider = await TestTreeProvider.create(1);
    const [tree] = provider.trees;
    const personData: JsonableTree = generatePersonData(dataType)
    // Insert root node
    initializeTestTree(tree, personData, fullSchemaData);
    switch (shape) {
        case TreeShape.Deep:
            setNodesNarrow(tree, numberOfNodes, dataType);
            break;
        case TreeShape.Wide:
            await setNodesWide(tree, numberOfNodes, dataType, provider);
            break;
        default:
            unreachableCase(shape);
    }
    return tree;
}

function setNodesNarrow(
    tree:ISharedTree,
    numberOfNodes:number,
    dataType:TestPrimitives
): void {
    let path: PlacePath = {
        parent: undefined,
        parentField: rootFieldKeySymbol,
        parentIndex: 0,
    };
    for (let i = 0; i<numberOfNodes; i++) {
        const personData = generatePersonData(dataType);
        tree.runTransaction((forest, editor) => {
            const writeCursor = singleTextCursor(personData);
            const field = editor.sequenceField(path, rootFieldKeySymbol);
            field.insert(0, writeCursor);
            return TransactionResult.Apply;
        });
        path = {
            parent: path,
            parentField: rootFieldKeySymbol,
            parentIndex: 0,
        };
    }
}

async function setNodesWide(
    tree:ISharedTree,
    numberOfNodes:number,
    dataType:TestPrimitives,
    provider: ITestTreeProvider,
): Promise<void> {
    const seed = 0;
    const random = makeRandom(seed);
    for (let j = 0; j < numberOfNodes; j++) {
        const personData = generatePersonData(dataType);
        tree.runTransaction((forest, editor) => {
            const writeCursor = singleTextCursor(personData);
            const field = editor.sequenceField(undefined, rootFieldKeySymbol);
            field.insert(j, writeCursor);
            return TransactionResult.Apply;
        });
        if (j % 1000 === 0) {
            await provider.ensureSynchronized();
        }
    }
}

function generatePersonData(dataType:TestPrimitives): JsonableTree{
    let field;
    const random = makeRandom(0);
    const insertValue = random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    let booleanValue;
    switch (dataType) {
        case TestPrimitives.Number:
            field = {age: [{ value: insertValue, type: int32Schema.name }]}
            break;
        case TestPrimitives.String:
            field = {name: [{ value: insertValue.toString(), type: stringSchema.name }]}
            break;
        case TestPrimitives.Boolean:
            booleanValue = insertValue % 2 === 0 ? true : false;
            field = {isMarried: [{ value: booleanValue, type: booleanSchema.name }]}
            break;
        default:
            unreachableCase(dataType);
    }
    const personData: JsonableTree = {
        type: personSchema.name,
        fields: field,
    };
    return personData
}

// <------------- Person Data TEST ----------------->
const booleanSchema = namedTreeSchema({
    name: brand("Boolean"),
    extraLocalFields: emptyField,
    value: ValueSchema.Boolean,
});

const personSchema = namedTreeSchema({
    name: brand("Test:Person-1.0.0"),
    localFields: {
        name: fieldSchema(FieldKinds.value, [stringSchema.name]),
        age: fieldSchema(FieldKinds.value, [int32Schema.name]),
        salary: fieldSchema(FieldKinds.value, [float32Schema.name]),
        friends: fieldSchema(FieldKinds.value, [mapStringSchema.name]),
        address: fieldSchema(FieldKinds.value, [addressSchema.name]),
        isMarried: fieldSchema(FieldKinds.value, [booleanSchema.name])
    },
    extraLocalFields: emptyField,
});

const rootPersonSchema = fieldSchema(FieldKinds.value, [personSchema.name]);

const fullSchemaData: SchemaData = {
    treeSchema: schemaMap,
    globalFieldSchema: new Map([
        [rootFieldKey, rootPersonSchema],
    ]),
};
// <------------------- END ------------------------>

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
    dataType: TestPrimitives,
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
