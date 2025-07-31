/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, unreachableCase } from "@fluidframework/core-utils/internal";

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
} from "../../core/index.js";
import { brand } from "../../util/index.js";
import {
	NodeKind,
	normalizeAnnotatedAllowedTypes,
	type AnnotatedAllowedType,
	type TreeNodeSchema,
} from "../core/index.js";
import {
	isArrayNodeSchema,
	isMapNodeSchema,
	isObjectNodeSchema,
	isRecordNodeSchema,
	type ObjectNodeSchemaPrivate,
} from "../node-kinds/index.js";
import { convertFieldKind } from "../toStoredSchema.js";
import {
	createFieldSchema,
	FieldKind,
	FieldSchemaAlpha,
	type FieldSchema,
} from "../fieldSchema.js";
import { LeafNodeSchema } from "../leafNodeSchema.js";
import type { TreeSchema } from "./configuration.js";
import { tryStoredSchemaAsArray } from "./customTree.js";
import { FieldKinds } from "../../feature-libraries/index.js";

/**
 * Discriminated union (keyed on `mismatch`) of discrepancies between a view and stored schema which
 * make it possible for content matching the stored schema to be incompatible with the view schema.
 */
export type Discrepancy = FieldDiscrepancy | NodeKindDiscrepancy;

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
 * This reports the symmetric difference of allowed types.
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

/**
 * Differences in `FieldKindIdentifier` between two schema.
 */
export interface FieldKindDiscrepancy extends FieldDiscrepancyLocation {
	readonly mismatch: "fieldKind";
	readonly view: FieldKindIdentifier;
	readonly stored: FieldKindIdentifier;
}

/**
 * Differences in the `ValueSchema` of two `LeafNodeStoredSchema` objects.
 */
export interface ValueSchemaDiscrepancy {
	identifier: TreeNodeSchemaIdentifier;
	mismatch: "valueSchema";
	view: ValueSchema | undefined;
	stored: ValueSchema | undefined;
}

/**
 * Differences in the kind of node schema.
 *
 * Includes when stored object schema are expected to be compatible with an array node schema.
 */
export interface NodeKindDiscrepancy {
	identifier: TreeNodeSchemaIdentifier;
	mismatch: "nodeKind";
	view: NodeKind;
	stored: SchemaFactoryNodeKind;
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
	fail(0xbe8 /* Invalid stored node schema type */);
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

/**
 * Finds and reports discrepancies between a view schema and a stored schema which make "canView" false.
 * @remarks
 * See documentation on {@link Discrepancy} and its subtypes for details of possible discrepancies.
 */
export function* getDiscrepanciesInAllowedContent(
	view: TreeSchema,
	stored: TreeStoredSchema,
): Iterable<Discrepancy> {
	// check root field discrepancies
	yield* getFieldDiscrepancies(view.root, stored.rootFieldSchema, undefined, undefined);

	// Check all of the stored nodes, including their fields for discrepancies.
	for (const [identifier, storedSchema] of stored.nodeSchema) {
		const viewSchema = view.definitions.get(identifier);

		// if the view schema has a node that's also in the stored schema, check it.
		if (viewSchema !== undefined) {
			yield* getNodeDiscrepancies(identifier, viewSchema, storedSchema);
		}
		// Note that nodes that are missing in the view schema are only a problem if other stored schema nodes actually reference them which will produce its own discrepancy, so we can rely on that to produce any needed discrepancies.
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
			view: view.kind,
			stored: getStoredNodeSchemaType(stored),
		};
		return;
	}

