/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { unreachableCase } from "@fluidframework/common-utils";
import {
	createField,
	EditableField,
	FieldKinds,
	getField,
	isEditableField,
	isUnwrappedNode,
	namedTreeSchema,
	singleTextCursor,
	UnwrappedEditableField,
} from "../../feature-libraries";
import { brand } from "../../util";
import { ITestTreeProvider, TestTreeProvider } from "../utils";
import { ISharedTree } from "../../shared-tree";
import {
	FieldKindIdentifier,
	fieldSchema,
	GlobalFieldKey,
	IForestSubscription,
	JsonableTree,
	LocalFieldKey,
	moveToDetachedField,
	NamedTreeSchema,
	rootFieldKey,
	rootFieldKeySymbol,
	SchemaData,
	TransactionResult,
	TreeSchemaIdentifier,
	UpPath,
	Value,
	ValueSchema,
} from "../../core";

/**
 * Shapes of trees to test with.
 */
enum TreeShape {
	/**
	 * Each node is inserted directly 1 layer below the root node, making a wide tree.
	 * Used to measure the performance of editing long sequences.
	 */
	Wide = 0,
	/**
	 * Each node is inserted one layer below the previous node, making a stick-like tree.
	 * Used to measure the performance costs related to the length of paths.
	 */
	Deep = 1,
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
	const testSchemaMap: Map<TreeSchemaIdentifier, NamedTreeSchema> = new Map();
	testSchemaMap.set(rootSchemaName, testRootNodeSchema);
	testSchemaMap.set(dataSchema.name, dataSchema);
	return {
		treeSchema: testSchemaMap,
		globalFieldSchema: new Map([
			[rootFieldKey, fieldSchema(FieldKinds.value, [rootSchemaName])],
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
const nodesCountWide = [
	[1, BenchmarkType.Measurement],
	[100, BenchmarkType.Perspective],
	[500, BenchmarkType.Measurement],
];
// number of nodes in test for deep trees
const nodesCountDeep = [
	[1, BenchmarkType.Measurement],
	[10, BenchmarkType.Perspective],
	[100, BenchmarkType.Measurement],
];

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

const testSubtrees: Map<string, JsonableTree> = new Map<string, JsonableTree>([
	["Number", { value: 1, type: dataSchema.name }],
	["Float", { value: 1.0, type: dataSchema.name }],
	["String", { value: "testString", type: dataSchema.name }],
	["Boolean", { value: true, type: dataSchema.name }],
	[
		"Map",
		{
			value: {
				mapField2: {
					mapField3: [{ type: dataSchema.name, value: 1 }],
				},
			},
			type: dataSchema.name,
		},
	],
]);

// TODO: Once the "BatchTooLarge" error is no longer an issue, extend tests for larger trees.
describe("SharedTree benchmarks", () => {
	describe("Direct JS Object", () => {
		for (const dataType of testSubtrees.keys()) {
			for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
				let tree: Jsonable;
				benchmark({
					type: benchmarkType,
					title: `Deep Tree as JS Object (${dataType}): reads with ${numberOfNodes} nodes`,
					before: () => {
						tree = getTestTreeAsJSObject(numberOfNodes, TreeShape.Deep, dataType);
					},
					benchmarkFn: () => {
						assert.equal(readTreeAsJSObject(tree, 0), numberOfNodes)
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
				let tree: Jsonable;
				benchmark({
					type: benchmarkType,
					title: `Wide Tree as JS Object (${dataType}): reads with ${numberOfNodes} nodes`,
					before: () => {
						tree = getTestTreeAsJSObject(numberOfNodes, TreeShape.Wide, dataType);
					},
					benchmarkFn: () => {
						assert.equal(readTreeAsJSObject(tree, 0), numberOfNodes)
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
				let tree: Jsonable;
				benchmark({
					type: benchmarkType,
					title: `Deep Tree as JS Object (${dataType}): writes with ${numberOfNodes} nodes`,
					benchmarkFn: () => {
						tree = getTestTreeAsJSObject(numberOfNodes, TreeShape.Deep, dataType);
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
				let tree: Jsonable;
				benchmark({
					type: benchmarkType,
					title: `Wide Tree as JS Object (${dataType}): writes with ${numberOfNodes} nodes`,
					benchmarkFn: () => {
						tree = getTestTreeAsJSObject(numberOfNodes, TreeShape.Wide, dataType);
					},
				});
			}
			describe(`Edit JS Object ${dataType}`, () => {
				for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
					let tree: Jsonable;
					let leafNode: Jsonable;
					benchmark({
						type: benchmarkType,
						title: `Update value at leaf of ${numberOfNodes} deep tree`,
						before: () => {
							tree = getTestTreeAsJSObject(numberOfNodes, TreeShape.Deep, dataType);
							leafNode = getLeafNodeFromJSObject(tree);
						},
						benchmarkFn: () => {
							manipulateTreeAsJSObject(leafNode, TreeShape.Deep);
						},
					});
				}
				for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
					let tree: Jsonable;
					benchmark({
						type: benchmarkType,
						title: `Update value at leaf of ${numberOfNodes} Wide tree`,
						before: () => {
							tree = getTestTreeAsJSObject(numberOfNodes, TreeShape.Wide, dataType);
						},
						benchmarkFn: () => {
							manipulateTreeAsJSObject(tree, TreeShape.Wide);
						},
					});
				}
			});
		}
	});
	describe("Cursors", () => {
		for (const dataType of testSubtrees.keys()) {
			for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
				let tree: ISharedTree;
				let provider: ITestTreeProvider;
				benchmark({
					type: benchmarkType,
					title: `Deep Tree (${dataType}) with cursor: reads with ${numberOfNodes} nodes`,
					before: async () => {
						provider = await TestTreeProvider.create(1);
						tree = provider.trees[0];
						tree.storedSchema.update(testSchema);
						await insertNodesToTestTree(
							provider,
							tree,
							numberOfNodes,
							TreeShape.Deep,
							dataType,
						);
					},
					benchmarkFn: () => {
						assert.equal(readCursorTree(tree.forest, numberOfNodes, TreeShape.Deep), numberOfNodes);
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
				let tree: ISharedTree;
				let provider: ITestTreeProvider;
				benchmark({
					type: benchmarkType,
					title: `Wide Tree (${dataType}) with cursor: reads with ${numberOfNodes} nodes`,
					before: async () => {
						provider = await TestTreeProvider.create(1);
						tree = provider.trees[0];
						tree.storedSchema.update(testSchema);
						await insertNodesToTestTree(
							provider,
							tree,
							numberOfNodes,
							TreeShape.Wide,
							dataType,
						);
					},
					benchmarkFn: () => {
						assert.equal(readCursorTree(tree.forest, numberOfNodes, TreeShape.Wide), numberOfNodes);
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
				let tree: ISharedTree;
				let provider: ITestTreeProvider;
				benchmark({
					type: benchmarkType,
					title: `Deep Tree (${dataType}) with cursor: writes ${numberOfNodes} nodes`,
					before: async () => {
						provider = await TestTreeProvider.create(1);
						tree = provider.trees[0];
						tree.storedSchema.update(testSchema);
					},
					benchmarkFn: async () => {
						await insertNodesToTestTree(
							provider,
							tree,
							numberOfNodes,
							TreeShape.Deep,
							dataType,
						);
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
				let tree: ISharedTree;
				let provider: ITestTreeProvider;
				benchmark({
					type: benchmarkType,
					title: `Wide Tree (${dataType}) with cursor: writes ${numberOfNodes} nodes`,
					before: async () => {
						provider = await TestTreeProvider.create(1);
						tree = provider.trees[0];
						tree.storedSchema.update(testSchema);
					},
					benchmarkFn: async () => {
						await insertNodesToTestTree(
							provider,
							tree,
							numberOfNodes,
							TreeShape.Wide,
							dataType,
						);
					},
				});
			}
			describe(`Edit Cursor Tree ${dataType}`, () => {
				for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
					let tree: ISharedTree;
					let provider: ITestTreeProvider;
					let path: UpPath;
					benchmark({
						type: benchmarkType,
						title: `Update value at leaf of ${numberOfNodes} deep tree`,
						before: async () => {
							provider = await TestTreeProvider.create(1);
							tree = provider.trees[0];
							tree.storedSchema.update(testSchema);
							await insertNodesToTestTree(
								provider,
								tree,
								numberOfNodes,
								TreeShape.Deep,
								dataType,
							);
							path = getCursorLeafNode(numberOfNodes, TreeShape.Deep);
						},
						benchmarkFn: () => {
							manipulateCursorTree(tree, path, dataType);
						},
					});
				}
				for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
					let tree: ISharedTree;
					let provider: ITestTreeProvider;
					let path: UpPath;
					benchmark({
						type: benchmarkType,
						title: `Update value at leaf of ${numberOfNodes} wide tree`,
						before: async () => {
							provider = await TestTreeProvider.create(1);
							tree = provider.trees[0];
							tree.storedSchema.update(testSchema);
							await insertNodesToTestTree(
								provider,
								tree,
								numberOfNodes,
								TreeShape.Wide,
								dataType,
							);
							path = getCursorLeafNode(numberOfNodes, TreeShape.Wide);
						},
						benchmarkFn: () => {
							manipulateCursorTree(tree, path, dataType);
						},
					});
				}
			});
		}
	});
	describe("EditableTree bench", () => {
		for (const dataType of testSubtrees.keys()) {
			for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
				let provider: ITestTreeProvider;
				let trees: readonly ISharedTree[];
				let tree: ISharedTree;
				benchmark({
					type: benchmarkType,
					title: `Deep Tree (${dataType}) with Editable Tree: reads with ${numberOfNodes} nodes`,
					before: async () => {
						[provider, trees] = await createSharedTrees(
							getTestSchema(FieldKinds.optional),
							[{ type: rootSchemaName }],
							1,
						);
						tree = trees[0];
						insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Deep, dataType);
					},
					benchmarkFn: () => {
						readEditableTree(tree, numberOfNodes, TreeShape.Deep);
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
				let provider: ITestTreeProvider;
				let trees: readonly ISharedTree[];
				let tree: ISharedTree;
				benchmark({
					type: benchmarkType,
					title: `Wide Tree (${dataType}) with Editable Tree: reads with ${numberOfNodes} nodes`,
					before: async () => {
						[provider, trees] = await createSharedTrees(
							getTestSchema(FieldKinds.sequence),
							[{ type: rootSchemaName }],
							1,
						);
						tree = trees[0];
						insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Wide, dataType);
					},
					benchmarkFn: () => {
						readEditableTree(tree, numberOfNodes, TreeShape.Wide);
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
				let provider: ITestTreeProvider;
				let trees: readonly ISharedTree[];
				let tree: ISharedTree;
				benchmark({
					type: benchmarkType,
					title: `Deep Tree (${dataType}) with Editable Tree: writes ${numberOfNodes} nodes`,
					before: async () => {
						[provider, trees] = await createSharedTrees(
							getTestSchema(FieldKinds.sequence),
							[{ type: rootSchemaName }],
							1,
						);
						tree = trees[0];
					},
					benchmarkFn: async () => {
						insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Deep, dataType);
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
				let provider: ITestTreeProvider;
				let trees: readonly ISharedTree[];
				let tree: ISharedTree;
				benchmark({
					type: benchmarkType,
					title: `Wide Tree (${dataType}) with Editable Tree: writes ${numberOfNodes} nodes`,
					before: async () => {
						[provider, trees] = await createSharedTrees(
							getTestSchema(FieldKinds.sequence),
							[{ type: rootSchemaName }],
							1,
						);
						tree = trees[0];
					},
					benchmarkFn: async () => {
						insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Wide, dataType);
					},
				});
			}
			describe(`Edit EditableTree ${dataType}`, () => {
				for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
					let provider: ITestTreeProvider;
					let trees: readonly ISharedTree[];
					let tree: ISharedTree;
					let editableField: EditableField;
					benchmark({
						type: benchmarkType,
						title: `Update value at leaf of ${numberOfNodes} Deep tree`,
						before: async () => {
							[provider, trees] = await createSharedTrees(
								getTestSchema(FieldKinds.sequence),
								[{ type: rootSchemaName }],
								1,
							);
							tree = trees[0];
							insertNodesToEditableTree(
								tree,
								numberOfNodes,
								TreeShape.Deep,
								dataType,
							);
							editableField = getEditableLeafNode(
								tree,
								numberOfNodes,
								TreeShape.Deep,
							);
						},
						benchmarkFn: () => {
							manipulateEditableTree(
								tree,
								numberOfNodes,
								TreeShape.Deep,
								dataType,
								editableField,
							);
						},
					});
				}
				for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
					let provider: ITestTreeProvider;
					let trees: readonly ISharedTree[];
					let tree: ISharedTree;
					let editableField: EditableField;
					benchmark({
						type: benchmarkType,
						title: `Update value at leaf of ${numberOfNodes} wide tree`,
						before: async () => {
							[provider, trees] = await createSharedTrees(
								getTestSchema(FieldKinds.sequence),
								[{ type: rootSchemaName }],
								1,
							);
							tree = trees[0];
							insertNodesToEditableTree(
								tree,
								numberOfNodes,
								TreeShape.Wide,
								dataType,
							);
							editableField = getEditableLeafNode(
								tree,
								numberOfNodes,
								TreeShape.Wide,
							);
						},
						benchmarkFn: () => {
							manipulateEditableTree(
								tree,
								numberOfNodes,
								TreeShape.Wide,
								dataType,
								editableField,
							);
						},
					});
				}
			});
		}
	});
});

async function insertNodesToTestTree(
	provider: ITestTreeProvider,
	tree: ISharedTree,
	numberOfNodes: number,
	shape: TreeShape,
	dataType: string,
): Promise<void> {
	tree.runTransaction((forest, editor) => {
		const field = editor.sequenceField(undefined, rootFieldKeySymbol);
		field.insert(0, singleTextCursor({ type: dataSchema.name, value: testSubtrees.get(dataType)?.value }));
		return TransactionResult.Apply;
	});
	switch (shape) {
		case TreeShape.Deep:
			await setNodesNarrow(tree, numberOfNodes, dataType, provider);
			break;
		case TreeShape.Wide:
			await setNodesWide(tree, numberOfNodes, dataType, provider);
			break;
		default:
			unreachableCase(shape);
	}
}

async function setNodesNarrow(
	tree: ISharedTree,
	numberOfNodes: number,
	dataType: string,
	provider: ITestTreeProvider,
): Promise<void> {
	let currPath: UpPath = {
		parent: undefined,
		parentField: rootFieldKeySymbol,
		parentIndex: 0,
	};
	const node = testSubtrees.get(dataType);
	assert(node !== undefined);
	for (let i = 0; i < numberOfNodes; i++) {
		tree.runTransaction((forest, editor) => {
			const field = editor.sequenceField(currPath, localFieldKey);
			field.insert(0, singleTextCursor(node));
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
	dataType: string,
	provider: ITestTreeProvider,
): Promise<void> {
	const path: UpPath = {
		parent: undefined,
		parentField: rootFieldKeySymbol,
		parentIndex: 0,
	};
	const node = testSubtrees.get(dataType);
	assert(node !== undefined);
	for (let j = 0; j < numberOfNodes; j++) {
		tree.runTransaction((forest, editor) => {
			const writeCursor = singleTextCursor(node);
			const field = editor.sequenceField(path, localFieldKey);
			field.insert(j, writeCursor);
			return TransactionResult.Apply;
		});
	}
	await provider.ensureSynchronized();
}

function insertNodesToEditableTree(
	tree: ISharedTree,
	numberOfNodes: number,
	shape: TreeShape,
	dataType: string,
): void {
	const treeRoot = tree.root;
	assert(isUnwrappedNode(treeRoot));
	let field_0;
	let currentNode;
	const node = testSubtrees.get(dataType);
	assert(node !== undefined);
	switch (shape) {
		case TreeShape.Deep:
			treeRoot[createField](localFieldKey, singleTextCursor(node));
			assert(isUnwrappedNode(treeRoot));
			field_0 = treeRoot[getField](localFieldKey);
			assert(field_0 !== undefined);
			currentNode = field_0.getNode(0);
			for (let i = 0; i < numberOfNodes; i++) {
				assert(isUnwrappedNode(currentNode));
				currentNode[createField](localFieldKey, singleTextCursor(node));
				currentNode = currentNode[getField](localFieldKey).getNode(0);
			}
			break;
		case TreeShape.Wide:
			assert(isUnwrappedNode(treeRoot));
			for (let i = 0; i < numberOfNodes - 1; i++) {
				treeRoot[getField](localFieldKey).insertNodes(i, singleTextCursor(node));
			}
			break;
		default:
			unreachableCase(shape);
	}
}

function getTestTreeAsJSObject(
	numberOfNodes: number,
	shape: TreeShape,
	dataType: string,
): Jsonable {
	let tree;
	switch (shape) {
		case TreeShape.Deep:
			tree = [getJSTestTreeDeep(numberOfNodes, dataType)];
			break;
		case TreeShape.Wide:
			tree = getJSTestTreeWide(numberOfNodes, dataType);
			break;
		default:
			unreachableCase(shape);
	}
	return tree;
}

function getJSTestTreeWide(numberOfNodes: number, dataType: string): Jsonable {
	const nodes = [];
	const node = testSubtrees.get(dataType);
	for (let i = 0; i < numberOfNodes - 1; i++) {
		nodes.push(node);
	}
	const tree = {
		type: dataSchema.name,
		fields: {
			foo: nodes,
		},
		value: testSubtrees.get(dataType)?.value,
	};
	return tree;
}

function getJSTestTreeDeep(numberOfNodes: number, dataType: string): Jsonable {
	const node = testSubtrees.get(dataType);
	assert(node !== undefined);
	if (numberOfNodes === 1) {
		return {
			type: dataSchema.name,
			value: node.value,
		};
	}
	const tree = {
		type: dataSchema.name,
		fields: {
			foo: [getJSTestTreeDeep(numberOfNodes - 1, dataType)],
		},
		value: node.value,
	};
	return tree;
}

function readTreeAsJSObject(tree: Jsonable, initialTotal: Jsonable): Jsonable {
	let currentTotal = initialTotal as number;
	for (const key of Object.keys(tree)) {
		if (typeof tree[key] === "object" && tree[key] !== null) {
			currentTotal = readTreeAsJSObject(tree[key], currentTotal);
		}
		if (key === "value") {
			assert(tree[key] !== undefined);
			if (typeof tree[key] !== "object") {
				currentTotal = applyOperationDuringRead(currentTotal, tree[key]);
			}
		}
	}
	return currentTotal;
}

/**
 * changes the value of the leaf node of the Jsonable tree.
 * @param tree - tree in form of a Jsonable object
 * @param shape - shape of the tree (wide vs deep)
 */
function manipulateTreeAsJSObject(tree: Jsonable, shape: TreeShape): void {
	let nodesUnderRoot;
	switch (shape) {
		case TreeShape.Deep:
			tree[0].value = 1;
			break;
		case TreeShape.Wide:
			nodesUnderRoot = tree.fields.foo.length;
			if (nodesUnderRoot === 0) {
				tree.fields.value = 1;
			} else {
				tree.fields.foo[nodesUnderRoot - 1].value = 1;
			}
			break;
		default:
			unreachableCase(shape);
	}
}

function getLeafNodeFromJSObject(tree: Jsonable): Jsonable {
	for (const key of Object.keys(tree)) {
		if (typeof tree[key] === "object" && tree[key] !== null) {
			if (tree[key].type !== undefined && tree[key].fields === undefined) {
				return tree;
			}
			return getLeafNodeFromJSObject(tree[key]);
		}
	}
}

function readCursorTree(
	forest: IForestSubscription,
	numberOfNodes: number,
	shape: TreeShape,
) {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	assert(readCursor.firstNode());
	let nodesRead = 0;
	let currentTotal = 0 as number;
	switch (shape) {
		case TreeShape.Deep:
			for (let i = 0; i < numberOfNodes; i++) {
				assert(readCursor.firstField());
				assert(readCursor.firstNode());
				currentTotal = applyOperationDuringRead(currentTotal, readCursor.value);
			}
			break;
		case TreeShape.Wide:
			assert(readCursor.firstField());
			for (let inNode = readCursor.firstNode(); inNode; inNode = readCursor.nextNode()) {
				nodesRead += 1;
				currentTotal = applyOperationDuringRead(currentTotal, readCursor.value);
			}
			assert(nodesRead === numberOfNodes);
			break;
		default:
			throw new Error("unreachable case");
	}
	readCursor.free();
	return currentTotal
}

function applyOperationDuringRead(
	current: number,
	value: Value,
) {
	assert(value !== undefined);
	if (typeof value === "number" ){
		return current + value
	}
	return current + 1
}

/**
 * Given a tree and path, changes the node value to a different one.
 * @param tree - tree that you need to manipulate
 * @param path - location where you need to apply the edit
 * @param dataType - the primitive data type of the value to store
 */
function manipulateCursorTree(tree: ISharedTree, path: UpPath, dataType: string) {
	const value = testSubtrees.get(dataType);
	tree.runTransaction((forest, editor) => {
		editor.setValue(path, { type: brand("Test"), value });
		return TransactionResult.Apply;
	});
}

function getCursorLeafNode(numberOfNodes: number, shape: TreeShape): UpPath {
	let path: UpPath;
	switch (shape) {
		case TreeShape.Deep:
			path = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};
			for (let i = 0; i < numberOfNodes; i++) {
				path = {
					parent: path,
					parentField: localFieldKey,
					parentIndex: 0,
				};
			}
			assert(path !== undefined);
			return path;
		case TreeShape.Wide:
			path = {
				parent: {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				},
				parentField: localFieldKey,
				parentIndex: numberOfNodes - 1,
			};
			assert(path !== undefined);
			return path;
		default:
			unreachableCase(shape);
	}
}

function readEditableTree(tree: ISharedTree, numberOfNodes: number, shape: TreeShape) {
	switch (shape) {
		case TreeShape.Deep: {
			let currentNode: UnwrappedEditableField = tree.root;
			for (let j = 0; j < numberOfNodes - 1; j++) {
				assert(isUnwrappedNode(currentNode));
				currentNode = currentNode.foo as UnwrappedEditableField;
			}
			break;
		}
		case TreeShape.Wide: {
			const root = tree.root;
			assert(isUnwrappedNode(root));
			const field = root.foo as UnwrappedEditableField;
			assert(isEditableField(field));
			for (const iterator of field) {
			}
			break;
		}
		default:
			unreachableCase(shape);
	}
}

function manipulateEditableTree(
	tree: ISharedTree,
	numberOfNodes: number,
	shape: TreeShape,
	dataType: string,
	editableField: EditableField,
) {
	assert(isUnwrappedNode(tree.root));
	let nodeIndex: number;
	const node = testSubtrees.get(dataType);
	assert(node !== undefined);
	switch (shape) {
		case TreeShape.Deep:
			editableField.replaceNodes(0, singleTextCursor(node), 1);
			break;
		case TreeShape.Wide:
			nodeIndex = numberOfNodes > 1 ? numberOfNodes - 2 : 0;
			editableField.replaceNodes(nodeIndex, singleTextCursor(node), 1);
			break;
		default:
			unreachableCase(shape);
	}
}

function getEditableLeafNode(
	tree: ISharedTree,
	numberOfNodes: number,
	shape: TreeShape,
): EditableField {
	assert(isUnwrappedNode(tree.root));
	let currentField;
	let currentNode;
	switch (shape) {
		case TreeShape.Deep:
			currentField = tree.root[getField](localFieldKey);
			currentNode = currentField.getNode(0);
			for (let j = 0; j < numberOfNodes; j++) {
				currentField = currentNode[getField](localFieldKey);
				currentNode = currentField.getNode(0);
			}
			assert(currentField !== undefined);
			return currentField;
		case TreeShape.Wide:
			currentField = tree.root[getField](localFieldKey);
			assert(currentField !== undefined);
			return currentField;
		default:
			unreachableCase(shape);
	}
}
