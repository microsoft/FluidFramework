/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IRandom, makeRandom } from "@fluid-internal/stochastic-test-utils";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { Jsonable } from "@fluidframework/datastore-definitions";
import {
	createField,
	FieldKinds,
	getField,
	isUnwrappedNode,
	namedTreeSchema,
	singleTextCursor,
} from "../../feature-libraries";
import { brand, unreachableCase } from "../../util";
import { ITestTreeProvider, TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import {
	schemaMap,
	// eslint-disable-next-line import/no-internal-modules
} from "../feature-libraries/editable-tree/mockData";
import {
	FieldKindIdentifier,
	fieldSchema,
	GlobalFieldKey,
	IForestSubscription,
	JsonableTree,
	LocalFieldKey,
	moveToDetachedField,
	rootFieldKey,
	rootFieldKeySymbol,
	SchemaData,
	TransactionResult,
	TreeSchemaIdentifier,
	UpPath,
	ValueSchema,
} from "../../core";

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

async function createSharedTrees(
	schemaData: SchemaData,
	data: JsonableTree[],
	numberOfTrees = 1,
): Promise<readonly [ITestTreeProvider, readonly ISharedTree[]]> {
	const provider = await TestTreeProvider.create(numberOfTrees);
	for (const tree of provider.trees) {
		assert(tree.isAttached());
	}
	provider.trees[0].storedSchema.update(schemaData);
	provider.trees[0].context.root.insertNodes(0, data.map(singleTextCursor));
	await provider.ensureSynchronized();
	return [provider, provider.trees];
}

const globalFieldKey: GlobalFieldKey = brand("foo");
const localFieldKey: LocalFieldKey = brand("foo");
const rootSchemaName: TreeSchemaIdentifier = brand("Test");

function getTestSchema(fieldKind: { identifier: FieldKindIdentifier }): SchemaData {
	const testRootNodeSchema = namedTreeSchema({
		name: rootSchemaName,
		localFields: {
			[localFieldKey]: fieldSchema(fieldKind),
		},
		globalFields: [globalFieldKey],
		value: ValueSchema.Serializable,
	});
	schemaMap.set(rootSchemaName, testRootNodeSchema);
	schemaMap.set(dataSchema.name, dataSchema);
	return {
		treeSchema: schemaMap,
		globalFieldSchema: new Map([
			[rootFieldKey, fieldSchema(FieldKinds.optional, [rootSchemaName])],
			[globalFieldKey, fieldSchema(fieldKind)],
		]),
	};
}

const dataSchema = namedTreeSchema({
	name: brand("DataSchema"),
	localFields: {
		foo: fieldSchema(FieldKinds.optional),
	},
	value: ValueSchema.Number,
});

// number of nodes in test for wide trees
const nodesCountWide = [5, 100, 500];
// number of nodes in test for deep trees
const nodesCountDeep = [5, 10, 100];

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

// TODO: Once the "BatchTooLarge" error is no longer an issue, extend tests for larger trees.
describe("SharedTree benchmarks", () => {
	describe("Direct JS Object", () => {
		const random = makeRandom(0);
		for (let dataType = 0 as TestPrimitives; dataType <= 4; dataType++) {
			for (const i of nodesCountDeep) {
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
			for (const i of nodesCountWide) {
				let tree: ISharedTree;
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Wide Tree as JS Object (${TestPrimitives[dataType]}): reads with ${i} nodes`,
					before: async () => {
						tree = getTestTreeAsJSObject(i, TreeShape.Wide, dataType);
					},
					benchmarkFn: () => {
						readTreeAsJSObject(tree);
					},
				});
			}
			for (const i of nodesCountDeep) {
				let tree: ISharedTree;
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Deep Tree as JS Object (${TestPrimitives[dataType]}): writes with ${i} nodes`,
					before: async () => {},
					benchmarkFn: () => {
						tree = getTestTreeAsJSObject(i, TreeShape.Deep, dataType);
					},
				});
			}
			for (const i of nodesCountWide) {
				let tree: ISharedTree;
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Wide Tree as JS Object (${TestPrimitives[dataType]}): writes with ${i} nodes`,
					before: async () => {},
					benchmarkFn: () => {
						tree = getTestTreeAsJSObject(i, TreeShape.Wide, dataType);
					},
				});
			}
			for (const i of nodesCountDeep) {
				let tree: ISharedTree;
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Deep Tree as JS Object (${TestPrimitives[dataType]}): manipulations with ${i} nodes`,
					before: async () => {
						tree = getTestTreeAsJSObject(i, TreeShape.Deep, dataType);
					},
					benchmarkFn: () => {
						manipulateTreeAsJSObject(tree, dataType, random);
					},
				});
			}
			for (const i of nodesCountWide) {
				let tree: ISharedTree;
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Wide Tree as JS Object (${TestPrimitives[dataType]}): manipulations with ${i} nodes`,
					before: async () => {
						tree = getTestTreeAsJSObject(i, TreeShape.Wide, dataType);
					},
					benchmarkFn: () => {
						manipulateTreeAsJSObject(tree, dataType, random);
					},
				});
			}
		}
	});
	describe("Cursors", () => {
		for (let dataType = 0 as TestPrimitives; dataType <= 4; dataType++) {
			for (const i of nodesCountDeep) {
				let tree: ISharedTree;
				const random = makeRandom(0);
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Deep Tree (${TestPrimitives[dataType]}) with cursor: reads with ${i} nodes`,
					before: async () => {
						tree = await generateTestTree(i, TreeShape.Deep, dataType, random);
					},
					benchmarkFn: () => {
						readCursorTree(tree.forest, i, TreeShape.Deep);
					},
				});
			}
			for (const i of nodesCountWide) {
				let tree: ISharedTree;
				const random = makeRandom(0);
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Wide Tree (${TestPrimitives[dataType]}) with cursor: reads with ${i} nodes`,
					before: async () => {
						tree = await generateTestTree(i, TreeShape.Wide, dataType, random);
					},
					benchmarkFn: () => {
						readCursorTree(tree.forest, i, TreeShape.Wide);
					},
				});
			}
			for (const i of nodesCountDeep) {
				let tree: ISharedTree;
				const random = makeRandom(0);
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Deep Tree (${TestPrimitives[dataType]}) with cursor: writes ${i} nodes`,
					before: () => {},
					benchmarkFn: async () => {
						tree = await generateTestTree(i, TreeShape.Deep, dataType, random);
					},
				});
			}
			for (const i of nodesCountWide) {
				let tree: ISharedTree;
				const random = makeRandom(0);
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Wide Tree (${TestPrimitives[dataType]}) with cursor: writes ${i} nodes`,
					before: () => {},
					benchmarkFn: async () => {
						tree = await generateTestTree(i, TreeShape.Wide, dataType, random);
					},
				});
			}
			for (const i of nodesCountDeep) {
				let tree: ISharedTree;
				const random = makeRandom(0);
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Deep Tree (${TestPrimitives[dataType]}) with cursor: manipulations with ${i} nodes`,
					before: async () => {
						tree = await generateTestTree(i, TreeShape.Deep, dataType, random);
					},
					benchmarkFn: () => {
						manipulateTree(tree, i, TreeShape.Deep, dataType, random);
					},
				});
			}
			for (const i of nodesCountWide) {
				let tree: ISharedTree;
				const random = makeRandom(0);
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Wide Tree (${TestPrimitives[dataType]}) with cursor: manipulations with ${i} nodes`,
					before: async () => {
						tree = await generateTestTree(i, TreeShape.Wide, dataType, random);
					},
					benchmarkFn: () => {
						manipulateTree(tree, i, TreeShape.Wide, dataType, random);
					},
				});
			}
		}
	});
	describe("EditableTree", () => {
		const random = makeRandom(0);
		for (let dataType = 0 as TestPrimitives; dataType <= 4; dataType++) {
			for (const i of nodesCountDeep) {
				let tree: ISharedTree;
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Deep Tree (${TestPrimitives[dataType]}) with Editable Tree: reads with ${i} nodes`,
					before: async () => {
						tree = await generateEditableTree(i, TreeShape.Deep, random, dataType);
					},
					benchmarkFn: () => {
						readEditableTree(tree, i, TreeShape.Deep);
					},
				});
			}
			for (const i of nodesCountWide) {
				let tree: ISharedTree;
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Wide Tree (${TestPrimitives[dataType]}) with Editable Tree: reads with ${i} nodes`,
					before: async () => {
						tree = await generateEditableTree(i, TreeShape.Wide, random, dataType);
					},
					benchmarkFn: () => {
						readEditableTree(tree, i, TreeShape.Wide);
					},
				});
			}
			for (const i of nodesCountDeep) {
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Deep Tree (${TestPrimitives[dataType]}) with Editable Tree: writes ${i} nodes`,
					before: () => {},
					benchmarkFn: async () => {
						const tree = await generateEditableTree(
							i,
							TreeShape.Deep,
							random,
							dataType,
						);
					},
				});
			}
			for (const i of nodesCountWide) {
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Deep Tree (${TestPrimitives[dataType]}) with Editable Tree: writes ${i} nodes`,
					before: () => {},
					benchmarkFn: async () => {
						const tree = await generateEditableTree(
							i,
							TreeShape.Wide,
							random,
							dataType,
						);
					},
				});
			}
			for (const i of nodesCountDeep) {
				let tree: ISharedTree;
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Deep Tree (${TestPrimitives[dataType]}) with Editable Tree: reads with ${i} nodes`,
					before: async () => {
						tree = await generateEditableTree(i, TreeShape.Deep, random, dataType);
					},
					benchmarkFn: () => {
						manipulateEditableTree(tree, i, TreeShape.Deep, dataType, random);
					},
				});
			}
			for (const i of nodesCountWide) {
				let tree: ISharedTree;
				benchmark({
					type: BenchmarkType.Measurement,
					title: `Wide Tree (${TestPrimitives[dataType]}) with Editable Tree: reads with ${i} nodes`,
					before: async () => {
						tree = await generateEditableTree(i, TreeShape.Wide, random, dataType);
					},
					benchmarkFn: () => {
						manipulateEditableTree(tree, i, TreeShape.Wide, dataType, random);
					},
				});
			}
		}
	});
});

