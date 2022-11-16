/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IRandom, makeRandom } from "@fluid-internal/stochastic-test-utils";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { buildForest, defaultSchemaPolicy, emptyField, FieldKinds, singleTextCursor } from "../../feature-libraries";
import { brand, unreachableCase } from "../../util";
import { JsonableTree, rootFieldKey, rootFieldKeySymbol } from "../../tree";
import { IEditableForest, initializeForest, moveToDetachedField } from "../../forest";
import { ITestTreeProvider, TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import { TransactionResult } from "../../checkout";
import { fieldSchema, InMemoryStoredSchemaRepository, namedTreeSchema, SchemaData, ValueSchema } from "../../schema-stored";
// eslint-disable-next-line import/no-internal-modules
import { PlacePath } from "../../feature-libraries/sequence-change-family";
// eslint-disable-next-line import/no-internal-modules
import { float32Schema, int32Schema, mapStringSchema, schemaMap, stringSchema } from "../feature-libraries/editable-tree/mockData";

enum TreeShape {
    Wide = 0,
    Deep = 1,
}

enum TestPrimitives {
    Number = 0,
    Float = 1,
    String = 2,
    Boolean = 3,
    Map = 4,
}

// TODO: Once the "BatchTooLarge" error is no longer an issue, extend tests for larger trees.
describe("SharedTree benchmarks", () => {
    describe("Direct JS Object", () => {
        for (let dataType=0 as TestPrimitives; dataType <= 4; dataType++) {
            for (let i = 10; i < 100; i += 10) {
                let tree: ISharedTree;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Deep Tree as JS Object (${TestPrimitives[dataType]}): reads with ${i} nodes`,
                    before: async () => {
                        tree = getTestTreeAsJSObject(i, TreeShape.Deep, dataType);
                    },
                    benchmarkFn: () => {
                        readTreeAsJSObject(tree);
                    },
                });
            }
            for (let i = 100; i < 1500; i += 100) {
                let tree: ISharedTree;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Wide Tree as JS Object (${TestPrimitives[dataType]}): reads with ${i} nodes`,
                    before: async () => {
                        tree = getTestTreeAsJSObject(i, TreeShape.Wide, TestPrimitives.String);
                    },
                    benchmarkFn: () => {
                        readTreeAsJSObject(tree);
                    },
                });
            }
            for (let i = 10; i < 100; i += 10) {
                let tree: ISharedTree;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Deep Tree as JS Object (${TestPrimitives[dataType]}): writes with ${i} nodes`,
                    before: async () => {},
                    benchmarkFn: () => {
                        tree = getTestTreeAsJSObject(i, TreeShape.Deep, TestPrimitives.String);
                    },
                });
            }
            for (let i = 100; i < 1500; i += 100) {
                let tree: ISharedTree;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Wide Tree as JS Object (${TestPrimitives[dataType]}): writes with ${i} nodes`,
                    before: async () => {},
                    benchmarkFn: () => {
                        tree = getTestTreeAsJSObject(i, TreeShape.Wide, TestPrimitives.String);
                    },
                });
            }
        }
    });
    describe("Cursors", () => {
        for (let dataType=0 as TestPrimitives; dataType <= 4; dataType++) {
            for (let i = 10; i < 100; i += 10) {
                let tree: ISharedTree;
                const random = makeRandom(0)
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Deep Tree (${TestPrimitives[dataType]}) with cursor: reads with ${i} nodes`,
                    before: async () => {
                        tree = await generateTestTree(i, TreeShape.Deep, dataType, random);
                    },
                    benchmarkFn: () => {
                        readTree(tree.forest, i, TreeShape.Deep);
                    },
                });
            }
            for (let i = 100; i < 1500; i += 100) {
                let tree: ISharedTree;
                const random = makeRandom(0)
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Wide Tree (${TestPrimitives[dataType]}) with cursor: reads with ${i} nodes`,
                    before: async () => {
                        tree = await generateTestTree(i, TreeShape.Wide, dataType, random);
                    },
                    benchmarkFn: () => {
                        readTree(tree.forest, i, TreeShape.Wide);
                    },
                });
            }
            for (let i = 10; i < 100; i += 10) {
                let tree: ISharedTree;
                const random = makeRandom(0)
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Deep Tree (${TestPrimitives[dataType]}) with cursor: writes ${i} nodes`,
                    before: () => {},
                    benchmarkFn: async () => {
                        tree = await generateTestTree(i, TreeShape.Deep, dataType, random);
                    },
                });
            }
            for (let i = 100; i < 1500; i += 100) {
                let tree: ISharedTree;
                const random = makeRandom(0)
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Wide Tree (${TestPrimitives[dataType]}) with cursor: writes ${i} nodes`,
                    before: () => {},
                    benchmarkFn: async () => {
                        tree = await generateTestTree(i, TreeShape.Wide, dataType, random);
                    },
                });
            }
        }
    });
    describe("Editable Tree", () => {
        for (let dataType=0 as TestPrimitives; dataType <= 4; dataType++) {
            for (let i = 10; i < 100; i += 10) {
                let tree;
                let forest: IEditableForest;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Deep Tree (${TestPrimitives[dataType]}) with Editable Tree: reads with ${i} nodes`,
                    before: async () => {
                        tree = getTestTreeAsJSObject(i, TreeShape.Deep, dataType)
                        forest = setupForest(fullSchemaData, tree);
                    },
                    benchmarkFn: () => {
                        readTree(forest, i, TreeShape.Deep);
                    },
                });
            }
            for (let i = 100; i < 1500; i += 100) {
                let tree;
                let forest: IEditableForest;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Wide Tree (${TestPrimitives[dataType]}) with Editable Tree: reads with ${i} nodes`,
                    before: async () => {
                        tree = getTestTreeAsJSObject(i, TreeShape.Wide, dataType)
                        forest = setupForest(fullSchemaData, tree);
                    },
                    benchmarkFn: () => {
                        readTree(forest, i, TreeShape.Wide);
                    },
                });
            }
            for (let i = 10; i < 100; i += 10) {
                let tree;
                let forest: IEditableForest;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Deep Tree (${TestPrimitives[dataType]}) with Editable Tree: writes ${i} nodes`,
                    before: () => {},
                    benchmarkFn: async () => {
                        tree = getTestTreeAsJSObject(i, TreeShape.Deep, dataType)
                        forest = setupForest(fullSchemaData, tree);
                    },
                });
            }
            for (let i = 100; i < 1500; i += 100) {
                let tree;
                let forest: IEditableForest;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Deep Tree (${TestPrimitives[dataType]}) with Editable Tree: writes ${i} nodes`,
                    before: () => {},
                    benchmarkFn: async () => {
                        tree = getTestTreeAsJSObject(i, TreeShape.Deep, dataType)
                        forest = setupForest(fullSchemaData, tree);
                    },
                });
            }
        }
    });
});

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

