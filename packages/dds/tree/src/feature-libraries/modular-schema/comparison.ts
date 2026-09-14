/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, unreachableCase } from "@fluidframework/core-utils/internal";

import {
	EmptyKey,
	type FieldKey,
	type FieldKindIdentifier,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	Multiplicity,
	ObjectNodeStoredSchema,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeTypeSet,
	type ValueSchema,
	storedEmptyFieldSchema,
} from "../../core/index.js";

import type { FullSchemaPolicy } from "./fieldKind.js";
import { isNeverField, isNeverTree } from "./isNeverTree.js";

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
	return (
		getTreeSupersetFailures(policy, originalData, original, superset).next().done === true
	);
}

/**
 * A failed stored-field comparison, independent of the public diagnostic representation.
 */
export type FieldSupersetFailure =
	| { readonly mismatch: "fieldKind" }
	| { readonly mismatch: "allowedType"; readonly allowedType: TreeNodeSchemaIdentifier };

/**
 * A failed node comparison. Maps use {@link EmptyKey} for their implicit field.
 */
export type NodeSupersetFailure =
	| { readonly mismatch: "nodeKind" | "valueSchema" }
	| (FieldSupersetFailure & { readonly fieldKey: FieldKey });

/**
 * A failed stored-schema comparison. Undefined identifiers identify the root field, which uses {@link EmptyKey}.
 */
export type StoredSchemaSupersetFailure =
	| (FieldSupersetFailure & {
			readonly identifier: undefined;
			readonly fieldKey: typeof EmptyKey;
	  })
	| (NodeSupersetFailure & { readonly identifier: TreeNodeSchemaIdentifier });

/**
 * Reports node constraints that prevent a superset transition.
 *
 * @param policy - Field-kind definitions and upgrade rules.
 * @param originalData - Stored schema used to determine constructability on both sides.
 * @param original - Node definition whose content must remain supported.
 * @param superset - Proposed replacement, or undefined for a missing definition.
 * @returns Failures at this node, without recursively expanding referenced definitions.
 * Boolean callers stop at the first failure; diagnostic callers consume the complete iterator.
 */
