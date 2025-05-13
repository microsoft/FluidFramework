/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeNodeSchema } from "./treeNodeSchema.js";

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

	walkAllowedTypes(schema.childTypes, visitor, visitedSet);

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
	allowedTypes: Iterable<TreeNodeSchema>,
	visitor: SchemaVisitor,
	visitedSet: Set<TreeNodeSchema> = new Set(),
): void {
	for (const childType of allowedTypes) {
		walkNodeSchema(childType, visitor, visitedSet);
	}
	visitor.allowedTypes?.(allowedTypes);
}

/**
 * Callbacks for use in {@link walkFieldSchema} / {@link walkAllowedTypes} / {@link walkNodeSchema}.
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
	allowedTypes?: (allowedTypes: Iterable<TreeNodeSchema>) => void;
}