	switch (view.kind) {
		case NodeKind.Object: {
			assert(
				isObjectNodeSchema(view),
				0xbe9 /* schema with node kind of object must implement ObjectNodeSchema */,
			);
			yield* computeObjectNodeDiscrepancies(
				identifier,
				view,
				stored as ObjectNodeStoredSchema,
			);
			break;
		}
		case NodeKind.Array: {
			assert(
				isArrayNodeSchema(view),
				0xbea /* schema with node kind of array must implement ArrayNodeSchema */,
			);

			const arrayStoredSchema = tryStoredSchemaAsArray(stored);
			if (arrayStoredSchema === undefined) {
				yield {
					identifier,
					mismatch: "nodeKind",
					view: NodeKind.Array,
					stored: getStoredNodeSchemaType(stored),
				};
				return;
			}

			yield* getAllowedTypeDiscrepancies(
				normalizeAnnotatedAllowedTypes(view.info).types,
				arrayStoredSchema,
				brand(view.identifier),
				EmptyKey,
			);

			break;
		}
		case NodeKind.Map: {
			assert(
				isMapNodeSchema(view),
				0xbeb /* schema with node kind of map must implement MapNodeSchema */,
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
				0xbec /* schema with node kind of record must implement RecordNodeSchema */,
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
				0xbed /* schema with node kind of leaf must implement LeafNodeSchema */,
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
): {
	viewExtra: readonly AnnotatedAllowedType<TreeNodeSchema>[];
	storedExtra: TreeNodeSchemaIdentifier[];
} {
	const viewNodeSchemaIdentifiers = new Set(
		viewAllowedTypes.map((value) => value.type.identifier),
	);

	const viewExtra = [...viewAllowedTypes].filter(
		(value) => !storedAllowedTypes.has(brand(value.type.identifier)),
	);
	const storedExtra = [...storedAllowedTypes].filter(
		(value) => !viewNodeSchemaIdentifiers.has(value),
	);
	return { viewExtra, storedExtra };
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
 * @param fieldKey - If the key is missing, it indicates that this is the root field schema.
 */
function* getFieldDiscrepancies(
	view: FieldSchema,
	stored: TreeFieldStoredSchema,
	identifier: TreeNodeSchemaIdentifier | undefined,
	fieldKey: FieldKey | undefined,
): Iterable<FieldDiscrepancy> {
	assert(
		view instanceof FieldSchemaAlpha,
		0xbee /* all field schema should be FieldSchemaAlpha */,
	);
	yield* getAllowedTypeDiscrepancies(
		view.annotatedAllowedTypesNormalized.types,
		stored.types,
		identifier,
		fieldKey,
	);

	const viewKind =
		convertFieldKind.get(view.kind) ??
		fail(0xbef /* A conversion from a FieldKind to a FlexFieldKind should exist */);

	// This checks if the field kind in the view schema is not compatible with the stored schema.
	if (viewKind.identifier !== stored.kind) {
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
 * The function to track the discrepancies between a field view schema and a stored schema.
 *
 * @remarks
 * This function yields discrepancies in the following cases:
 * 1. If the view schema has allowed types that are not present in the stored schema.
 * 2. If the stored schema has allowed types that are not present in the view schema.
 *
 * This function does not recurse into the nodes of the view schema and only makes comparisons at the field level.
 *
 * @param fieldKey - If the key is missing, it indicates that this is the root field schema.
 */
function* getAllowedTypeDiscrepancies(
	view: readonly AnnotatedAllowedType<TreeNodeSchema>[],
	stored: TreeTypeSet,
	identifier: TreeNodeSchemaIdentifier | undefined,
	fieldKey: FieldKey | undefined,
): Iterable<FieldDiscrepancy> {
	const { viewExtra, storedExtra } = findExtraAllowedTypes(view, stored);
	if (viewExtra.length > 0 || storedExtra.length > 0) {
		yield {
			identifier,
			fieldKey,
			mismatch: "allowedTypes",
			view: viewExtra,
			stored: storedExtra,
		} satisfies AllowedTypeDiscrepancy;
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
	view: ObjectNodeSchemaPrivate,
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

	const viewKeys = new Set<FieldKey>();

	for (const [_, { storedKey: fieldKey, schema: fieldSchema }] of view.flexKeyMap) {
		const storedSchema = stored.objectNodeFields.get(fieldKey);
		viewKeys.add(fieldKey);

		// If the view schema has a field that's not in the stored schema
		if (storedSchema === undefined) {
			const viewKind =
				convertFieldKind.get(fieldSchema.kind) ??
				fail(0xbf0 /* A conversion from a FieldKind to a FlexFieldKind should exist */);
			yield {
				identifier,
				fieldKey,
				mismatch: "fieldKind",
				view: viewKind.identifier,
				stored: storedEmptyFieldSchema.kind,
			} satisfies FieldKindDiscrepancy;
		} else {
			yield* getFieldDiscrepancies(fieldSchema, storedSchema, identifier, fieldKey);
		}
	}

	for (const [fieldKey, schema] of stored.objectNodeFields) {
		if (schema.kind === forbiddenFieldKindIdentifier) {
			// In the stored schema the field is explicitly forbidden.
			// This has the same semantics of the field not being mentioned in the stored schema,
			// and thus can be skipped.
			continue;
		}

		// If the stored schema has a field that's not in the view schema
		if (!viewKeys.has(fieldKey)) {
			// When the application has opted into it, we allow viewing documents which have additional
			// optional fields in the stored schema that are not present in the view schema.
			if (!view.allowUnknownOptionalFields || schema.kind !== FieldKinds.optional.identifier) {
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
}
