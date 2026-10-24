/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	normalizeAndEvaluateAnnotatedAllowedTypes,
	type AnnotatedAllowedType,
	type AllowedTypesFullEvaluated,
	markSchemaMostDerived,
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

	function* visit(node: TreeNodeSchema): IterableIterator<TreeNodeSchema> {
		visitedSet.add(node);
		markSchemaMostDerived(node, false);
		visitor.enterNode?.(node);
		// Do not initialize contexts: this walk is itself used during node initialization.
		for (const field of getTreeNodeSchemaPrivateData(node).childAllowedTypes) {
			yield* visitAllowedTypes(normalizeAndEvaluateAnnotatedAllowedTypes(field), visitor);
		}
		visitor.node?.(node);
	}

	const pending = [visit(schema)];
	let current = pending.at(-1);
	while (current !== undefined) {
		const next = current.next();
		if (next.done === true) {
			pending.pop();
		} else if (!visitedSet.has(next.value)) {
			pending.push(visit(next.value));
		}
		current = pending.at(-1);
	}
}

/**
 * Traverses all {@link TreeNodeSchema} schema reachable from `allowedTypes`, applying the visitor pattern.
 * @internal
 */
export function walkAllowedTypes(
	annotatedAllowedTypes: AllowedTypesFullEvaluated,
	visitor: SchemaVisitor,
	visitedSet: Set<TreeNodeSchema> = new Set(),
): void {
	for (const schema of visitAllowedTypes(annotatedAllowedTypes, visitor)) {
		walkNodeSchema(schema, visitor, visitedSet);
	}
}

function* visitAllowedTypes(
	annotatedAllowedTypes: AllowedTypesFullEvaluated,
	visitor: SchemaVisitor,
): IterableIterator<TreeNodeSchema> {
	for (const allowedType of annotatedAllowedTypes.types) {
		const filter = visitor.allowedTypeFilter;
		if (filter === undefined || filter(allowedType)) {
			yield allowedType.type;
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
	 * Called once per reached node, after most-derived validation and before evaluating its fields.
	 */
	enterNode?: (schema: TreeNodeSchema) => void;
	/**
	 * Called once for each node schema reached, after walking its fields.
	 */
	node?: (schema: TreeNodeSchema) => void;
	/**
	 * Called once for each set of allowed types.
	 * @remarks
	 * This includes every field, as well as the allowed types for maps and arrays nodes and the root if starting at {@link walkAllowedTypes}.
	 *
	 * Each allowed types in the schema is visited as it was in the original schema except for normalization.
	 *
	 * Called after walking the allowed types selected by {@link SchemaVisitor.allowedTypeFilter}.
	 */
	allowedTypes?: (allowedTypes: AllowedTypesFullEvaluated) => void;
	/**
	 * If true, will walk into this `allowedType`.
	 * If false, the `allowedType` will not be walked into.
	 *
	 * If not provided, all allowedTypes will be walked into.
	 * @remarks
	 * Called before walking each reference, including references to already visited nodes.
	 * @privateRemarks
	 * It would be possible to combine this with `allowedTypes` into a single callback, but for the current usage this separation is more convenient.
	 */
	allowedTypeFilter?: (allowedType: AnnotatedAllowedType<TreeNodeSchema>) => boolean;
}
