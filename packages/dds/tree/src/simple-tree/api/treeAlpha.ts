/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeNode } from "../core/index.js";

import type { TreeChangeEventsBeta } from "./treeChangeEventsBeta.js";

/**
 * Compatibility alias for the event variants now available from {@link (TreeBeta:interface).on}.
 * @deprecated Use {@link TreeChangeEventsBeta} instead.
 * @sealed @alpha
 */
export interface TreeChangeEventsAlpha<TNode extends TreeNode = TreeNode>
	extends TreeChangeEventsBeta<TNode> {}
