/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	TreeFieldStoredSchema,
	TreeNodeStoredSchema,
	TreeStoredSchema,
	TreeTypeSet,
	ValueSchema,
	storedEmptyFieldSchema,
	type FieldKey,
	type TreeNodeSchemaIdentifier,
} from "../../core/index.js";
import { compareSets, fail } from "../../util/index.js";
import { FullSchemaPolicy } from "./fieldKind.js";
import { withEditor } from "./fieldKindWithEditor.js";
import { isNeverTree } from "./isNeverTree.js";
import type {
	AllowedTypeIncompatibility,
	FieldIncompatibility,
	FieldKindIncompatibility,
	Incompatibility,
	NodeFieldsIncompatibility,
	NodeKindIncompatibility,
	SchemaFactoryFieldKind,
} from "./discrepancies.js";

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
	if (original instanceof LeafNodeStoredSchema) {
		if (superset instanceof LeafNodeStoredSchema) {
			return allowsValueSuperset(original.leafValue, superset.leafValue);
		}
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
				normalizeField(original.mapFields),
				normalizeField(superset.mapFields),
			);
		}
		return false;
	}

	assert(original instanceof ObjectNodeStoredSchema, 0x895 /* unsupported node kind */);
	if (superset instanceof MapNodeStoredSchema) {
		for (const [_key, field] of original.objectNodeFields) {
			if (
				!allowsFieldSuperset(
					policy,
					originalData,
					normalizeField(field),
					normalizeField(superset.mapFields),
				)
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
				original.objectNodeFields.get(originalField) ?? fail("missing expected field"),
				normalizeField(undefined),
			),
		bExtra: (supersetField) =>
			allowsFieldSuperset(
				policy,
				originalData,
				normalizeField(undefined),
				superset.objectNodeFields.get(supersetField) ?? fail("missing expected field"),
			),
		same: (sameField) =>
			allowsFieldSuperset(
				policy,
				originalData,
				original.objectNodeFields.get(sameField) ?? fail("missing expected field"),
				superset.objectNodeFields.get(sameField) ?? fail("missing expected field"),
			),
	});
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
		policy.fieldKinds.get(original.kind) ?? fail("missing kind"),
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
 * @returns the discrepancies between two TreeStoredSchema objects
 */
