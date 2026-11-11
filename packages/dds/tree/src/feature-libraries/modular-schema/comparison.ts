/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, unreachableCase } from "@fluidframework/core-utils/internal";

import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	Multiplicity,
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
import { isNeverField, isNeverTree } from "./isNeverTree.js";

/**
 * Selects the rules used to compare allowed schema content.
 *
 * @remarks
 * These modes separate content compatibility from the ordering needed to prevent upgrade cycles.
 * Neither mode compares schema versions itself; {@link allowsSchemaUpgrade} combines a content comparison with version checks.
 */
export enum SchemaComparisonMode {
	/**
	 * Compares allowed content and requires field-kind changes to be listed in {@link FieldKindOptions.allowMonotonicUpgradeFrom}.
	 * That additional restriction prevents clients from repeatedly reversing changes between field kinds that allow the same content.
	 * Because these rules provide an upgrade ordering without version increases, this is the default mode.
	 */
	Monotonic,

	/**
	 * Compares allowed content without enforcing monotonic field-kind upgrade rules.
	 * Instead, field-kind changes are checked with {@link allowsMultiplicitySuperset}, and fields with no valid content are treated as subsets of all fields.
	 * This permits some changes between distinct schemas that allow the same content, but it can also permit their inverse.
	 *
	 * To prevent those cycles, {@link allowsSchemaUpgrade} uses this mode only when both version maps are present,
	 * no versions decrease or disappear, and at least one version increases or a library identifier is added.
	 * It checks these conditions with {@link ifSchemaVersionsDecrease} and {@link areSchemaVersionsEqual}.
	 */
	ContentOnly,
}

/**
 * Returns true iff `superset` is a superset of `original`.
 *
 * This does not require a strict (aka proper) superset: equivalent schema will return true.
 *
 * `undefined` TreeNodeStoredSchema means the schema is not present (and thus treated as a NeverTree).
 *
 * @param comparisonMode - The content comparison rules. Defaults to {@link SchemaComparisonMode.Monotonic}.
 */
