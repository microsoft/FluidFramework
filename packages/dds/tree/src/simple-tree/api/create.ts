/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type { ITreeCursorSynchronous, SchemaAndPolicy } from "../../core/index.js";
import type {
	ImplicitFieldSchema,
	TreeFieldFromImplicitField,
	FieldSchema,
	FieldKind,
	UnsafeUnknownSchema,
	InsertableField,
	TreeLeafValue,
} from "../schemaTypes.js";
import {
	getOrCreateNodeFromInnerNode,
	UnhydratedFlexTreeNode,
	type TreeNode,
	type Unhydrated,
} from "../core/index.js";
import {
	cursorForMapTreeNode,
	defaultSchemaPolicy,
	FieldKinds,
	mapTreeFromCursor,
	type NodeKeyManager,
} from "../../feature-libraries/index.js";
import { isFieldInSchema } from "../../feature-libraries/index.js";
import { toStoredSchema } from "../toStoredSchema.js";
import { inSchemaOrThrow, mapTreeFromNodeData } from "../toMapTree.js";
import { getUnhydratedContext } from "../createContext.js";

/**
 * Construct tree content that is compatible with the field defined by the provided `schema`.
 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
 * @param data - The data used to construct the field content.
 * @remarks
 * When providing a {@link TreeNodeSchemaClass}, this is the same as invoking its constructor except that an unhydrated node can also be provided.
 * This function exists as a generalization that can be used in other cases as well,
 * such as when `undefined` might be allowed (for an optional field), or when the type should be inferred from the data when more than one type is possible.
 *
 * Like with {@link TreeNodeSchemaClass}'s constructor, its an error to provide an existing node to this API.
 * For that case, use {@link TreeBeta.clone}.
 */
export function createFromInsertable<
	const TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema,
>(
	schema: UnsafeUnknownSchema extends TSchema
		? ImplicitFieldSchema
		: TSchema & ImplicitFieldSchema,
	data: InsertableField<TSchema>,
	context?: NodeKeyManager | undefined,
): Unhydrated<
	TSchema extends ImplicitFieldSchema
		? TreeFieldFromImplicitField<TSchema>
		: TreeNode | TreeLeafValue | undefined
> {
	const cursor = cursorFromInsertable(schema, data, context);
	const result = cursor === undefined ? undefined : createFromCursor(schema, cursor);
	return result as Unhydrated<
		TSchema extends ImplicitFieldSchema
			? TreeFieldFromImplicitField<TSchema>
			: TreeNode | TreeLeafValue | undefined
	>;
}

/**
 * Construct tree content that is compatible with the field defined by the provided `schema`.
 * @param schema - The schema for what to construct. As this is an {@link ImplicitFieldSchema}, a {@link FieldSchema}, {@link TreeNodeSchema} or {@link AllowedTypes} array can be provided.
 * @param data - The data used to construct the field content.
 * @remarks
 * When providing a {@link TreeNodeSchemaClass},
 * this is the same as invoking its constructor except that an unhydrated node can also be provided and the returned value is a cursor.
 * When `undefined` is provided (for an optional field), `undefined` is returned.
 */
export function cursorFromInsertable<
	TSchema extends ImplicitFieldSchema | UnsafeUnknownSchema,
>(
	schema: UnsafeUnknownSchema extends TSchema
		? ImplicitFieldSchema
		: TSchema & ImplicitFieldSchema,
	data: InsertableField<TSchema>,
	context?: NodeKeyManager | undefined,
):
	| ITreeCursorSynchronous
	| (TSchema extends FieldSchema<FieldKind.Optional> ? undefined : never) {
	const storedSchema = toStoredSchema(schema);
	const schemaValidationPolicy: SchemaAndPolicy = {
		policy: defaultSchemaPolicy,
		// TODO: optimize: This isn't the most efficient operation since its not cached, and has to convert all the schema.
		schema: storedSchema,
	};

	const mapTree = mapTreeFromNodeData(
		data as InsertableField<UnsafeUnknownSchema>,
		schema,
		context,
		schemaValidationPolicy,
	);
	if (mapTree === undefined) {
		assert(
			storedSchema.rootFieldSchema.kind === FieldKinds.optional.identifier,
			0xa10 /* missing non-optional field */,
		);
		return undefined as TSchema extends FieldSchema<FieldKind.Optional> ? undefined : never;
	}
	return cursorForMapTreeNode(mapTree);
}

/**
 * Creates an unhydrated simple-tree field from a cursor in nodes mode.
 */
export function createFromCursor<const TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	cursor: ITreeCursorSynchronous | undefined,
): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
	const mapTrees = cursor === undefined ? [] : [mapTreeFromCursor(cursor)];
	const context = getUnhydratedContext(schema);
	const flexSchema = context.flexContext.schema;

	const schemaValidationPolicy: SchemaAndPolicy = {
		policy: defaultSchemaPolicy,
		schema: context.flexContext.schema,
	};

	const maybeError = isFieldInSchema(
		mapTrees,
		flexSchema.rootFieldSchema,
		schemaValidationPolicy,
	);
	inSchemaOrThrow(maybeError);

	if (mapTrees.length === 0) {
		return undefined as Unhydrated<TreeFieldFromImplicitField<TSchema>>;
	}
	assert(mapTrees.length === 1, 0xa11 /* unexpected field length */);
	// Length asserted above, so this is safe. This assert is done instead of checking for undefined after indexing to ensure a length greater than 1 also errors.
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const mapTree = mapTrees[0]!;
	const mapTreeNode = UnhydratedFlexTreeNode.getOrCreate(
		getUnhydratedContext(schema),
		mapTree,
	);

	const result = getOrCreateNodeFromInnerNode(mapTreeNode);
	return result as Unhydrated<TreeFieldFromImplicitField<TSchema>>;
}
