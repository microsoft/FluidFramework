/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeNode } from "../editableTreeTypes";
import { SharedTreeNode } from "./types";

export const nodeSym = Symbol("node");

/**
 * Exposes node functionality, such as event subscriptions, for the given SharedTreeNode.
 * @alpha
 */
export function node(owner: SharedTreeNode): Required<SharedTreeNode>[typeof nodeSym] {
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return owner[nodeSym]!;
}

/** Helper for creating the "API" object returned by 'node(..)'. */
export function createNodeApi(editNode: TreeNode): Required<SharedTreeNode>[typeof nodeSym] {
	return {
		on: editNode.on.bind(editNode),
	};
}