async function generateTestTree(
	numberOfNodes: number,
	shape: TreeShape,
	dataType: TestPrimitives,
	random: IRandom,
): Promise<ISharedTree> {
	const provider = await TestTreeProvider.create(1);
	const tree = provider.trees[0];
	tree.storedSchema.update(testSchema);
	tree.runTransaction((forest, editor) => {
		const field = editor.sequenceField(undefined, rootFieldKeySymbol);
		field.insert(0, singleTextCursor({ type: dataSchema.name, value: true }));
		return TransactionResult.Apply;
	});
	switch (shape) {
		case TreeShape.Deep:
			await setNodesNarrow(tree, numberOfNodes - 1, dataType, provider, random);
			break;
		case TreeShape.Wide:
			await setNodesWide(tree, numberOfNodes - 1, dataType, provider, random);
			break;
		default:
			unreachableCase(shape);
	}
	return tree;
}

async function setNodesNarrow(
	tree: ISharedTree,
	numberOfNodes: number,
	dataType: TestPrimitives,
	provider: ITestTreeProvider,
	random: IRandom,
): Promise<void> {
	let currPath: UpPath = {
		parent: undefined,
		parentField: rootFieldKeySymbol,
		parentIndex: 0,
	};
	for (let i = 0; i < numberOfNodes; i++) {
		tree.runTransaction((forest, editor) => {
			const field = editor.sequenceField(currPath, localFieldKey);
			field.insert(0, singleTextCursor(generateTreeData(dataType, random)));
			return TransactionResult.Apply;
		});
		currPath = {
			parent: currPath,
			parentField: localFieldKey,
			parentIndex: 0,
		};
	}
	await provider.ensureSynchronized();
}

