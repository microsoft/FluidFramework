/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AllowedTypeMetadata } from "../schemaTypes.js";
import {
	asTreeNodeSchemaCorePrivate,
	type NormalizedAnnotatedAllowedTypes,
	type TreeNodeSchema,
} from "./treeNodeSchema.js";

/**
 * Traverses all {@link TreeNodeSchema} schema reachable from `schema`, applying the visitor pattern.
 */
export function walkNodeSchema(
	schema: TreeNodeSchema,
	annotations: AllowedTypeMetadata,
	visitor: SchemaVisitor,
	visitedSet: Set<TreeNodeSchema>,
): void {
	if (visitedSet.has(schema)) {
		return;
	}

	visitedSet.add(schema);

	const annotatedAllowedTypes = asTreeNodeSchemaCorePrivate(schema).childAnnotatedAllowedTypes;

	for (const fieldAllowedTypes of annotatedAllowedTypes) {
		walkAllowedTypes(fieldAllowedTypes, visitor, visitedSet);
	}

	// This visit is done at the end so the traversal order is most inner types first.
	// This was picked since when fixing errors,
	// working from the inner types out to the types that use them will probably go better than the reverse.
	// This does not however ensure all types referenced by a type are visited before it, since in recursive cases thats impossible.
	visitor.node?.(schema, annotations);
}

/**
 * Traverses all {@link TreeNodeSchema} schema reachable from `allowedTypes`, applying the visitor pattern.
 */
export function walkAllowedTypes(
	annotatedAllowedTypes: NormalizedAnnotatedAllowedTypes,
	visitor: SchemaVisitor,
	visitedSet: Set<TreeNodeSchema> = new Set(),
): void {
	for (const { type } of annotatedAllowedTypes.types) {
		walkNodeSchema(type, visitor, visitedSet);
	}
	visitor.allowedTypes?.(annotatedAllowedTypes);
}

/**
 * Callbacks for use in {@link walkFieldSchema} / {@link walkAllowedTypes} / {@link walkNodeSchema}.
 */
export interface SchemaVisitor {
	/**
	 * Called for each node schema. This may be called multiple times for the same node schema e.g. if the same schema
	 * is allowed on different fields.
	 */
	node?: (schema: TreeNodeSchema, annotations: AllowedTypeMetadata) => void;
	/**
	 * Called once for each set of allowed types.
	 * Includes implicit allowed types (when a single type was used instead of an array).
	 *
	 * This includes every field, but also the allowed types array for maps and arrays and the root if starting at {@link walkAllowedTypes}.
	 */
	allowedTypes?: (allowedTypes: NormalizedAnnotatedAllowedTypes) => void;
}
