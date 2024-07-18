/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FieldUpPath, UpPath } from "../../../core/index.js";
import {
	Skip,
	visitBipartiteIterableTreeWithState,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/flex-tree/navigation.js";
import type { FlexTreeField, FlexTreeNode } from "../../../feature-libraries/index.js";

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
function test(root: FlexTreeField): void {
	// Count depth in nodes:
	let depth = 0;
	visitBipartiteIterableTreeWithState(
		root,
		0,
		(field) => field.boxedIterator(),
		(node) => node.boxedIterator(),
		(field: FlexTreeField, n) => n,
		(node: FlexTreeNode, n) => {
			depth = Math.max(n, depth);
			return n + 1;
		},
	);

	// Construct all paths
	visitBipartiteIterableTreeWithState(
		root,
		undefined,
		(field) => field.boxedIterator(),
		(node) => node.boxedIterator(),
		(field: FlexTreeField, parent: UpPath | undefined): FieldUpPath => ({
			parent,
			field: field.key,
		}),
		(node: FlexTreeNode, parent: FieldUpPath): UpPath => ({
			parent: parent.parent,
			parentField: parent.field,
			parentIndex: node.parentField.index,
		}),
	);
}
