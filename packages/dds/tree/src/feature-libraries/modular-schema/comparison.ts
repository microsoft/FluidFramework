/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeTypeSet,
	type ValueSchema,
	storedEmptyFieldSchema,
} from "../../core/index.js";
import { compareSets } from "../../util/index.js";

import type { FullSchemaPolicy } from "./fieldKind.js";
import { withEditor } from "./fieldKindWithEditor.js";
import { isNeverTree } from "./isNeverTree.js";

/**
 * Returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 *
 * `undefined` TreeNodeStoredSchema means the schema is not present (and thus treated as a NeverTree).
 */
export function allowsTreeSuperset(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	original: TreeNodeStoredSchema | undefined,
	superset: TreeNodeStoredSchema | undefined,
): boolean {
	if (isNeverTree(policy, originalData, original)) {
		return true;
	}
	if (isNeverTree(policy, originalData, superset)) {
		return false;
	}
	assert(original !== undefined, 0x716 /* only never trees have undefined schema */);
	assert(superset !== undefined, 0x717 /* only never trees have undefined schema */);
	if (original instanceof LeafNodeStoredSchema) {
		if (superset instanceof LeafNodeStoredSchema) {
			return allowsValueSuperset(original.leafValue, superset.leafValue);
		}
		return false;
	}

	if (superset instanceof LeafNodeStoredSchema) {
		return false;
	}

	assert(
		original instanceof MapNodeStoredSchema || original instanceof ObjectNodeStoredSchema,
		0x893 /* unsupported node kind */,
	);
	assert(
		superset instanceof MapNodeStoredSchema || superset instanceof ObjectNodeStoredSchema,
		0x894 /* unsupported node kind */,
	);

	if (original instanceof MapNodeStoredSchema) {
		if (superset instanceof MapNodeStoredSchema) {
			return allowsFieldSuperset(policy, originalData, original.mapFields, superset.mapFields);
		}
		return false;
	}

	assert(original instanceof ObjectNodeStoredSchema, 0x895 /* unsupported node kind */);
	if (superset instanceof MapNodeStoredSchema) {
		for (const [_key, field] of original.objectNodeFields) {
			if (!allowsFieldSuperset(policy, originalData, field, superset.mapFields)) {
				return false;
			}
		}
		return true;
	}
	assert(superset instanceof ObjectNodeStoredSchema, 0x896 /* unsupported node kind */);

	return compareSets({
		a: original.objectNodeFields,
		b: superset.objectNodeFields,
		aExtra: (originalField) =>
			allowsFieldSuperset(
				policy,
				originalData,
				original.objectNodeFields.get(originalField) ??
					fail(0xb17 /* missing expected field */),
				storedEmptyFieldSchema,
			),
		bExtra: (supersetField) =>
			allowsFieldSuperset(
				policy,
				originalData,
				storedEmptyFieldSchema,
				superset.objectNodeFields.get(supersetField) ??
					fail(0xb18 /* missing expected field */),
			),
		same: (sameField) =>
			allowsFieldSuperset(
				policy,
				originalData,
				original.objectNodeFields.get(sameField) ?? fail(0xb19 /* missing expected field */),
				superset.objectNodeFields.get(sameField) ?? fail(0xb1a /* missing expected field */),
			),
	});
}

/**
 * Returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsValueSuperset(
	original: ValueSchema | undefined,
	superset: ValueSchema | undefined,
): boolean {
	return original === superset;
}

/**
 * Returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsFieldSuperset(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	original: TreeFieldStoredSchema,
	superset: TreeFieldStoredSchema,
): boolean {
	return withEditor(
		policy.fieldKinds.get(original.kind) ?? fail(0xb1b /* missing kind */),
	).allowsFieldSuperset(policy, originalData, original.types, superset);
}

/**
 * Returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsTreeSchemaIdentifierSuperset(
	original: TreeTypeSet,
	superset: TreeTypeSet,
): boolean {
	for (const originalType of original) {
		if (!superset.has(originalType)) {
			return false;
		}
	}
	return true;
}

/**
 * Returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 *
 * A version of this that assumes a specific root field could be slightly more permissive in some simple cases,
 * however if any extra fields and fields with unconstrained types are reachable,
 * it would have to compare everything anyway.
 */
export function allowsRepoSuperset(
	policy: FullSchemaPolicy,
	original: TreeStoredSchema,
	superset: TreeStoredSchema,
): boolean {
	{
		if (
			!allowsFieldSuperset(
				policy,
				original,
				original.rootFieldSchema,
				superset.rootFieldSchema,
			)
		) {
			return false;
		}
	}
	// Check if all schema in original are included in superset, and permit a superset of the node content.
	// Note that any schema can be used in for a detached field, so we must check all schema in original, even if they are not reachable from the root.
	for (const [key, schema] of original.nodeSchema) {
		if (!allowsTreeSuperset(policy, original, schema, superset.nodeSchema.get(key))) {
			return false;
		}
	}
	// Any schema in superset not in original are already known to be superset of original since they are "never" due to being missing.
	// Therefore, we do not need to check them.
	return true;
}
