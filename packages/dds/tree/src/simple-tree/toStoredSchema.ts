/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	unreachableCase,
	fail,
	transformMapValues,
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
} from "../core/index.js";
import { FieldKinds, type FlexFieldKind } from "../feature-libraries/index.js";
import { brand, getOrCreate, type JsonCompatibleReadOnlyObject } from "../util/index.js";

import {
	allowedTypeFilter,
	convertAllowedTypes,
	ExpectStored,
	NodeKind,
	type SimpleNodeSchemaBase,
	type StoredFromViewSchemaGenerationOptions,
	type StoredSchemaGenerationOptions,
} from "./core/index.js";
import { FieldKind, normalizeFieldSchema, type ImplicitFieldSchema } from "./fieldSchema.js";
import type {
	SimpleAllowedTypes,
	SimpleFieldSchema,
	SimpleNodeSchema,
	SimpleTreeSchema,
} from "./simpleSchema.js";
import { walkFieldSchema } from "./walkFieldSchema.js";

const viewToStoredCache = new WeakMap<
	StoredFromViewSchemaGenerationOptions,
	WeakMap<ImplicitFieldSchema, TreeStoredSchema>
>();

export const restrictiveStoredSchemaGenerationOptions: StoredSchemaGenerationOptions = {
	includeStaged: () => false,
};

export const permissiveStoredSchemaGenerationOptions: StoredSchemaGenerationOptions = {
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
	options: StoredSchemaGenerationOptions,
): TreeStoredSchema {
	const cache = getOrCreate(viewToStoredCache, options, () => new WeakMap());
	return getOrCreate(cache, root, () => {
		const normalized = normalizeFieldSchema(root);
		const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
		walkFieldSchema(normalized, {
			node(schema) {
				if (nodeSchema.has(brand(schema.identifier))) {
					// Use JSON.stringify to quote and escape identifier string.
					throw new UsageError(
						`Multiple schema encountered with the identifier ${JSON.stringify(
							schema.identifier,
						)}. Remove or rename them to avoid the collision.`,
					);
				}
				nodeSchema.set(
					brand(schema.identifier),
					getStoredSchema(
						schema as SimpleNodeSchemaBase<NodeKind> as SimpleNodeSchema,
						options,
					),
				);
			},
			allowedTypeFilter: (allowedType) =>
				allowedTypeFilter(
					{ isStaged: allowedType.metadata.stagedSchemaUpgrade ?? false },
					options,
				),
		});

		const result: TreeStoredSchema = {
			nodeSchema,
			rootFieldSchema: convertField(normalized, options),
		};
		return result;
	});
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
	treeSchema: SimpleTreeSchema,
): TreeStoredSchema {
	const result: TreeStoredSchema = {
		nodeSchema: transformMapValues(treeSchema.definitions, (schema) =>
			getStoredSchema(schema, ExpectStored),
		) as Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>,
		rootFieldSchema: convertField(treeSchema.root, ExpectStored),
	};
	return result;
}

/**
 * Convert a {@link SimpleFieldSchema} into a {@link TreeFieldStoredSchema}.
 */
export function convertField(
	schema: SimpleFieldSchema,
	options: StoredSchemaGenerationOptions,
): TreeFieldStoredSchema {
	const kind: FieldKindIdentifier =
		convertFieldKind.get(schema.kind)?.identifier ?? fail(0xae3 /* Invalid field kind */);
	const types = convertAllowedTypes(schema.simpleAllowedTypes, options);
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
	schema: SimpleNodeSchema,
	options: StoredSchemaGenerationOptions,
): TreeNodeStoredSchema {
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf: {
			return new LeafNodeStoredSchema(schema.leafKind);
		}
		case NodeKind.Map:
		case NodeKind.Record: {
			const types = convertAllowedTypes(schema.simpleAllowedTypes, options);
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
			return arrayNodeStoredSchema(
				schema.simpleAllowedTypes,
				options,
				schema.persistedMetadata,
			);
		}
		case NodeKind.Object: {
			const fields: Map<FieldKey, TreeFieldStoredSchema> = new Map();
			for (const fieldSchema of schema.fields.values()) {
				fields.set(brand(fieldSchema.storedKey), convertField(fieldSchema, options));
			}
			return new ObjectNodeStoredSchema(fields, schema.persistedMetadata);
		}
		default: {
			unreachableCase(kind);
		}
	}
}

export function arrayNodeStoredSchema(
	schema: SimpleAllowedTypes,
	options: StoredSchemaGenerationOptions,
	persistedMetadata: JsonCompatibleReadOnlyObject | undefined,
): ObjectNodeStoredSchema {
	const field = {
		kind: FieldKinds.sequence.identifier,
		types: convertAllowedTypes(schema, options),
		persistedMetadata,
	};
	const fields = new Map([[EmptyKey, field]]);
	return new ObjectNodeStoredSchema(fields, persistedMetadata);
}