async function setNodesWide(
	tree: ISharedTree,
	numberOfNodes: number,
	dataType: TestPrimitives,
	provider: ITestTreeProvider,
	random: IRandom,
): Promise<void> {
	const path: UpPath = {
		parent: undefined,
		parentField: rootFieldKeySymbol,
		parentIndex: 0,
	};
	for (let j = 0; j < numberOfNodes; j++) {
		const personData = generateTreeData(dataType, random);
		tree.runTransaction((forest, editor) => {
			const writeCursor = singleTextCursor(personData);
			const field = editor.sequenceField(path, localFieldKey);
			field.insert(j, writeCursor);
			return TransactionResult.Apply;
		});
	}
	await provider.ensureSynchronized();
}

async function generateEditableTree(
	numberOfNodes: number,
	shape: TreeShape,
	random: IRandom,
	dataType: TestPrimitives,
): Promise<ISharedTree> {
	const [provider, trees] = await createSharedTrees(
		getTestSchema(FieldKinds.sequence),
		[{ type: rootSchemaName }],
		1,
	);
	const tree = trees[0].root;
	assert(isUnwrappedNode(tree));
	let field_0;
	let currentNode;
	switch (shape) {
		case TreeShape.Deep:
			tree[createField](localFieldKey, [
				singleTextCursor({
					type: dataSchema.name,
					value: generateTreeData(dataType, random),
				}),
			]);
			assert(isUnwrappedNode(trees[0].root));
			field_0 = tree[getField](localFieldKey);
			assert(field_0 !== undefined);
			currentNode = field_0.getNode(0);
			for (let i = 0; i < numberOfNodes; i++) {
				const treeData = generateTreeData(dataType, random);
				currentNode[createField](localFieldKey, singleTextCursor(treeData));
				currentNode = currentNode[getField](localFieldKey).getNode(0);
			}
			break;
		case TreeShape.Wide:
			assert(isUnwrappedNode(trees[0].root));
			for (let i = 0; i < numberOfNodes - 1; i++) {
				trees[0].root[getField](localFieldKey).insertNodes(
					i,
					singleTextCursor(generateTreeData(dataType, random)),
				);
			}
			break;
		default:
			unreachableCase(shape);
	}
	return trees[0];
}
const booleans = [true, false];

