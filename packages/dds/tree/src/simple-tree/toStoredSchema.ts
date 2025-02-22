/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
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
import { brand, fail, getOrCreate, isReadonlyArray } from "../util/index.js";
import { NodeKind, type TreeNodeSchema } from "./core/index.js";
import {
	FieldKind,
	FieldSchema,
	type ImplicitAllowedTypes,
	type ImplicitFieldSchema,
} from "./schemaTypes.js";
import { walkFieldSchema } from "./walkFieldSchema.js";
import { LeafNodeSchema } from "./leafNodeSchema.js";
import { isObjectNodeSchema } from "./objectNodeTypes.js";
import { normalizeFlexListEager } from "./flexList.js";

const viewToStoredCache = new WeakMap<ImplicitFieldSchema, TreeStoredSchema>();

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema}.
 */
export function toStoredSchema(root: ImplicitFieldSchema): TreeStoredSchema {
	return getOrCreate(viewToStoredCache, root, () => {
		const nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map();
		walkFieldSchema(root, {
			node(schema) {
				if (nodeSchema.has(brand(schema.identifier))) {
					// Use JSON.stringify to quote and escape identifier string.
					throw new UsageError(
						`Multiple schema encountered with the identifier ${JSON.stringify(
							schema.identifier,
						)}. Remove or rename them to avoid the collision.`,
					);
				}
				nodeSchema.set(brand(schema.identifier), getStoredSchema(schema));
			},
		});

		const result: TreeStoredSchema = {
			nodeSchema,
			rootFieldSchema: convertField(root),
		};
		viewToStoredCache.set(root, result);
		return result;
	});
}

/**
 * Normalizes an {@link ImplicitFieldSchema} into a {@link TreeFieldSchema}.
 */
export function convertField(schema: ImplicitFieldSchema): TreeFieldStoredSchema {
	let kind: FieldKindIdentifier;
	let allowedTypes: ImplicitAllowedTypes;
	if (schema instanceof FieldSchema) {
		kind = convertFieldKind.get(schema.kind)?.identifier ?? fail("Invalid field kind");
		allowedTypes = schema.allowedTypes;
	} else {
		kind = FieldKinds.required.identifier;
		allowedTypes = schema;
	}
	const types = convertAllowedTypes(allowedTypes);
	return { kind, types };
}

const convertFieldKind = new Map<FieldKind, FlexFieldKind>([
	[FieldKind.Optional, FieldKinds.optional],
	[FieldKind.Required, FieldKinds.required],
	[FieldKind.Identifier, FieldKinds.identifier],
]);

/**
 * Normalizes an {@link ImplicitAllowedTypes} into an {@link TreeTypeSet}.
 */
export function convertAllowedTypes(schema: ImplicitAllowedTypes): TreeTypeSet {
	if (isReadonlyArray(schema)) {
		return new Set(normalizeFlexListEager(schema).map((item) => brand(item.identifier)));
	}
	return new Set([brand(schema.identifier)]);
}

/**
 * Converts a {@link TreeNodeSchema} into a {@link TreeNodeStoredSchema}.
 */
export function getStoredSchema(schema: TreeNodeSchema): TreeNodeStoredSchema {
	const kind = schema.kind;
	switch (kind) {
		case NodeKind.Leaf: {
			assert(schema instanceof LeafNodeSchema, 0xa4a /* invalid kind */);
			return new LeafNodeStoredSchema(schema.info);
		}
		case NodeKind.Map: {
			const fieldInfo = schema.info as ImplicitAllowedTypes;
			const types = convertAllowedTypes(fieldInfo);
			return new MapNodeStoredSchema({ kind: FieldKinds.optional.identifier, types });
		}
		case NodeKind.Array: {
			const fieldInfo = schema.info as ImplicitAllowedTypes;
			const field = {
				kind: FieldKinds.sequence.identifier,
				types: convertAllowedTypes(fieldInfo),
			};
			const fields = new Map([[EmptyKey, field]]);
			return new ObjectNodeStoredSchema(fields);
		}
		case NodeKind.Object: {
			assert(isObjectNodeSchema(schema), 0xa4b /* invalid kind */);
			const fields: Map<FieldKey, TreeFieldStoredSchema> = new Map();
			for (const field of schema.flexKeyMap.values()) {
				fields.set(field.storedKey, convertField(field.schema));
			}
			return new ObjectNodeStoredSchema(fields);
		}
		default:
			unreachableCase(kind);
	}
}
