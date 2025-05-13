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
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeTypeSet,
	type ValueSchema,
} from "../../core/index.js";
import { brand } from "../../util/index.js";

// TODO:
// The comparisons in this file seem redundant with those in comparison.ts.
// Rather than both existing, one of which just returns boolean and the other which returns additional details, a simple comparison which returns everything needed should be used.

/**
 * Discriminated union (keyed on `mismatch`) of discrepancies between a view and stored schema.
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

/**
 * A discrepancy in the declaration of a field.
 */
export type FieldDiscrepancy =
	| AllowedTypeDiscrepancy
	| FieldKindDiscrepancy
	| ValueSchemaDiscrepancy;

/**
 * Information about where a field discrepancy is located within a collection of schema.
 */
export interface FieldDiscrepancyLocation {
	/**
	 * The {@link TreeNodeSchemaIdentifier} that contains the discrepancy.
	 *
	 * Undefined iff the discrepancy is part of the root field schema.
	 */
	identifier: TreeNodeSchemaIdentifier | undefined;
	/**
	 * The {@link FieldKey} for the field that contains the discrepancy.
	 * Undefined when:
	 * - the discrepancy is part of the root field schema
	 * - the discrepancy is for 'all fields' of a map node
	 */
	fieldKey: FieldKey | undefined;
}

/**
 * A discrepancy in the allowed types of a field.
 *
 * @remarks
 * This reports the symmetric difference of allowed types in view/stored to enable more efficient checks for compatibility
 */
export interface AllowedTypeDiscrepancy extends FieldDiscrepancyLocation {
	mismatch: "allowedTypes";
	/**
	 * List of allowed type identifiers in viewed schema which are not allowed in stored schema
	 */
	view: TreeNodeSchemaIdentifier[];
	/**
	 * List of allowed type identifiers in stored schema which are not allowed in view schema
	 */
	stored: TreeNodeSchemaIdentifier[];
}

export interface FieldKindDiscrepancy extends FieldDiscrepancyLocation {
	mismatch: "fieldKind";
	view: FieldKindIdentifier;
	stored: FieldKindIdentifier;
}

export interface ValueSchemaDiscrepancy {
	identifier: TreeNodeSchemaIdentifier;
	mismatch: "valueSchema";
	view: ValueSchema | undefined;
	stored: ValueSchema | undefined;
}

export interface NodeKindDiscrepancy {
	identifier: TreeNodeSchemaIdentifier;
	mismatch: "nodeKind";
	view: SchemaFactoryNodeKind | undefined;
	stored: SchemaFactoryNodeKind | undefined;
}

export interface NodeFieldsDiscrepancy {
	identifier: TreeNodeSchemaIdentifier;
	mismatch: "fields";
	differences: FieldDiscrepancy[];
}

type SchemaFactoryNodeKind = "object" | "leaf" | "map";

function getNodeSchemaType(nodeSchema: TreeNodeStoredSchema): SchemaFactoryNodeKind {
	if (nodeSchema instanceof ObjectNodeStoredSchema) {
		return "object";
	} else if (nodeSchema instanceof MapNodeStoredSchema) {
		return "map";
	} else if (nodeSchema instanceof LeafNodeStoredSchema) {
		return "leaf";
	}
	throwUnsupportedNodeType(nodeSchema.constructor.name);
}

/**
 * Finds and reports discrepancies between a view schema and a stored schema.
 *
 * See documentation on {@link Discrepancy} for details of possible discrepancies.
 * @remarks
 * This function does not attempt to distinguish between equivalent representations of a node/field involving extraneous never trees.
 * For example, a Forbidden field with allowed type set `[]` is equivalent to an optional field with allowed type set `[]`,
 * as well as an optional field with an allowed type set containing only unconstructable types.
 *
 * It is up to the caller to determine whether such discrepancies matter.
 */
