/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeValue } from "../../core/index.js";

import type { TreeNode } from "./treeNode.js";
import {
	type InnerNode,
	simpleTreeNodeSlot,
	createTreeNodeFromInner,
} from "./treeNodeKernel.js";
import { UnhydratedFlexTreeNode } from "./unhydratedFlexTree.js";

/**
 * Returns the TreeNode or TreeValue for the provided {@link InnerNode}.
 * This will allocate a new one if needed, and otherwise return one from cache.
 * @remarks
 * This supports both hydrated and unhydrated nodes.
 */
export function getOrCreateNodeFromInnerNode(flexNode: InnerNode): TreeNode | TreeValue {
	const cached =
		flexNode instanceof UnhydratedFlexTreeNode
			? flexNode.treeNode
			: flexNode.anchorNode.slots.get(simpleTreeNodeSlot);

	if (cached !== undefined) {
		return cached;
	}

	return createTreeNodeFromInner(flexNode);
}
