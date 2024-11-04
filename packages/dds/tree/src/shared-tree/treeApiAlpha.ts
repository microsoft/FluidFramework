/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { type TreeContext, type TreeNode, getKernel } from "../simple-tree/index.js";
import { SchematizingSimpleTreeView, ViewSlot } from "./schematizingTreeView.js";

/**
 * Extensions to {@link Tree} which are not yet stable.
 * @sealed @alpha
 */
export const TreeAlpha: {
	/**
	 * Retrieve the {@link TreeContext | context}, if any, for the given node.
	 * @param node - The node for which to get a context.
	 * @remarks Returns `undefined` for nodes not yet inserted into the tree - nodes are not attached to a context until they are inserted.
	 */
	context(node: TreeNode): TreeContext | undefined;
} = {
	context(node: TreeNode): TreeContext | undefined {
		const kernel = getKernel(node);
		if (!kernel.isHydrated()) {
			return undefined;
		}
		const view = kernel.anchorNode.anchorSet.slots.get(ViewSlot);
		assert(view instanceof SchematizingSimpleTreeView, "Unexpected view implementation");
		return view;
	},
};
