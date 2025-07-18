/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	assert,
	debugAssert,
	fail,
	unreachableCase,
} from "@fluidframework/core-utils/internal";

import {
	EmptyKey,
	type FieldKey,
	type FieldKindIdentifier,
	forbiddenFieldKindIdentifier,
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
} from "../core/index.js";
import { brand } from "../util/index.js";
import { NodeKind, type AnnotatedAllowedType, type TreeNodeSchema } from "./core/index.js";
import {
	isArrayNodeSchema,
	isMapNodeSchema,
	isObjectNodeSchema,
	isRecordNodeSchema,
	type SimpleKeyMap,
} from "./node-kinds/index.js";
import { convertFieldKind } from "./toStoredSchema.js";
import { walkFieldSchema } from "./walkFieldSchema.js";
import {
	createFieldSchema,
	FieldKind,
	FieldSchemaAlpha,
	type FieldSchema,
} from "./fieldSchema.js";
import { LeafNodeSchema } from "./leafNodeSchema.js";

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
	readonly identifier: TreeNodeSchemaIdentifier | undefined;
	/**
	 * The {@link FieldKey} for the field that contains the discrepancy.
	 * Undefined when:
	 * - the discrepancy is part of the root field schema
	 * - the discrepancy is for 'all fields' of a map node
	 */
	readonly fieldKey: FieldKey | undefined;
}

/**
 * A discrepancy in the allowed types of a field.
 *
 * @remarks
 * This reports the symmetric difference of allowed types in view/stored to enable more efficient checks for compatibility
 */
export interface AllowedTypeDiscrepancy extends FieldDiscrepancyLocation {
	readonly mismatch: "allowedTypes";
	/**
	 * List of annotated allowed types in viewed schema which are not allowed in stored schema
	 */
	readonly view: readonly AnnotatedAllowedType<TreeNodeSchema>[];
	/**
	 * List of allowed type identifiers in stored schema which are not allowed in view schema
	 */
	readonly stored: readonly TreeNodeSchemaIdentifier[];
}

