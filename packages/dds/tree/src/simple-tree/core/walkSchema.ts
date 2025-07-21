/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	normalizeAnnotatedAllowedTypes,
	type NormalizedAnnotatedAllowedTypes,
} from "./allowedTypes.js";
import { getTreeNodeSchemaPrivateData, type TreeNodeSchema } from "./treeNodeSchema.js";

/**
 * Traverses all {@link TreeNodeSchema} schema reachable from `schema`, applying the visitor pattern.
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
 */
export function walkAllowedTypes(
	annotatedAllowedTypes: NormalizedAnnotatedAllowedTypes,
	visitor: SchemaVisitor,
	visitedSet: Set<TreeNodeSchema> = new Set(),
): void {
	for (const { metadata, type } of annotatedAllowedTypes.types) {
		if (metadata.stagedSchemaUpgrade === undefined || visitor.walkStagedAllowedTypes) {
			walkNodeSchema(type, visitor, visitedSet);
		}
	}
	visitor.allowedTypes?.(annotatedAllowedTypes);
}

/**
 * Callbacks and options for use in {@link walkFieldSchema} / {@link walkAllowedTypes} / {@link walkNodeSchema}.
 */
export interface SchemaVisitor {
	/**
	 * Called once for each node schema.
	 */
	node?: (schema: TreeNodeSchema) => void;
	/**
	 * Called once for each set of allowed types.
	 * Includes implicit allowed types (when a single type was used instead of an array).
	 *
	 * This includes every field, but also the allowed types array for maps and arrays and the root if starting at {@link walkAllowedTypes}.
	 */
	allowedTypes?: (allowedTypes: NormalizedAnnotatedAllowedTypes) => void;
	/**
	 * If true, will walk the {@link SchemaFactoryAlpha.staged | staged allowed types} of the schema in both the node callback and the allowedTypes callback.
	 * If undefined, will skip any staged allowed types in the node callback but will include them in the allowedTypes callback.
	 */
	walkStagedAllowedTypes?: true;
}
