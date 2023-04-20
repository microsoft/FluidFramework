/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import {
	ContextuallyTypedNodeData,
	cursorFromContextualData,
	FieldKinds,
	isEditableField,
	isUnwrappedNode,
	jsonableTreeFromCursor,
	SchemaAware,
	TypedSchema,
	UnwrappedEditableField,
} from "../../feature-libraries";
import { jsonNumber } from "../../domains";
import { brand } from "../../util";
import { toJsonableTree } from "../utils";
import { ISharedTree, ISharedTreeView, SharedTreeFactory } from "../../shared-tree";
import {
	AllowedUpdateType,
	LocalFieldKey,
	moveToDetachedField,
	rootFieldKey,
	rootFieldKeySymbol,
	UpPath,
} from "../../core";

const localFieldKey: LocalFieldKey = brand("foo");

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

/**
 * JS object like a deep tree.
 * Comparible with ContextuallyTypedNodeData
 */
interface JSDeepTree {
	foo: JSDeepTree | number;
}
/**
 * JS object like a wide tree.
 * Comparible with ContextuallyTypedNodeData
 */
interface JSWideTree {
	foo: number[];
}

function makeJsDeepTree(
	depth: number,
	leafValue: number,
): (JSDeepTree | number) & ContextuallyTypedNodeData {
	return depth === 0 ? leafValue : { foo: makeJsDeepTree(depth - 1, leafValue) };
}

/**
 *
 * @param numberOfNodes - number of nodes of the tree
 * @param endLeafValue - the value of the end leaf of the tree
 * @returns a tree with specified number of nodes, with the end leaf node set to the endLeafValue
 */
function makeJsWideTreeWithEndValue(
	numberOfNodes: number,
	endLeafValue: number,
): JSWideTree & ContextuallyTypedNodeData {
	const numbers = [];
	for (let index = 0; index < numberOfNodes - 1; index++) {
		numbers.push(index);
	}
	numbers.push(endLeafValue);
	return { foo: numbers };
}