export function allowsDocumentConcepts(
	original: TreeStoredSchema,
	updated: TreeStoredSchema,
): Incompatibility[] {
	const incompatibilities: Incompatibility[] = [];
	const areSetsEqual = (a: TreeTypeSet, b: TreeTypeSet): boolean => {
		if (a === undefined && b === undefined) {
			return true;
		}
		if (a !== undefined && b !== undefined) {
			return a.size === b.size && [...a].every((value) => b.has(value));
		}
		return false;
	};
	const getFieldKind = (x: unknown): SchemaFactoryFieldKind | undefined => {
		switch (x) {
			case "Value": {
				return "required";
			}
			case "Optional": {
				return "optional";
			}
			case "Sequence": {
				return "array";
			}
			default: {
				return undefined;
			}
		}
	};

	/**
	 * The helper function tracks discrepancies between two TreeFieldStoredSchema objects.
	 */
	const trackFieldDiscrepancies = (
		originalField: TreeFieldStoredSchema,
		updatedField: TreeFieldStoredSchema,
		key: string,
	): FieldIncompatibility[] => {
		const differences: FieldIncompatibility[] = [];
		if (!areSetsEqual(originalField.types, updatedField.types)) {
			differences.push({
				identifier: key,
				mismatch: "allowedTypes",
				view: updatedField.types ? [...updatedField.types.values()] : [],
				stored: originalField.types ? [...originalField.types.values()] : [],
			} satisfies AllowedTypeIncompatibility);
		}
		if (originalField.kind !== updatedField.kind) {
			differences.push({
				identifier: key,
				mismatch: "fieldKind",
				view: getFieldKind(updatedField.kind),
				stored: getFieldKind(originalField.kind),
			});
		}
		return differences;
	};

	// Check root schema discrepancies
	incompatibilities.push(
		...trackFieldDiscrepancies(original.rootFieldSchema, updated.rootFieldSchema, "root"),
	);

	// Check discrepancies in node schemas
	const nodeKeySet = new Set<TreeNodeSchemaIdentifier>();
	for (const [key, schema] of original.nodeSchema) {
		nodeKeySet.add(key);
		if (schema instanceof ObjectNodeStoredSchema) {
			if (!updated.nodeSchema.has(key)) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: undefined,
					stored: "object",
				});
			}
			const updatedSchema = updated.nodeSchema.get(key);
			if (updatedSchema instanceof MapNodeStoredSchema) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "map",
					stored: "object",
				} satisfies NodeKindIncompatibility);
			} else if (updatedSchema instanceof ObjectNodeStoredSchema) {
				const differences: FieldIncompatibility[] = [];
				const fieldKeySet = new Set<FieldKey>();
				/**
				 * We will track three types of differences:
				 * 1. Fields that exist in the original schema but not in the updated schema.
				 * 2. Fields that exist in both schemas but have different contents.
				 * 3. Fields that exist in the updated schema but not in the original schema.
				 *
				 * First, the original schema is iterated to track the first two types of differences.
				 * Then, the updated schema is iterated to find the third type.
				 */
				for (const [fieldKey, fieldStoredSchema] of schema.objectNodeFields) {
					fieldKeySet.add(fieldKey);
					if (!updatedSchema.objectNodeFields.has(fieldKey)) {
						differences.push({
							identifier: fieldKey,
							mismatch: "fieldKind",
							view: undefined,
							stored: getFieldKind(fieldStoredSchema.kind),
						} satisfies FieldKindIncompatibility);
					} else {
						const originalFieldStoredSchema = schema.objectNodeFields.get(
							fieldKey,
						) as TreeFieldStoredSchema;
						const updatedFieldStoredSchema = updatedSchema.objectNodeFields.get(
							fieldKey,
						) as TreeFieldStoredSchema;
						differences.push(
							...trackFieldDiscrepancies(
								originalFieldStoredSchema,
								updatedFieldStoredSchema,
								fieldKey,
							),
						);
					}
				}
				for (const [fieldKey, fieldStoredSchema] of updatedSchema.objectNodeFields) {
					if (fieldKeySet.has(fieldKey)) {
						continue;
					}
					differences.push({
						identifier: fieldKey,
						mismatch: "fieldKind",
						view: getFieldKind(fieldStoredSchema.kind),
						stored: undefined,
					} satisfies FieldKindIncompatibility);
				}
				if (differences.length > 0) {
					incompatibilities.push({
						identifier: key,
						mismatch: "fields",
						differences,
					} satisfies NodeFieldsIncompatibility);
				}
			}
		} else if (schema instanceof MapNodeStoredSchema) {
			if (!updated.nodeSchema.has(key)) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: undefined,
					stored: "map",
				});
			}
			const updatedSchema = updated.nodeSchema.get(key);
			if (updatedSchema instanceof ObjectNodeStoredSchema) {
				incompatibilities.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "object",
					stored: "map",
				} satisfies NodeKindIncompatibility);
			} else if (updatedSchema instanceof MapNodeStoredSchema) {
				incompatibilities.push(
					...trackFieldDiscrepancies(schema.mapFields, updatedSchema.mapFields, key),
				);
			}
		}
	}
	/**
	 * Similar to the logic above, after iterating through the original node schemas, we iterate through the
	 * updated node schemas to find those that exist in the updated version but not in the original one.
	 */
	for (const [key, schema] of updated.nodeSchema) {
		if (!nodeKeySet.has(key)) {
			incompatibilities.push({
				identifier: key,
				mismatch: "nodeKind",
				view: schema instanceof MapNodeStoredSchema ? "map" : "object",
				stored: undefined,
			} satisfies NodeKindIncompatibility);
		}
	}

	return incompatibilities;
}

export function normalizeField(schema: TreeFieldStoredSchema | undefined): TreeFieldStoredSchema {
	return schema ?? storedEmptyFieldSchema;
}
