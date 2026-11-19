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
	type FieldKey,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeTypeSet,
	type ValueSchema,
	storedEmptyFieldSchema,
} from "../../core/index.js";
import { compareSets } from "../../util/index.js";

import type { FullSchemaPolicy } from "./fieldKind.js";
import { isNeverField, isNeverTree } from "./isNeverTree.js";
import type {
	SchemaDiscrepancyLocation,
	StoredSchemaUpgradeDiscrepancy,
} from "./schemaDiscrepancy.js";

interface ComparisonDiagnostics extends SchemaDiscrepancyLocation {
	readonly discrepancies: StoredSchemaUpgradeDiscrepancy[];
}

interface NodeComparisonDiagnostics extends ComparisonDiagnostics {
	readonly identifier: TreeNodeSchemaIdentifier;
}

/**
 * Selects the rules used to compare allowed schema content.
 *
 * @remarks
 * These modes separate content compatibility from the ordering needed to prevent upgrade cycles.
 * Neither mode compares schema versions itself.
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
	 * To prevent those cycles, upgrade validation must use this mode only when both version maps are present,
	 * no versions decrease or disappear, and at least one version increases or a library identifier is added.
	 * These conditions can be checked with {@link compareSchemaVersions}.
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
 * @param diagnostics - If you supply this argument, the function adds failed upgrade requirements to `diagnostics.discrepancies`.
 * It keeps existing entries and compares the other fields to find more failures.
 * If you omit this argument, the function does not collect failure details and can stop at the first failure.
 */
export function allowsTreeSuperset(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	original: TreeNodeStoredSchema | undefined,
	superset: TreeNodeStoredSchema | undefined,
	comparisonMode: SchemaComparisonMode = SchemaComparisonMode.Monotonic,
	diagnostics?: NodeComparisonDiagnostics,
): boolean {
	if (isNeverTree(policy, originalData, original)) {
		return true;
	}
	if (isNeverTree(policy, originalData, superset)) {
		if (diagnostics !== undefined) {
			if (superset === undefined) {
				diagnostics.discrepancies.push({
					mismatch: "missingNodeSchema",
					identifier: diagnostics.identifier,
				});
			} else {
				reportUnsatisfiedNodeSchemaRequirement(policy, originalData, superset, diagnostics);
			}
		}
		return false;
	}
	assert(original !== undefined, 0x716 /* only never trees have undefined schema */);
	assert(superset !== undefined, 0x717 /* only never trees have undefined schema */);
	if (original instanceof LeafNodeStoredSchema) {
		if (superset instanceof LeafNodeStoredSchema) {
			const leafCompatible = allowsValueSuperset(original.leafValue, superset.leafValue);
			if (!leafCompatible && diagnostics !== undefined) {
				diagnostics.discrepancies.push({
					mismatch: "valueSchema",
					identifier: diagnostics.identifier,
					stored: original.leafValue,
					proposed: superset.leafValue,
				});
			}
			return leafCompatible;
		}
		return reportNodeKindMismatch(original, superset, diagnostics);
	}

	if (superset instanceof LeafNodeStoredSchema) {
		return reportNodeKindMismatch(original, superset, diagnostics);
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
				diagnostics,
			);
		}
		return reportNodeKindMismatch(original, superset, diagnostics);
	}

	assert(original instanceof ObjectNodeStoredSchema, 0x895 /* unsupported node kind */);
	let compatible = true;
	const compareField = (fieldKey: FieldKey): boolean => {
		const fieldCompatible = allowsFieldSuperset(
			policy,
			originalData,
			original.objectNodeFields.get(fieldKey) ?? storedEmptyFieldSchema,
			superset instanceof MapNodeStoredSchema
				? superset.mapFields
				: (superset.objectNodeFields.get(fieldKey) ?? storedEmptyFieldSchema),
			comparisonMode,
			diagnostics === undefined ? undefined : { ...diagnostics, fieldKey },
		);
		compatible = fieldCompatible && compatible;
		// Keep visiting fields after a failure only when collecting diagnostics.
		return fieldCompatible || diagnostics !== undefined;
	};
	if (superset instanceof MapNodeStoredSchema) {
		for (const key of original.objectNodeFields.keys()) {
			if (!compareField(key)) {
				return false;
			}
		}
		return compatible;
	}
	assert(superset instanceof ObjectNodeStoredSchema, 0x896 /* unsupported node kind */);

	const fieldsCompared = compareSets({
		a: original.objectNodeFields,
		b: superset.objectNodeFields,
		aExtra: compareField,
		bExtra: compareField,
		same: compareField,
	});
	return compatible && fieldsCompared;
}

/**
 * Records a field or map requirement that prevents construction of the proposed node.
 *
 * @remarks
 * Before you call this helper, check that no finite tree can match `proposed`.
 * Use the existing stored definitions in `originalData` to check its child types.
 * The helper then records a map requirement or required object field that explains this failure.
 */
function reportUnsatisfiedNodeSchemaRequirement(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	proposed: TreeNodeStoredSchema,
	diagnostics: NodeComparisonDiagnostics,
): void {
	if (proposed instanceof MapNodeStoredSchema) {
		diagnostics.discrepancies.push({
			mismatch: "nodeSchemaCannotBeSatisfied",
			identifier: diagnostics.identifier,
			requirement: { kind: "requiredMapEntries" },
		});
		return;
	}
	assert(
		proposed instanceof ObjectNodeStoredSchema,
		"Only object and map node requirements can prevent construction of a defined node.",
	);
	for (const [fieldKey, field] of proposed.objectNodeFields) {
		if (isNeverField(policy, originalData, field)) {
			diagnostics.discrepancies.push({
				mismatch: "nodeSchemaCannotBeSatisfied",
				identifier: diagnostics.identifier,
				requirement: {
					kind: "requiredField",
					fieldKey,
					allowedTypes: field.types,
				},
			});
			return;
		}
	}
	fail("A node that cannot be constructed must have an unsatisfied schema requirement.");
}