export function* getAllowedContentDiscrepancies(
	view: TreeStoredSchema,
	stored: TreeStoredSchema,
): Iterable<Discrepancy> {
	// check root schema discrepancies
	yield* getFieldDiscrepancies(
		view.rootFieldSchema,
		stored.rootFieldSchema,
		undefined,
		undefined,
	);

	for (const result of compareMaps(view.nodeSchema, stored.nodeSchema)) {
		switch (result.type) {
			case "aExtra": {
				const viewType = getNodeSchemaType(result.value);
				yield {
					identifier: result.key,
					mismatch: "nodeKind",
					view: viewType,
					stored: undefined,
				};
				break;
			}
			case "bExtra": {
				const storedType = getNodeSchemaType(result.value);
				yield {
					identifier: result.key,
					mismatch: "nodeKind",
					view: undefined,
					stored: storedType,
				};
				break;
			}
			case "both": {
				yield* getNodeDiscrepancies(result.key, result.valueA, result.valueB);
				break;
			}
			default:
				break;
		}
	}
}

function* getNodeDiscrepancies(
	identifier: TreeNodeSchemaIdentifier,
	view: TreeNodeStoredSchema,
	stored: TreeNodeStoredSchema,
): Iterable<Discrepancy> {
	const viewType = getNodeSchemaType(view);
	const storedType = getNodeSchemaType(stored);
	if (viewType !== storedType) {
		yield {
			identifier,
			mismatch: "nodeKind",
			view: viewType,
			stored: storedType,
		};
		return;
	}

	switch (viewType) {
		case "object": {
			const differences = Array.from(
				trackObjectNodeDiscrepancies(
					identifier,
					view as ObjectNodeStoredSchema,
					stored as ObjectNodeStoredSchema,
				),
			);
			if (differences.length > 0) {
				yield {
					identifier,
					mismatch: "fields",
					differences,
				} satisfies NodeFieldsDiscrepancy;
			}
			break;
		}
		case "map":
			yield* getFieldDiscrepancies(
				(view as MapNodeStoredSchema).mapFields,
				(stored as MapNodeStoredSchema).mapFields,
				identifier,
				undefined,
			);
			break;
		case "leaf": {
			const viewValue = (view as LeafNodeStoredSchema).leafValue;
			const storedValue = (stored as LeafNodeStoredSchema).leafValue;
			if (viewValue !== storedValue) {
				yield {
					identifier,
					mismatch: "valueSchema",
					view: viewValue,
					stored: storedValue,
				};
			}
			break;
		}
		default:
			break;
	}
}

/**
 * The function to track the discrepancies between two field stored schemas.
 *
 * @param keyOrRoot - If the key is missing, it indicates that this is the root field schema.
 */
function* getFieldDiscrepancies(
	view: TreeFieldStoredSchema,
	stored: TreeFieldStoredSchema,
	identifier: TreeNodeSchemaIdentifier | undefined,
	fieldKey: FieldKey | undefined,
): Iterable<FieldDiscrepancy> {
	// Only track the symmetric differences of two sets.
	const findSetDiscrepancies = (
		a: TreeTypeSet,
		b: TreeTypeSet,
	): [TreeNodeSchemaIdentifier[], TreeNodeSchemaIdentifier[]] => {
		const aDiff = [...a].filter((value) => !b.has(value));
		const bDiff = [...b].filter((value) => !a.has(value));
		return [aDiff, bDiff];
	};

	const [viewExtra, storedExtra] = findSetDiscrepancies(view.types, stored.types);
	if (viewExtra.length > 0 || storedExtra.length > 0) {
		yield {
			identifier,
			fieldKey,
			mismatch: "allowedTypes",
			view: viewExtra,
			stored: storedExtra,
		} satisfies AllowedTypeDiscrepancy;
	}

	if (view.kind !== stored.kind) {
		yield {
			identifier,
			fieldKey,
			mismatch: "fieldKind",
			view: view.kind,
			stored: stored.kind,
		} satisfies FieldKindDiscrepancy;
	}
}

