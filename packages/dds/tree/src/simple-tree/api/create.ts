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
	type FieldKey,
	type ITreeCursorSynchronous,
	type SchemaAndPolicy,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import {
	defaultSchemaPolicy,
	isFieldInSchema,
	throwOutOfSchema,
} from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import {
	type Context,
	getOrCreateNodeFromInnerNode,
	type Unhydrated,
	type UnhydratedFlexTreeField,
	UnhydratedFlexTreeNode,
	createField,
} from "../core/index.js";
import { getUnhydratedContext } from "../createContext.js";
import {
	getStagedRequiredUpgrade,
	type ImplicitFieldSchema,
	type TreeFieldFromImplicitField,
} from "../fieldSchema.js";
import { isObjectNodeSchema } from "../node-kinds/index.js";

import { unknownTypeError } from "./customTree.js";

/**
 * Creates an unhydrated simple-tree field from a cursor in nodes mode.
 * @remarks
 * Does not support providing missing defaults values.
 * Validates the field is in schema using `destinationSchema` the provided `contextForNewNodes` or the default unhydrated context if not provided.
 */
export function createFromCursor<const TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
	cursor: ITreeCursorSynchronous | undefined,
	destinationSchema: TreeFieldStoredSchema,
	contextForNewNodes?: Context,
): Unhydrated<TreeFieldFromImplicitField<TSchema>> {
	const context = contextForNewNodes ?? getUnhydratedContext(schema);
	assert(context.flexContext.isHydrated() === false, 0xbfe /* Expected unhydrated context */);
	if (cursor === undefined && getStagedRequiredUpgrade(schema) !== false) {
		throw new UsageError(
			"Cannot create empty content for a staged required field. The field is optional in the view schema only because the stored schema has not been tightened yet (see SchemaStaticsAlpha.stagedRequired); a client using this schema must not create new content where it is empty.",
		);
	}
	const mapTrees = cursor === undefined ? [] : [unhydratedFlexTreeFromCursor(context, cursor)];

	const schemaAndPolicy: SchemaAndPolicy = {
		policy: defaultSchemaPolicy,
		schema: context.flexContext.schema,
	};

	// Assuming the caller provides the correct `contextForNewNodes`, this should handle unknown optional fields.
	isFieldInSchema(mapTrees, destinationSchema, schemaAndPolicy, throwOutOfSchema);

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
	const identifier = cursor.type;
	const storedSchema =
		context.flexContext.schema.nodeSchema.get(identifier) ?? unknownTypeError(identifier);

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
					`Field ${JSON.stringify(cursor.getFieldKey())} is not defined in the schema ${JSON.stringify(identifier)}.`,
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
	checkStagedRequiredFieldsPresent(context, identifier, fields);
	return new UnhydratedFlexTreeNode(
		{ type: cursor.type, value: cursor.value },
		fields,
		context,
	);
}

/**
 * Enforces the {@link SchemaStaticsAlpha.stagedRequired | staged required} invariant on the cursor-based
 * construction path (used by `TreeAlpha.importVerbose`, `TreeAlpha.importCompressed` and `TreeBeta.clone`).
 *
 * @remarks
 * A staged required field is `Optional` in both the view and (until the upgrade is explicitly enabled) the stored
 * schema, so neither the flex-tree schema validation nor the stored schema can catch construction of an empty value
 * here. Without this check, a client running the staged view schema could import or clone content in which the field
 * is empty, which would violate the invariant that step 3 of the migration relies on.
 */
function checkStagedRequiredFieldsPresent(
	context: Context,
	identifier: TreeNodeSchemaIdentifier,
	fields: ReadonlyMap<FieldKey, UnhydratedFlexTreeField>,
): void {
	const viewSchema = context.schema.get(identifier);
	if (viewSchema === undefined || !isObjectNodeSchema(viewSchema)) {
		return;
	}
	for (const fieldSchema of viewSchema.fields.values()) {
		if (getStagedRequiredUpgrade(fieldSchema) === false) {
			continue;
		}
		const field = fields.get(brand(fieldSchema.storedKey));
		if (field === undefined || field.length === 0) {
			throw new UsageError(
				`Staged required field ${JSON.stringify(fieldSchema.storedKey)} of node ${JSON.stringify(identifier)} must have a value. ` +
					`The field is optional in the view schema only because the stored schema has not been tightened yet (see SchemaStaticsAlpha.stagedRequired); ` +
					`a client using this schema must not create new content where it is empty.`,
			);
		}
	}
}
