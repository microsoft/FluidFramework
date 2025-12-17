/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	SchemaFactory,
	type NodeFromSchema,
	type Unhydrated,
	type ValidateRecursiveSchema,
} from "../../simple-tree/index.js";
import { hydrate } from "./utils.js";
import { Tree } from "../../shared-tree/index.js";

const schemaFactory = new SchemaFactory("test");

/**
 * A recursive tree node with a single leaf value
 */
export class DeepTreeNode extends schemaFactory.objectRecursive("deep-tree-node", {
	node: [() => DeepTreeNode, schemaFactory.number],
}) {}
{
	type _check = ValidateRecursiveSchema<typeof DeepTreeNode>;
}

/**
 * A wide tree node with all leaves having the same value
 */
export const WideTreeNode = schemaFactory.array(schemaFactory.number);
export type WideTreeNode = NodeFromSchema<typeof WideTreeNode>;

/**
 * Make an unhydrated deep tree with a single leaf value
 */
function makeDeepTree(depth: number, leafValue: number): Unhydrated<DeepTreeNode> {
	return new DeepTreeNode({
		node: depth === 1 ? leafValue : makeDeepTree(depth - 1, leafValue),
	});
}

/**
 * generate a deep tree with a single leaf value
 */
export function generateDeepSimpleTree(depth: number, leafValue: number): DeepTreeNode {
	assert(Number.isSafeInteger(depth));
	assert(depth > 0);

	return hydrate(DeepTreeNode, makeDeepTree(depth, leafValue));
}

/**
 * read the deep tree and return the depth and value of the leaf node
 */
export function readDeepSimpleTree(tree: DeepTreeNode): {
	depth: number;
	value: number;
} {
	let currentNode: DeepTreeNode | number = tree;
	let depth = 0;

	while (Tree.is(currentNode, DeepTreeNode)) {
		depth += 1;
		currentNode = currentNode.node;
	}

	return { depth, value: currentNode };
}

/**
 * Update the deep tree with a new leaf value deep in the tree
 */
export function writeDeepTree(tree: DeepTreeNode, newValue: number): void {
	let currentNode: DeepTreeNode = tree;

	while (Tree.is(currentNode.node, DeepTreeNode)) {
		currentNode = currentNode.node;
	}

	currentNode.node = newValue;
}

/**
 * generate a wide tree with a single layer
 */
export function generateWideSimpleTree(length: number, leafValue: number): WideTreeNode {
	return hydrate(
		WideTreeNode,
		Array.from({ length }, () => leafValue),
	);
}

/**
 * Reads the whole wide tree and returns the width and the sum of all value in the leaf node.
 */
export function readWideSimpleTree(tree: WideTreeNode): {
	nodesCount: number;
	sum: number;
} {
	const nodesCount = tree.length;
	const sum = tree.reduce((a, b) => a + b, 0);
	return { nodesCount, sum };
}

/**
 * Update the input index value for the wide tree.
 */
export function writeWideSimpleTreeNewValue(
	tree: WideTreeNode,
	newValue: number,
	index: number,
): void {
	tree.insertAt(index, newValue);
	tree.removeAt(index + 1);
}
