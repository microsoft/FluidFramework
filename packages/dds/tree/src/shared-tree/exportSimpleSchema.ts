/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";

import type {
	FieldKey,
	TreeFieldStoredSchema,
	TreeNodeStoredSchema,
	TreeStoredSchema,
	TreeTypeSet,
} from "../core/index.js";
import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
} from "../core/index.js";
import { FieldKinds } from "../feature-libraries/index.js";
import type {
	SchemaType,
	SimpleAllowedTypeAttributes,
	SimpleFieldSchema,
	SimpleNodeSchema,
	SimpleObjectFieldSchema,
	SimpleTreeSchema,
} from "../simple-tree/index.js";
import { FieldKind, NodeKind, tryStoredSchemaAsArray } from "../simple-tree/index.js";

/**
 * Converts stored schema into a simple schema without depending on a tree checkout.
 */
export function exportSimpleSchema(
	storedSchema: TreeStoredSchema,
): SimpleTreeSchema<SchemaType.Stored> {
	return {
		root: exportSimpleFieldSchemaStored(storedSchema.rootFieldSchema),
		definitions: new Map(
			[...storedSchema.nodeSchema].map(([key, schema]) => {
				return [key, exportSimpleNodeSchemaStored(schema)];
			}),
		),
	};
}

/**
 * Build the allowed types for a Stored Schema.
 *
 * @remarks Staged upgrades do not apply to stored schemas, so we omit the {@link SimpleAllowedTypeAttributes.isStaged | staging flag } when building {@link SimpleAllowedTypeAttributes}.
 * @param types - The types to create allowed types for.
 * @returns The allowed types.
 */
function buildSimpleAllowedTypeAttributesForStoredSchema(
	types: TreeTypeSet,
): ReadonlyMap<string, SimpleAllowedTypeAttributes<SchemaType.Stored>> {
	const allowedTypesInfo = new Map<string, SimpleAllowedTypeAttributes<SchemaType.Stored>>();
	for (const type of types) {
		// Stored schemas do not have staged upgrades
		allowedTypesInfo.set(type, { isStaged: undefined });
	}
	return allowedTypesInfo;
}

function exportSimpleFieldSchemaStored(
	schema: TreeFieldStoredSchema,
): SimpleFieldSchema<SchemaType.Stored> {
	let kind: FieldKind;
	switch (schema.kind) {
		case FieldKinds.identifier.identifier: {
			kind = FieldKind.Identifier;
			break;
		}
		case FieldKinds.optional.identifier: {
			kind = FieldKind.Optional;
			break;
		}
		case FieldKinds.required.identifier: {
			kind = FieldKind.Required;
			break;
		}
		case FieldKinds.forbidden.identifier: {
			kind = FieldKind.Optional;
			assert(schema.types.size === 0, 0xa94 /* invalid forbidden field */);
			break;
		}
		default: {
			fail(0xaca /* invalid field kind */);
		}
	}
	return {
		kind,
		simpleAllowedTypes: buildSimpleAllowedTypeAttributesForStoredSchema(schema.types),
		metadata: {},
		persistedMetadata: schema.persistedMetadata,
	};
}

/**
 * Export a {@link SimpleNodeSchema} from a {@link TreeNodeStoredSchema}.
 * @privateRemarks
 * TODO: Persist node metadata once schema FormatV2 is supported.
 * Note on SimpleNodeSchema construction: In the persisted format `persistedMetadata` is just called `metadata` whereas the `metadata`
 * field on SimpleNodeSchema is not persisted.
 */
function exportSimpleNodeSchemaStored(
	schema: TreeNodeStoredSchema,
): SimpleNodeSchema<SchemaType.Stored> {
	const arrayTypes = tryStoredSchemaAsArray(schema);
	if (arrayTypes !== undefined) {
		return {
			kind: NodeKind.Array,
			simpleAllowedTypes: buildSimpleAllowedTypeAttributesForStoredSchema(arrayTypes),
			metadata: {},
			persistedMetadata: schema.metadata,
		};
	}
	if (schema instanceof ObjectNodeStoredSchema) {
		const fields = new Map<FieldKey, SimpleObjectFieldSchema<SchemaType.Stored>>();
		for (const [storedKey, field] of schema.objectNodeFields) {
			fields.set(storedKey, { ...exportSimpleFieldSchemaStored(field), storedKey });
		}
		return {
			kind: NodeKind.Object,
			fields,
			allowUnknownOptionalFields: undefined,
			metadata: {},
			persistedMetadata: schema.metadata,
		};
	}
	if (schema instanceof MapNodeStoredSchema) {
		assert(
			schema.mapFields.kind === FieldKinds.optional.identifier,
			0xa95 /* Invalid map schema */,
		);
		return {
			kind: NodeKind.Map,
			simpleAllowedTypes: buildSimpleAllowedTypeAttributesForStoredSchema(
				schema.mapFields.types,
			),
			metadata: {},
			persistedMetadata: schema.metadata,
		};
	}
	if (schema instanceof LeafNodeStoredSchema) {
		return {
			kind: NodeKind.Leaf,
			leafKind: schema.leafValue,
			metadata: {},
			persistedMetadata: schema.metadata,
		};
	}
	fail(0xacb /* invalid schema kind */);
}