export function allowsTreeSuperset(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	original: TreeNodeStoredSchema | undefined,
	superset: TreeNodeStoredSchema | undefined,
	comparisonMode: SchemaComparisonMode = SchemaComparisonMode.Monotonic,
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
			return allowsFieldSuperset(
				policy,
				originalData,
				original.mapFields,
				superset.mapFields,
				comparisonMode,
			);
		}
		return false;
	}

	assert(original instanceof ObjectNodeStoredSchema, 0x895 /* unsupported node kind */);
	if (superset instanceof MapNodeStoredSchema) {
		for (const [_key, field] of original.objectNodeFields) {
			if (
				!allowsFieldSuperset(policy, originalData, field, superset.mapFields, comparisonMode)
			) {
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
				comparisonMode,
			),
		bExtra: (supersetField) =>
			allowsFieldSuperset(
				policy,
				originalData,
				storedEmptyFieldSchema,
				superset.objectNodeFields.get(supersetField) ??
					fail(0xb18 /* missing expected field */),
				comparisonMode,
			),
		same: (sameField) =>
			allowsFieldSuperset(
				policy,
				originalData,
				original.objectNodeFields.get(sameField) ?? fail(0xb19 /* missing expected field */),
				superset.objectNodeFields.get(sameField) ?? fail(0xb1a /* missing expected field */),
				comparisonMode,
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
 *
 * @param comparisonMode - The content comparison rules. Defaults to {@link SchemaComparisonMode.Monotonic}.
 *
 * @remarks
 * Schema versions are not checked here.
 * {@link allowsSchemaUpgrade} determines whether a schema upgrade is allowed.
 *
 * @privateRemarks
 * See also {@link FieldKindOptions.allowMonotonicUpgradeFrom} for constraints on the implementation.
 */
export function allowsFieldSuperset(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	original: TreeFieldStoredSchema,
	superset: TreeFieldStoredSchema,
	comparisonMode: SchemaComparisonMode = SchemaComparisonMode.Monotonic,
): boolean {
	if (
		comparisonMode === SchemaComparisonMode.ContentOnly &&
		isNeverField(policy, originalData, original)
	) {
		return true;
	}

	if (!allowsTreeSchemaIdentifierSuperset(original.types, superset.types)) {
		return false;
	}

	if (original.kind === superset.kind) {
		return true;
	}

	const supersetKind = policy.fieldKinds.get(superset.kind) ?? fail(0xb1b /* missing kind */);

	if (comparisonMode === SchemaComparisonMode.Monotonic) {
		return supersetKind.options.allowMonotonicUpgradeFrom.has(original.kind);
	} else {
		const originalKind =
			policy.fieldKinds.get(original.kind) ?? fail(0xcab /* missing kind */);
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
 *
 * @param comparisonMode - The content comparison rules. Defaults to {@link SchemaComparisonMode.Monotonic}.
 */
export function allowsRepoSuperset(
	policy: FullSchemaPolicy,
	original: TreeStoredSchema,
	superset: TreeStoredSchema,
	comparisonMode: SchemaComparisonMode = SchemaComparisonMode.Monotonic,
): boolean {
	{
		if (
			!allowsFieldSuperset(
				policy,
				original,
				original.rootFieldSchema,
				superset.rootFieldSchema,
				comparisonMode,
			)
		) {
			return false;
		}
	}
	// Check if all schemas in original are included in superset, and permit a superset of the node content.
	// Note that any schema from `original.nodeSchema` can be used as the schema for a node at the root of a detached field,
	// so we must check all of them, even if they are not reachable from the root field schema.
	for (const [key, schema] of original.nodeSchema) {
		if (
			!allowsTreeSuperset(
				policy,
				original,
				schema,
				superset.nodeSchema.get(key),
				comparisonMode,
			)
		) {
			return false;
		}
	}
	// Any schema in superset not in original are already known to be superset of original since they are "never" due to being missing.
	// Therefore, we do not need to check them.
	return true;
}

/**
 * Returns whether `original` can be upgraded to `updated`.
 *
 * @remarks
 * Every upgrade must preserve existing version identifiers and must not decrease their values,
 * as checked by {@link ifSchemaVersionsDecrease}.
 * Within that constraint, changes allowed by {@link SchemaComparisonMode.Monotonic} do not require a version increase.
 *
 * For other content-preserving changes, the version maps must provide the ordering that prevents inverse upgrades.
 * Both maps must therefore be present, with at least one increased version or added library identifier,
 * before the change is checked using {@link SchemaComparisonMode.ContentOnly}.
 * Adding the first version map alone does not enable this less restrictive comparison.
 */
export function allowsSchemaUpgrade(
	policy: FullSchemaPolicy,
	original: TreeStoredSchema,
	updated: TreeStoredSchema,
): boolean {
	const versionsDecrease = ifSchemaVersionsDecrease(
		original.schemaVersion,
		updated.schemaVersion,
	);
	if (!versionsDecrease && allowsRepoSuperset(policy, original, updated)) {
		return true;
	}

	return (
		!versionsDecrease &&
		original.schemaVersion !== undefined &&
		updated.schemaVersion !== undefined &&
		!areSchemaVersionsEqual(original.schemaVersion, updated.schemaVersion) &&
		allowsRepoSuperset(policy, original, updated, SchemaComparisonMode.ContentOnly)
	);
}

/**
 * Returns whether both maps have the same library identifiers and version values.
 *
 * @remarks
 * An absent map differs from an empty map.
 */
export function areSchemaVersionsEqual(
	a: TreeStoredSchema["schemaVersion"],
	b: TreeStoredSchema["schemaVersion"],
): boolean {
	if (a === undefined || b === undefined) {
		return a === b;
	}
	const aEntries = Object.entries(a);
	return (
		aEntries.length === Object.keys(b).length &&
		aEntries.every(([libraryId, version]) => b[libraryId] === version)
	);
}

/**
 * Returns whether `updated` removes a library identifier or decreases a version in `original`.
 *
 * @remarks
 * Only existing versions constrain an update, so the result is `false` if `original` is `undefined`.
 * If `original` is present but `updated` is `undefined`, the result is `true` because the map was removed.
 * Within a present map, adding library identifiers does not count as a decrease.
 */
function ifSchemaVersionsDecrease(
	original: TreeStoredSchema["schemaVersion"],
	updated: TreeStoredSchema["schemaVersion"],
): boolean {
	if (original === undefined) {
		return false;
	}
	if (updated === undefined) {
		return true;
	}
	return Object.entries(original).some(([libraryId, version]) => {
		const updatedVersion = updated[libraryId];
		return (
			!Object.hasOwn(updated, libraryId) ||
			updatedVersion === undefined ||
			updatedVersion < version
		);
	});
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
