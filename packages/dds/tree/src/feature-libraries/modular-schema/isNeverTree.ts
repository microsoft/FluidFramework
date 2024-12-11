/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	Multiplicity,
} from "../../core/index.js";
import { fail } from "../../util/index.js";

import type { FullSchemaPolicy } from "./fieldKind.js";

/**
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
		(policy.fieldKinds.get(field.kind) ?? fail("missing field kind")).multiplicity ===
			Multiplicity.Single &&
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
		if (treeNode instanceof MapNodeStoredSchema) {
			return (
				(policy.fieldKinds.get(treeNode.mapFields.kind) ?? fail("missing field kind"))
					.multiplicity === Multiplicity.Single
			);
		} else if (treeNode instanceof ObjectNodeStoredSchema) {
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
		} else {
			assert(treeNode instanceof LeafNodeStoredSchema, 0x897 /* unsupported node kind */);
			return false;
		}
	} finally {
		parentTypeStack.delete(treeNode);
	}
}
