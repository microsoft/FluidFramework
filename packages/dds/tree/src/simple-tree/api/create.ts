/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	CursorLocationType,
	mapCursorField,
	mapCursorFields,
	type ITreeCursorSynchronous,
	type SchemaAndPolicy,
} from "../../core/index.js";
import type { ImplicitFieldSchema, TreeFieldFromImplicitField } from "../schemaTypes.js";
import {
	type Context,
	getOrCreateNodeFromInnerNode,
	type NodeKind,
	type Unhydrated,
	UnhydratedFlexTreeNode,
	createField,
} from "../core/index.js";
import {
	defaultSchemaPolicy,
	inSchemaOrThrow,
	isFieldInSchema,
} from "../../feature-libraries/index.js";
import { getUnhydratedContext } from "../createContext.js";
import { createUnknownOptionalFieldPolicy } from "../node-kinds/index.js";
import type { SimpleNodeSchema, SimpleNodeSchemaBase } from "../simpleSchema.js";
import { getStoredSchema } from "../toStoredSchema.js";
import { unknownTypeError } from "./customTree.js";

/**
 * Creates an unhydrated simple-tree field from a cursor in nodes mode.
 * @remarks
 * Does not support defaults.
 * Validates the field is in schema.
 */
export function createFromCursor<const TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	cursor: ITreeCursorSynchronous | undefined,
): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
	const context = getUnhydratedContext(schema);
	const mapTrees = cursor === undefined ? [] : [flexTreeFromCursor(context, cursor)];

	const flexSchema = context.flexContext.schema;

	const schemaValidationPolicy: SchemaAndPolicy = {
		policy: {
			...defaultSchemaPolicy,
			allowUnknownOptionalFields: createUnknownOptionalFieldPolicy(schema),
		},
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

	return getOrCreateNodeFromInnerNode(mapTree) as Unhydrated<
		TreeFieldFromImplicitField<TSchema>
	>;
}

/**
 * Construct an {@link UnhydratedFlexTreeNode} from a cursor in Nodes mode.
 * @remarks
 * This does not validate the node is in schema.
 */
export function flexTreeFromCursor(
	context: Context,
	cursor: ITreeCursorSynchronous,
): UnhydratedFlexTreeNode {
	assert(cursor.mode === CursorLocationType.Nodes, "Expected nodes cursor");
	const schema = context.schema.get(cursor.type) ?? unknownTypeError(cursor.type);
	const storedSchema = getStoredSchema(
		schema as SimpleNodeSchemaBase<NodeKind> as SimpleNodeSchema,
	);
	const fields = new Map(
		mapCursorFields(cursor, () => [
			cursor.getFieldKey(),
			createField(
				context.flexContext,
				storedSchema.getFieldSchema(cursor.getFieldKey()).kind,
				cursor.getFieldKey(),
				mapCursorField(cursor, () => flexTreeFromCursor(context, cursor)),
			),
		]),
	);
	return new UnhydratedFlexTreeNode(
		{ type: cursor.type, value: cursor.value },
		fields,
		context,
	);
}
