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
	valueSymbol,
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

const testTreeNode: JsonableTree = { value: 1, type: dataSchema.name };
const replacementTestNode: JsonableTree = { value: "1.0", type: dataSchema.name };

// TODO: Once the "BatchTooLarge" error is no longer an issue, extend tests for larger trees.
describe.only("SharedTree benchmarks", () => {
	describe("Direct JS Object", () => {
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: Jsonable;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree as JS Object: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = getTestTreeAsJSObject(numberOfNodes, TreeShape.Deep);
				},
				benchmarkFn: () => {
					assert.equal(readTreeAsJSObject(tree, 0), numberOfNodes);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: Jsonable;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree as JS Object: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = getTestTreeAsJSObject(numberOfNodes, TreeShape.Wide);
				},
				benchmarkFn: () => {
					assert.equal(readTreeAsJSObject(tree, 0), numberOfNodes);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: Jsonable;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree as JS Object: writes with ${numberOfNodes} nodes`,
				benchmarkFn: () => {
					tree = getTestTreeAsJSObject(numberOfNodes, TreeShape.Deep);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: Jsonable;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree as JS Object: writes with ${numberOfNodes} nodes`,
				benchmarkFn: () => {
					tree = getTestTreeAsJSObject(numberOfNodes, TreeShape.Wide);
				},
			});
		}
		describe(`Edit JS Object`, () => {
			for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
				let tree: Jsonable;
				let leafNode: Jsonable;
				benchmark({
					type: benchmarkType,
					title: `Update value at leaf of ${numberOfNodes} deep tree`,
					before: () => {
						tree = getTestTreeAsJSObject(numberOfNodes, TreeShape.Deep);
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
						tree = getTestTreeAsJSObject(numberOfNodes, TreeShape.Wide);
					},
					benchmarkFn: () => {
						manipulateTreeAsJSObject(tree, TreeShape.Wide);
					},
				});
			}
		});
	});
	describe("Cursors", () => {
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: ISharedTree;
			let provider: ITestTreeProvider;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree with cursor: reads with ${numberOfNodes} nodes`,
				before: async () => {
					provider = await TestTreeProvider.create(1);
					tree = provider.trees[0];
					tree.storedSchema.update(testSchema);
					await insertNodesToTestTree(provider, tree, numberOfNodes, TreeShape.Deep);
				},
				benchmarkFn: () => {
					assert.equal(
						readCursorTree(tree.forest, numberOfNodes, TreeShape.Deep),
						numberOfNodes,
					);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: ISharedTree;
			let provider: ITestTreeProvider;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree with cursor: reads with ${numberOfNodes} nodes`,
				before: async () => {
					provider = await TestTreeProvider.create(1);
					tree = provider.trees[0];
					tree.storedSchema.update(testSchema);
					await insertNodesToTestTree(provider, tree, numberOfNodes, TreeShape.Wide);
				},
				benchmarkFn: () => {
					assert.equal(
						readCursorTree(tree.forest, numberOfNodes, TreeShape.Wide),
						numberOfNodes,
					);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: ISharedTree;
			let provider: ITestTreeProvider;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree with cursor: writes ${numberOfNodes} nodes`,
				before: async () => {
					provider = await TestTreeProvider.create(1);
					tree = provider.trees[0];
					tree.storedSchema.update(testSchema);
				},
				benchmarkFn: async () => {
					await insertNodesToTestTree(provider, tree, numberOfNodes, TreeShape.Deep);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: ISharedTree;
			let provider: ITestTreeProvider;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree with cursor: writes ${numberOfNodes} nodes`,
				before: async () => {
					provider = await TestTreeProvider.create(1);
					tree = provider.trees[0];
					tree.storedSchema.update(testSchema);
				},
				benchmarkFn: async () => {
					await insertNodesToTestTree(provider, tree, numberOfNodes, TreeShape.Wide);
				},
			});
		}
		describe(`Edit Cursor Tree`, () => {
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
						await insertNodesToTestTree(provider, tree, numberOfNodes, TreeShape.Deep);
						path = getCursorLeafNode(numberOfNodes, TreeShape.Deep);
					},
					benchmarkFn: () => {
						manipulateCursorTree(tree, path);
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
						await insertNodesToTestTree(provider, tree, numberOfNodes, TreeShape.Wide);
						path = getCursorLeafNode(numberOfNodes, TreeShape.Wide);
					},
					benchmarkFn: () => {
						manipulateCursorTree(tree, path);
					},
				});
			}
		});
	});
	describe("EditableTree bench", () => {
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let provider: ITestTreeProvider;
			let trees: readonly ISharedTree[];
			let tree: ISharedTree;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree with Editable Tree: reads with ${numberOfNodes} nodes`,
				before: async () => {
					[provider, trees] = await createSharedTrees(
						getTestSchema(FieldKinds.optional),
						[{ type: rootSchemaName, value: 1 }],
						1,
					);
					tree = trees[0];
					insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Deep);
				},
				benchmarkFn: () => {
					assert.equal(
						numberOfNodes,
						readEditableTree(tree, numberOfNodes, TreeShape.Deep),
					);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let provider: ITestTreeProvider;
			let trees: readonly ISharedTree[];
			let tree: ISharedTree;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree with Editable Tree: reads with ${numberOfNodes} nodes`,
				before: async () => {
					[provider, trees] = await createSharedTrees(
						getTestSchema(FieldKinds.sequence),
						[{ type: rootSchemaName, value: 1 }],
						1,
					);
					tree = trees[0];
					insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Wide);
				},
				benchmarkFn: () => {
					assert.equal(
						numberOfNodes,
						readEditableTree(tree, numberOfNodes, TreeShape.Wide),
					);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let provider: ITestTreeProvider;
			let trees: readonly ISharedTree[];
			let tree: ISharedTree;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree with Editable Tree: writes ${numberOfNodes} nodes`,
				before: async () => {
					[provider, trees] = await createSharedTrees(
						getTestSchema(FieldKinds.sequence),
						[{ type: rootSchemaName, value: 1 }],
						1,
					);
					tree = trees[0];
				},
				benchmarkFn: () => {
					insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Deep);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let provider: ITestTreeProvider;
			let trees: readonly ISharedTree[];
			let tree: ISharedTree;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree with Editable Tree: writes ${numberOfNodes} nodes`,
				before: async () => {
					[provider, trees] = await createSharedTrees(
						getTestSchema(FieldKinds.sequence),
						[{ type: rootSchemaName, value: 1 }],
						1,
					);
					tree = trees[0];
				},
				benchmarkFn: () => {
					insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Wide);
				},
			});
		}
		describe(`Edit EditableTree`, () => {
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
							[{ type: rootSchemaName, value: 1 }],
							1,
						);
						tree = trees[0];
						insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Deep);
						editableField = getEditableLeafNode(tree, numberOfNodes, TreeShape.Deep);
					},
					benchmarkFn: () => {
						manipulateEditableTree(tree, numberOfNodes, TreeShape.Deep, editableField);
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
							[{ type: rootSchemaName, value: 1 }],
							1,
						);
						tree = trees[0];
						insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Wide);
						editableField = getEditableLeafNode(tree, numberOfNodes, TreeShape.Wide);
					},
					benchmarkFn: () => {
						manipulateEditableTree(tree, numberOfNodes, TreeShape.Wide, editableField);
					},
				});
			}
		});
	});
});

