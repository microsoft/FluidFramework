/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	unreachableCase,
	fail,
	transformMapValues,
	assert,
} from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type FieldKey,
	type FieldKindIdentifier,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	type TreeTypeSet,
} from "../core/index.js";
import { FieldKinds, type FlexFieldKind } from "../feature-libraries/index.js";
import {
	brand,
	filterIterable,
	getOrCreate,
	mapIterable,
	type JsonCompatibleReadOnlyObject,
} from "../util/index.js";

import {
	ExpectStored,
	NodeKind,
	Unchanged,
	type SimpleSchemaTransformationOptions,
	type StoredFromViewSchemaGenerationOptions,
	type StoredSchemaGenerationOptions,
} from "./core/index.js";
import { FieldKind, normalizeFieldSchema, type ImplicitFieldSchema } from "./fieldSchema.js";
import type {
	SchemaType,
	SimpleAllowedTypeAttributes,
	SimpleAllowedTypes,
	SimpleArrayNodeSchema,
	SimpleFieldSchema,
	SimpleLeafNodeSchema,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectNodeSchema,
	SimpleRecordNodeSchema,
	SimpleTreeSchema,
} from "./simpleSchema.js";
import { createTreeSchema } from "./treeSchema.js";

// TODO: this file, src/simple-tree/api/storedSchema.ts and src/simple-tree/core/toStored.ts should be refactored to group the logic more logically.
// The content of src/simple-tree/api/storedSchema.ts should probably removed from the API surface, replaced by simple schema snapshotting APIs.
// The logic from this file for converting stored-simple-schema to the persisted format can be moved to its own file.
// The simple-schema related logic from this file and src/simple-tree/core/toStored.ts can be unified and `toStoredSchema` and its other ImplicitFieldSchema consuming variants should probably be removed in favor of acting on TreeSchema and SimpleTreeSchema directly.

const viewToStoredCache = new WeakMap<
	StoredFromViewSchemaGenerationOptions,
	WeakMap<ImplicitFieldSchema, TreeStoredSchema>
>();

/**
 * Maximally restrictive transformation of a view to stored schema.
 * @remarks
 * This should only be used when the intent is to produce a stored schema is as restrictive as possible while still being compatible with the input view schema.
 * This is typically used for cases where backwards compatibility with past versions of an application is required, like {@link toUpgradeSchema} or {@link toInitialSchema}.
 */
export const restrictiveStoredSchemaGenerationOptions: StoredFromViewSchemaGenerationOptions =
	{
		includeStaged: () => false,
	};

/**
 * Maximally permissive transformation of a view to stored schema.
 * @remarks
 * This should only be used when the intent is to produce a stored schema which allows as much as possible while still being compatible with the input view schema.
 * This is typically used for cases where forwards compatibility with future versions of an application is required, like {@link toUnhydratedSchema}.
 *
 * This is unable to include unknown optional fields in the output, which makes it not truly maximally permissive.
 *
 * TODO: {@link StoredFromViewSchemaGenerationOptions} could be updated to allow a way to inject extra optional fields.
 * If done, then this could take in an existing stored schema, and attempt to generate a valid superset.
 * This could be useful to use as the schema for unhydrated content cloned from hydrated content.
 */
export const permissiveStoredSchemaGenerationOptions: StoredFromViewSchemaGenerationOptions = {
	includeStaged: () => true,
};

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema} for use in schema upgrades.
 *
 * TODO: once upgrades are more flexible, this should take in more options, including the old schema and specific upgrades to enable.
 */
export function toUpgradeSchema(root: ImplicitFieldSchema): TreeStoredSchema {
	return toStoredSchema(root, restrictiveStoredSchemaGenerationOptions);
}

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema} for use as initial document schema.
 */
export function toInitialSchema(root: ImplicitFieldSchema): TreeStoredSchema {
	return toStoredSchema(root, restrictiveStoredSchemaGenerationOptions);
}

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema} to used for unhydrated nodes.
 * @remarks
 * This allows as much as possible, relying on further validation when inserting the content.
 *
 * TODO: this should get additional options to enable support for unknown optional fields.
 */
export const toUnhydratedSchema = permissiveStoredSchemaGenerationOptions;

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema}.
 *
 * @privateRemarks
 * TODO:#38722 When runtime schema upgrades are implemented, this will need to be updated to check if
 * a staged allowed type has been upgraded and if so, include it in the conversion.
 *
 * Even if this took in a SimpleTreeSchema,
 * it would still need to walk the schema to avoid including schema that become unreachable due to filtered out staged schema.
 *
 * @throws
 * Throws a `UsageError` if multiple schemas are encountered with the same identifier.
 */
