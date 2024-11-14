/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	type FieldKey,
	type FieldKindIdentifier,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	storedEmptyFieldSchema,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
	type TreeTypeSet,
	type ValueSchema,
} from "../../core/index.js";
import { brand } from "../../util/index.js";

// TODO:
// The comparisons in this file seem redundant with those in comparison.ts.
// Rather than both existing, one of which just returns boolean and the other which returns additional details, a simple comparison which returns everything needed should be used.

/**
 * @remarks
 *
 * 1. FieldDiscrepancy
 *
 * `FieldDiscrepancy` represents the differences between two `TreeFieldStoredSchema` objects. It consists of
 * three types of incompatibilities:
 *
 * - FieldKindDiscrepancy: Indicates the differences in `FieldKindIdentifier` between two `TreeFieldStoredSchema`
 * objects (e.g., optional, required, sequence, etc.).
 * - AllowedTypesDiscrepancy: Indicates the differences in the allowed child types between the two schemas.
 * - ValueSchemaDiscrepancy: Specifically indicates the differences in the `ValueSchema` of two
 * `LeafNodeStoredSchema` objects.
 *
 * 2. NodeDiscrepancy
 *
 * `NodeDiscrepancy` represents the differences between two `TreeNodeStoredSchema` objects and includes:
 *
 * - NodeKindDiscrepancy: Indicates the differences in the types of `TreeNodeStoredSchema` (currently supports
 * `ObjectNodeStoredSchema`, `MapNodeStoredSchema`, and `LeafNodeStoredSchema`).
 * - NodeFieldsDiscrepancy: Indicates the `FieldDiscrepancy` of `TreeFieldStoredSchema` within two
 * `TreeNodeStoredSchema`. It includes an array of `FieldDiscrepancy` instances in the `differences` field.
 *
 * When comparing two nodes for compatibility, it only makes sense to compare their fields if the nodes are of
 * the same kind (map, object, leaf).
 *
 * 3. Discrepancy
 *
 * Discrepancy consists of both `NodeDiscrepancy` and `FieldDiscrepancy`, representing any kind of
 * schema differences. See {@link getAllowedContentDiscrepancies} for more details about how we process it
 * and the ordering.
 */
export type Discrepancy = FieldDiscrepancy | NodeDiscrepancy;

export type NodeDiscrepancy = NodeKindDiscrepancy | NodeFieldsDiscrepancy;

export type FieldDiscrepancy =
	| AllowedTypeDiscrepancy
	| FieldKindDiscrepancy
	| ValueSchemaDiscrepancy;

export interface AllowedTypeDiscrepancy {
	identifier: string | undefined; // undefined indicates root field schema
	mismatch: "allowedTypes";
	/**
	 * List of allowed type identifiers in viewed schema
	 */
	view: string[];
	/**
	 * List of allowed type identifiers in stored schema
	 */
	stored: string[];
}

export interface FieldKindDiscrepancy {
	identifier: string | undefined; // undefined indicates root field schema
	mismatch: "fieldKind";
	view: FieldKindIdentifier;
	stored: FieldKindIdentifier;
}

export interface ValueSchemaDiscrepancy {
	identifier: string;
	mismatch: "valueSchema";
	view: ValueSchema | undefined;
	stored: ValueSchema | undefined;
}

export interface NodeKindDiscrepancy {
	identifier: string;
	mismatch: "nodeKind";
	view: SchemaFactoryNodeKind | undefined;
	stored: SchemaFactoryNodeKind | undefined;
}

export interface NodeFieldsDiscrepancy {
	identifier: string;
	mismatch: "fields";
	differences: FieldDiscrepancy[];
}

type SchemaFactoryNodeKind = "object" | "leaf" | "map";