export interface FieldKindDiscrepancy extends FieldDiscrepancyLocation {
	readonly mismatch: "fieldKind";
	readonly view: FieldKindIdentifier;
	readonly stored: FieldKindIdentifier;
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

type SchemaFactoryNodeKind =
	| typeof ObjectNodeStoredSchema
	| typeof MapNodeStoredSchema
	| typeof LeafNodeStoredSchema;

function getStoredNodeSchemaType(nodeSchema: TreeNodeStoredSchema): SchemaFactoryNodeKind {
	if (nodeSchema instanceof ObjectNodeStoredSchema) {
		return ObjectNodeStoredSchema;
	}
	if (nodeSchema instanceof MapNodeStoredSchema) {
		return MapNodeStoredSchema;
	}
	if (nodeSchema instanceof LeafNodeStoredSchema) {
		return LeafNodeStoredSchema;
	}
	fail("Invalid stored node schema type");
}

function doesNodeKindMatchStoredNodeKind(
	viewKind: NodeKind,
	storedType: SchemaFactoryNodeKind,
): boolean {
	switch (viewKind) {
		case NodeKind.Leaf:
			return storedType === LeafNodeStoredSchema;
		case NodeKind.Array:
		case NodeKind.Object:
			return storedType === ObjectNodeStoredSchema;
		case NodeKind.Map:
		case NodeKind.Record:
			return storedType === MapNodeStoredSchema;
		default:
			unreachableCase(viewKind);
	}
}

function getViewNodeSchemaType(schema: TreeNodeSchema): SchemaFactoryNodeKind {
	switch (schema.kind) {
		case NodeKind.Leaf: {
			return LeafNodeStoredSchema;
		}
		case NodeKind.Map:
		case NodeKind.Record: {
			return MapNodeStoredSchema;
		}
		case NodeKind.Object:
		case NodeKind.Array: {
			return ObjectNodeStoredSchema;
		}
		default:
			unreachableCase(schema.kind);
	}
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
	view: FieldSchema,
	stored: TreeStoredSchema,
): Iterable<Discrepancy> {
	// check root schema discrepancies
	yield* getFieldDiscrepancies(view, stored.rootFieldSchema, undefined, undefined);

	const viewNodeSchema = new Map<TreeNodeSchemaIdentifier, TreeNodeSchema>();

	walkFieldSchema(view, {
		node: (schema) => {
			const identifier: TreeNodeSchemaIdentifier = brand(schema.identifier);

			debugAssert(() => !viewNodeSchema.has(identifier));
			viewNodeSchema.set(identifier, schema);
		},
	});

	for (const [identifier, viewSchema] of viewNodeSchema) {
		const storedSchema = stored.nodeSchema.get(identifier);

		// if the view schema has a node that's not in the stored schema
		if (storedSchema === undefined) {
			const viewType = getViewNodeSchemaType(viewSchema);
			// TODO does it make sense to have this mismatch when there will also be an allowedTypes mismatch?
			yield {
				identifier,
				mismatch: "nodeKind",
				view: viewType,
				stored: undefined,
			};
		} else {
			yield* getNodeDiscrepancies(identifier, viewSchema, storedSchema);
		}
	}

	for (const [identifier, storedSchema] of stored.nodeSchema) {
		if (!viewNodeSchema.has(identifier)) {
			const storedType = getStoredNodeSchemaType(storedSchema);
			yield {
				identifier,
				mismatch: "nodeKind",
				view: undefined,
				stored: storedType,
			};
		}
	}
}

function* getNodeDiscrepancies(
	identifier: TreeNodeSchemaIdentifier,
	view: TreeNodeSchema,
	stored: TreeNodeStoredSchema,
): Iterable<Discrepancy> {
	if (!doesNodeKindMatchStoredNodeKind(view.kind, getStoredNodeSchemaType(stored))) {
		yield {
			identifier,
			mismatch: "nodeKind",
			view: getViewNodeSchemaType(view),
			stored: getStoredNodeSchemaType(stored),
		};
		return;
	}

	switch (view.kind) {
		case NodeKind.Object: {
			assert(
				isObjectNodeSchema(view),
				"schema with node kind of object must implement ObjectNodeSchema",
			);
			const fields: SimpleKeyMap | undefined = view.flexKeyMap;
			const differences = Array.from(
				computeObjectNodeDiscrepancies(identifier, fields, stored as ObjectNodeStoredSchema),
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
		case NodeKind.Array: {
			assert(
				isArrayNodeSchema(view),
				"schema with node kind of array must implement ArrayNodeSchema",
			);
			const fields: SimpleKeyMap = new Map([
				[
					EmptyKey,
					{
						storedKey: EmptyKey,
						schema: createFieldSchema(FieldKind.Optional, view.info),
					},
				],
			]);

			const differences = Array.from(
				computeObjectNodeDiscrepancies(
					identifier,
					fields,
					stored as ObjectNodeStoredSchema,
					true,
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
		case NodeKind.Map: {
			assert(
				isMapNodeSchema(view),
				"schema with node kind of map must implement MapNodeSchema",
			);

			yield* getFieldDiscrepancies(
				createFieldSchema(FieldKind.Optional, view.info),
				(stored as MapNodeStoredSchema).mapFields,
				identifier,
				undefined,
			);
			break;
		}
		case NodeKind.Record: {
			assert(
				isRecordNodeSchema(view),
				"schema with node kind of record must implement RecordNodeSchema",
			);

			yield* getFieldDiscrepancies(
				createFieldSchema(FieldKind.Optional, view.info),
				(stored as MapNodeStoredSchema).mapFields,
				identifier,
				undefined,
			);
			break;
		}
		case NodeKind.Leaf: {
			assert(
				view instanceof LeafNodeSchema,
				"schema with node kind of leaf must implement LeafNodeSchema",
			);
			// TODO: leafKind seems like a bad name
			const viewValue = view.leafKind;
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
 * Returns the allowed types that are not present in both the given view and stored schemas.
 * It returns a tuple containing two arrays:
 * 1. The first array contains the allowed types that are present in the view schema but not in the stored schema.
 * 2. The second array contains the allowed types that are present in the stored schema but not in the view schema.
 */
export function findExtraAllowedTypes(
	viewAllowedTypes: readonly AnnotatedAllowedType<TreeNodeSchema>[],
	storedAllowedTypes: TreeTypeSet,
): [readonly AnnotatedAllowedType<TreeNodeSchema>[], TreeNodeSchemaIdentifier[]] {
	const viewNodeSchemaIdentifiers = new Set(
		viewAllowedTypes.map((value) => value.type.identifier),
	);
	const viewExtraneousAllowedTypes = [...viewAllowedTypes].filter(
		(value) => !storedAllowedTypes.has(brand(value.type.identifier)),
	);
	const storedExtraneousAllowedTypes = [...storedAllowedTypes].filter(
		(value) => !viewNodeSchemaIdentifiers.has(value),
	);
	return [viewExtraneousAllowedTypes, storedExtraneousAllowedTypes];
}

/**
 * The function to track the discrepancies between a field view schema and a stored schema.
 *
 * @remarks
 * This function yields discrepancies in the following cases:
 * 1. If the view schema has allowed types that are not present in the stored schema.
 * 2. If the stored schema has allowed types that are not present in the view schema.
 * 3. If the field kind in the view schema is not compatible with the stored schema.
 *
 * This function does not recurse into the nodes of the view schema and only makes comparisons at the field level.
 *
 * @param keyOrRoot - If the key is missing, it indicates that this is the root field schema.
 */
function* getFieldDiscrepancies(
	view: FieldSchema,
	stored: TreeFieldStoredSchema,
	identifier: TreeNodeSchemaIdentifier | undefined,
	fieldKey: FieldKey | undefined,
	// TODO: This is a temporary workaround until the comparison logic is redesigned.
	viewKindIsSequence = false,
): Iterable<FieldDiscrepancy> {
	assert(view instanceof FieldSchemaAlpha, "all field schema should be FieldSchemaAlpha");
	const [viewExtra, storedExtra] = findExtraAllowedTypes(
		view.annotatedAllowedTypesNormalized.types,
		stored.types,
	);
	if (viewExtra.length > 0 || storedExtra.length > 0) {
		yield {
			identifier,
			fieldKey,
			mismatch: "allowedTypes",
			view: viewExtra,
			stored: storedExtra,
		} satisfies AllowedTypeDiscrepancy;
	}

	const viewKind =
		convertFieldKind.get(view.kind) ??
		fail("A conversion from a FieldKind to a FlexFieldKind should exist");

	// This checks if the field kind in the view schema is not compatible with the stored schema.
	// We cannot detect if the view schema is a sequence using the kind property so it is passed in separately.
	if (
		(viewKindIsSequence && stored.kind !== "Sequence") ||
		(!viewKindIsSequence && viewKind.identifier !== stored.kind)
	) {
		yield {
			identifier,
			fieldKey,
			mismatch: "fieldKind",
			view: viewKind.identifier,
			stored: stored.kind,
		} satisfies FieldKindDiscrepancy;
	}
}

/**
 * Computes discrepancies between a view schema and a stored schema for nodes that are treated as object nodes in the stored schema.
 * This includes both view object nodes and view array nodes.
 *
 * This function yields discrepancies in the following cases:
 *
 * 1. If the view schema has fields that are not present in the stored schema.
 * 2. If the stored schema has fields that are not present in the view schema.
 * 3. If the field kind or allowed types of a field in the view schema is not compatible with the stored schema.
 *
 * This function includes discrepancies within the common fields and their allowed types, but does NOT recurse to report and discrepancies within the node types referenced by those fields.
 */
function* computeObjectNodeDiscrepancies(
	identifier: TreeNodeSchemaIdentifier,
	view: SimpleKeyMap,
	stored: ObjectNodeStoredSchema,
	viewKindIsSequence = false,
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

	const viewKeys = new Set<FieldKey>();

	for (const [_, { storedKey: fieldKey, schema: fieldSchema }] of view) {
		const storedSchema = stored.objectNodeFields.get(fieldKey);
		viewKeys.add(fieldKey);

		// If the view schema has a field that's not in the stored schema
		if (storedSchema === undefined) {
			const viewKind =
				convertFieldKind.get(fieldSchema.kind) ??
				fail("A conversion from a FieldKind to a FlexFieldKind should exist");
			yield {
				identifier,
				fieldKey,
				mismatch: "fieldKind",
				view: viewKind.identifier,
				stored: storedEmptyFieldSchema.kind,
			} satisfies FieldKindDiscrepancy;
		} else {
			yield* getFieldDiscrepancies(
				fieldSchema,
				storedSchema,
				identifier,
				fieldKey,
				viewKindIsSequence,
			);
		}
	}

	for (const [fieldKey, schema] of stored.objectNodeFields) {
		// If the stored schema has a field that's not in the view schema
		if (!viewKeys.has(fieldKey)) {
			if (schema.kind === forbiddenFieldKindIdentifier) {
				// In the stored schema the field is explicitly forbidden.
				// This has the same semantics of the field not being mentioned in the stored schema,
				// and thus is compatible with the view schema which does not mention this field.
				continue;
			}
			yield {
				identifier,
				fieldKey,
				mismatch: "fieldKind",
				view: storedEmptyFieldSchema.kind,
				stored: schema.kind,
			} satisfies FieldKindDiscrepancy;
		}
	}
}

export function posetLte<T>(a: T, b: T, realizer: Realizer<T>): boolean {
	const comparison = comparePosetElements(a, b, realizer);
	return (
		comparison === PosetComparisonResult.Less || comparison === PosetComparisonResult.Equal
	);
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
