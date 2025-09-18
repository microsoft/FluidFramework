/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Tree, TreeNode, type ImplicitFieldSchema } from "@fluidframework/tree";
import { TreeAlpha, type TreeBranch, type TreeViewAlpha } from "@fluidframework/tree/alpha";

/**
 * Given a {@link TreeNode} _n_ and a target {@link TreeView} _B_, return the node corresponding to _n_ in _B_.
 * @param node - The node to find the corresponding node for.
 * @param branch - The target branch to find the corresponding node on.
 * @returns The corresponding node on the target branch, or `undefined` if it could not be found.
 * @remarks A corresponding node is one that can be reached by following the same exact property path from the root in both views.
 * @alpha
 * @privateRemarks This is a candidate for lifting into `@fluidframework/tree/alpha`.
 */
export function getNodeOnBranch<T extends TreeNode>(
	node: T,
	branch: TreeBranch,
): T | undefined {
	const currentBranch = TreeAlpha.branch(node);
	if (currentBranch === branch) {
		return node;
	}
	// TODO: This cast is technically safe for now but relies on implementation details of TreeBranch.
	// There is currently no way to (generically/untyped) get the schema or root of a TreeBranch.
	const view = branch as TreeViewAlpha<ImplicitFieldSchema>;
	if (currentBranch?.hasRootSchema(view.schema) !== true) {
		return undefined;
	}
	if (view.root === undefined || !(view.root instanceof TreeNode)) {
		return undefined;
	}

	// Walk up to the root collecting the keys needed to reach `node` from the root.
	const path: (string | number)[] = [];
	let cursor: TreeNode = node;
	let parent = Tree.parent(cursor);
	while (parent !== undefined) {
		path.push(Tree.key(cursor));
		cursor = parent;
		parent = Tree.parent(cursor);
	}
	path.reverse();

	let target = view.root;
	for (const key of path) {
		const next = TreeAlpha.child(target, key);
		if (next === undefined || !(next instanceof TreeNode)) {
			return undefined;
		}
		target = next;
	}

	if (Tree.schema(target) !== Tree.schema(node)) {
		return undefined;
	}

	return target as T;
}