/**
 * Finds and reports discrepancies between a view schema and a stored schema.
 *
 * The workflow for finding schema incompatibilities:
 * 1. Compare the two root schemas to identify any `FieldDiscrepancy`.
 *
 * 2. For each node schema in the `view`:
 * - Verify if the node schema exists in the stored. If it does, ensure that the `SchemaFactoryNodeKind` are
 * consistent. Otherwise this difference is treated as `NodeKindDiscrepancy`
 * - If a node schema with the same identifier exists in both view and stored, and their `SchemaFactoryNodeKind`
 * are consistent, perform a exhaustive validation to identify all `FieldDiscrepancy`.
 *
 * 3. For each node schema in the stored, verify if it exists in the view. The overlapping parts were already
 * addressed in the previous step.
 *
 * @returns the discrepancies between two TreeStoredSchema objects
 */
export function getAllowedContentDiscrepancies(
	view: TreeStoredSchema,
	stored: TreeStoredSchema,
): Discrepancy[] {
	const discrepancies: Discrepancy[] = [];

	// check root schema discrepancies
	discrepancies.push(...trackFieldDiscrepancies(view.rootFieldSchema, stored.rootFieldSchema));

	// Verify the existence and type of a node schema given its identifier (key), then determine if
	// an exhaustive search is necessary.
	const viewNodeKeys = new Set<TreeNodeSchemaIdentifier>();
	for (const [key, viewNodeSchema] of view.nodeSchema) {
		viewNodeKeys.add(key);

		if (viewNodeSchema instanceof ObjectNodeStoredSchema) {
			if (!stored.nodeSchema.has(key)) {
				discrepancies.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "object",
					stored: undefined,
				});
			} else {
				const storedNodeSchema = stored.nodeSchema.get(key);
				assert(
					storedNodeSchema !== undefined,
					0x9be /* The storedNodeSchema in stored.nodeSchema should not be undefined */,
				);
				if (storedNodeSchema instanceof MapNodeStoredSchema) {
					discrepancies.push({
						identifier: key,
						mismatch: "nodeKind",
						view: "object",
						stored: "map",
					} satisfies NodeKindDiscrepancy);
				} else if (storedNodeSchema instanceof LeafNodeStoredSchema) {
					discrepancies.push({
						identifier: key,
						mismatch: "nodeKind",
						view: "object",
						stored: "leaf",
					} satisfies NodeKindDiscrepancy);
				} else if (storedNodeSchema instanceof ObjectNodeStoredSchema) {
					const differences = trackObjectNodeDiscrepancies(viewNodeSchema, storedNodeSchema);
					if (differences.length > 0) {
						discrepancies.push({
							identifier: key,
							mismatch: "fields",
							differences,
						} satisfies NodeFieldsDiscrepancy);
					}
				} else {
					throwUnsupportedNodeType(storedNodeSchema.constructor.name);
				}
			}
		} else if (viewNodeSchema instanceof MapNodeStoredSchema) {
			if (!stored.nodeSchema.has(key)) {
				discrepancies.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "map",
					stored: undefined,
				} satisfies NodeKindDiscrepancy);
			} else {
				const storedNodeSchema = stored.nodeSchema.get(key);
				assert(
					storedNodeSchema !== undefined,
					0x9bf /* The storedNodeSchema in stored.nodeSchema should not be undefined */,
				);
				if (storedNodeSchema instanceof ObjectNodeStoredSchema) {
					discrepancies.push({
						identifier: key,
						mismatch: "nodeKind",
						view: "map",
						stored: "object",
					} satisfies NodeKindDiscrepancy);
				} else if (storedNodeSchema instanceof LeafNodeStoredSchema) {
					discrepancies.push({
						identifier: key,
						mismatch: "nodeKind",
						view: "map",
						stored: "leaf",
					} satisfies NodeKindDiscrepancy);
				} else if (storedNodeSchema instanceof MapNodeStoredSchema) {
					discrepancies.push(
						...trackFieldDiscrepancies(
							viewNodeSchema.mapFields,
							storedNodeSchema.mapFields,
							key,
						),
					);
				} else {
					throwUnsupportedNodeType(storedNodeSchema.constructor.name);
				}
			}
		} else if (viewNodeSchema instanceof LeafNodeStoredSchema) {
			if (!stored.nodeSchema.has(key)) {
				discrepancies.push({
					identifier: key,
					mismatch: "nodeKind",
					view: "leaf",
					stored: undefined,
				});
			} else {
				const storedNodeSchema = stored.nodeSchema.get(key);
				assert(
					storedNodeSchema !== undefined,
					0x9c0 /* The storedNodeSchema in stored.nodeSchema should not be undefined */,
				);
				if (storedNodeSchema instanceof MapNodeStoredSchema) {
					discrepancies.push({
						identifier: key,
						mismatch: "nodeKind",
						view: "leaf",
						stored: "map",
					} satisfies NodeKindDiscrepancy);
				} else if (storedNodeSchema instanceof ObjectNodeStoredSchema) {
					discrepancies.push({
						identifier: key,
						mismatch: "nodeKind",
						view: "leaf",
						stored: "object",
					} satisfies NodeKindDiscrepancy);
				} else if (storedNodeSchema instanceof LeafNodeStoredSchema) {
					if (viewNodeSchema.leafValue !== storedNodeSchema.leafValue) {
						discrepancies.push({
							identifier: key,
							mismatch: "valueSchema",
							view: viewNodeSchema.leafValue,
							stored: storedNodeSchema.leafValue,
						} satisfies ValueSchemaDiscrepancy);
					}
				} else {
					throwUnsupportedNodeType(storedNodeSchema.constructor.name);
				}
			}
		} else {
			throwUnsupportedNodeType(viewNodeSchema.constructor.name);
		}
	}

	for (const [key, storedNodeSchema] of stored.nodeSchema) {
		if (!viewNodeKeys.has(key)) {
			discrepancies.push({
				identifier: key,
				mismatch: "nodeKind",
				view: undefined,
				stored:
					storedNodeSchema instanceof MapNodeStoredSchema
						? "map"
						: storedNodeSchema instanceof ObjectNodeStoredSchema
							? "object"
							: "leaf",
			} satisfies NodeKindDiscrepancy);
		}
	}

	return discrepancies;
}

