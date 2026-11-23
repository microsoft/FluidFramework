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
import {
	FieldKinds,
	type SchemaIncompatibilityLocation,
} from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import {
	NodeKind,
	normalizeAndEvaluateAnnotatedAllowedTypes,
	type AnnotatedAllowedType,
	type SchemaUpgrade,
	type TreeNodeSchema,
} from "../core/index.js";
import {
	createFieldSchema,
	FieldKind,
	FieldSchemaAlpha,
	type FieldSchema,
} from "../fieldSchema.js";
import { LeafNodeSchema } from "../leafNodeSchema.js";
import {
	isArrayNodeSchema,
	isMapNodeSchema,
	isObjectNodeSchema,
	isRecordNodeSchema,
	type ObjectNodeSchemaPrivate,
} from "../node-kinds/index.js";
import { convertFieldKind } from "../toStoredSchema.js";
import type { TreeSchema } from "../treeSchema.js";

import { tryStoredSchemaAsArray } from "./customTree.js";

/**
 * Collects upgrade location data during a schema walk.
 * @remarks Called for each staged type or staged optional field encountered.
 */
export interface UpgradeLocationCollector {
	/**
	 * Record a staged allowed type location.
	 * @param upgrade - The upgrade token guarding this type.
	 * @param isEnabled - Whether this type is present in stored schema.
	 */
	allowedType(upgrade: SchemaUpgrade, isEnabled: boolean): void;
	/**
	 * Record a staged optional field location.
	 * @param upgrade - The upgrade token guarding this field.
	 * @param isEnabled - Whether the stored field is already optional.
	 */
	optionalField(upgrade: SchemaUpgrade, isEnabled: boolean): void;
}

/**
 * Discriminated union (keyed on `mismatch`) of incompatibilities between a view and stored schema which
 * make it possible for content matching the stored schema to be incompatible with the view schema.
 */
export type Incompatibility = FieldIncompatibility | NodeKindIncompatibility;

/**
 * An incompatibility in the declaration of a field.
 */
export type FieldIncompatibility =
	| AllowedTypeIncompatibility
	| FieldKindIncompatibility
	| ValueSchemaIncompatibility;

/**
 * Information about where a field incompatibility is located within a collection of schemas.
 */
export interface FieldIncompatibilityLocation extends SchemaIncompatibilityLocation {
	/**
	 * Whether the view field is a staged optional field.
	 * Omitted when false.
	 */
	readonly viewIsStagedOptional?: true;
}

/**
 * An incompatibility in the allowed types of a field.
 *
 * @remarks
 * This reports the symmetric difference of allowed types.
 */
export interface AllowedTypeIncompatibility extends FieldIncompatibilityLocation {
	readonly mismatch: "allowedTypes";
	/**
	 * Annotated allowed types in viewed schema
	 * (excluding {@link SchemaStaticsBeta.staged | staged} schema) which are not allowed in stored schema.
	 */
	readonly view: readonly AnnotatedAllowedType<TreeNodeSchema>[];
	/**
	 * Staged allowed types in the view schema which are not allowed in stored schema.
	 *
	 * @remarks
	 * These types do not cause the incompatibility and are omitted when there are none.
	 */
	readonly stagedView?: readonly AnnotatedAllowedType<TreeNodeSchema>[];
	/**
	 * Allowed type identifiers in stored schema which are not allowed in view schema
	 * (including the view schema's {@link SchemaStaticsBeta.staged | staged} schema).
	 */
	readonly stored: readonly TreeNodeSchemaIdentifier[];
}

/**
 * Differences in `FieldKindIdentifier` between two schemas.
 */
export interface FieldKindIncompatibility extends FieldIncompatibilityLocation {
	readonly mismatch: "fieldKind";
	readonly view: FieldKindIdentifier;
	readonly stored: FieldKindIdentifier;
}

/**
 * Differences in the `ValueSchema` of two `LeafNodeStoredSchema` objects.
 */
export interface ValueSchemaIncompatibility {
	identifier: TreeNodeSchemaIdentifier;
	mismatch: "valueSchema";
	view: ValueSchema | undefined;
	stored: ValueSchema | undefined;
}

/**
 * Differences in the kind of node schema.
 *
 * Includes when stored object schemas are expected to be compatible with an array node schema.
 */
export interface NodeKindIncompatibility {
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
		case NodeKind.Leaf: {
			return storedType === LeafNodeStoredSchema;
		}
		case NodeKind.Array:
		case NodeKind.Object: {
			return storedType === ObjectNodeStoredSchema;
		}
		case NodeKind.Map:
		case NodeKind.Record: {
			return storedType === MapNodeStoredSchema;
		}
		default: {
			unreachableCase(viewKind);
		}
	}
}

/**
 * Finds and reports incompatibilities between a view schema and a stored schema which make "canView" false.
 *
 * Optionally collects upgrade location information for staged schema upgrades during the same walk.
 *
 * @remarks
 * See documentation on {@link Incompatibility} and its subtypes for details of possible incompatibilities.
 */
