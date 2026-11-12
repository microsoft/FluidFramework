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
	StoredSchemaDiscrepancyLocation,
	StoredSchemaUpgradeDiscrepancy,
} from "./schemaDiscrepancy.js";

interface ComparisonDiagnostics extends StoredSchemaDiscrepancyLocation {
	readonly discrepancies: StoredSchemaUpgradeDiscrepancy[];
}

interface NodeComparisonDiagnostics extends ComparisonDiagnostics {
	readonly identifier: TreeNodeSchemaIdentifier;
}

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
	diagnostics?: NodeComparisonDiagnostics,
): boolean {
	if (isNeverTree(policy, originalData, original)) {
		return true;
	}
	if (isNeverTree(policy, originalData, superset)) {
		if (diagnostics !== undefined) {
			if (superset === undefined) {
				diagnostics.discrepancies.push({
					operation: "upgrade",
					mismatch: "missingNodeSchema",
					identifier: diagnostics.identifier,
				});
			} else {
				reportUnsatisfiedNodeConstraint(policy, originalData, superset, diagnostics);
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
					operation: "upgrade",
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
				true,
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
			true,
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

function reportUnsatisfiedNodeConstraint(
	policy: FullSchemaPolicy,
	originalData: TreeStoredSchema,
	proposed: TreeNodeStoredSchema,
	diagnostics: NodeComparisonDiagnostics,
): void {
	if (proposed instanceof MapNodeStoredSchema) {
		diagnostics.discrepancies.push({
			operation: "upgrade",
			mismatch: "nodeSchemaCannotBeSatisfied",
			identifier: diagnostics.identifier,
			constraint: { kind: "requiredMapEntries" },
		});
		return;
	}
	assert(
		proposed instanceof ObjectNodeStoredSchema,
		"Only object and map node constraints can prevent construction of a defined node.",
	);
	for (const [fieldKey, field] of proposed.objectNodeFields) {
		if (isNeverField(policy, originalData, field)) {
			diagnostics.discrepancies.push({
				operation: "upgrade",
				mismatch: "nodeSchemaCannotBeSatisfied",
				identifier: diagnostics.identifier,
				constraint: {
					kind: "requiredField",
					fieldKey,
					allowedTypes: field.types,
				},
			});
			return;
		}
	}
	fail("A node that cannot be constructed must have an unsatisfied constraint.");
}

function reportNodeKindMismatch(
	original: TreeNodeStoredSchema,
	proposed: TreeNodeStoredSchema,
	diagnostics: NodeComparisonDiagnostics | undefined,
): false {
	diagnostics?.discrepancies.push({
		operation: "upgrade",
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
 * @param monotonicOnly - If true, only allow changes of field kinds which are explicitly listed in {@link FieldKindOptions.allowMonotonicUpgradeFrom}.
 * This prevents this function from considering two different schemas as equivalent, preventing upgrades which would allow their inverse.
 * This prevents infinite upgrade loops where two clients could keep upgrading between two schemas.
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
	diagnostics?: ComparisonDiagnostics,
): boolean {
	if (!monotonicOnly && isNeverField(policy, originalData, original)) {
		return true;
	}

	const typesCompatible = allowsTreeSchemaIdentifierSuperset(original.types, superset.types);
	if (!typesCompatible) {
		if (diagnostics === undefined) {
			return false;
		}
		diagnostics.discrepancies.push({
			operation: "upgrade",
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

	const kindCompatible = monotonicOnly
		? supersetKind.options.allowMonotonicUpgradeFrom.has(original.kind)
		: allowsMultiplicitySuperset(
				(policy.fieldKinds.get(original.kind) ?? fail(0xcab /* missing kind */)).multiplicity,
				supersetKind.multiplicity,
			);
	if (!kindCompatible && diagnostics !== undefined) {
		diagnostics.discrepancies.push({
			operation: "upgrade",
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
 * @param discrepancies - When provided, collect all failed upgrade constraints instead of stopping at the first one.
 */
export function allowsRepoSuperset(
	policy: FullSchemaPolicy,
	original: TreeStoredSchema,
	superset: TreeStoredSchema,
	discrepancies?: StoredSchemaUpgradeDiscrepancy[],
): boolean {
	let compatible = allowsFieldSuperset(
		policy,
		original,
		original.rootFieldSchema,
		superset.rootFieldSchema,
		true,
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