async function insertNodesToTestTree(
	provider: ITestTreeProvider,
	tree: ISharedTree,
	numberOfNodes: number,
	shape: TreeShape,
): Promise<void> {
	const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
	field.insert(0, singleTextCursor(testTreeNode));

	switch (shape) {
		case TreeShape.Deep:
			await setNodesNarrow(tree, numberOfNodes, provider);
			break;
		case TreeShape.Wide:
			await setNodesWide(tree, numberOfNodes, provider);
			break;
		default:
			unreachableCase(shape);
	}
}

async function setNodesNarrow(
	tree: ISharedTree,
	numberOfNodes: number,
	provider: ITestTreeProvider,
): Promise<void> {
	let currPath: UpPath = {
		parent: undefined,
		parentField: rootFieldKeySymbol,
		parentIndex: 0,
	};
	for (let i = 0; i < numberOfNodes; i++) {
		const field = tree.editor.sequenceField(currPath, localFieldKey);
		field.insert(0, singleTextCursor(testTreeNode));

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
	provider: ITestTreeProvider,
): Promise<void> {
	const path: UpPath = {
		parent: undefined,
		parentField: rootFieldKeySymbol,
		parentIndex: 0,
	};
	for (let j = 0; j < numberOfNodes; j++) {
		const field = tree.editor.sequenceField(path, localFieldKey);
		field.insert(j, singleTextCursor(testTreeNode));

	}
	await provider.ensureSynchronized();
}

function insertNodesToEditableTree(
	tree: ISharedTree,
	numberOfNodes: number,
	shape: TreeShape,
): void {
	const treeRoot = tree.root;
	assert(isUnwrappedNode(treeRoot));
	let field_0;
	let currentNode;
	switch (shape) {
		case TreeShape.Deep:
			treeRoot[createField](localFieldKey, singleTextCursor(testTreeNode));
			assert(isUnwrappedNode(treeRoot));
			field_0 = treeRoot[getField](localFieldKey);
			assert(field_0 !== undefined);
			currentNode = field_0.getNode(0);
			for (let i = 0; i < numberOfNodes; i++) {
				assert(isUnwrappedNode(currentNode));
				currentNode[createField](localFieldKey, singleTextCursor(testTreeNode));
				currentNode = currentNode[getField](localFieldKey).getNode(0);
			}
			break;
		case TreeShape.Wide:
			assert(isUnwrappedNode(treeRoot));
			for (let i = 0; i < numberOfNodes; i++) {
				treeRoot[getField](localFieldKey).insertNodes(i, singleTextCursor(testTreeNode));
			}
			break;
		default:
			unreachableCase(shape);
	}
}

function getTestTreeAsJSObject(numberOfNodes: number, shape: TreeShape): Jsonable {
	let tree;
	switch (shape) {
		case TreeShape.Deep:
			tree = [getJSTestTreeDeep(numberOfNodes)];
			break;
		case TreeShape.Wide:
			tree = getJSTestTreeWide(numberOfNodes);
			break;
		default:
			unreachableCase(shape);
	}
	return tree;
}

function getJSTestTreeWide(numberOfNodes: number): Jsonable {
	const nodes = [];
	for (let i = 0; i < numberOfNodes - 1; i++) {
		nodes.push(testTreeNode);
	}
	const tree = {
		type: dataSchema.name,
		fields: {
			foo: nodes,
		},
		value: testTreeNode.value,
	};
	return tree;
}

function getJSTestTreeDeep(numberOfNodes: number): Jsonable {
	if (numberOfNodes === 1) {
		return testTreeNode;
	}
	const tree = {
		type: dataSchema.name,
		fields: {
			foo: [getJSTestTreeDeep(numberOfNodes - 1)],
		},
		value: testTreeNode.value,
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
			tree[0].value = replacementTestNode.value;
			break;
		case TreeShape.Wide:
			nodesUnderRoot = tree.fields.foo.length;
			if (nodesUnderRoot === 0) {
				tree.fields.value = replacementTestNode.value;
			} else {
				tree.fields.foo[nodesUnderRoot - 1].value = replacementTestNode.value;
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

function readCursorTree(forest: IForestSubscription, numberOfNodes: number, shape: TreeShape) {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	assert(readCursor.firstNode());
	let nodesRead = 0;
	let currentTotal = 0 as number;
	switch (shape) {
		case TreeShape.Deep:
			for (let i = 0; i < numberOfNodes; i++) {
				readCursor.enterField(localFieldKey);
				readCursor.enterNode(0);
				currentTotal = applyOperationDuringRead(currentTotal, readCursor.value);
			}
			break;
		case TreeShape.Wide:
			readCursor.enterField(localFieldKey);
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
	return currentTotal;
}

function applyOperationDuringRead(current: number, value: Value) {
	assert(value !== undefined);
	if (typeof value === "number") {
		return current + value;
	}
	return current + 1;
}

/**
 * Given a tree and path, changes the node value to a different one.
 * @param tree - tree that you need to manipulate
 * @param path - location where you need to apply the edit
 */
function manipulateCursorTree(tree: ISharedTree, path: UpPath) {
	const value = 2; // arbitrary different value
	tree.editor.setValue(path, replacementTestNode);

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

function readEditableTree(tree: ISharedTree, numberOfNodes: number, shape: TreeShape): number {
	let sum = 0;
	switch (shape) {
		case TreeShape.Deep: {
			let currentNode: UnwrappedEditableField = tree.root;
			for (let j = 0; j < numberOfNodes; j++) {
				assert(isUnwrappedNode(currentNode));
				const value = currentNode[valueSymbol] as number;
				sum = applyOperationDuringRead(sum, value);
				currentNode = currentNode.foo as UnwrappedEditableField;
			}
			return sum;
		}
		case TreeShape.Wide: {
			const root = tree.root;
			assert(isUnwrappedNode(root));
			const field = root.foo as UnwrappedEditableField;
			assert(isEditableField(field));
			for (let i = 0; i < numberOfNodes; i++) {
				const currentNode = field[i] as UnwrappedEditableField;
				assert(isUnwrappedNode(currentNode));
				const value = currentNode[valueSymbol] as number;
				sum = applyOperationDuringRead(sum, value);
			}
			return sum;
		}
		default:
			unreachableCase(shape);
	}
}

function manipulateEditableTree(
	tree: ISharedTree,
	numberOfNodes: number,
	shape: TreeShape,
	editableField: EditableField,
) {
	assert(isUnwrappedNode(tree.root));
	let nodeIndex: number;
	switch (shape) {
		case TreeShape.Deep:
			editableField.replaceNodes(0, singleTextCursor(replacementTestNode), 1);
			break;
		case TreeShape.Wide:
			nodeIndex = numberOfNodes > 1 ? numberOfNodes - 2 : 0;
			editableField.replaceNodes(nodeIndex, singleTextCursor(replacementTestNode), 1);
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
				const test = currentNode[valueSymbol];
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
