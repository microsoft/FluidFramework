/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ITreeSubscriptionCursor, inCursorNode } from "../../core/index.js";
import { FieldKinds } from "../default-schema/index.js";
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
	FlexTreeUnboxField,
	FlexTreeUnboxNode,
	FlexTreeUnboxNodeUnion,
} from "./flexTreeTypes.js";
import { makeField } from "./lazyField.js";
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
): FlexTreeUnboxNodeUnion<TTypes> {
	const type = schema.monomorphicChildType;
	if (type !== undefined) {
		return unboxedTree(context, type, cursor) as FlexTreeUnboxNodeUnion<TTypes>;
	}
	return makeTree(context, cursor) as FlexTreeUnboxNodeUnion<TTypes>;
}

/**
 * @param context - the common context of the field.
 * @param schema - the TreeFieldStoredSchema of the field.
 * @param cursor - the cursor, which must point to the field being proxified.
 */
export function unboxedField<TSchema extends FlexFieldSchema>(
	context: Context,
	schema: TSchema,
	cursor: ITreeSubscriptionCursor,
): FlexTreeUnboxField<TSchema> {
	const kind = schema.kind;
	if (kind === FieldKinds.required) {
		return inCursorNode(cursor, 0, (innerCursor) =>
			unboxedUnion(context, schema, innerCursor),
		) as FlexTreeUnboxField<TSchema>;
	}
	if (kind === FieldKinds.optional) {
		if (cursor.getFieldLength() === 0) {
			return undefined as FlexTreeUnboxField<TSchema>;
		}
		return inCursorNode(cursor, 0, (innerCursor) =>
			unboxedUnion(context, schema, innerCursor),
		) as FlexTreeUnboxField<TSchema>;
	}

	// TODO: forbidden and nodeKey
	return makeField(context, schema, cursor) as FlexTreeUnboxField<TSchema>;
}
