/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITreeSubscriptionCursor } from "../../core/index.js";

import type { Context } from "./context.js";
import type { FlexTreeUnknownUnboxed } from "./flexTreeTypes.js";
import { makeTree } from "./lazyNode.js";

/**
 * Returns the flex tree node, of the value if it has one.
 */
export function unboxedFlexNode(
	context: Context,
	cursor: ITreeSubscriptionCursor,
): FlexTreeUnknownUnboxed {
	const value = cursor.value;
	if (value !== undefined) {
		return value;
	}
	return makeTree(context, cursor);
}
