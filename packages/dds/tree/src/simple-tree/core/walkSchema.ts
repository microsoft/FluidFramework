/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	normalizeAnnotatedAllowedTypes,
	type AnnotatedAllowedType,
	type NormalizedAnnotatedAllowedTypes,
} from "./allowedTypes.js";
import { getTreeNodeSchemaPrivateData, type TreeNodeSchema } from "./treeNodeSchema.js";

/**
 * Traverses all {@link TreeNodeSchema} schema reachable from `schema`, applying the visitor pattern.
 * @internal
 */
export function walkNodeSchema(
	schema: TreeNodeSchema,
	visitor: SchemaVisitor,
	visitedSet: Set<TreeNodeSchema>,
): void {
	if (visitedSet.has(schema)) {
		return;
	}

	visitedSet.add(schema);

	// Since walkNodeSchema is used in the implementation of TreeNodeSchemaPrivateData.idempotentInitialize,
	// Avoid depending on it here to avoid circular dependencies for recursive schema.
	// Instead normalize/evaluate the allowed types as needed.
	const annotatedAllowedTypes =
		getTreeNodeSchemaPrivateData(schema).childAnnotatedAllowedTypes;

	for (const fieldAllowedTypes of annotatedAllowedTypes) {
		walkAllowedTypes(normalizeAnnotatedAllowedTypes(fieldAllowedTypes), visitor, visitedSet);
	}

	// This visit is done at the end so the traversal order is most inner types first.
	// This was picked since when fixing errors,
	// working from the inner types out to the types that use them will probably go better than the reverse.
	// This does not however ensure all types referenced by a type are visited before it, since in recursive cases thats impossible.
	visitor.node?.(schema);
}

/**
 * Traverses all {@link TreeNodeSchema} schema reachable from `allowedTypes`, applying the visitor pattern.
 * @internal
 */
export function walkAllowedTypes(
	annotatedAllowedTypes: NormalizedAnnotatedAllowedTypes,
	visitor: SchemaVisitor,
	visitedSet: Set<TreeNodeSchema> = new Set(),
): void {
	for (const allowedType of annotatedAllowedTypes.types) {
		if ((visitor.allowedTypeFilter ?? (() => true))(allowedType)) {
			walkNodeSchema(allowedType.type, visitor, visitedSet);
		}
	}
	visitor.allowedTypes?.(annotatedAllowedTypes);
}

/**
 * Callbacks and options for use in {@link walkFieldSchema} / {@link walkAllowedTypes} / {@link walkNodeSchema}.
 * @internal
 */
export interface SchemaVisitor {
	/**
	 * Called once for each node schema reached.
	 */
	node?: (schema: TreeNodeSchema) => void;
	/**
	 * Called once for each set of allowed types.
	 * @remarks
	 * This includes every field, as well as the allowed types for maps and arrays nodes and the root if starting at {@link walkAllowedTypes}.
	 *
	 * Each allowed types in the schema is visited as it was in the original schema except for normalization.
	 *
	 * After this is called {@link SchemaVisitor.allowedTypeFilter} is applied to each allowed type in the schema to determine which of them are walked into.
	 */
	allowedTypes?: (allowedTypes: NormalizedAnnotatedAllowedTypes) => void;
	/**
	 * If true, will walk into this `allowedType`.
	 * If false, the `allowedType` will not be walked into.
	 *
	 * If not provided, all allowedTypes will be walked into.
	 * @remarks
	 * Called after {@link SchemaVisitor.allowedTypes}.
	 * @privateRemarks
	 * It would be possible to combine this with `allowedTypes` into a single callback, but for the current usage this separation is more convenient.
	 */
	allowedTypeFilter?: (allowedType: AnnotatedAllowedType<TreeNodeSchema>) => boolean;
}