function generateTreeData(dataType: TestPrimitives, random: IRandom): JsonableTree {
	const insertValue = random.integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
	let map;
	switch (dataType) {
		case TestPrimitives.Number:
			return { value: insertValue, type: dataSchema.name };
		case TestPrimitives.Float:
			return { value: insertValue, type: dataSchema.name };
		case TestPrimitives.String:
			return {
				value: random.real(0, Number.MAX_SAFE_INTEGER).toString(),
				type: dataSchema.name,
			};
		case TestPrimitives.Boolean:
			return { value: random.pick(booleans), type: dataSchema.name };
		case TestPrimitives.Map:
			map = {
				mapField2: {
					mapField3: [{ type: dataSchema.name, value: insertValue.toString() }],
				},
			};
			return {
				value: map,
				type: dataSchema.name,
			};
		default:
			unreachableCase(dataType);
	}
}

function getTestTreeAsJSObject(
	numberOfNodes: number,
	shape: TreeShape,
	dataType: TestPrimitives,
): Jsonable {
	const seed = 0;
	const random = makeRandom(seed);
	let tree;
	switch (shape) {
		case TreeShape.Deep:
			tree = [getJSTestTreeDeep(numberOfNodes, dataType, random)];
			break;
		case TreeShape.Wide:
			tree = getJSTestTreeWide(numberOfNodes, dataType, random);
			break;
		default:
			unreachableCase(shape);
	}
	const testTreeJS = JSON.parse(JSON.stringify(tree));
	return testTreeJS;
}

function getJSTestTreeWide(numberOfNodes: number, dataType: TestPrimitives, random: IRandom): Jsonable {
	const nodes = [];
	for (let i = 0; i < numberOfNodes - 1; i++) {
		const node = generateTreeData(dataType, random);
		nodes.push(node);
	}
	const tree = {
		type: dataSchema.name,
		fields: {
			foo: nodes,
		},
		value: generateTreeData(dataType, random).value,
	};
	return tree;
}

function getJSTestTreeDeep(numberOfNodes: number, dataType: TestPrimitives, random: IRandom): Jsonable {
	const node = generateTreeData(dataType, random);
	if (numberOfNodes === 1) {
		return {
			type: dataSchema.name,
			value: node.value,
		};
	}
	const tree = {
		type: dataSchema.name,
		fields: {
			foo: [getJSTestTreeDeep(numberOfNodes - 1, dataType, random)],
		},
		value: node.value,
	};
	return tree;
}