/**
 * The function to track the discrepancies between two field stored schemas.
 *
 * @param keyOrRoot - If the key is missing, it indicates that this is the root field schema.
 */
function trackFieldDiscrepancies(
	view: TreeFieldStoredSchema,
	stored: TreeFieldStoredSchema,
	keyOrRoot?: string,
): FieldDiscrepancy[] {
	const differences: FieldDiscrepancy[] = [];

	// Only track the symmetric differences of two sets.
	const findSetDiscrepancies = (
		a: TreeTypeSet,
		b: TreeTypeSet,
	): [TreeNodeSchemaIdentifier[], TreeNodeSchemaIdentifier[]] => {
		const aDiff = [...a].filter((value) => !b.has(value));
		const bDiff = [...b].filter((value) => !a.has(value));
		return [aDiff, bDiff];
	};

	const allowedTypesDiscrepancies = findSetDiscrepancies(view.types, stored.types);
	if (allowedTypesDiscrepancies[0].length > 0 || allowedTypesDiscrepancies[1].length > 0) {
		differences.push({
			identifier: keyOrRoot,
			mismatch: "allowedTypes",
			view: allowedTypesDiscrepancies[0],
			stored: allowedTypesDiscrepancies[1],
		} satisfies AllowedTypeDiscrepancy);
	}

	if (view.kind !== stored.kind) {
		differences.push({
			identifier: keyOrRoot,
			mismatch: "fieldKind",
			view: view.kind,
			stored: stored.kind,
		} satisfies FieldKindDiscrepancy);
	}

	return differences;
}

