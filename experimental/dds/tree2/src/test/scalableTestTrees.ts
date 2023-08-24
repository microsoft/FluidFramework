/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
	FieldKinds,
	isEditableField,
	isEditableTree,
	SchemaAware,
	SchemaBuilder,
	typeNameSymbol,
	UnwrappedEditableField,
} from "../feature-libraries";
import { jsonNumber, jsonSchema } from "../domains";
import { brand, requireAssignableTo } from "../util";
import { ISharedTreeView, TreeContent } from "../shared-tree";
import { FieldKey, moveToDetachedField, rootFieldKey, UpPath } from "../core";

/**
 * Test trees which can be parametrically scaled to any size.
 */

/**
 * Arbitrary key used when a field key is needed in this file.
 */
export const localFieldKey: FieldKey = brand("foo");

const deepBuilder = new SchemaBuilder("sharedTree.bench: deep", {}, jsonSchema);

// Test data in "deep" mode: a linked list with a number at the end.
const linkedListSchema = deepBuilder.structRecursive("linkedList", {
	foo: SchemaBuilder.fieldRecursive(FieldKinds.value, () => linkedListSchema, jsonNumber),
});

const wideBuilder = new SchemaBuilder("sharedTree.bench: wide", {}, jsonSchema);

export const wideRootSchema = wideBuilder.struct("WideRoot", {
	foo: SchemaBuilder.field(FieldKinds.sequence, jsonNumber),
});

export const wideSchema = wideBuilder.intoDocumentSchema(
	SchemaBuilder.field(FieldKinds.value, wideRootSchema),
);

export const deepSchema = deepBuilder.intoDocumentSchema(
	SchemaBuilder.field(FieldKinds.value, linkedListSchema, jsonNumber),
);

/**
 * JS object like a deep tree.
 * Compatible with ContextuallyTypedNodeData
 */
export interface JSDeepTree {
	[typeNameSymbol]?: "linkedList" | undefined;
	foo: JSDeepTree | number;
}

type JSDeepTree2 = SchemaAware.TypedNode<typeof linkedListSchema, SchemaAware.ApiMode.Simple>;
type JSDeepTreeRoot2 = SchemaAware.TypedField<
	typeof deepSchema.rootFieldSchema,
	SchemaAware.ApiMode.Simple
>;

{
	type _check = requireAssignableTo<JSDeepTree, JSDeepTree2>;
	type _check2 = requireAssignableTo<JSDeepTree | number, JSDeepTreeRoot2>;
}

/**
 * JS object like a wide tree.
 * Compatible with ContextuallyTypedNodeData
 */
export interface JSWideTree {
	foo: number[];
}

type JSWideTreeRoot2 = SchemaAware.TypedField<
	typeof wideSchema.rootFieldSchema,
	SchemaAware.ApiMode.Simple
>;

{
	type _check2 = requireAssignableTo<JSWideTree, JSWideTreeRoot2>;
}

export function makeJsDeepTree(depth: number, leafValue: number): JSDeepTree | number {
	return depth === 0 ? leafValue : { foo: makeJsDeepTree(depth - 1, leafValue) };
}

export function makeDeepContent(
	depth: number,
	leafValue: number = 1,
): TreeContent<typeof deepSchema.rootFieldSchema> {
	// Implicit type conversion is needed here to make this compile.
	const initialTree: JSDeepTreeRoot2 = makeJsDeepTree(depth, leafValue);
	return {
		initialTree,
		schema: deepSchema,
	};
}

/**
 *
 * @param numberOfNodes - number of nodes of the tree
 * @param endLeafValue - the value of the end leaf of the tree
 * @returns a tree with specified number of nodes, with the end leaf node set to the endLeafValue
 */
export function makeWideContentWithEndValue(
	numberOfNodes: number,
	endLeafValue: number,
): TreeContent<typeof wideSchema.rootFieldSchema> {
	// Implicit type conversion is needed here to make this compile.
	const initialTree: JSWideTreeRoot2 = makeJsWideTreeWithEndValue(numberOfNodes, endLeafValue);
	return {
		initialTree,
		schema: wideSchema,
	};
}

/**
 *
 * @param numberOfNodes - number of nodes of the tree
 * @param endLeafValue - the value of the end leaf of the tree
 * @returns a tree with specified number of nodes, with the end leaf node set to the endLeafValue
 */
export function makeJsWideTreeWithEndValue(
	numberOfNodes: number,
	endLeafValue: number,
): JSWideTree {
	const numbers = [];
	for (let index = 0; index < numberOfNodes - 1; index++) {
		numbers.push(index);
	}
	numbers.push(endLeafValue);
	return { foo: numbers };
}

export function readDeepTreeAsJSObject(tree: JSDeepTree): { depth: number; value: number } {
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

export function readWideTreeAsJSObject(tree: JSWideTree): { nodesCount: number; sum: number } {
	let sum = 0;

	const nodes = tree.foo;
	assert(nodes !== undefined);
	for (const node of nodes) {
		sum += node;
	}
	return { nodesCount: nodes.length, sum };
}

export function readWideCursorTree(tree: ISharedTreeView): { nodesCount: number; sum: number } {
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
	readCursor.free();
	return { nodesCount, sum };
}

export function readDeepCursorTree(tree: ISharedTreeView): { depth: number; value: number } {
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
	readCursor.free();
	return { depth, value };
}

/**
 * Path to linked list node at provided depth.
 * Depth 1 points to the root node.
 */
export function deepPath(depth: number): UpPath {
	assert(depth > 0);
	let path: UpPath = {
		parent: undefined,
		parentField: rootFieldKey,
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
export function wideLeafPath(index: number): UpPath {
	const path = {
		parent: {
			parent: undefined,
			parentField: rootFieldKey,
			parentIndex: 0,
		},
		parentField: localFieldKey,
		parentIndex: index,
	};
	return path;
}

export function readWideEditableTree(tree: ISharedTreeView): { nodesCount: number; sum: number } {
	let sum = 0;
	let nodesCount = 0;
	const root = tree.root;
	assert(isEditableTree(root));
	const field = root.foo;
	assert(isEditableField(field));
	assert(field.length !== 0);
	for (const currentNode of field) {
		sum += currentNode as number;
		nodesCount += 1;
	}
	return { nodesCount, sum };
}

export function readDeepEditableTree(tree: ISharedTreeView): { depth: number; value: number } {
	let depth = 0;
	let currentNode: UnwrappedEditableField = tree.root;
	while (isEditableTree(currentNode)) {
		currentNode = currentNode.foo;
		depth++;
	}
	assert(typeof currentNode === "number");
	return { depth, value: currentNode };
}