function readTreeAsJSObject(tree: Jsonable) {
	for (const key of Object.keys(tree)) {
		if (typeof tree[key] === "object" && tree[key] !== null) readTreeAsJSObject(tree[key]);
		if (key === "value") {
			assert(tree[key] !== undefined);
		}
	}
}

function manipulateTreeAsJSObject(tree: Jsonable, dataType: TestPrimitives, random: IRandom): void {
	for (const key of Object.keys(tree)) {
		if (typeof tree[key] === "object" && tree[key] !== null)
			manipulateTreeAsJSObject(tree[key], dataType, random);
		if (key === "value") {
			tree[key] = generateTreeData(dataType, random).value;
		}
	}
}

function readCursorTree(forest: IForestSubscription, numberOfNodes: number, shape: TreeShape) {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	assert(readCursor.firstNode());
	switch (shape) {
		case TreeShape.Deep:
			for (let i = 0; i < numberOfNodes - 1; i++) {
				readCursor.firstField();
				assert(readCursor.firstNode());
			}
			break;
		case TreeShape.Wide:
			readCursor.firstField();
			readCursor.firstNode();
			for (let j = 0; j < numberOfNodes - 1; j++) {
				readCursor.nextNode();
			}
			break;
		default:
			unreachableCase(shape);
	}
	readCursor.free();
}

function manipulateTree(
	tree: ISharedTree,
	numberOfNodes: number,
	shape: TreeShape,
	dataType: TestPrimitives,
	random: IRandom,
) {
	let path: UpPath;
	switch (shape) {
		case TreeShape.Deep:
			path = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};
			for (let i = 0; i < numberOfNodes - 1; i++) {
				path = {
					parent: path,
					parentField: localFieldKey,
					parentIndex: 0,
				};
			}
			tree.runTransaction((forest, editor) => {
				editor.setValue(path, { type: brand("Test"), value: 123 });
				return TransactionResult.Apply;
			});
			break;
		case TreeShape.Wide:
			for (let i = 0; i < numberOfNodes - 1; i++) {
				path = {
					parent: {
						parent: undefined,
						parentField: rootFieldKeySymbol,
						parentIndex: 0,
					},
					parentField: localFieldKey,
					parentIndex: i,
				};
				tree.runTransaction((forest, editor) => {
					editor.setValue(path, { type: brand("Test"), value: 123 });
					return TransactionResult.Apply;
				});
			}
			break;
		default:
			unreachableCase(shape);
	}
}

function readEditableTree(
	tree: ISharedTree,
	numberOfNodes: number,
	shape: TreeShape,
) {
	assert(isUnwrappedNode(tree.root));
	let currField;
	let currNode;
	switch (shape) {
		case TreeShape.Deep:
			currField = tree.root[getField](localFieldKey);
			currNode = currField.getNode(0);
			for (let j = 0; j < numberOfNodes; j++) {
				currField = currNode[getField](localFieldKey);
				currNode = currField.getNode(0);
			}
			break;
		case TreeShape.Wide:
			for (let j = 0; j < numberOfNodes - 1; j++) {
				tree.root[getField](localFieldKey).getNode(j);
			}
			break;
		default:
			unreachableCase(shape);
	}
}

function manipulateEditableTree(
	tree: ISharedTree,
	numberOfNodes: number,
	shape: TreeShape,
	dataType: TestPrimitives,
	random: IRandom,
) {
	assert(isUnwrappedNode(tree.root));
	let currField;
	let currNode;
	switch (shape) {
		case TreeShape.Deep:
			currField = tree.root[getField](localFieldKey);
			currNode = currField.getNode(0);
			for (let j = 0; j < numberOfNodes; j++) {
				currField = currNode[getField](localFieldKey);
				currNode = currField.getNode(0);
			}
			currField.replaceNodes(0, singleTextCursor(generateTreeData(dataType, random)), 1);
			break;
		case TreeShape.Wide:
			for (let j = 0; j < numberOfNodes - 1; j++) {
				tree.root[getField](localFieldKey).replaceNodes(
					j,
					singleTextCursor(generateTreeData(dataType, random)),
					1,
				);
			}
			break;
		default:
			unreachableCase(shape);
	}
}
