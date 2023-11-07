/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITreeSubscriptionCursor, inCursorNode, EmptyKey } from "../../core";
import { FieldKind } from "../modular-schema";
import { FieldKinds } from "../default-field-kinds";
import { fail } from "../../util";
import {
	AllowedTypes,
	TreeFieldSchema,
	TreeNodeSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
} from "../typed-schema";
import { Context } from "./context";
import { UnboxField, UnboxNode, UnboxNodeUnion } from "./editableTreeTypes";
import { makeTree } from "./lazyTree";
import { makeField } from "./lazyField";

/**
 * See {@link UnboxNode} for documentation on what unwrapping this performs.
 */
export function unboxedTree<TSchema extends TreeNodeSchema>(
	context: Context,
	schema: TSchema,
	cursor: ITreeSubscriptionCursor,
): UnboxNode<TSchema> {
	if (schemaIsLeaf(schema)) {
		return cursor.value as UnboxNode<TSchema>;
	}
	if (schemaIsFieldNode(schema)) {
		cursor.enterField(EmptyKey);
		const primaryField = makeField(
			context,
			schema.objectNodeFields.get(EmptyKey) ?? fail("invalid schema"),
			cursor,
		);
		cursor.exitField();
		return primaryField as UnboxNode<TSchema>;
	}

	return makeTree(context, cursor) as UnboxNode<TSchema>;
}

/**
 * See {@link UnboxNodeUnion} for documentation on what unwrapping this performs.
 */
export function unboxedUnion<TTypes extends AllowedTypes>(
	context: Context,
	schema: TreeFieldSchema<FieldKind, TTypes>,
	cursor: ITreeSubscriptionCursor,
): UnboxNodeUnion<TTypes> {
	const type = schema.monomorphicChildType;
	if (type !== undefined) {
		return unboxedTree(context, type, cursor) as UnboxNodeUnion<TTypes>;
	}
	return makeTree(context, cursor) as UnboxNodeUnion<TTypes>;
}

/**
 * @param context - the common context of the field.
 * @param schema - the TreeFieldStoredSchema of the field.
 * @param cursor - the cursor, which must point to the field being proxified.
 */
export function unboxedField<TSchema extends TreeFieldSchema>(
	context: Context,
	schema: TSchema,
	cursor: ITreeSubscriptionCursor,
): UnboxField<TSchema> {
	const kind = schema.kind;
	if (kind === FieldKinds.required) {
		return inCursorNode(cursor, 0, (innerCursor) =>
			unboxedUnion(context, schema, innerCursor),
		) as UnboxField<TSchema>;
	}
	if (kind === FieldKinds.optional) {
		if (cursor.getFieldLength() === 0) {
			return undefined as UnboxField<TSchema>;
		}
		return inCursorNode(cursor, 0, (innerCursor) =>
			unboxedUnion(context, schema, innerCursor),
		) as UnboxField<TSchema>;
	}

	// TODO: forbidden and nodeKey
	return makeField(context, schema, cursor) as UnboxField<TSchema>;
}
