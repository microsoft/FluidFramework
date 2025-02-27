/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeValue } from "../../core/index.js";
import type { FlexTreeNode } from "../../feature-libraries/index.js";
import { fail } from "../../util/index.js";
import {
	type InnerNode,
	unhydratedFlexTreeNodeToTreeNode,
	proxySlot,
} from "./treeNodeKernel.js";
import { getSimpleNodeSchemaFromInnerNode } from "./schemaCaching.js";
import type { TreeNode, InternalTreeNode } from "./types.js";
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
			? unhydratedFlexTreeNodeToTreeNode.get(flexNode)
			: flexNode.anchorNode.slots.get(proxySlot);

	if (cached !== undefined) {
		return cached;
	}

	const classSchema =
		getSimpleNodeSchemaFromInnerNode(flexNode) ?? fail(0xb3e /* Missing schema */);
	const node = flexNode as unknown as InternalTreeNode;
	// eslint-disable-next-line unicorn/prefer-ternary
	if (typeof classSchema === "function") {
		return new classSchema(node);
	} else {
		return (classSchema as { create(data: FlexTreeNode): TreeValue }).create(flexNode);
	}
}