function reportNodeKindMismatch(
	original: TreeNodeStoredSchema,
	proposed: TreeNodeStoredSchema,
	diagnostics: NodeComparisonDiagnostics | undefined,
): false {
	diagnostics?.discrepancies.push({
		mismatch: "nodeKind",
		identifier: diagnostics.identifier,
		stored: original,
		proposed,
	});
	return false;
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
 * @param diagnostics - If you supply this argument, the function adds failed upgrade requirements to `diagnostics.discrepancies`.
 * It keeps existing entries and checks both allowed types and field kinds so it can report a failure in each.
 * If you omit this argument, the function does not collect failure details and can stop at the first failure.
 *
 * @remarks
 * Schema versions are not checked here.
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
	diagnostics?: ComparisonDiagnostics,
): boolean {
	if (
		comparisonMode === SchemaComparisonMode.ContentOnly &&
		isNeverField(policy, originalData, original)
	) {
		return true;
	}

	const typesCompatible = allowsTreeSchemaIdentifierSuperset(original.types, superset.types);
	if (!typesCompatible) {
		if (diagnostics === undefined) {
			return false;
		}
		diagnostics.discrepancies.push({
			mismatch: "allowedTypes",
			identifier: diagnostics.identifier,
			fieldKey: diagnostics.fieldKey,
			stored: original.types,
			proposed: superset.types,
		});
	}

	if (original.kind === superset.kind) {
		return typesCompatible;
	}

	const supersetKind = policy.fieldKinds.get(superset.kind) ?? fail(0xb1b /* missing kind */);

	const kindCompatible =
		comparisonMode === SchemaComparisonMode.Monotonic
			? supersetKind.options.allowMonotonicUpgradeFrom.has(original.kind)
			: allowsMultiplicitySuperset(
					(policy.fieldKinds.get(original.kind) ?? fail(0xcab /* missing kind */))
						.multiplicity,
					supersetKind.multiplicity,
				);
	if (!kindCompatible && diagnostics !== undefined) {
		diagnostics.discrepancies.push({
			mismatch: "fieldKind",
			identifier: diagnostics.identifier,
			fieldKey: diagnostics.fieldKey,
			stored: original.kind,
			proposed: superset.kind,
		});
	}
	return typesCompatible && kindCompatible;
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
 * @param discrepancies - When provided, collect failed upgrade requirements instead of stopping at the first one.
 */
export function allowsRepoSuperset(
	policy: FullSchemaPolicy,
	original: TreeStoredSchema,
	superset: TreeStoredSchema,
	comparisonMode: SchemaComparisonMode = SchemaComparisonMode.Monotonic,
	discrepancies?: StoredSchemaUpgradeDiscrepancy[],
): boolean {
	if (original === superset) {
		return true;
	}

	let compatible = allowsFieldSuperset(
		policy,
		original,
		original.rootFieldSchema,
		superset.rootFieldSchema,
		comparisonMode,
		discrepancies === undefined
			? undefined
			: { discrepancies, identifier: undefined, fieldKey: undefined },
	);
	if (!compatible && discrepancies === undefined) {
		return false;
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
				discrepancies === undefined
					? undefined
					: { discrepancies, identifier: key, fieldKey: undefined },
			)
		) {
			if (discrepancies === undefined) {
				return false;
			}
			compatible = false;
		}
	}
	// Any schema in superset not in original are already known to be superset of original since they are "never" due to being missing.
	// Therefore, we do not need to check them.
	return compatible;
}

/**
 * Describes the direction of a schema version change from the original map to the updated map.
 */
export enum SchemaVersionComparison {
	/**
	 * Both maps have identical identifiers and values, or both are absent.
	 */
	Equal,
	/**
	 * At least one version increases or an identifier is added, with no decreases or removals.
	 * Adding the first map, including an empty one, also counts as an increase.
	 */
	Increase,
	/**
	 * At least one version decreases or an identifier is removed, with no increases or additions.
	 * Removing the entire map, including an empty one, also counts as a decrease.
	 */
	Decrease,
	/**
	 * Some versions increase or identifiers are added, while others decrease or are removed.
	 * Neither map can be upgraded to the other without decreasing or removing a version.
	 */
	Incompatible,
}

/**
 * Compares schema versions in upgrade order, from `original` to `updated`.
 *
 * @remarks
 * An absent map differs from an empty map.
 * The comparison considers version ordering only.
 * Upgrade validation must also check allowed content and prevent the first version map from enabling non-monotonic upgrades.
 */
export function compareSchemaVersions(
	original: TreeStoredSchema["schemaVersion"],
	updated: TreeStoredSchema["schemaVersion"],
): SchemaVersionComparison {
	if (original === undefined) {
		return updated === undefined
			? SchemaVersionComparison.Equal
			: SchemaVersionComparison.Increase;
	}
	if (updated === undefined) {
		return SchemaVersionComparison.Decrease;
	}
	let increases = false;
	let decreases = false;
	for (const [libraryId, version] of original) {
		const updatedVersion = updated.get(libraryId);
		if (updatedVersion === undefined || updatedVersion < version) {
			decreases = true;
		} else if (updatedVersion > version) {
			increases = true;
		}
	}
	for (const libraryId of updated.keys()) {
		if (!original.has(libraryId)) {
			increases = true;
			break;
		}
	}
	if (increases) {
		return decreases ? SchemaVersionComparison.Incompatible : SchemaVersionComparison.Increase;
	}
	return decreases ? SchemaVersionComparison.Decrease : SchemaVersionComparison.Equal;
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
