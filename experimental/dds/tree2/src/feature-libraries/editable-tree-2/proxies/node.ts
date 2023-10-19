/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../../util";
import { TreeNodeCore } from "../coreTreeTypes";
import { SharedTreeNode } from "./types";

export const nodeSym = Symbol("node");

/**
 * Exposes node functionality, such as event subscriptions, for the given SharedTreeNode.
 * @alpha
 */
export function node(owner: SharedTreeNode): TreeNodeCore {
	return owner[nodeSym] ?? fail("owner must be a SharedTreeNode");
}
