/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITreeSubscriptionCursor } from "../../core/index.js";
import type { FlexFieldKind } from "../modular-schema/index.js";
import {
	type FlexAllowedTypes,
	type FlexFieldSchema,
	type FlexTreeNodeSchema,
	schemaIsLeaf,
} from "../typed-schema/index.js";

import type { Context } from "./context.js";
import type {
	FlexTreeNode,
	FlexTreeUnboxNode,
	FlexTreeUnknownUnboxed,
} from "./flexTreeTypes.js";
import { makeTree } from "./lazyNode.js";

/**
 * See {@link FlexTreeUnboxNode} for documentation on what unwrapping this performs.
 */
export function unboxedTree<TSchema extends FlexTreeNodeSchema>(
	context: Context,
	schema: TSchema,
	cursor: ITreeSubscriptionCursor,
): FlexTreeUnboxNode<TSchema> {
	if (schemaIsLeaf(schema)) {
		return cursor.value as FlexTreeUnboxNode<TSchema>;
	}

	return makeTree(context, cursor) as FlexTreeNode as FlexTreeUnboxNode<TSchema>;
}

/**
 * See {@link FlexTreeUnboxNodeUnion} for documentation on what unwrapping this performs.
 */
export function unboxedUnion<TTypes extends FlexAllowedTypes>(
	context: Context,
	schema: FlexFieldSchema<FlexFieldKind, TTypes>,
	cursor: ITreeSubscriptionCursor,
): FlexTreeUnknownUnboxed {
	const type = schema.monomorphicChildType;
	if (type !== undefined) {
		return unboxedTree(context, type, cursor);
	}
	return makeTree(context, cursor);
}
