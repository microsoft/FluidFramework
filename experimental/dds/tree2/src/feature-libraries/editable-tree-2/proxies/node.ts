/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../../util";
import { TreeNode } from "../editableTreeTypes";
import { SharedTreeNode } from "./types";

export const nodeSym = Symbol("node");

/**
 * Exposes node functionality, such as event subscriptions, for the given SharedTreeNode.
 * @alpha
 */
export function node(owner: SharedTreeNode): Required<SharedTreeNode>[typeof nodeSym] {
	return (
		(owner[nodeSym] as Required<SharedTreeNode>[typeof nodeSym]) ??
		fail("owner must be a SharedTreeNode")
	);
}

/** Helper for creating the "API" object returned by 'node(..)'. */
export function createNodeApi(editNode: TreeNode): Required<SharedTreeNode>[typeof nodeSym] {
	return {
		on: editNode.on.bind(editNode),
	};
}
