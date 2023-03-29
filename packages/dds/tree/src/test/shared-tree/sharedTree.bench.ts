/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { unreachableCase } from "@fluidframework/common-utils";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import {
	ContextuallyTypedNodeData,
	createField,
	cursorFromContextualData,
	EditableField,
	FieldKinds,
	getField,
	isEditableField,
	isUnwrappedNode,
	jsonableTreeFromCursor,
	SchemaAware,
	singleTextCursor,
	TypedSchema,
	UnwrappedEditableField,
	valueSymbol,
} from "../../feature-libraries";
import { jsonNumber } from "../../domains";
import { brand } from "../../util";
import { ITestTreeProvider, TestTreeProvider, toJsonableTree } from "../utils";
import { ISharedTree, schematizeView, SharedTreeFactory } from "../../shared-tree";
import {
	AllowedUpdateType,
	IForestSubscription,
	JsonableTree,
	LocalFieldKey,
	moveToDetachedField,
	rootFieldKey,
	rootFieldKeySymbol,
	SchemaData,
	TreeSchemaIdentifier,
	UpPath,
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

const localFieldKey: LocalFieldKey = brand("foo");
const rootSchemaName: TreeSchemaIdentifier = brand("Test");

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

// Test data in "deep" mode: a linked list with a number at the end.
const linkedListSchema = TypedSchema.tree("linkedList", {
	local: {
		foo: TypedSchema.field(FieldKinds.value, "linkedList", jsonNumber),
	},
});

const wideRootSchema = TypedSchema.tree("WideRoot", {
	local: {
		foo: TypedSchema.field(FieldKinds.sequence, jsonNumber),
	},
});

const wideSchema = SchemaAware.typedSchemaData(
	[[rootFieldKey, TypedSchema.field(FieldKinds.value, wideRootSchema)]],
	wideRootSchema,
	jsonNumber,
);

const deepSchema = SchemaAware.typedSchemaData(
	[[rootFieldKey, TypedSchema.field(FieldKinds.value, linkedListSchema)]],
	linkedListSchema,
	jsonNumber,
);

const factory = new SharedTreeFactory();

// TODO
const testTreeNode: JsonableTree = { value: 1, type: jsonNumber.name };
const replacementTestNode: JsonableTree = { value: 1.0, type: jsonNumber.name };

interface JSObjectTree {
	type: string;
	value: number;
	fields?: { foo: JSObjectTree[] };
}

/**
 * JS object like a deep tree.
 * Comparible with ContextuallyTypedNodeData
 */
interface JSDeepTree {
	foo: JSDeepTree | number;
}

function makeJsDeepTree(
	depth: number,
	leafValue: number,
): (JSDeepTree | number) & ContextuallyTypedNodeData {
	return depth === 0 ? leafValue : { foo: makeJsDeepTree(depth - 1, leafValue) };
}

// TODO: Once the "BatchTooLarge" error is no longer an issue, extend tests for larger trees.
describe("SharedTree benchmarks", () => {
	describe("Direct JS Object", () => {
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: JSObjectTree[];
			benchmark({
				type: benchmarkType,
				title: `Deep Tree as JS Object: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = getJSTestTreeDeep(numberOfNodes);
				},
				benchmarkFn: () => {
					assert.equal(readDeepTreeAsJSObject(tree, 0), numberOfNodes);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: JSObjectTree[];
			benchmark({
				type: benchmarkType,
				title: `Wide Tree as JS Object: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = [getJSTestTreeWide(numberOfNodes)];
				},
				benchmarkFn: () => {
					assert.equal(readWideTreeAsJSObject(tree, 0), numberOfNodes);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			benchmark({
				type: benchmarkType,
				title: `Deep Tree as JS Object: writes with ${numberOfNodes} nodes`,
				benchmarkFn: () => {
					const tree = getJSTestTreeDeep(numberOfNodes);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			benchmark({
				type: benchmarkType,
				title: `Wide Tree as JS Object: writes with ${numberOfNodes} nodes`,
				benchmarkFn: () => {
					const tree = getJSTestTreeWide(numberOfNodes);
				},
			});
		}
		describe(`Edit JS Object`, () => {
			for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
				let tree: JSObjectTree[];
				let leafNode: JSObjectTree;
				benchmark({
					type: benchmarkType,
					title: `Update value at leaf of ${numberOfNodes} deep tree`,
					before: () => {
						tree = getJSTestTreeDeep(numberOfNodes);
						leafNode = getLeafFromJSObject(tree);
					},
					benchmarkFn: () => {
						manipulateTreeAsJSObject(leafNode, TreeShape.Deep);
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
				let tree: JSObjectTree;
				benchmark({
					type: benchmarkType,
					title: `Update value at leaf of ${numberOfNodes} Wide tree`,
					before: () => {
						tree = getJSTestTreeWide(numberOfNodes);
					},
					benchmarkFn: () => {
						manipulateTreeAsJSObject(tree, TreeShape.Wide);
					},
				});
			}
		});
	});
	describe("Cursors", () => {
		// for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
		// 	let tree: ISharedTree;
		// 	let provider: ITestTreeProvider;
		// 	benchmark({
		// 		type: benchmarkType,
		// 		title: `Deep Tree with cursor: reads with ${numberOfNodes} nodes`,
		// 		before: async () => {
		// 			provider = await TestTreeProvider.create(1);
		// 			tree = provider.trees[0];
		// 			tree.storedSchema.update(testSchema);
		// 			await insertNodesToTestTree(provider, tree, numberOfNodes, TreeShape.Deep);
		// 		},
		// 		benchmarkFn: () => {
		// 			assert.equal(
		// 				readCursorTree(tree.forest, numberOfNodes, TreeShape.Deep),
		// 				numberOfNodes,
		// 			);
		// 		},
		// 	});
		// }
		// for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
		// 	let tree: ISharedTree;
		// 	let provider: ITestTreeProvider;
		// 	benchmark({
		// 		type: benchmarkType,
		// 		title: `Wide Tree with cursor: reads with ${numberOfNodes} nodes`,
		// 		before: async () => {
		// 			provider = await TestTreeProvider.create(1);
		// 			tree = provider.trees[0];
		// 			tree.storedSchema.update(testSchema);
		// 			await insertNodesToTestTree(provider, tree, numberOfNodes, TreeShape.Wide);
		// 		},
		// 		benchmarkFn: () => {
		// 			assert.equal(
		// 				readCursorTree(tree.forest, numberOfNodes, TreeShape.Wide),
		// 				numberOfNodes,
		// 			);
		// 		},
		// 	});
		// }
		// for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
		// 	let tree: ISharedTree;
		// 	let provider: ITestTreeProvider;
		// 	benchmark({
		// 		type: benchmarkType,
		// 		title: `Deep Tree with cursor: writes ${numberOfNodes} nodes`,
		// 		before: async () => {
		// 			provider = await TestTreeProvider.create(1);
		// 			tree = provider.trees[0];
		// 			tree.storedSchema.update(testSchema);
		// 		},
		// 		benchmarkFn: async () => {
		// 			await insertNodesToTestTree(provider, tree, numberOfNodes, TreeShape.Deep);
		// 		},
		// 	});
		// }
		// for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
		// 	let tree: ISharedTree;
		// 	let provider: ITestTreeProvider;
		// 	benchmark({
		// 		type: benchmarkType,
		// 		title: `Wide Tree with cursor: writes ${numberOfNodes} nodes`,
		// 		before: async () => {
		// 			provider = await TestTreeProvider.create(1);
		// 			tree = provider.trees[0];
		// 			tree.storedSchema.update(testSchema);
		// 		},
		// 		benchmarkFn: async () => {
		// 			await insertNodesToTestTree(provider, tree, numberOfNodes, TreeShape.Wide);
		// 		},
		// 	});
		// }
		describe("Edit with editor", () => {
			for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
				let tree: ISharedTree;
				let path: UpPath;
				benchmark({
					type: benchmarkType,
					title: `Update value at leaf of ${numberOfNodes} deep tree`,
					before: () => {
						tree = factory.create(new MockFluidDataStoreRuntime(), "test");
						const schematized = schematizeView(tree, {
							allowedSchemaModifications: AllowedUpdateType.None,
							initialTree: makeJsDeepTree(numberOfNodes, 1),
							schema: deepSchema,
						});
						path = deepPath(numberOfNodes + 1);
					},
					benchmarkFn: () => {
						tree.editor.setValue(path, -1);
					},
					after: () => {
						const expected = jsonableTreeFromCursor(
							cursorFromContextualData(
								tree.storedSchema,
								TypedSchema.nameSet(linkedListSchema),
								makeJsDeepTree(numberOfNodes, -1),
							),
						);
						const actual = toJsonableTree(tree);
						assert.deepEqual(actual, [expected]);
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
				let tree: ISharedTree;
				let path: UpPath;
				benchmark({
					type: benchmarkType,
					title: `Update value at leaf of ${numberOfNodes} wide tree`,
					before: () => {
						tree = factory.create(new MockFluidDataStoreRuntime(), "test");
						const numbers = [];
						for (let index = 0; index < numberOfNodes; index++) {
							numbers.push(index);
						}
						const schematized = schematizeView(tree, {
							allowedSchemaModifications: AllowedUpdateType.None,
							initialTree: { foo: numbers },
							schema: wideSchema,
						});

						path = wideLeafPath(numberOfNodes - 1);
					},
					benchmarkFn: () => {
						tree.editor.setValue(path, -1);
					},
				});
			}
		});
	});
	// describe("EditableTree bench", () => {
	// 	for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
	// 		let provider: ITestTreeProvider;
	// 		let trees: readonly ISharedTree[];
	// 		let tree: ISharedTree;
	// 		benchmark({
	// 			type: benchmarkType,
	// 			title: `Deep Tree with Editable Tree: reads with ${numberOfNodes} nodes`,
	// 			before: async () => {
	// 				[provider, trees] = await createSharedTrees(
	// 					getTestSchema(FieldKinds.optional),
	// 					[{ type: rootSchemaName, value: 1 }],
	// 					1,
	// 				);
	// 				tree = trees[0];
	// 				insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Deep);
	// 			},
	// 			benchmarkFn: () => {
	// 				assert.equal(
	// 					numberOfNodes,
	// 					readEditableTree(tree, numberOfNodes, TreeShape.Deep),
	// 				);
	// 			},
	// 		});
	// 	}
	// 	for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
	// 		let provider: ITestTreeProvider;
	// 		let trees: readonly ISharedTree[];
	// 		let tree: ISharedTree;
	// 		benchmark({
	// 			type: benchmarkType,
	// 			title: `Wide Tree with Editable Tree: reads with ${numberOfNodes} nodes`,
	// 			before: async () => {
	// 				[provider, trees] = await createSharedTrees(
	// 					getTestSchema(FieldKinds.sequence),
	// 					[{ type: rootSchemaName, value: 1 }],
	// 					1,
	// 				);
	// 				tree = trees[0];
	// 				insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Wide);
	// 			},
	// 			benchmarkFn: () => {
	// 				assert.equal(
	// 					numberOfNodes,
	// 					readEditableTree(tree, numberOfNodes, TreeShape.Wide),
	// 				);
	// 			},
	// 		});
	// 	}
	// 	for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
	// 		let provider: ITestTreeProvider;
	// 		let trees: readonly ISharedTree[];
	// 		let tree: ISharedTree;
	// 		benchmark({
	// 			type: benchmarkType,
	// 			title: `Deep Tree with Editable Tree: writes ${numberOfNodes} nodes`,
	// 			before: async () => {
	// 				[provider, trees] = await createSharedTrees(
	// 					getTestSchema(FieldKinds.sequence),
	// 					[{ type: rootSchemaName, value: 1 }],
	// 					1,
	// 				);
	// 				tree = trees[0];
	// 			},
	// 			benchmarkFn: () => {
	// 				insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Deep);
	// 			},
	// 		});
	// 	}
	// 	for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
	// 		let provider: ITestTreeProvider;
	// 		let trees: readonly ISharedTree[];
	// 		let tree: ISharedTree;
	// 		benchmark({
	// 			type: benchmarkType,
	// 			title: `Wide Tree with Editable Tree: writes ${numberOfNodes} nodes`,
	// 			before: async () => {
	// 				[provider, trees] = await createSharedTrees(
	// 					getTestSchema(FieldKinds.sequence),
	// 					[{ type: rootSchemaName, value: 1 }],
	// 					1,
	// 				);
	// 				tree = trees[0];
	// 			},
	// 			benchmarkFn: () => {
	// 				insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Wide);
	// 			},
	// 		});
	// 	}
	// 	describe(`Edit EditableTree`, () => {
	// 		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
	// 			let provider: ITestTreeProvider;
	// 			let trees: readonly ISharedTree[];
	// 			let tree: ISharedTree;
	// 			let editableField: EditableField;
	// 			benchmark({
	// 				type: benchmarkType,
	// 				title: `Update value at leaf of ${numberOfNodes} Deep tree`,
	// 				before: async () => {
	// 					[provider, trees] = await createSharedTrees(
	// 						getTestSchema(FieldKinds.sequence),
	// 						[{ type: rootSchemaName, value: 1 }],
	// 						1,
	// 					);
	// 					tree = trees[0];
	// 					insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Deep);
	// 					editableField = getEditableLeafNode(tree, numberOfNodes, TreeShape.Deep);
	// 				},
	// 				benchmarkFn: () => {
	// 					manipulateEditableTree(tree, numberOfNodes, TreeShape.Deep, editableField);
	// 				},
	// 			});
	// 		}
	// 		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
	// 			let provider: ITestTreeProvider;
	// 			let trees: readonly ISharedTree[];
	// 			let tree: ISharedTree;
	// 			let editableField: EditableField;
	// 			benchmark({
	// 				type: benchmarkType,
	// 				title: `Update value at leaf of ${numberOfNodes} wide tree`,
	// 				before: async () => {
	// 					[provider, trees] = await createSharedTrees(
	// 						getTestSchema(FieldKinds.sequence),
	// 						[{ type: rootSchemaName, value: 1 }],
	// 						1,
	// 					);
	// 					tree = trees[0];
	// 					insertNodesToEditableTree(tree, numberOfNodes, TreeShape.Wide);
	// 					editableField = getEditableLeafNode(tree, numberOfNodes, TreeShape.Wide);
	// 				},
	// 				benchmarkFn: () => {
	// 					manipulateEditableTree(tree, numberOfNodes, TreeShape.Wide, editableField);
	// 				},
	// 			});
	// 		}
	// 	});
	// });
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

function getJSTestTreeWide(numberOfNodes: number): JSObjectTree {
	const nodes = [];
	const node = { value: testTreeNode.value as number, type: jsonNumber.name };
	for (let i = 0; i < numberOfNodes - 1; i++) {
		nodes.push(node);
	}
	const tree = {
		type: jsonNumber.name,
		fields: {
			foo: nodes,
		},
		value: testTreeNode.value as number,
	};
	return tree;
}

function getJSTestTreeDeep(numberOfNodes: number): JSObjectTree[] {
	if (numberOfNodes === 1) {
		return [{ value: testTreeNode.value as number, type: linkedListSchema.name }];
	}
	const tree = {
		type: jsonNumber.name,
		fields: {
			foo: getJSTestTreeDeep(numberOfNodes - 1),
		},
		value: testTreeNode.value as number,
	};
	return [tree];
}

function readDeepTreeAsJSObject(tree: JSObjectTree[], initialTotal: number): number {
	let currentTotal = initialTotal;
	let currentNode: JSObjectTree | undefined = tree[0];
	while (currentNode !== undefined) {
		if (currentNode.value !== undefined) {
			currentTotal += currentNode.value;
		}
		currentNode = currentNode.fields?.foo[0];
	}
	return currentTotal;
}

function readWideTreeAsJSObject(tree: JSObjectTree[], initialTotal: number): number {
	let currentTotal = initialTotal;
	const currentNode: JSObjectTree | undefined = tree[0];
	currentTotal += currentNode.value;
	const nodes = currentNode.fields?.foo;
	assert(nodes !== undefined);
	for (const node of nodes) {
		currentTotal += node.value;
	}
	return currentTotal;
}

/**
 * changes the value of the leaf node of the Jsonable tree.
 * @param tree - tree in form of a Jsonable object
 * @param shape - shape of the tree (wide vs deep)
 */
function manipulateTreeAsJSObject(tree: JSObjectTree, shape: TreeShape): void {
	let nodesUnderRoot;
	switch (shape) {
		case TreeShape.Deep:
			tree.value = replacementTestNode.value as number;
			break;
		case TreeShape.Wide:
			nodesUnderRoot = tree.fields?.foo.length;
			assert(nodesUnderRoot !== undefined);
			if (nodesUnderRoot === 0) {
				tree.value = replacementTestNode.value as number;
			} else {
				assert(tree.fields !== undefined);
				tree.fields.foo[nodesUnderRoot - 1].value = replacementTestNode.value as number;
			}
			break;
		default:
			unreachableCase(shape);
	}
}

function getLeafFromJSObject(tree: JSObjectTree[]): JSObjectTree {
	let currentNode: JSObjectTree | undefined = tree[0];
	while (currentNode !== undefined) {
		const currentField = currentNode.fields?.foo;
		if (currentField === undefined) {
			break;
		}
		currentNode = currentNode.fields?.foo[0];
	}
	assert(currentNode);
	return currentNode;
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
				const value = readCursor.value as number;
				currentTotal += value;
			}
			break;
		case TreeShape.Wide:
			readCursor.enterField(localFieldKey);
			for (let inNode = readCursor.firstNode(); inNode; inNode = readCursor.nextNode()) {
				nodesRead += 1;
				const value = readCursor.value as number;
				currentTotal += value;
			}
			assert(nodesRead === numberOfNodes);
			break;
		default:
			throw new Error("unreachable case");
	}
	readCursor.free();
	return currentTotal;
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

/**
 * Path to linked list node at provided depth.
 * Depth 1 points to the root node.
 */
function deepPath(depth: number): UpPath {
	assert(depth > 0);
	let path: UpPath = {
		parent: undefined,
		parentField: rootFieldKeySymbol,
		parentIndex: 0,
	};
	for (let i = 0; i < depth - 1; i++) {
		path = {
			parent: path,
			parentField: localFieldKey,
			parentIndex: 0,
		};
	}
	return path;
}

/**
 * Path to linked list node at provided depth.
 * Depth 1 points to the root node.
 */
function wideLeafPath(index: number): UpPath {
	const path = {
		parent: {
			parent: undefined,
			parentField: rootFieldKeySymbol,
			parentIndex: 0,
		},
		parentField: localFieldKey,
		parentIndex: index,
	};
	return path;
}

// TODO: Split into two function, one foir each shape
function getCursorLeafNode(numberOfNodes: number, shape: TreeShape): UpPath {
	switch (shape) {
		case TreeShape.Deep:
			return deepPath(numberOfNodes);
		case TreeShape.Wide:
			return wideLeafPath(numberOfNodes - 1);
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
				sum += value;
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
				sum += value;
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