function trackObjectNodeDiscrepancies(
	view: ObjectNodeStoredSchema,
	stored: ObjectNodeStoredSchema,
): FieldDiscrepancy[] {
	const differences: FieldDiscrepancy[] = [];
	const viewFieldKeys = new Set<FieldKey>();
	/**
	 * Similar to the logic used for tracking discrepancies between two node schemas, we will identify
	 * three types of differences:
	 * 1. Fields that exist in the view schema but not in the stored schema.
	 * 2. Fields that exist in both schemas but have different contents.
	 * 3. Fields that exist in the stored schema but not in the view schema.
	 *
	 * First, the view schema is iterated to track the first two types of differences.
	 * Then, the stored schema is iterated to find the third type.
	 */

	for (const [fieldKey, fieldStoredSchema] of view.objectNodeFields) {
		viewFieldKeys.add(fieldKey);
		if (
			!stored.objectNodeFields.has(fieldKey) &&
			fieldStoredSchema.kind !== storedEmptyFieldSchema.kind
		) {
			differences.push({
				identifier: fieldKey,
				mismatch: "fieldKind",
				view: fieldStoredSchema.kind,
				stored: storedEmptyFieldSchema.kind,
			} satisfies FieldKindDiscrepancy);
		} else {
			differences.push(
				...trackFieldDiscrepancies(
					view.objectNodeFields.get(fieldKey) as TreeFieldStoredSchema,
					stored.objectNodeFields.get(fieldKey) as TreeFieldStoredSchema,
					fieldKey,
				),
			);
		}
	}

	for (const [fieldKey, fieldStoredSchema] of stored.objectNodeFields) {
		if (viewFieldKeys.has(fieldKey)) {
			continue;
		}

		if (fieldStoredSchema.kind !== storedEmptyFieldSchema.kind) {
			differences.push({
				identifier: fieldKey,
				mismatch: "fieldKind",
				view: storedEmptyFieldSchema.kind,
				stored: fieldStoredSchema.kind,
			} satisfies FieldKindDiscrepancy);
		}
	}

	return differences;
}

/**
 * @remarks
 *
 * This function uses incompatibilities to determine if changes to a document schema are backward-compatible, i.e., it determines
 * whether the `view` schema allows a superset of the documents that the `stored` schema allows.
 * According to the policy of schema evolution, `isRepoSuperset` supports three types of changes:
 * 1. Adding an optional field to an object node.
 * 2. Expanding the set of allowed types for a field.
 * 3. Relaxing a field kind to a more general field kind.
 *
 * Notes: We expect isRepoSuperset to return consistent results with allowsRepoSuperset. However, currently there are some scenarios
 * where the inconsistency will occur:
 *
 * - Different Node Kinds: If a and b have different node kinds (e.g., a is an objectNodeSchema and b is a mapNodeSchema),
 * `isRepoSuperset` will determine that a can never be the superset of b. In contrast, `allowsRepoSuperset` will continue
 * validating internal fields.
 */
export function isRepoSuperset(view: TreeStoredSchema, stored: TreeStoredSchema): boolean {
	const discrepancies = getAllowedContentDiscrepancies(view, stored);

	for (const discrepancy of discrepancies) {
		switch (discrepancy.mismatch) {
			case "nodeKind": {
				if (discrepancy.stored !== undefined) {
					// It's fine for the view schema to know of a node type that the stored schema doesn't know about.
					return false;
				}
				break;
			}
			case "valueSchema":
			case "allowedTypes":
			case "fieldKind": {
				if (!validateFieldIncompatibility(discrepancy)) {
					return false;
				}
				break;
			}
			case "fields": {
				if (
					discrepancy.differences.some(
						(difference) => !validateFieldIncompatibility(difference),
					)
				) {
					return false;
				}
				break;
			}
			// No default
		}
	}
	return true;
}

function validateFieldIncompatibility(discrepancy: FieldDiscrepancy): boolean {
	switch (discrepancy.mismatch) {
		case "allowedTypes": {
			// Since we only track the symmetric difference between the allowed types in the view and
			// stored schemas, it's sufficient to check if any extra allowed types still exist in the
			// stored schema.
			return discrepancy.stored.length === 0;
		}
		case "fieldKind": {
			return posetLte(discrepancy.stored, discrepancy.view, fieldRealizer);
		}
		case "valueSchema": {
			return false;
		}
		// No default
	}
	return false;
}

