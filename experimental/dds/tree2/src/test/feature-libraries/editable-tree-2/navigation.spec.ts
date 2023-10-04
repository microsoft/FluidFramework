/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Skip,
	visitBipartiteIterableTreeWithState,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree-2/navigation";

import { TreeField, TreeNode, boxedIterator } from "../../../feature-libraries";
import { FieldUpPath, UpPath } from "../../../core";

/**
 * Simpler version of visitIterableTree, but uses more memory.
 */
function visitIterableTree2<T extends Iterable<T>>(
	root: T,
	visitor: (item: T) => Skip | undefined,
): void {
	const queue = [root];
	let next: T | undefined;
	while ((next = queue.pop())) {
		if (visitor(next) !== Skip) {
			for (const child of next) {
				queue.push(child);
			}
		}
	}
}

/**
 * Simpler version of visitIterableTree, but recursive.
 */
function visitIterableTreeRecursive<T extends Iterable<T>>(
	root: T,
	visitor: (item: T) => Skip | undefined,
): void {
	if (visitor(root) !== Skip) {
		for (const child of root) {
			visitIterableTreeRecursive(child, visitor);
		}
	}
}

// Examples
function test(root: TreeField): void {
	// Count depth in nodes:
	let depth = 0;
	visitBipartiteIterableTreeWithState(
		root,
		0,
		(field) => field[boxedIterator](),
		(node) => node[boxedIterator](),
		(field: TreeField, n) => n,
		(node: TreeNode, n) => {
			depth = Math.max(n, depth);
			return n + 1;
		},
	);

	// Construct all paths
	visitBipartiteIterableTreeWithState(
		root,
		undefined,
		(field) => field[boxedIterator](),
		(node) => node[boxedIterator](),
		(field: TreeField, parent: UpPath | undefined): FieldUpPath => ({
			parent,
			field: field.key,
		}),
		(node: TreeNode, parent: FieldUpPath): UpPath => ({
			parent: parent.parent,
			parentField: parent.field,
			parentIndex: node.parentField.index,
		}),
	);
}
