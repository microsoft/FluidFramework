/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	CursorLocationType,
	forbiddenFieldKindIdentifier,
	mapCursorField,
	mapCursorFields,
	type ITreeCursorSynchronous,
	type SchemaAndPolicy,
} from "../../core/index.js";
import type { ImplicitFieldSchema, TreeFieldFromImplicitField } from "../fieldSchema.js";
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
import type { SimpleNodeSchema, SimpleNodeSchemaBase } from "../simpleSchema.js";
import { getStoredSchema } from "../toStoredSchema.js";
import { unknownTypeError } from "./customTree.js";

/**
 * Creates an unhydrated simple-tree field from a cursor in nodes mode.
 * @remarks
 * Does not support defaults.
 * Validates the field is in schema.
 *
 * TODO: AB#43548: How this handles unknown optional fields needs to be figured out, tested and documented.
 */
export function createFromCursor<const TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	cursor: ITreeCursorSynchronous | undefined,
): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
	const context = getUnhydratedContext(schema);
	const mapTrees = cursor === undefined ? [] : [unhydratedFlexTreeFromCursor(context, cursor)];

	const flexSchema = context.flexContext.schema;

	const schemaValidationPolicy: SchemaAndPolicy = {
		policy: {
			...defaultSchemaPolicy,
		},
		schema: context.flexContext.schema,
	};

	// TODO: AB#43548: Using a stored schema from the possibly unhydrated flex tree context does not handle schema evolution features like "allowUnknownOptionalFields".
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
 * This does not fully validate the node is in schema, but does throw UsageErrors for some cases of out-of-schema content.
 *
 * Does not support unknown optional fields: will throw a UsageError if the field is not in schema.
 * This cannot easily be fixed as this code requires a schema for each subtree to process, and none is available for unknown optional fields.
 */
export function unhydratedFlexTreeFromCursor(
	context: Context,
	cursor: ITreeCursorSynchronous,
): UnhydratedFlexTreeNode {
	assert(cursor.mode === CursorLocationType.Nodes, 0xbb4 /* Expected nodes cursor */);
	const schema = context.schema.get(cursor.type) ?? unknownTypeError(cursor.type);
	// TODO: AB#43548: Using a stored schema from for unhydrated flex trees does not handle schema evolution features like "allowUnknownOptionalFields".
	const storedSchema = getStoredSchema(
		schema as SimpleNodeSchemaBase<NodeKind> as SimpleNodeSchema,
	);
	const fields = new Map(
		mapCursorFields(cursor, () => {
			const fieldSchema = storedSchema.getFieldSchema(cursor.getFieldKey());
			if (fieldSchema.kind === forbiddenFieldKindIdentifier) {
				// Check for unexpected fields before recursing into children:
				// Code which hits this case is very likely to also use an unknown type in the unexpected field, which would give a more confusing error message.
				// This case is detected here to improve error quality.
				// Also note that if using the view schema from above to suppress this error for unknownOptionalFields, that would not provide a way to handle unknown types in those fields:
				// they would still error, but with that more confusing message about unknown types.
				throw new UsageError(
					// Using JSON.stringify to handle quoting and escaping since both key and identifier can technically contain quotes themselves.
					`Field ${JSON.stringify(cursor.getFieldKey())} is not defined in the schema ${JSON.stringify(schema.identifier)}.`,
				);
			}
			return [
				cursor.getFieldKey(),
				createField(
					context.flexContext,
					fieldSchema.kind,
					cursor.getFieldKey(),
					mapCursorField(cursor, () => unhydratedFlexTreeFromCursor(context, cursor)),
				),
			];
		}),
	);
	return new UnhydratedFlexTreeNode(
		{ type: cursor.type, value: cursor.value },
		fields,
		context,
	);
}
