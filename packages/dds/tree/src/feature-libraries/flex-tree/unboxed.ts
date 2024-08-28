/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITreeSubscriptionCursor } from "../../core/index.js";
import {
	type FlexFieldSchema,
	type FlexTreeNodeSchema,
	schemaIsLeaf,
} from "../typed-schema/index.js";

import type { Context } from "./context.js";
import type { FlexTreeUnknownUnboxed } from "./flexTreeTypes.js";
import { makeTree } from "./lazyNode.js";

/**
 * See {@link FlexTreeUnboxNode} for documentation on what unwrapping this performs.
 */
export function unboxedTree(
	context: Context,
	schema: FlexTreeNodeSchema,
	cursor: ITreeSubscriptionCursor,
): FlexTreeUnknownUnboxed {
	if (schemaIsLeaf(schema)) {
		return cursor.value as FlexTreeUnknownUnboxed;
	}

	return makeTree(context, cursor);
}

/**
 * See {@link FlexTreeUnboxNodeUnion} for documentation on what unwrapping this performs.
 */
export function unboxedUnion(
	context: Context,
	schema: FlexFieldSchema,
	cursor: ITreeSubscriptionCursor,
): FlexTreeUnknownUnboxed {
	const type = schema.monomorphicChildType;
	if (type !== undefined) {
		return unboxedTree(context, type, cursor);
	}
	return makeTree(context, cursor);
}
