/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InnerNode, TreeNode } from "./core/index.js";
import { getKernel } from "./core/index.js";

/**
 * Retrieves the flex node associated with the given target via {@link setInnerNode}.
 * @remarks
 * For {@link Unhydrated} nodes, this returns the MapTreeNode.
 *
 * For hydrated nodes it returns a FlexTreeNode backed by the forest.
 * Note that for "marinated" nodes, this FlexTreeNode exists and returns it: it does not return the MapTreeNode which is the current InnerNode.
 */
export function getOrCreateInnerNode(treeNode: TreeNode, allowFreed = false): InnerNode {
	const kernel = getKernel(treeNode);
	return kernel.getOrCreateInnerNode(allowFreed);
}
