/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase, fail } from "@fluidframework/core-utils/internal";
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
import { brand, getOrCreate } from "../util/index.js";
import { NodeKind } from "./core/index.js";
import { FieldKind, normalizeFieldSchema, type ImplicitFieldSchema } from "./schemaTypes.js";
import { walkFieldSchema } from "./walkFieldSchema.js";
import { LeafNodeSchema } from "./leafNodeSchema.js";
import type {
	SimpleFieldSchema,
	SimpleNodeSchema,
	SimpleNodeSchemaBase,
	SimpleTreeSchema,
} from "./simpleSchema.js";

const viewToStoredCache = new WeakMap<ImplicitFieldSchema, TreeStoredSchema>();

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema}.
 */
export function toStoredSchema(root: ImplicitFieldSchema): TreeStoredSchema {
	return getOrCreate(viewToStoredCache, root, () => {
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
					getStoredSchema(schema as SimpleNodeSchemaBase<NodeKind> as SimpleNodeSchema),
				);
			},
		});

		const result: TreeStoredSchema = {
			nodeSchema,
			rootFieldSchema: convertField(normalized),
		};
		return result;
	});
}

/**
 * Converts a {@link SimpleTreeSchema} into a {@link TreeStoredSchema}.
 */
export function simpleToStoredSchema(root: SimpleTreeSchema): TreeStoredSchema {
	const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
	for (const [identifier, schema] of root.definitions) {
		nodeSchema.set(brand(identifier), getStoredSchema(schema));
	}

	const result: TreeStoredSchema = {
		nodeSchema,
		rootFieldSchema: convertField(root.root),
	};
	return result;
}

/**
 * Normalizes an {@link ImplicitFieldSchema} into a {@link TreeFieldSchema}.
 */
export function convertField(schema: SimpleFieldSchema): TreeFieldStoredSchema {
	const kind: FieldKindIdentifier =
		convertFieldKind.get(schema.kind)?.identifier ?? fail(0xae3 /* Invalid field kind */);
	const types: TreeTypeSet = schema.allowedTypesIdentifiers as TreeTypeSet;
	return { kind, types, metadata: undefined };
}

const convertFieldKind = new Map<FieldKind, FlexFieldKind>([
	[FieldKind.Optional, FieldKinds.optional],
	[FieldKind.Required, FieldKinds.required],
	[FieldKind.Identifier, FieldKinds.identifier],
]);

/**
 * Converts a {@link TreeNodeSchema} into a {@link TreeNodeStoredSchema}.
 */
export function getStoredSchema(schema: SimpleNodeSchema): TreeNodeStoredSchema {
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf: {
			assert(schema instanceof LeafNodeSchema, 0xa4a /* invalid kind */);
			return new LeafNodeStoredSchema(schema.leafKind);
		}
		case NodeKind.Map: {
			const types = schema.allowedTypesIdentifiers as TreeTypeSet;
			return new MapNodeStoredSchema(
				{
					kind: FieldKinds.optional.identifier,
					types,
					metadata: schema.persistedMetadata,
				},
				// TODO: Find a way to avoid injecting persistedMetadata twice in these constructor calls.
				schema.persistedMetadata,
			);
		}
		case NodeKind.Array: {
			const types = schema.allowedTypesIdentifiers as TreeTypeSet;
			const field = {
				kind: FieldKinds.sequence.identifier,
				types,
				metadata: schema.persistedMetadata,
			};
			const fields = new Map([[EmptyKey, field]]);
			return new ObjectNodeStoredSchema(fields, schema.persistedMetadata);
		}
		case NodeKind.Object: {
			const fields: Map<FieldKey, TreeFieldStoredSchema> = new Map();
			for (const fieldSchema of schema.fields.values()) {
				fields.set(brand(fieldSchema.storedKey), convertField(fieldSchema));
			}
			return new ObjectNodeStoredSchema(fields, schema.persistedMetadata);
		}
		default:
			unreachableCase(kind);
	}
}