export function toStoredSchema(
	root: ImplicitFieldSchema,
	options: StoredFromViewSchemaGenerationOptions,
): TreeStoredSchema {
	const cache = getOrCreate(viewToStoredCache, options, () => new WeakMap());
	return getOrCreate(cache, root, () => {
		const treeSchema = createTreeSchema(normalizeFieldSchema(root));
		const simpleSchema = transformSimpleSchema(treeSchema, options);
		return simpleStoredSchemaToStoredSchema(simpleSchema);
	});
}

/**
 * Converts a {@link SimpleTreeSchema} from `SchemaType.View` to `SchemaType.Stored`.
 */
export function transformSimpleSchema(
	schema: SimpleTreeSchema<SchemaType.View>,
	options: StoredFromViewSchemaGenerationOptions,
): SimpleTreeSchema<SchemaType.Stored>;

/**
 * Copies a `SchemaType.Stored` {@link SimpleTreeSchema}.
 */
export function transformSimpleSchema(
	schema: SimpleTreeSchema<SchemaType.Stored>,
	options: ExpectStored,
): SimpleTreeSchema<SchemaType.Stored>;

/**
 * Copies a {@link SimpleTreeSchema}.
 */
export function transformSimpleSchema<T extends SchemaType>(
	schema: SimpleTreeSchema<T>,
	options: Unchanged,
): SimpleTreeSchema<T>;

/**
 * Converts a {@link SimpleTreeSchema}.
 */
export function transformSimpleSchema(
	schema: SimpleTreeSchema,
	options: SimpleSchemaTransformationOptions,
): SimpleTreeSchema;

/**
 * TODO:#38722 When runtime schema upgrades are implemented, this will need to be updated to check if
 * a staged allowed type has been upgraded and if so, include it in the conversion.
 */
export function transformSimpleSchema(
	schema: SimpleTreeSchema,
	options: SimpleSchemaTransformationOptions,
): SimpleTreeSchema {
	const simpleNodeSchema = new Map<string, SimpleNodeSchema>();
	const root = filterFieldAllowedTypes(schema.root, options);
	const queue = [...root.simpleAllowedTypes.keys()];
	for (const identifier of queue) {
		getOrCreate(simpleNodeSchema, identifier, (id) => {
			const nodeSchema = schema.definitions.get(id) ?? fail(0xca8 /* missing schema */);
			const transformed = transformSimpleNodeSchema(nodeSchema, options);
			const kind = transformed.kind;
			switch (kind) {
				case NodeKind.Leaf: {
					break;
				}
				case NodeKind.Array:
				case NodeKind.Map:
				case NodeKind.Record: {
					queue.push(...transformed.simpleAllowedTypes.keys());
					break;
				}
				case NodeKind.Object: {
					for (const fieldSchema of transformed.fields.values()) {
						queue.push(...fieldSchema.simpleAllowedTypes.keys());
					}
					break;
				}
				default: {
					unreachableCase(kind);
				}
			}
			return transformed;
		});
	}
	// Copy simpleNodeSchema, but in the order from the original schema.definitions
	// Currently we do not specify anything about the order of definitions, but it is nicer to have a stable order and some tests rely on it.
	const definitions = new Map<string, SimpleNodeSchema>(
		mapIterable(
			filterIterable(schema.definitions.keys(), (id) => simpleNodeSchema.has(id)),
			(id) => [id, simpleNodeSchema.get(id) ?? fail(0xca9 /* missing schema */)],
		),
	);
	assert(
		definitions.size === simpleNodeSchema.size,
		0xcaa /* Reachable schema missing from input TreeSchema */,
	);
	return { root, definitions };
}

/**
 * Convert a {@link SimpleTreeSchema} for a stored schema into a {@link TreeStoredSchema}.
 * @remarks
 * This only supports simple schemas that are already logically stored schemas.
 * @privateRemarks
 * To correctly support view schema here, this would need to filter out unreferenced schema after excluding staged schema.
 * @see {@link ExpectStored}.
 */
export function simpleStoredSchemaToStoredSchema(
	treeSchema: SimpleTreeSchema<SchemaType.Stored>,
): TreeStoredSchema {
	const result: TreeStoredSchema = {
		nodeSchema: transformMapValues(treeSchema.definitions, (schema) =>
			getStoredSchema(schema),
		) as Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>,
		rootFieldSchema: convertField(treeSchema.root),
	};
	return result;
}