/**
 * A linear extension of a partially-ordered set of `T`s. See:
 * https://en.wikipedia.org/wiki/Linear_extension
 *
 * The linear extension is represented as a lookup from each poset element to its index in the linear extension.
 */
type LinearExtension<T> = Map<T, number>;

/**
 * A realizer for a partially-ordered set. See:
 * https://en.wikipedia.org/wiki/Order_dimension
 */
type Realizer<T> = LinearExtension<T>[];

/**
 * @privateRemarks
 * TODO: Knowledge of specific field kinds is not appropriate for modular schema.
 * This bit of field comparison should be dependency injected by default-schema if this comparison logic remains in modular-schema
 * (this is analogous to what is done in comparison.ts).
 */
const FieldKindIdentifiers = {
	forbidden: brand<FieldKindIdentifier>("Forbidden"),
	required: brand<FieldKindIdentifier>("Value"),
	identifier: brand<FieldKindIdentifier>("Identifier"),
	optional: brand<FieldKindIdentifier>("Optional"),
	sequence: brand<FieldKindIdentifier>("Sequence"),
};

/**
 * A realizer for the partial order of field kind relaxability.
 *
 * It seems extremely likely that this partial order will remain dimension 2 over time (i.e. the set of allowed relaxations can be visualized
 * with a [dominance drawing](https://en.wikipedia.org/wiki/Dominance_drawing)), so this strategy allows efficient comarison between field kinds
 * without excessive casework.
 *
 * Hasse diagram for the partial order is shown below (lower fields can be relaxed to higher fields):
 * ```
 * sequence
 *    |
 * optional
 *    |    \
 * required forbidden
 *    |
 * identifier
 * ```
 */
const fieldRealizer: Realizer<FieldKindIdentifier> = [
	[
		FieldKindIdentifiers.forbidden,
		FieldKindIdentifiers.identifier,
		FieldKindIdentifiers.required,
		FieldKindIdentifiers.optional,
		FieldKindIdentifiers.sequence,
	],
	[
		FieldKindIdentifiers.identifier,
		FieldKindIdentifiers.required,
		FieldKindIdentifiers.forbidden,
		FieldKindIdentifiers.optional,
		FieldKindIdentifiers.sequence,
	],
].map((extension) => new Map(extension.map((identifier, index) => [identifier, index])));

const PosetComparisonResult = {
	Less: "<",
	Greater: ">",
	Equal: "=",
	Incomparable: "||",
} as const;
type PosetComparisonResult =
	(typeof PosetComparisonResult)[keyof typeof PosetComparisonResult];

function comparePosetElements<T>(a: T, b: T, realizer: Realizer<T>): PosetComparisonResult {
	let hasLessThanResult = false;
	let hasGreaterThanResult = false;
	for (const extension of realizer) {
		const aIndex = extension.get(a);
		const bIndex = extension.get(b);
		assert(aIndex !== undefined && bIndex !== undefined, "Invalid realizer");
		if (aIndex < bIndex) {
			hasLessThanResult = true;
		} else if (aIndex > bIndex) {
			hasGreaterThanResult = true;
		}
	}

	return hasLessThanResult
		? hasGreaterThanResult
			? PosetComparisonResult.Incomparable
			: PosetComparisonResult.Less
		: hasGreaterThanResult
			? PosetComparisonResult.Greater
			: PosetComparisonResult.Equal;
}

function posetLte<T>(a: T, b: T, realizer: Realizer<T>): boolean {
	const comparison = comparePosetElements(a, b, realizer);
	return (
		comparison === PosetComparisonResult.Less || comparison === PosetComparisonResult.Equal
	);
}

function throwUnsupportedNodeType(type: string): never {
	throw new TypeError(`Unsupported node stored schema type: ${type}`);
}