async function generateTestTree(
    numberOfNodes:number,
    shape:TreeShape,
    dataType:TestPrimitives,
    random: IRandom,
): Promise<ISharedTree> {
    const provider = await TestTreeProvider.create(1);
    const [tree] = provider.trees;
    const personData: JsonableTree = generateTreeData(dataType, random)
    // Insert root node
    initializeTestTree(tree, personData, fullSchemaData);
    switch (shape) {
        case TreeShape.Deep:
            await setNodesNarrow(tree, numberOfNodes-1, dataType, provider, random);
            break;
        case TreeShape.Wide:
            await setNodesWide(tree, numberOfNodes-1, dataType, provider, random);
            break;
        default:
            unreachableCase(shape);
    }
    return tree;
}

async function setNodesNarrow(
    tree:ISharedTree,
    numberOfNodes:number,
    dataType:TestPrimitives,
    provider: ITestTreeProvider,
    random: IRandom,
): Promise<void> {
    let path: PlacePath = {
        parent: undefined,
        parentField: rootFieldKeySymbol,
        parentIndex: 0,
    };
    for (let i = 0; i<numberOfNodes; i++) {
        const personData = generateTreeData(dataType, random);
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
    await provider.ensureSynchronized();
}

async function setNodesWide(
    tree:ISharedTree,
    numberOfNodes:number,
    dataType:TestPrimitives,
    provider: ITestTreeProvider,
    random: IRandom,
): Promise<void> {
    for (let j = 0; j < numberOfNodes; j++) {
        const personData = generateTreeData(dataType, random);
        tree.runTransaction((forest, editor) => {
            const writeCursor = singleTextCursor(personData);
            const field = editor.sequenceField(undefined, rootFieldKeySymbol);
            field.insert(j, writeCursor);
            return TransactionResult.Apply;
        });
    }
    await provider.ensureSynchronized();
}

function generateTreeData(dataType:TestPrimitives, random: IRandom): JsonableTree{
    let field;
    let booleanValue;
    const insertValue = random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
    switch (dataType) {
        case TestPrimitives.Number:
            field = {age: [{ value: insertValue, type: int32Schema.name }]}
            break;
        case TestPrimitives.Float:
            field = {age: [{ value: insertValue, type: float32Schema.name }]}
            break;
        case TestPrimitives.String:
            field = {name: [{ value: random.real(0,Number.MAX_SAFE_INTEGER).toString(), type: stringSchema.name }]}
            break;
        case TestPrimitives.Boolean:
            booleanValue = insertValue % 2 === 0 ? true : false;
            field = {isMarried: [{ value: booleanValue, type: booleanSchema.name }]}
            break;
        case TestPrimitives.Map:
            field = {
                friends: [
                    {
                        fields: {
                            Mat: [{ type: stringSchema.name, value: insertValue.toString() }],
                        },
                        type: mapStringSchema.name,
                    },
                ],
            }
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

/**
 * Updates the given `tree` to the given `schema` and inserts `state` as its root.
 */
function initializeTestTree(
    tree: ISharedTree,
    state: JsonableTree,
    schema: SchemaData = fullSchemaData,
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

function readTree(forest: any, numberOfNodes: number, shape: TreeShape) {
    const readCursor = forest.allocateCursor();
    moveToDetachedField(forest, readCursor);
    assert(readCursor.firstNode());
    switch (shape) {
        case TreeShape.Deep:
            for (let i = 0; i < numberOfNodes-1; i++) {
                readCursor.enterField(rootFieldKeySymbol);
                assert(readCursor.firstNode());
            }
            break;
        case TreeShape.Wide:
            for (let j = 0; j < numberOfNodes-1; j++) {
                readCursor.nextNode();
            }
            break;
        default:
            unreachableCase(shape);
    }
    readCursor.free();
}

function getTestTreeAsJSObject(numberOfNodes:number, shape:TreeShape, dataType:TestPrimitives): any {
    const seed = 0;
    const random = makeRandom(seed);
    let tree;
    switch (shape) {
        case TreeShape.Deep:
            tree = [getJSTestTreeDeep(numberOfNodes, dataType, random)]
            break;
        case TreeShape.Wide:
            tree = getJSTestTreeWide(numberOfNodes, dataType, random)
            break;
        default:
            unreachableCase(shape);
    }
    const testTreeJS = JSON.parse(JSON.stringify(tree))
    return testTreeJS
}

function getJSTestTreeWide(numberOfNodes:number, dataType:TestPrimitives, random:IRandom):any {
    const tree = [];
    for(let i = 0; i<numberOfNodes; i++) {
        const node = generateTreeData(dataType, random);
        tree.push(node)
    }
    return tree
}

interface DeepTree {
    type:any;
    fields: any;
    globalFields: {
        rootFieldKey: any
    }
}

function getJSTestTreeDeep(numberOfNodes:number, dataType:TestPrimitives, random:IRandom): any {
    if (numberOfNodes === 1) {
        return generateTreeData(dataType, random);
    }
    const node = generateTreeData(dataType, random);
    const tree: DeepTree = {
        type: node.type,
        fields: node.fields,
        globalFields: {
            rootFieldKey:[getJSTestTreeDeep(numberOfNodes-1, dataType, random)]
        }
    }
    return tree;
}

function readTreeAsJSObject(tree: any) {
    for (const key of Object.keys(tree)) {
        if (typeof tree[key] === "object" && tree[key] !== null) readTreeAsJSObject(tree[key]);
        else if (key === "value") {
            assert(tree[key] !== undefined);
        }
    }
}

function setupForest(schema: SchemaData, data: JsonableTree[]): IEditableForest {
    const schemaRepo = new InMemoryStoredSchemaRepository(defaultSchemaPolicy, schema);
    const forest = buildForest(schemaRepo);
    initializeForest(forest, data.map(singleTextCursor));
    return forest;
}
