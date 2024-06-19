/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type FieldKey,
	type UpPath,
	moveToDetachedField,
	rootFieldKey,
} from "../core/index.js";
import { jsonSchema, leaf } from "../domains/index.js";
import {
	FieldKinds,
	FlexFieldSchema,
	type InsertableFlexField,
	type InsertableFlexNode,
	SchemaBuilderBase,
	type typeNameSymbol,
} from "../feature-libraries/index.js";
import type { FlexTreeView, TreeContent } from "../shared-tree/index.js";
import { brand, type requireAssignableTo } from "../util/index.js";

/**
 * Test trees which can be parametrically scaled to any size.
 */

/**
 * Arbitrary key used when a field key is needed in this file.
 */
export const localFieldKey: FieldKey = brand("foo");

const deepBuilder = new SchemaBuilderBase(FieldKinds.required, {
	scope: "scalable",
	name: "sharedTree.bench: deep",
	libraries: [jsonSchema],
});

// Test data in "deep" mode: a linked list with a number at the end.
const linkedListSchema = deepBuilder.objectRecursive("linkedList", {
	foo: FlexFieldSchema.createUnsafe(FieldKinds.required, [
		() => linkedListSchema,
		leaf.number,
	]),
});

const wideBuilder = new SchemaBuilderBase(FieldKinds.required, {
	scope: "scalable",
	name: "sharedTree.bench: wide",
	libraries: [jsonSchema],
});

export const wideRootSchema = wideBuilder.object("WideRoot", {
	foo: FlexFieldSchema.create(FieldKinds.sequence, [leaf.number]),
});

export const wideSchema = wideBuilder.intoSchema(wideRootSchema);

export const deepSchema = deepBuilder.intoSchema([linkedListSchema, leaf.number]);

/**
 * JS object like a deep tree.
 * Compatible with ContextuallyTypedNodeData
 */
export interface JSDeepTree {
	[typeNameSymbol]?: typeof linkedListSchema.name | undefined;
	foo: JSDeepTree | number;
}

type JSDeepTree2 = InsertableFlexNode<typeof linkedListSchema>;
type JSDeepTreeRoot2 = InsertableFlexField<typeof deepSchema.rootFieldSchema>;

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

type JSWideTreeRoot2 = InsertableFlexField<typeof wideSchema.rootFieldSchema>;

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

export function readWideCursorTree(tree: FlexTreeView<typeof wideSchema.rootFieldSchema>): {
	nodesCount: number;
	sum: number;
} {
	let nodesCount = 0;
	let sum = 0;
	const readCursor = tree.checkout.forest.allocateCursor();
	moveToDetachedField(tree.checkout.forest, readCursor);
	assert(readCursor.firstNode());
	readCursor.firstField();
	for (let inNode = readCursor.firstNode(); inNode; inNode = readCursor.nextNode()) {
		sum += readCursor.value as number;
		nodesCount += 1;
	}
	readCursor.free();
	return { nodesCount, sum };
}

export function readDeepCursorTree(tree: FlexTreeView<typeof deepSchema.rootFieldSchema>): {
	depth: number;
	value: number;
} {
	let depth = 0;
	let value = 0;
	const readCursor = tree.checkout.forest.allocateCursor();
	moveToDetachedField(tree.checkout.forest, readCursor);
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

export function readWideFlexTree(tree: FlexTreeView<typeof wideSchema.rootFieldSchema>): {
	nodesCount: number;
	sum: number;
} {
	let sum = 0;
	let nodesCount = 0;
	const root = tree.flexTree;
	const field = root.content.foo;
	assert(field.length !== 0);
	for (const currentNode of field) {
		sum += currentNode;
		nodesCount += 1;
	}
	return { nodesCount, sum };
}

export function readDeepFlexTree(tree: FlexTreeView<typeof deepSchema.rootFieldSchema>): {
	depth: number;
	value: number;
} {
	let depth = 0;
	let currentNode = tree.flexTree.content;
	while (currentNode.is(linkedListSchema)) {
		currentNode = currentNode.foo;
		depth++;
	}
	assert(currentNode.is(leaf.number));
	return { depth, value: currentNode.value };
}