/**
 * Convert a {@link SimpleFieldSchema} into a {@link TreeFieldStoredSchema}.
 */
export function convertField(
	schema: SimpleFieldSchema<SchemaType.Stored>,
): TreeFieldStoredSchema {
	const kind: FieldKindIdentifier =
		convertFieldKind.get(schema.kind)?.identifier ?? fail(0xae3 /* Invalid field kind */);
	const types = convertAllowedTypes(schema.simpleAllowedTypes);
	return { kind, types, persistedMetadata: schema.persistedMetadata };
}

/**
 * A map that converts {@link FieldKind} to {@link FlexFieldKind}.
 */
export const convertFieldKind: ReadonlyMap<FieldKind, FlexFieldKind> = new Map<
	FieldKind,
	FlexFieldKind
>([
	[FieldKind.Optional, FieldKinds.optional],
	[FieldKind.Required, FieldKinds.required],
	[FieldKind.Identifier, FieldKinds.identifier],
]);

/**
 * Converts a {@link TreeNodeSchema} into a {@link TreeNodeStoredSchema}.
 * @privateRemarks
 * TODO: Persist node metadata once schema FormatV2 is supported.
 */
export function getStoredSchema(
	schema: SimpleNodeSchema<SchemaType.Stored>,
): TreeNodeStoredSchema {
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf: {
			return new LeafNodeStoredSchema(schema.leafKind);
		}
		case NodeKind.Map:
		case NodeKind.Record: {
			const types = convertAllowedTypes(schema.simpleAllowedTypes);
			return new MapNodeStoredSchema(
				{
					kind: FieldKinds.optional.identifier,
					types,
					persistedMetadata: schema.persistedMetadata,
				},
				// TODO: Find a way to avoid injecting persistedMetadata twice in these constructor calls.
				schema.persistedMetadata,
			);
		}
		case NodeKind.Array: {
			return arrayNodeStoredSchema(schema.simpleAllowedTypes, schema.persistedMetadata);
		}
		case NodeKind.Object: {
			const fields: Map<FieldKey, TreeFieldStoredSchema> = new Map();
			for (const fieldSchema of schema.fields.values()) {
				fields.set(brand(fieldSchema.storedKey), convertField(fieldSchema));
			}
			return new ObjectNodeStoredSchema(fields, schema.persistedMetadata);
		}
		default: {
			unreachableCase(kind);
		}
	}
}

/**
 * Converts a {@link SimpleNodeSchema} from view to stored.
 */
export function transformSimpleNodeSchema(
	schema: SimpleNodeSchema<SchemaType.View>,
	options: StoredFromViewSchemaGenerationOptions,
): SimpleNodeSchema<SchemaType.Stored>;

/**
 * Converts a {@link SimpleNodeSchema}.
 */
export function transformSimpleNodeSchema(
	schema: SimpleNodeSchema,
	options: SimpleSchemaTransformationOptions,
): SimpleNodeSchema;

/**
 * TODO: Persist node metadata once schema FormatV2 is supported.
 *
 * This is only exported for use by tests: if other users need them more overloads could be provided, but this is currently sufficient.
 */
export function transformSimpleNodeSchema(
	schema: SimpleNodeSchema,
	options: SimpleSchemaTransformationOptions,
): SimpleNodeSchema {
	const metadata = {
		persistedMetadata: schema.persistedMetadata,
		metadata: preservesViewData(options)
			? {
					custom: schema.metadata.custom,
					description: schema.metadata.description,
				}
			: {},
	};
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf: {
			return {
				kind,
				leafKind: schema.leafKind,
				...metadata,
			} satisfies SimpleLeafNodeSchema;
		}
		case NodeKind.Array:
		case NodeKind.Map:
		case NodeKind.Record: {
			return {
				kind,
				...metadata,
				simpleAllowedTypes: filterAllowedTypes(schema.simpleAllowedTypes, options),
			} satisfies SimpleMapNodeSchema | SimpleRecordNodeSchema | SimpleArrayNodeSchema;
		}
		case NodeKind.Object: {
			return {
				kind,
				...metadata,
				fields: transformMapValues(schema.fields, (f) => ({
					...filterFieldAllowedTypes(f, options),
					storedKey: f.storedKey,
				})),
				allowUnknownOptionalFields: filterViewData(options, schema.allowUnknownOptionalFields),
			} satisfies SimpleObjectNodeSchema;
		}
		default: {
			unreachableCase(kind);
		}
	}
}

