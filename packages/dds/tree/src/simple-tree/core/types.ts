/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { ErasedType } from "@fluidframework/core-interfaces";

import { isFlexTreeNode, type FlexTreeNode } from "../../feature-libraries/index.js";

/**
 * Type alias to document which values are un-hydrated.
 *
 * Un-hydrated values are nodes produced from schema's create functions that haven't been inserted into a tree yet.
 *
 * Since un-hydrated nodes become hydrated when inserted, strong typing can't be used to distinguish them.
 * This no-op wrapper is used instead.
 * @remarks
 * Nodes which are Unhydrated report {@link TreeStatus}.new from `Tree.status(node)`.
 * @privateRemarks
 * TODO: Linking tree status is failing in intellisense and linking directly to its .new item is failing in API extractor as well.
 * WOuld be nice to have a working link here.
 * @public
 */
export type Unhydrated<T> = T;

/**
 * A node type internal to `@fluidframework/tree`.
 * @remarks
 * This type is used in the construction of {@link TreeNode} as an implementation detail, but leaks into the public API due to how schema are implemented.
 * @privateRemarks
 * A {@link FlexTreeNode}. Includes {@link RawTreeNode}s.
 * @sealed @public
 */
export interface InternalTreeNode
	extends ErasedType<"@fluidframework/tree.InternalTreeNode"> {}

export function toFlexTreeNode(node: InternalTreeNode): FlexTreeNode {
	assert(isFlexTreeNode(node), 0x963 /* Invalid InternalTreeNode */);
	return node;
}
