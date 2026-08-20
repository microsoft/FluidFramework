/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Tree, TreeNode, type ImplicitFieldSchema } from "@fluidframework/tree";
import {
	TreeAlpha,
	type TreeViewAlpha,
	type UntypedTreeView,
} from "@fluidframework/tree/alpha";

/**
 * Given a {@link TreeNode} _n_ and a target {@link TreeView} _B_, return the node corresponding to _n_ in _B_.
 * @param node - The node to find the corresponding node for.
 * @param view - The target view in which to find the corresponding node.
 * @returns The corresponding node in the target view, or `undefined` if it could not be found.
 * @remarks A corresponding node is one that can be reached by following the same exact property path from the root in both views.
 * @alpha
 * @privateRemarks This is a candidate for lifting into `@fluidframework/tree/alpha`.
 */
export function getNodeOnBranch<T extends TreeNode>(
	node: T,
	view: UntypedTreeView,
): T | undefined {
	const context = TreeAlpha.context(node);
	const currentView = context.isView() ? context : undefined;
	if (currentView === view) {
		return node;
	}
	// TODO: This cast is technically safe for now but relies on implementation details of UntypedTreeView.
	// There is currently no way to (generically/untyped) get the schema or root of an UntypedTreeView.
	const typedView = view as TreeViewAlpha<ImplicitFieldSchema>;
	if (currentView?.hasRootSchema(typedView.schema) !== true) {
		return undefined;
	}
	if (typedView.root === undefined || !(typedView.root instanceof TreeNode)) {
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

	let target = typedView.root;
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