export function* getIncompatibilitiesInAllowedContent(
	view: TreeSchema,
	stored: TreeStoredSchema,
	upgradeCollector?: UpgradeLocationCollector,
): Iterable<Incompatibility> {
	yield* getRootFieldIncompatibilities(view, stored.rootFieldSchema, upgradeCollector);

	// Check all of the stored nodes, including their fields for incompatibilities.
	for (const [identifier, storedSchema] of stored.nodeSchema) {
		const viewSchema = view.definitions.get(identifier);

		// if the view schema has a node that's also in the stored schema, check it.
		if (viewSchema !== undefined) {
			yield* getNodeIncompatibilities(identifier, viewSchema, storedSchema, upgradeCollector);
		}
		// Note that nodes that are missing in the view schema are only a problem if other stored schema nodes actually reference them which will produce its own incompatibility, so we can rely on that to produce any needed incompatibilities.
	}
}

/**
 * The part of {@link getIncompatibilitiesInAllowedContent} which compares the root fields.
 */
export function* getRootFieldIncompatibilities(
	view: TreeSchema,
	storedRoot: TreeFieldStoredSchema,
	upgradeCollector?: UpgradeLocationCollector,
): Iterable<Incompatibility> {
	yield* getFieldIncompatibilities(
		view.root,
		storedRoot,
		undefined,
		undefined,
		upgradeCollector,
	);
}

