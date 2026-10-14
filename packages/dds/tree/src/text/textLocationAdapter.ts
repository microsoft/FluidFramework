/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TextLocationNode, TreeArrayNode, TreeNode } from "../simple-tree/index.js";

/**
 * Internal capability supplied by supported text implementations, including their subclasses.
 * Not exported from the package: applications cannot register arbitrary nodes as text.
 */
export const textLocationArray: unique symbol = Symbol("textLocationArray");

/**
 * Identifies text nodes without relying on public method names or stored schema identifiers.
 */
export function isTextLocationNode(
	node: TreeNode,
): node is TextLocationNode & { readonly [textLocationArray]: TreeArrayNode } {
	return textLocationArray in node;
}