function* getTreeSupersetFailures(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	original: TreeNodeStoredSchema | undefined,
	superset: TreeNodeStoredSchema | undefined,
): Generator<NodeSupersetFailure> {
	if (isNeverTree(policy, originalData, original)) {
		return;
	}
	if (superset === undefined) {
		yield { mismatch: "nodeKind" };
		return;
	}
	assert(original !== undefined, 0x716 /* only never trees have undefined schema */);
	if (original instanceof LeafNodeStoredSchema) {
		if (superset instanceof LeafNodeStoredSchema) {
			if (!allowsValueSuperset(original.leafValue, superset.leafValue)) {
				yield { mismatch: "valueSchema" };
			}
		} else {
			yield { mismatch: "nodeKind" };
		}
		return;
	}

	if (superset instanceof LeafNodeStoredSchema) {
		yield { mismatch: "nodeKind" };
		return;
	}

	assert(
		original instanceof MapNodeStoredSchema || original instanceof ObjectNodeStoredSchema,
		0x893 /* unsupported node kind */,
	);
	assert(
		superset instanceof MapNodeStoredSchema || superset instanceof ObjectNodeStoredSchema,
		0x894 /* unsupported node kind */,
	);

	if (original instanceof MapNodeStoredSchema && superset instanceof ObjectNodeStoredSchema) {
		yield { mismatch: "nodeKind" };
		return;
	}

	const targetIsNever = isNeverTree(policy, originalData, superset);
	let reported = false;
	const keys: Iterable<FieldKey> =
		original instanceof MapNodeStoredSchema
			? [EmptyKey]
			: new Set([
					...original.objectNodeFields.keys(),
					...(superset instanceof ObjectNodeStoredSchema
						? superset.objectNodeFields.keys()
						: []),
				]);
	for (const fieldKey of keys) {
		const originalField =
			original instanceof MapNodeStoredSchema
				? original.mapFields
				: (original.objectNodeFields.get(fieldKey) ?? storedEmptyFieldSchema);
		const supersetField =
			superset instanceof MapNodeStoredSchema
				? superset.mapFields
				: (superset.objectNodeFields.get(fieldKey) ?? storedEmptyFieldSchema);
		for (const failure of getFieldSupersetFailures(
			policy,
			originalData,
			originalField,
			supersetField,
		)) {
			reported = true;
			yield { ...failure, fieldKey };
		}
	}
	// Constructability can reject a transition even when its individual field rules permit it.
	if (targetIsNever && !reported) {
		yield { mismatch: "nodeKind" };
	}
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
 * Determines whether `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 *
 * @param monotonicOnly - If true, only allow changes of field kinds which are explicitly listed in {@link FieldKindOptions.allowMonotonicUpgradeFrom}.
 * This prevents this function from considering two different schema as equivalent, preventing upgrades which would allow their inverse.
 * This prevents infinite upgrade loops where two clients could keep upgrading between two schema.
 *
 * @remarks
 * True if a client should be able to {@link TreeView.upgradeSchema} from a field schema using this field kind and `originalTypes` to `superset`.
 *
 * @privateRemarks
 * See also {@link FieldKindOptions.allowMonotonicUpgradeFrom} for constraints on the implementation.
 */
export function allowsFieldSuperset(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	original: TreeFieldStoredSchema,
	superset: TreeFieldStoredSchema,
	monotonicOnly: boolean = true,
): boolean {
	return (
		getFieldSupersetFailures(policy, originalData, original, superset, monotonicOnly).next()
			.done === true
	);
}

/**
 * Reports field constraints that reject a superset transition.
 *
 * @param policy - Field-kind definitions and upgrade rules.
 * @param originalData - Stored schema used to determine whether the original field is constructible.
 * @param original - Field whose content must remain supported.
 * @param superset - Proposed replacement field.
 * @param monotonicOnly - Whether different field kinds require an explicit monotonic upgrade.
 * @returns Every removed type identifier and any rejected field-kind transition.
 */
function* getFieldSupersetFailures(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	original: TreeFieldStoredSchema,
	superset: TreeFieldStoredSchema,
	monotonicOnly: boolean = true,
): Generator<FieldSupersetFailure> {
	// Without monotonic upgrade restrictions, a field with no valid content is a subset of any field.
	if (!monotonicOnly && isNeverField(policy, originalData, original)) {
		return;
	}

	// Require the superset to allow every type identifier allowed by the original field.
	for (const allowedType of getMissingTypes(original.types, superset.types)) {
		yield { mismatch: "allowedType", allowedType };
	}

	// Check that the field-kind transition is allowed under the selected upgrade rules.
	if (!allowsFieldKindSuperset(policy, original.kind, superset.kind, monotonicOnly)) {
		yield { mismatch: "fieldKind" };
	}
}

/**
 * Determines whether `superset` can replace `original` under the selected field-kind comparison rules.
 *
 * @remarks
 * Identical field-kind identifiers always return true.
 * For different identifiers, the comparison depends on `monotonicOnly`:
 *
 * - When true, the proposed kind must explicitly allow an upgrade from the original kind through
 * {@link FieldKindOptions.allowMonotonicUpgradeFrom}.
 * These rules prevent reversible field-kind upgrades that could cause repeated upgrades between clients.
 * - When false, only multiplicity (the allowed number of children) is compared.
 * The proposed kind must allow every child count allowed by the original kind.
 * This comparison can accept transitions in both directions between different kinds with the same multiplicity.
 *
 * This function does not compare allowed type identifiers or determine whether field content can be constructed.
 * Use {@link allowsFieldSuperset} to compare complete field schemas.
 *
 * @param policy - Schema policy containing the field-kind definitions and upgrade rules used by the comparison.
 * @param original - Identifier of the field kind to replace.
 * @param superset - Identifier of the proposed replacement field kind.
 * @param monotonicOnly - Whether to require an explicitly permitted upgrade for different field kinds.
 * Defaults to true. When false, compares multiplicities instead.
 *
 * @returns True if the kinds are identical or the selected comparison permits the replacement; otherwise false.
 */
export function allowsFieldKindSuperset(
	policy: FullSchemaPolicy,
	original: FieldKindIdentifier,
	superset: FieldKindIdentifier,
	monotonicOnly: boolean = true,
): boolean {
	// Identical kinds are compatible without consulting the upgrade rules.
	if (original === superset) {
		return true;
	}

	// Look up the proposed kind's upgrade rules and multiplicity.
	const supersetKind = policy.fieldKinds.get(superset) ?? fail(0xb1b /* missing kind */);

	if (monotonicOnly) {
		// Require the proposed kind to explicitly permit an upgrade from the original kind.
		return supersetKind.options.allowMonotonicUpgradeFrom.has(original);
	} else {
		// Without monotonic restrictions, check that every original child count remains allowed.
		const originalKind = policy.fieldKinds.get(original) ?? fail(0xcab /* missing kind */);
		return allowsMultiplicitySuperset(originalKind.multiplicity, supersetKind.multiplicity);
	}
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
	return getMissingTypes(original, superset).next().done === true;
}

/**
 * Enumerates the allowed type identifiers removed by a proposed replacement.
 *
 * @param original - Allowed type identifiers whose support must be retained.
 * @param superset - Allowed type identifiers in the proposed replacement.
 * @returns Missing identifiers in their original iteration order.
 */
function* getMissingTypes(
	original: TreeTypeSet,
	superset: TreeTypeSet,
): Generator<TreeNodeSchemaIdentifier> {
	for (const originalType of original) {
		if (!superset.has(originalType)) {
			yield originalType;
		}
	}
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
	return getStoredSchemaSupersetFailures(policy, original, superset).next().done === true;
}

/**
 * Reports every constraint that prevents a stored schema from being upgraded to a superset.
 *
 * @param policy - Field-kind definitions and upgrade rules.
 * @param original - Stored schema whose content must remain supported, including detached nodes.
 * @param superset - Proposed replacement stored schema.
 * @returns Located failures from the root field and every original node definition.
 */
export function* getStoredSchemaSupersetFailures(
	policy: FullSchemaPolicy,
	original: TreeStoredSchema,
	superset: TreeStoredSchema,
): Generator<StoredSchemaSupersetFailure> {
	for (const failure of getFieldSupersetFailures(
		policy,
		original,
		original.rootFieldSchema,
		superset.rootFieldSchema,
	)) {
		yield { ...failure, identifier: undefined, fieldKey: EmptyKey };
	}
	// Check if all schema in original are included in superset, and permit a superset of the node content.
	// Note that any schema from `original.nodeSchema` can be used as the schema for a node at the root of a detached field,
	// so we must check all of them, even if they are not reachable from the root field schema.
	for (const [key, schema] of original.nodeSchema) {
		for (const failure of getTreeSupersetFailures(
			policy,
			original,
			schema,
			superset.nodeSchema.get(key),
		)) {
			yield { ...failure, identifier: key };
		}
	}
	// Any schema in superset not in original are already known to be superset of original since they are "never" due to being missing.
	// Therefore, we do not need to check them.
}

/**
 * Returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 */
export function allowsMultiplicitySuperset(
	original: Multiplicity,
	superset: Multiplicity,
): boolean {
	if (original === superset) {
		return true;
	}

	switch (superset) {
		case Multiplicity.Forbidden: {
			return false;
		}
		case Multiplicity.Optional: {
			return original === Multiplicity.Single || original === Multiplicity.Forbidden;
		}
		case Multiplicity.Single: {
			return false;
		}
		case Multiplicity.Sequence: {
			return true;
		}
		default: {
			return unreachableCase(superset);
		}
	}
}