function* trackObjectNodeDiscrepancies(
	identifier: TreeNodeSchemaIdentifier,
	view: ObjectNodeStoredSchema,
	stored: ObjectNodeStoredSchema,
): Iterable<FieldDiscrepancy> {
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

	for (const result of compareMaps(view.objectNodeFields, stored.objectNodeFields)) {
		const fieldKey = result.key;
		switch (result.type) {
			case "aExtra": {
				if (result.value.kind === storedEmptyFieldSchema.kind) {
					// In one of view/stored, this field is explicitly forbidden, but in the other it is implicitly forbidden
					// (by way of omission). We treat these identically anyway.
					break;
				}
				yield {
					identifier,
					fieldKey,
					mismatch: "fieldKind",
					view: result.value.kind,
					stored: storedEmptyFieldSchema.kind,
				} satisfies FieldKindDiscrepancy;
				break;
			}
			case "bExtra": {
				if (result.value.kind === storedEmptyFieldSchema.kind) {
					// In one of view/stored, this field is explicitly forbidden, but in the other it is implicitly forbidden
					// (by way of omission). We treat these identically anyway.
					break;
				}
				yield {
					identifier,
					fieldKey,
					mismatch: "fieldKind",
					view: storedEmptyFieldSchema.kind,
					stored: result.value.kind,
				} satisfies FieldKindDiscrepancy;
				break;
			}
			case "both": {
				yield* getFieldDiscrepancies(result.valueA, result.valueB, identifier, fieldKey);
				break;
			}
			default:
				break;
		}
	}
}

function* compareMaps<K, V1, V2>(
	a: ReadonlyMap<K, V1>,
	b: ReadonlyMap<K, V2>,
): Iterable<
	| { type: "aExtra"; key: K; value: V1 }
	| { type: "bExtra"; key: K; value: V2 }
	| { type: "both"; key: K; valueA: V1; valueB: V2 }
> {
	for (const [key, valueA] of a) {
		const valueB = b.get(key);
		yield valueB === undefined
			? { type: "aExtra", key, value: valueA }
			: { type: "both", key, valueA, valueB };
	}
	for (const [key, valueB] of b) {
		if (!a.has(key)) {
			yield { type: "bExtra", key, value: valueB };
		}
	}
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
				if (!isFieldDiscrepancyCompatible(discrepancy)) {
					return false;
				}
				break;
			}
			case "fields": {
				if (
					discrepancy.differences.some(
						(difference) => !isFieldDiscrepancyCompatible(difference),
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

function isFieldDiscrepancyCompatible(discrepancy: FieldDiscrepancy): boolean {
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
export type LinearExtension<T> = Map<T, number>;

/**
 * A realizer for a partially-ordered set. See:
 * https://en.wikipedia.org/wiki/Order_dimension
 */
export type Realizer<T> = LinearExtension<T>[];

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
export const fieldRealizer: Realizer<FieldKindIdentifier> = [
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

export const PosetComparisonResult = {
	Less: "<",
	Greater: ">",
	Equal: "=",
	Incomparable: "||",
} as const;
type PosetComparisonResult =
	(typeof PosetComparisonResult)[keyof typeof PosetComparisonResult];

export function comparePosetElements<T>(
	a: T,
	b: T,
	realizer: Realizer<T>,
): PosetComparisonResult {
	let hasLessThanResult = false;
	let hasGreaterThanResult = false;
	for (const extension of realizer) {
		const aIndex = extension.get(a);
		const bIndex = extension.get(b);
		assert(aIndex !== undefined && bIndex !== undefined, 0xa72 /* Invalid realizer */);
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

export function posetLte<T>(a: T, b: T, realizer: Realizer<T>): boolean {
	const comparison = comparePosetElements(a, b, realizer);
	return (
		comparison === PosetComparisonResult.Less || comparison === PosetComparisonResult.Equal
	);
}

function throwUnsupportedNodeType(type: string): never {
	throw new TypeError(`Unsupported node stored schema type: ${type}`);
}
