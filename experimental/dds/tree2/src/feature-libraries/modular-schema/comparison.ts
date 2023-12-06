/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { compareSets, fail } from "../../util";
import {
	TreeNodeStoredSchema,
	ValueSchema,
	TreeFieldStoredSchema,
	TreeTypeSet,
	TreeStoredSchema,
	storedEmptyFieldSchema,
} from "../../core";
import { Multiplicity } from "../multiplicity";
import { FullSchemaPolicy, withEditor } from "./fieldKind";

/**
 * @returns true iff `superset` is a superset of `original`.
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
	if (!allowsValueSuperset(original.leafValue, superset.leafValue)) {
		return false;
	}
	if (
		!allowsFieldSuperset(
			policy,
			originalData,
			normalizeField(original.mapFields),
			normalizeField(superset.mapFields),
		)
	) {
		return false;
	}

	if (
		!compareSets({
			a: original.objectNodeFields,
			b: superset.objectNodeFields,
			aExtra: (originalField) =>
				allowsFieldSuperset(
					policy,
					originalData,
					original.objectNodeFields.get(originalField) ?? fail("missing expected field"),
					normalizeField(superset.mapFields),
				),
			bExtra: (supersetField) =>
				allowsFieldSuperset(
					policy,
					originalData,
					normalizeField(original.mapFields),
					superset.objectNodeFields.get(supersetField) ?? fail("missing expected field"),
				),
			same: (sameField) =>
				allowsFieldSuperset(
					policy,
					originalData,
					original.objectNodeFields.get(sameField) ?? fail("missing expected field"),
					superset.objectNodeFields.get(sameField) ?? fail("missing expected field"),
				),
		})
	) {
		return false;
	}

	return true;
}

/**
 * @returns true iff `superset` is a superset of `original`.
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
 * @returns true iff `superset` is a superset of `original`.
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
		policy.fieldKinds.get(original.kind.identifier) ?? fail("missing kind"),
	).allowsFieldSuperset(policy, originalData, original.types, superset);
}

/**
 * @returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsTreeSchemaIdentifierSuperset(
	original: TreeTypeSet,
	superset: TreeTypeSet,
): boolean {
	if (superset === undefined) {
		return true;
	}
	if (original === undefined) {
		return false;
	}
	for (const originalType of original) {
		if (!superset.has(originalType)) {
			return false;
		}
	}
	return true;
}

/**
 * @returns true iff `superset` is a superset of `original`.
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
		// TODO: I think its ok to use the field from superset here, but I should confirm it is, and document why.
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
	for (const [key, schema] of original.nodeSchema) {
		// TODO: I think its ok to use the tree from superset here, but I should confirm it is, and document why.
		if (!allowsTreeSuperset(policy, original, schema, superset.nodeSchema.get(key))) {
			return false;
		}
	}
	return true;
}

/**
 * @alpha
 */
export function isNeverField(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	field: TreeFieldStoredSchema,
): boolean {
	return isNeverFieldRecursive(policy, originalData, field, new Set());
}

export function isNeverFieldRecursive(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	field: TreeFieldStoredSchema,
	parentTypeStack: Set<TreeNodeStoredSchema>,
): boolean {
	if (
		(policy.fieldKinds.get(field.kind.identifier) ?? fail("missing field kind"))
			.multiplicity === Multiplicity.Single &&
		field.types !== undefined
	) {
		for (const type of field.types) {
			if (
				!isNeverTreeRecursive(
					policy,
					originalData,
					originalData.nodeSchema.get(type),
					parentTypeStack,
				)
			) {
				return false;
			}
		}
		// This field requires at least one child, and there are no types permitted in it that can exist,
		// so this is a never field (field which no sequence of children content could ever be in schema for)
		return true;
	}
	return false;
}

/**
 * Returns true iff there are no possible trees that could meet this schema.
 * Trees which are infinite (like endless linked lists) are considered impossible.
 *
 * `undefined` means the schema is not present and thus a NeverTree.
 */
export function isNeverTree(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	treeNode: TreeNodeStoredSchema | undefined,
): boolean {
	return isNeverTreeRecursive(policy, originalData, treeNode, new Set());
}

/**
 * Returns true iff there are no possible trees that could meet this schema.
 * Trees which are infinite (like endless linked lists) are considered impossible.
 *
 * `undefined` means the schema is not present and thus a NeverTree.
 */
export function isNeverTreeRecursive(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	treeNode: TreeNodeStoredSchema | undefined,
	parentTypeStack: Set<TreeNodeStoredSchema>,
): boolean {
	if (treeNode === undefined) {
		return true;
	}
	if (parentTypeStack.has(treeNode)) {
		return true;
	}
	try {
		parentTypeStack.add(treeNode);
		if (
			(
				policy.fieldKinds.get(normalizeField(treeNode.mapFields).kind.identifier) ??
				fail("missing field kind")
			).multiplicity === Multiplicity.Single
		) {
			return true;
		}
		for (const field of treeNode.objectNodeFields.values()) {
			// TODO: this can recurse infinitely for schema that include themselves in a value field.
			// This breaks even if there are other allowed types.
			// Such schema should either be rejected (as an error here) or considered never (and thus detected by this).
			// This can be done by passing a set/stack of current types recursively here.
			if (isNeverFieldRecursive(policy, originalData, field, parentTypeStack)) {
				return true;
			}
		}

		return false;
	} finally {
		parentTypeStack.delete(treeNode);
	}
}

export function normalizeField(schema: TreeFieldStoredSchema | undefined): TreeFieldStoredSchema {
	return schema ?? storedEmptyFieldSchema;
}