function arrayNodeStoredSchema(
	schema: SimpleAllowedTypes<SchemaType.Stored>,
	persistedMetadata: JsonCompatibleReadOnlyObject | undefined,
): ObjectNodeStoredSchema {
	const field = {
		kind: FieldKinds.sequence.identifier,
		types: convertAllowedTypes(schema),
		persistedMetadata,
	};
	const fields = new Map([[EmptyKey, field]]);
	return new ObjectNodeStoredSchema(fields, persistedMetadata);
}

/**
 * Converts a {@link SimpleAllowedTypes} to a stored schema.
 * @param schema - The schema to convert.
 * @param options - The options to use for filtering.
 * @returns The converted stored schema.
 */
export function filterAllowedTypes(
	schema: SimpleAllowedTypes,
	options: SimpleSchemaTransformationOptions,
): SimpleAllowedTypes {
	const filtered: Map<string, SimpleAllowedTypeAttributes> = new Map();
	for (const [type, data] of schema) {
		if (options === Unchanged) {
			filtered.set(type, { isStaged: data.isStaged });
		} else if (allowedTypeFilter(data, options)) {
			filtered.set(type, { isStaged: undefined });
		}
	}
	return filtered;
}

function filterFieldAllowedTypes(
	f: SimpleFieldSchema,
	options: SimpleSchemaTransformationOptions,
): SimpleFieldSchema {
	return {
		kind: f.kind,
		persistedMetadata: f.persistedMetadata,
		metadata: preservesViewData(options)
			? {
					custom: f.metadata.custom,
					description: f.metadata.description,
				}
			: {},
		simpleAllowedTypes: filterAllowedTypes(f.simpleAllowedTypes, options),
	};
}

/**
 * Converts a stored {@link SimpleAllowedTypes} to a {@link TreeTypeSet}.
 */
function convertAllowedTypes(schema: SimpleAllowedTypes<SchemaType.Stored>): TreeTypeSet {
	return new Set(schema.keys() as Iterable<TreeNodeSchemaIdentifier>);
}

/**
 * Filters an allowed type based on the provided options.
 * @param allowedType - The allowed type to filter.
 * @param options - The options to use for filtering.
 * @returns Whether the allowed type passes the filter.
 */
function allowedTypeFilter(
	data: SimpleAllowedTypeAttributes,
	options: StoredSchemaGenerationOptions,
): boolean {
	if (options === ExpectStored) {
		if (data.isStaged !== undefined) {
			throw new UsageError(
				"Failed to covert view schema to stored schema. The simple schema provided was indicated to be a stored schema by the use of `ExpectStored`, but view schema specific content was encountered which requires a `StoredFromViewSchemaGenerationOptions` to process.",
			);
		}
		return true;
	}

	if (data.isStaged === undefined) {
		throw new UsageError(
			"Failed to covert view schema to stored schema. The simple schema provided as the view schema was actually a stored schema. If this was intended, use `ExpectStored` for the `StoredSchemaGenerationOptions` to indicate the input is already a stored schema and only a format conversion is required.",
		);
	}

	// If the allowed type is staged, only include it if the options allow it.
	if (data.isStaged === false) {
		return true;
	}

	return options.includeStaged(data.isStaged);
}

function isStoredFromView(
	options: SimpleSchemaTransformationOptions,
): options is StoredFromViewSchemaGenerationOptions {
	return typeof options === "object" && "includeStaged" in options;
}

function filterViewData<T>(
	options: SimpleSchemaTransformationOptions,
	data: T,
): T | undefined {
	return preservesViewData(options) ? data : undefined;
}

/**
 * Determines if the provided options indicate that view specific data should be preserved.
 * @remarks
 * This assumes that stored simple schema should not contain view specific data.
 * Therefore the only case where what this returns should matter is when the input schema is view schema
 * (and thus there might be view specific data).
 */
function preservesViewData(options: SimpleSchemaTransformationOptions): boolean {
	// As noted above in the doc comment, the only case we care about the return value is when the input is a view schema.
	// There are two such cases: isStoredFromView where we return false, and Unchanged when applied to a view schema, where we return true.
	// It does not matter what we return in other cases, so for simplicity they just end up as "true".
	return isStoredFromView(options) ? false : true;
}
