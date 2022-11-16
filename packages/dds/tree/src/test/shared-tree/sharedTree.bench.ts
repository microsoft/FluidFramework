/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IRandom, makeRandom } from "@fluid-internal/stochastic-test-utils";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { emptyField, FieldKinds, singleTextCursor } from "../../feature-libraries";
import { brand, unreachableCase } from "../../util";
import { JsonableTree, rootFieldKey, rootFieldKeySymbol } from "../../tree";
import { moveToDetachedField } from "../../forest";
import { ITestTreeProvider, TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import { TransactionResult } from "../../checkout";
import { fieldSchema, namedTreeSchema, SchemaData, ValueSchema } from "../../schema-stored";
// eslint-disable-next-line import/no-internal-modules
import { PlacePath } from "../../feature-libraries/sequence-change-family";
// eslint-disable-next-line import/no-internal-modules
import { addressSchema, float32Schema, int32Schema, mapStringSchema, schemaMap, stringSchema } from "../feature-libraries/editable-tree/mockData";

enum TreeShape {
    Wide = 0,
    Deep = 1,
}

enum TestPrimitives {
    Number = 0,
    String = 1,
    Boolean = 2,
    Map = 3,
}

// TODO: Once the "BatchTooLarge" error is no longer an issue, extend tests for larger trees.
describe("SharedTree benchmarks", () => {
    describe.skip("Direct JS Object", () => {
        for (let dataType=0 as TestPrimitives; dataType <= 3; dataType++) {
            for (let i = 1; i < 100; i += 10) {
                let tree: ISharedTree;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Deep Tree as JS Object (${TestPrimitives[dataType]}): reads with ${i} nodes`,
                    before: async () => {
                        tree = await getTestTreeAsJSObject(i, TreeShape.Deep, TestPrimitives.String);
                    },
                    benchmarkFn: () => {
                        readTreeAsJSObject(tree);
                    },
                });
            }
            for (let i = 1; i < 1600; i += 100) {
                let tree: ISharedTree;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Wide Tree as JS Object (${TestPrimitives[dataType]}): reads with ${i} nodes`,
                    before: async () => {
                        tree = await getTestTreeAsJSObject(i, TreeShape.Wide, TestPrimitives.String);
                    },
                    benchmarkFn: () => {
                        readTreeAsJSObject(tree);
                    },
                });
            }
        }
    });
    describe.skip("Cursors", () => {
        for (let dataType=0 as TestPrimitives; dataType <= 3; dataType++) {
            for (let i = 1; i < 100; i += 10) {
                let tree: ISharedTree;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Deep Tree (${TestPrimitives[dataType]}) with cursor: reads with ${i} nodes`,
                    before: async () => {
                        tree = await generateTestTree(i, TreeShape.Deep, TestPrimitives.String);
                    },
                    benchmarkFn: () => {
                        readTree(tree, i, TreeShape.Deep);
                    },
                });
            }
            for (let i = 1; i < 1600; i += 100) {
                let tree: ISharedTree;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Wide Tree (${TestPrimitives[dataType]}) with cursor: reads with ${i} nodes`,
                    before: async () => {
                        tree = await generateTestTree(i, TreeShape.Wide, TestPrimitives.String);
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
                    title: `Deep Tree (${TestPrimitives[dataType]}) with cursor: writes ${i} nodes`,
                    before: () => {},
                    benchmarkFn: async () => {
                        tree = await generateTestTree(i, TreeShape.Deep, TestPrimitives.String);
                    },
                });
            }
            for (let i = 1; i < 1600; i += 100) {
                let tree: ISharedTree;
                benchmark({
                    type: BenchmarkType.Measurement,
                    title: `Wide Tree (${TestPrimitives[dataType]}) with cursor: writes ${i} nodes`,
                    before: () => {},
                    benchmarkFn: async () => {
                        tree = await generateTestTree(i, TreeShape.Wide, TestPrimitives.String);
                    },
                });
            }
        }
    });
    describe("Editable Tree", () => {
        it("consistent given the same seed", () => {
            const random = makeRandom(0);
            const a = getJSTestTreeDeep(3, TestPrimitives.Map, random)
            const jsonData = JSON.stringify([a]);
            // eslint-disable-next-line import/no-nodejs-modules, @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
            const fs = require('fs');
            fs.writeFile("deepTreeJS.json", jsonData, (err: any) => {
                if (err) {
                    console.log(err);
                }
            });
            const q = 1;
            const t = 1;
            assert(q === t);
        });
    });
});

async function generateTestTree(
    numberOfNodes:number,
    shape:TreeShape,
    dataType:TestPrimitives
): Promise<ISharedTree> {
    const seed = 0;
    const random = makeRandom(seed);
    const provider = await TestTreeProvider.create(1);
    const [tree] = provider.trees;
    const personData: JsonableTree = generateTreeData(dataType, random)
    // Insert root node
    initializeTestTree(tree, personData, fullSchemaData);
    switch (shape) {
        case TreeShape.Deep:
            await setNodesNarrow(tree, numberOfNodes, dataType, provider, random);
            break;
        case TreeShape.Wide:
            await setNodesWide(tree, numberOfNodes, dataType, provider, random);
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
        case TestPrimitives.String:
            field = {name: [{ value: insertValue.toString(), type: stringSchema.name }]}
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

const booleanSchema = namedTreeSchema({
    name: brand("Boolean"),
    extraLocalFields: emptyField,
    value: ValueSchema.Boolean,
});

const personSchema = namedTreeSchema({
    name: brand("Test:Person"),
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


function readTree(tree: any, numberOfNodes: number, shape: TreeShape) {
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