// TODO: Once the "BatchTooLarge" error is no longer an issue, extend tests for larger trees.
describe("SharedTree benchmarks", () => {
	describe("Direct JS Object", () => {
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: JSDeepTree;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree as JS Object: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = makeJsDeepTree(numberOfNodes, 1) as JSDeepTree;
				},
				benchmarkFn: () => {
					const { depth, value } = readDeepTreeAsJSObject(tree);
					assert.equal(depth, numberOfNodes);
					assert.equal(value, 1);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: JSWideTree;
			let expected = 0;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree as JS Object: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = makeJsWideTreeWithEndValue(numberOfNodes, numberOfNodes - 1);
					for (let i = 0; i < numberOfNodes; i++) {
						expected += i;
					}
				},
				benchmarkFn: () => {
					const { nodesCount, sum } = readWideTreeAsJSObject(tree);
					assert.equal(nodesCount, numberOfNodes);
					assert.equal(sum, expected);
				},
			});
		}
		describe(`Edit JS Object`, () => {
			for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
				let tree: JSDeepTree;
				let currentNode: JSDeepTree;
				benchmark({
					type: benchmarkType,
					title: `Update value at leaf of ${numberOfNodes} deep tree`,
					before: () => {
						tree = makeJsDeepTree(numberOfNodes, 1) as JSDeepTree;
						currentNode = tree;
						while (typeof currentNode !== "number") {
							if (typeof currentNode.foo === "number") {
								break;
							}
							currentNode = currentNode.foo;
						}
					},
					benchmarkFn: () => {
						currentNode.foo = -1;
					},
					after: () => {
						const expected = makeJsDeepTree(numberOfNodes, -1);
						assert.deepEqual(tree, expected);
					},
				});
			}
			for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
				let tree: JSWideTree;
				benchmark({
					type: benchmarkType,
					title: `Update value at leaf of ${numberOfNodes} Wide tree`,
					before: () => {
						tree = makeJsWideTreeWithEndValue(numberOfNodes, numberOfNodes - 1);
					},
					benchmarkFn: () => {
						tree.foo[numberOfNodes - 1] = -1;
					},
					after: () => {
						const expected = makeJsWideTreeWithEndValue(numberOfNodes, -1);
						assert.deepEqual(tree, expected);
					},
				});
			}
		});
	});
	describe("Cursors", () => {
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: ISharedTree;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree with cursor: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = factory.create(new MockFluidDataStoreRuntime(), "test");
					const schematized = tree.schematize({
						allowedSchemaModifications: AllowedUpdateType.None,
						initialTree: makeJsDeepTree(numberOfNodes, 1),
						schema: deepSchema,
					});
				},
				benchmarkFn: () => {
					const { depth, value } = readDeepCursorTree(tree);
					assert.equal(value, 1);
					assert.equal(depth, numberOfNodes);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: ISharedTree;
			let expected = 0;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree with cursor: reads with ${numberOfNodes} nodes`,
				before: () => {
					tree = factory.create(new MockFluidDataStoreRuntime(), "test");
					const numbers = [];
					for (let index = 0; index < numberOfNodes; index++) {
						numbers.push(index);
						expected += index;
					}
					const schematized = tree.schematize({
						allowedSchemaModifications: AllowedUpdateType.None,
						initialTree: makeJsWideTreeWithEndValue(numberOfNodes, numberOfNodes - 1),
						schema: wideSchema,
					});
				},
				benchmarkFn: () => {
					const { nodesCount, sum } = readWideCursorTree(tree);
					assert.equal(sum, expected);
					assert.equal(nodesCount, numberOfNodes);
				},
			});
		}
	});
	describe("EditableTree bench", () => {
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: ISharedTreeView;
			benchmark({
				type: benchmarkType,
				title: `Deep Tree with Editable Tree: reads with ${numberOfNodes} nodes`,
				before: () => {
					const untypedTree = factory.create(new MockFluidDataStoreRuntime(), "test");
					tree = untypedTree.schematize({
						allowedSchemaModifications: AllowedUpdateType.None,
						initialTree: makeJsDeepTree(numberOfNodes, 1),
						schema: deepSchema,
					});
				},
				benchmarkFn: () => {
					const { depth, value } = readDeepEditableTree(tree);
					assert.equal(depth, numberOfNodes);
					assert.equal(value, 1);
				},
			});
		}
		for (const [numberOfNodes, benchmarkType] of nodesCountWide) {
			let tree: ISharedTreeView;
			let expected: number = 0;
			benchmark({
				type: benchmarkType,
				title: `Wide Tree with Editable Tree: reads with ${numberOfNodes} nodes`,
				before: () => {
					const untypedTree = factory.create(new MockFluidDataStoreRuntime(), "test");
					const numbers = [];
					for (let index = 0; index < numberOfNodes; index++) {
						numbers.push(index);
						expected += index;
					}
					tree = untypedTree.schematize({
						allowedSchemaModifications: AllowedUpdateType.None,
						initialTree: { foo: numbers },
						schema: wideSchema,
					});
				},
				benchmarkFn: () => {
					const { nodesCount, sum } = readWideEditableTree(tree);
					assert.equal(sum, expected);
					assert.equal(nodesCount, numberOfNodes);
					readWideCursorTree(tree);
				},
			});
		}
	});
	describe("Edit with editor", () => {
		for (const [numberOfNodes, benchmarkType] of nodesCountDeep) {
			let tree: ISharedTreeView;
			let path: UpPath;
			benchmark({
				type: benchmarkType,
				title: `Update value at leaf of ${numberOfNodes} deep tree`,
				before: () => {
					const untypedTree = factory.create(new MockFluidDataStoreRuntime(), "test");
					tree = untypedTree.schematize({
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
			let tree: ISharedTreeView;
			let path: UpPath;
			benchmark({
				type: benchmarkType,
				title: `Update value at leaf of ${numberOfNodes} wide tree`,
				before: () => {
					const untypedTree = factory.create(new MockFluidDataStoreRuntime(), "test");
					const numbers = [];
					for (let index = 0; index < numberOfNodes; index++) {
						numbers.push(index);
					}
					tree = untypedTree.schematize({
						allowedSchemaModifications: AllowedUpdateType.None,
						initialTree: { foo: numbers },
						schema: wideSchema,
					});

					path = wideLeafPath(numberOfNodes - 1);
				},
				benchmarkFn: () => {
					tree.editor.setValue(path, -1);
				},
				after: () => {
					const expected = jsonableTreeFromCursor(
						cursorFromContextualData(
							tree.storedSchema,
							TypedSchema.nameSet(wideRootSchema),
							makeJsWideTreeWithEndValue(numberOfNodes, -1),
						),
					);
					const actual = toJsonableTree(tree);
					assert.deepEqual(actual, [expected]);
				},
			});
		}
	});
});

function readDeepTreeAsJSObject(tree: JSDeepTree): { depth: number; value: number } {
	let currentNode = tree.foo;
	let depth = 1;
	let value = 0;

	while (typeof currentNode !== "number") {
		currentNode = currentNode.foo;
		depth += 1;
	}
	if (typeof currentNode === "number") {
		value = currentNode;
	}
	return { depth, value };
}

function readWideTreeAsJSObject(tree: JSWideTree): { nodesCount: number; sum: number } {
	let sum = 0;

	const nodes = tree.foo;
	assert(nodes !== undefined);
	for (const node of nodes) {
		sum += node;
	}
	return { nodesCount: nodes.length, sum };
}

function readWideCursorTree(tree: ISharedTreeView): { nodesCount: number; sum: number } {
	let nodesCount = 0;
	let sum = 0;
	const readCursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, readCursor);
	assert(readCursor.firstNode());
	readCursor.firstField();
	for (let inNode = readCursor.firstNode(); inNode; inNode = readCursor.nextNode()) {
		sum += readCursor.value as number;
		nodesCount += 1;
	}
	return { nodesCount, sum };
}

function readDeepCursorTree(tree: ISharedTreeView): { depth: number; value: number } {
	let depth = 0;
	let value = 0;
	const readCursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, readCursor);
	assert(readCursor.firstNode());
	while (readCursor.firstField()) {
		readCursor.firstNode();
		depth += 1;
		value = readCursor.value as number;
	}
	value = readCursor.value as number;
	return { depth, value };
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

function readWideEditableTree(tree: ISharedTreeView): { nodesCount: number; sum: number } {
	let sum = 0;
	let nodesCount = 0;
	const root = tree.root;
	assert(isUnwrappedNode(root));
	const field = root.foo as UnwrappedEditableField;
	assert(isEditableField(field));
	assert(field.length !== 0);
	for (const currentNode of field) {
		sum += currentNode as number;
		nodesCount += 1;
	}
	return { nodesCount, sum };
}

function readDeepEditableTree(tree: ISharedTreeView): { depth: number; value: number } {
	let depth = 0;
	let currentNode: UnwrappedEditableField = tree.root;
	while (isUnwrappedNode(currentNode)) {
		currentNode = currentNode.foo as UnwrappedEditableField;
		depth++;
	}
	assert(typeof currentNode === "number");
	return { depth, value: currentNode };
}
