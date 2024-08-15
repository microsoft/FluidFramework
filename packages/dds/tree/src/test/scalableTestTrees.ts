/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	EmptyKey,
	type FieldKey,
	type UpPath,
	moveToDetachedField,
	rootFieldKey,
} from "../core/index.js";
import { jsonSchema, leaf } from "../domains/index.js";
import { FieldKinds, FlexFieldSchema, SchemaBuilderBase } from "../feature-libraries/index.js";
import type { FlexTreeView, TreeContent } from "../shared-tree/index.js";
import { brand } from "../util/index.js";
import {
	cursorFromInsertable,
	SchemaFactory,
	type ValidateRecursiveSchema,
} from "../simple-tree/index.js";

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
	[EmptyKey]: FlexFieldSchema.create(FieldKinds.sequence, [leaf.number]),
});

const sf = new SchemaFactory("scalable");

/**
 * Linked list used for performance testing deep trees.
 * @remarks
 * Simple-tree version of {@link deepSchema}.
 */
export class LinkedList extends sf.objectRecursive("linkedList", {
	foo: [() => LinkedList, sf.number],
}) {}
{
	type _check = ValidateRecursiveSchema<typeof LinkedList>;
}

/**
 * Array node used for testing the performance scalability of large arrays.
 * @remarks
 * Simple-tree version of {@link wideSchema}.
 */
export class WideRoot extends sf.array("WideRoot", sf.number) {}

/**
 * @deprecated Use {@link WideRoot}.
 */
export const wideSchema = wideBuilder.intoSchema(wideRootSchema);

/**
 * @deprecated Use {@link LinkedList}.
 */
export const deepSchema = deepBuilder.intoSchema([linkedListSchema, leaf.number]);

export interface JSDeepTree {
	foo: JSDeepTree | number;
}

export type JSWideTree = number[];

export function makeJsDeepTree(depth: number, leafValue: number): JSDeepTree | number {
	return depth === 0 ? leafValue : { foo: makeJsDeepTree(depth - 1, leafValue) };
}

export function makeDeepContent(
	depth: number,
	leafValue: number = 1,
): TreeContent<typeof deepSchema.rootFieldSchema> {
	// Implicit type conversion is needed here to make this compile.
	const initialTree = makeJsDeepTree(depth, leafValue);
	return {
		// Types do now allow implicitly constructing recursive types, so cast is required.
		// TODO: Find a better alternative.
		initialTree: cursorFromInsertable(LinkedList, initialTree as LinkedList),
		schema: deepSchema,
	};
}

/**
 *
 * @param numberOfNodes - number of nodes of the tree
 * @param endLeafValue - the value of the end leaf of the tree. If not provided its index is used.
 * @returns a tree with specified number of nodes, with the end leaf node set to the endLeafValue
 */
export function makeWideContentWithEndValue(
	numberOfNodes: number,
	endLeafValue?: number,
): TreeContent<typeof wideSchema.rootFieldSchema> {
	// Implicit type conversion is needed here to make this compile.
	const initialTree = makeJsWideTreeWithEndValue(numberOfNodes, endLeafValue);
	return {
		initialTree: cursorFromInsertable(WideRoot, initialTree),
		schema: wideSchema,
	};
}

/**
 *
 * @param numberOfNodes - number of nodes of the tree
 * @param endLeafValue - the value of the end leaf of the tree. If not provided its index is used.
 * @returns a tree with specified number of nodes, with the end leaf node set to the endLeafValue
 */
export function makeJsWideTreeWithEndValue(
	numberOfNodes: number,
	endLeafValue?: number,
): JSWideTree {
	const numbers = [];
	for (let index = 0; index < numberOfNodes - 1; index++) {
		numbers.push(index);
	}
	numbers.push(endLeafValue ?? numberOfNodes - 1);
	return numbers;
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

export function readWideTreeAsJSObject(nodes: JSWideTree): {
	nodesCount: number;
	sum: number;
} {
	let sum = 0;

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
		parentField: EmptyKey,
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
	const field = root.content[EmptyKey];
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
