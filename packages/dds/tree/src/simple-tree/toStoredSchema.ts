/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase, fail } from "@fluidframework/core-utils/internal";
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
import { brand, getOrCreate, type JsonCompatibleReadOnlyObject } from "../util/index.js";

import {
	allowedTypeFilter,
	convertAllowedTypes,
	getTreeNodeSchemaPrivateData,
	isClassBasedSchema,
	NodeKind,
	type SimpleNodeSchemaBase,
	type StoredSchemaGenerationOptions,
} from "./core/index.js";
import {
	FieldKind,
	FieldSchemaAlpha,
	normalizeFieldSchema,
	type ImplicitAnnotatedFieldSchema,
	type ImplicitFieldSchema,
} from "./fieldSchema.js";
import type { SimpleFieldSchema, SimpleNodeSchema } from "./simpleSchema.js";
import { walkFieldSchema } from "./walkFieldSchema.js";

const viewToStoredCache = new WeakMap<
	StoredSchemaGenerationOptions,
	WeakMap<ImplicitFieldSchema, TreeStoredSchema>
>();

export const restrictiveStoredSchemaGenerationOptions: StoredSchemaGenerationOptions = {
	includeStaged: () => false,
};

export const permissiveStoredSchemaGenerationOptions: StoredSchemaGenerationOptions = {
	includeStaged: () => true,
};

/**
 * Converts a {@link ImplicitAnnotatedFieldSchema} into a {@link TreeStoredSchema} for use in schema upgrades.
 *
 * TODO: once upgrades are more flexible, this should take in more options, including the old schema and specific upgrades to enable.
 */
export function toUpgradeSchema(root: ImplicitAnnotatedFieldSchema): TreeStoredSchema {
	return toStoredSchema(root, restrictiveStoredSchemaGenerationOptions);
}

/**
 * Converts a {@link ImplicitAnnotatedFieldSchema} into a {@link TreeStoredSchema} for use as initial document schema.
 */
export function toInitialSchema(root: ImplicitAnnotatedFieldSchema): TreeStoredSchema {
	return toStoredSchema(root, restrictiveStoredSchemaGenerationOptions);
}

/**
 * Converts a {@link ImplicitAnnotatedFieldSchema} into a {@link TreeStoredSchema} to used for unhydrated nodes.
 * @remarks
 * This allows as much as possible, relying on further validation when inserting the content.
 *
 * TODO: this should get additional options to enable support for unknown optional fields.
 */
export const toUnhydratedSchema = permissiveStoredSchemaGenerationOptions;

/**
 * Converts a {@link ImplicitAnnotatedFieldSchema} into a {@link TreeStoredSchema}.
 *
 * @privateRemarks
 * TODO:#38722 When runtime schema upgrades are implemented, this will need to be updated to check if
 * a staged allowed type has been upgraded and if so, include it in the conversion.
 *
 * @throws
 * Throws a `UsageError` if multiple schemas are encountered with the same identifier.
 */
export function toStoredSchema(
	root: ImplicitAnnotatedFieldSchema,
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
			allowedTypeFilter: (allowedType) => allowedTypeFilter(allowedType, options),
		});

		const result: TreeStoredSchema = {
			nodeSchema,
			rootFieldSchema: convertField(normalized, options),
		};
		return result;
	});
}

/**
 * Normalizes an {@link ImplicitFieldSchema} into a {@link TreeFieldSchema}.
 */
export function convertField(
	schema: SimpleFieldSchema | FieldSchemaAlpha,
	options: StoredSchemaGenerationOptions,
): TreeFieldStoredSchema {
	const kind: FieldKindIdentifier =
		convertFieldKind.get(schema.kind)?.identifier ?? fail(0xae3 /* Invalid field kind */);
	let types: TreeTypeSet;
	// eslint-disable-next-line unicorn/prefer-ternary
	if (schema instanceof FieldSchemaAlpha) {
		types = convertAllowedTypes(schema.annotatedAllowedTypesNormalized, options);
	} else {
		types = schema.allowedTypesIdentifiers as TreeTypeSet;
	}
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
	if (isClassBasedSchema(schema)) {
		return getTreeNodeSchemaPrivateData(schema).toStored(options);
	}
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf: {
			return new LeafNodeStoredSchema(schema.leafKind);
		}
		case NodeKind.Map:
		case NodeKind.Record: {
			const types = schema.allowedTypesIdentifiers as TreeTypeSet;
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
			const types = schema.allowedTypesIdentifiers as TreeTypeSet;
			return arrayNodeStoredSchema(types, schema.persistedMetadata);
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
	types: TreeTypeSet,
	persistedMetadata: JsonCompatibleReadOnlyObject | undefined,
): ObjectNodeStoredSchema {
	const field = {
		kind: FieldKinds.sequence.identifier,
		types,
		persistedMetadata,
	};
	const fields = new Map([[EmptyKey, field]]);
	return new ObjectNodeStoredSchema(fields, persistedMetadata);
}
