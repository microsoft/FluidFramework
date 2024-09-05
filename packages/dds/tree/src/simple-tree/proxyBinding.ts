/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InnerNode, TreeNode } from "./core/index.js";
import { getKernel } from "./core/index.js";

// This file contains various maps and helpers for supporting associating simple TreeNodes with their InnerNodes, and swapping those InnerNodes as part of hydration.
// See ./ProxyBinding.md for a high-level overview of the process.

// The following records are maintained as WeakMaps, rather than a private symbol (e.g. like `targetSymbol`) on the TreeNode.
// The map behaves essentially the same, except that performing a lookup in the map will not perform a property read/get on the key object (as is the case with a symbol).
// Since `SharedTreeNodes` are proxies with non-trivial `get` traps, this choice is meant to prevent the confusion of the lookup passing through multiple objects
// via the trap, or the trap not properly handling the special symbol, etc.

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