function* getNodeIncompatibilities(
	identifier: TreeNodeSchemaIdentifier,
	view: TreeNodeSchema,
	stored: TreeNodeStoredSchema,
	upgradeCollector?: UpgradeLocationCollector,
): Iterable<Incompatibility> {
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
			yield* computeObjectNodeIncompatibilities(
				identifier,
				view,
				stored as ObjectNodeStoredSchema,
				upgradeCollector,
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

			yield* getAllowedTypeIncompatibilities(
				normalizeAndEvaluateAnnotatedAllowedTypes(view.info).types,
				arrayStoredSchema,
				brand(view.identifier),
				EmptyKey,
				false,
				upgradeCollector,
			);

			break;
		}
		case NodeKind.Map: {
			assert(
				isMapNodeSchema(view),
				0xbeb /* schema with node kind of map must implement MapNodeSchema */,
			);

			yield* getFieldIncompatibilities(
				createFieldSchema(FieldKind.Optional, view.info),
				(stored as MapNodeStoredSchema).mapFields,
				identifier,
				undefined,
				upgradeCollector,
			);
			break;
		}
		case NodeKind.Record: {
			assert(
				isRecordNodeSchema(view),
				0xbec /* schema with node kind of record must implement RecordNodeSchema */,
			);

			yield* getFieldIncompatibilities(
				createFieldSchema(FieldKind.Optional, view.info),
				(stored as MapNodeStoredSchema).mapFields,
				identifier,
				undefined,
				upgradeCollector,
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
		default: {
			break;
		}
	}
}

/**
 * Returns the allowed types that are not present in both the given view and stored schemas.
 */
export function findExtraAllowedTypes(
	viewAllowedTypes: readonly AnnotatedAllowedType<TreeNodeSchema>[],
	storedAllowedTypes: TreeTypeSet,
): Pick<AllowedTypeIncompatibility, "view" | "stagedView" | "stored"> {
	const viewNodeSchemaIdentifiers = new Set(
		viewAllowedTypes.map((value) => value.type.identifier),
	);

	// TODO:
	// Add detecting which SchemaUpgrades have been made.
	// When doing so, each will fall into one of three states: staged, partially applied, or fully applied.
	// This would allow for nicer compatibility errors and more detailed compatibility status in the future.
	const view = viewAllowedTypes.filter(
		(value) =>
			!storedAllowedTypes.has(brand(value.type.identifier)) &&
			value.metadata.stagedSchemaUpgrade === undefined,
	);
	const stagedView = viewAllowedTypes.filter(
		(value) =>
			!storedAllowedTypes.has(brand(value.type.identifier)) &&
			value.metadata.stagedSchemaUpgrade !== undefined,
	);
	const stored = [...storedAllowedTypes].filter(
		(value) => !viewNodeSchemaIdentifiers.has(value),
	);
	return {
		view,
		...(stagedView.length === 0 ? {} : { stagedView }),
		stored,
	};
}

/**
 * The function to track the incompatibilities between a field view schema and a stored schema.
 *
 * @remarks
 * This function yields incompatibilities in the following cases:
 * 1. If the view schema has allowed types that are not present in the stored schema.
 * 2. If the stored schema has allowed types that are not present in the view schema.
 * 3. If the field kind in the view schema is not compatible with the stored schema.
 *
 * This function does not recurse into the nodes of the view schema and only makes comparisons at the field level.
 *
 * @param fieldKey - If the key is missing, it indicates that this is the root field schema.
 */
function* getFieldIncompatibilities(
	view: FieldSchema,
	stored: TreeFieldStoredSchema,
	identifier: TreeNodeSchemaIdentifier | undefined,
	fieldKey: FieldKey | undefined,
	upgradeCollector?: UpgradeLocationCollector,
): Iterable<FieldIncompatibility> {
	assert(
		view instanceof FieldSchemaAlpha,
		0xbee /* all field schema should be FieldSchemaAlpha */,
	);

	// Collect staged-optional upgrade location if present.
	if (upgradeCollector !== undefined && view.isStagedOptional !== false) {
		upgradeCollector.optionalField(
			view.isStagedOptional,
			stored.kind === FieldKinds.optional.identifier,
		);
	}

	yield* getAllowedTypeIncompatibilities(
		view.allowedTypesFull.evaluate().types,
		stored.types,
		identifier,
		fieldKey,
		view.isStagedOptional !== false,
		upgradeCollector,
	);

	const viewKind =
		convertFieldKind.get(view.kind) ??
		fail(0xbef /* A conversion from a FieldKind to a FlexFieldKind should exist */);

	// This checks if the field kind in the view schema is not compatible with the stored schema.
	// A staged optional field (optional in the view) is compatible with a required stored field
	// during the rollout period — suppress the kind incompatibility in that case.
	if (
		viewKind.identifier !== stored.kind &&
		!(view.isStagedOptional !== false && stored.kind === FieldKinds.required.identifier)
	) {
		yield {
			identifier,
			fieldKey,
			mismatch: "fieldKind",
			view: viewKind.identifier,
			stored: stored.kind,
			...(view.isStagedOptional === false ? {} : { viewIsStagedOptional: true }),
		} satisfies FieldKindIncompatibility;
	}
}

/**
 * The function to track the incompatibilities between a field view schema and a stored schema.
 *
 * @remarks
 * This function yields incompatibilities in the following cases:
 * 1. If the view schema has allowed types that are not present in the stored schema.
 * 2. If the stored schema has allowed types that are not present in the view schema.
 *
 * This function does not recurse into the nodes of the view schema and only makes comparisons at the field level.
 *
 * @param fieldKey - If the key is missing, it indicates that this is the root field schema.
 */
function* getAllowedTypeIncompatibilities(
	view: readonly AnnotatedAllowedType<TreeNodeSchema>[],
	stored: TreeTypeSet,
	identifier: TreeNodeSchemaIdentifier | undefined,
	fieldKey: FieldKey | undefined,
	viewIsStagedOptional: boolean,
	upgradeCollector?: UpgradeLocationCollector,
): Iterable<FieldIncompatibility> {
	// Collect staged allowed type upgrade locations if present.
	if (upgradeCollector !== undefined) {
		for (const allowedType of view) {
			if (allowedType.metadata.stagedSchemaUpgrade !== undefined) {
				upgradeCollector.allowedType(
					allowedType.metadata.stagedSchemaUpgrade,
					stored.has(brand(allowedType.type.identifier)),
				);
			}
		}
	}

	const incompatibilities = findExtraAllowedTypes(view, stored);
	if (incompatibilities.view.length > 0 || incompatibilities.stored.length > 0) {
		yield {
			...incompatibilities,
			identifier,
			fieldKey,
			mismatch: "allowedTypes",
			...(viewIsStagedOptional ? { viewIsStagedOptional: true } : {}),
		} satisfies AllowedTypeIncompatibility;
	}
}

/**
 * Computes incompatibilities between a view schema and a stored schema for nodes that are treated as object nodes in the stored schema.
 * This includes both view object nodes and view array nodes.
 *
 * This function yields incompatibilities in the following cases:
 *
 * 1. If the view schema has fields that are not present in the stored schema.
 * 2. If the stored schema has fields that are not present in the view schema.
 * 3. If the field kind or allowed types of a field in the view schema is not compatible with the stored schema.
 *
 * This function includes incompatibilities within the common fields and their allowed types, but does NOT recurse to report and incompatibilities within the node types referenced by those fields.
 */
function* computeObjectNodeIncompatibilities(
	identifier: TreeNodeSchemaIdentifier,
	view: ObjectNodeSchemaPrivate,
	stored: ObjectNodeStoredSchema,
	upgradeCollector?: UpgradeLocationCollector,
): Iterable<FieldIncompatibility> {
	/**
	 * Similar to the logic used for tracking incompatibilities between two node schemas, we will identify
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
				...(fieldSchema instanceof FieldSchemaAlpha && fieldSchema.isStagedOptional !== false
					? { viewIsStagedOptional: true }
					: {}),
			} satisfies FieldKindIncompatibility;
		} else {
			yield* getFieldIncompatibilities(
				fieldSchema,
				storedSchema,
				identifier,
				fieldKey,
				upgradeCollector,
			);
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
		// When the application has opted into it, we allow viewing documents which have additional
		// optional fields in the stored schema that are not present in the view schema.
		if (
			!viewKeys.has(fieldKey) &&
			(!view.allowUnknownOptionalFields || schema.kind !== FieldKinds.optional.identifier)
		) {
			yield {
				identifier,
				fieldKey,
				mismatch: "fieldKind",
				view: storedEmptyFieldSchema.kind,
				stored: schema.kind,
			} satisfies FieldKindIncompatibility;
		}
	}
}
