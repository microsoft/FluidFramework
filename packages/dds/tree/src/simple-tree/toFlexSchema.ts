/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	EmptyKey,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
} from "../core/index.js";
import {
	FieldKinds,
	type FlexAllowedTypes,
	type FlexFieldKind,
	FlexFieldSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	type FlexTreeNodeSchema,
	type FlexTreeSchema,
	TreeNodeSchemaBase,
	defaultSchemaPolicy,
	intoStoredSchemaCollection,
	schemaIsLeaf,
} from "../feature-libraries/index.js";
// TODO: once flex schema is gone, this code can move into simple-tree
// eslint-disable-next-line import/no-internal-modules
import { normalizeFlexListEager } from "../feature-libraries/typed-schema/index.js";
import { brand, fail, isReadonlyArray, mapIterable } from "../util/index.js";
import {
	cachedFlexSchemaFromClassSchema,
	setFlexSchemaFromClassSchema,
	tryGetSimpleNodeSchema,
	NodeKind,
	type TreeNodeSchema,
} from "./core/index.js";
import {
	FieldKind,
	FieldSchema,
	type ImplicitAllowedTypes,
	type ImplicitFieldSchema,
	getStoredKey,
} from "./schemaTypes.js";

interface SchemaInfo {
	readonly toFlex: () => FlexTreeNodeSchema;
	readonly original: TreeNodeSchema;
}

type SchemaMap = Map<TreeNodeSchemaIdentifier, SchemaInfo>;

/**
 * Generate a {@link FlexTreeSchema} with `root` as the root field.
 *
 * This also has the side effect of populating the cached view schema on the class-based schema.
 */
export function toFlexSchema(root: ImplicitFieldSchema): FlexTreeSchema {
	const schemaMap: SchemaMap = new Map();
	const field = convertField(schemaMap, root);
	const nodeSchema = new Map(
		mapIterable(schemaMap, ([key, value]) => {
			const schema = value.toFlex();
			const classSchema = tryGetSimpleNodeSchema(schema);
			if (classSchema === undefined) {
				assert(schemaIsLeaf(schema), 0x83e /* invalid leaf */);
			} else {
				assert(
					cachedFlexSchemaFromClassSchema(classSchema) === schema,
					0x83f /* mismatched schema */,
				);
			}
			return [key, schema];
		}),
	);

	const typed: FlexTreeSchema = {
		nodeSchema,
		adapters: {},
		rootFieldSchema: field,
		policy: defaultSchemaPolicy,
	};
	return typed;
}

/**
 * Converts a {@link ImplicitFieldSchema} into a {@link TreeStoredSchema}.
 */
export function toStoredSchema(root: ImplicitFieldSchema): TreeStoredSchema {
	const flex = toFlexSchema(root);
	return {
		rootFieldSchema: flex.rootFieldSchema.stored,
		...intoStoredSchemaCollection(flex),
	};
}

/**
 * Return a flex schema for the provided class schema.
 *
 * This also has the side effect of populating the cached view schema on the class based schema.
 */
export function getFlexSchema(root: TreeNodeSchema): FlexTreeNodeSchema {
	const treeSchema = toFlexSchema(root);
	return treeSchema.rootFieldSchema.monomorphicChildType ?? fail("root should be monomorphic");
}

/**
 * Return a stored schema for the provided class schema.
 *
 * This also has the side effect of populating the cached view schema on the class based schema.
 */
export function getStoredSchema(root: TreeNodeSchema): TreeNodeStoredSchema {
	return getFlexSchema(root).stored;
}

/**
 * Normalizes an {@link ImplicitFieldSchema} into a {@link TreeFieldSchema}.
 */
export function convertField(
	schemaMap: SchemaMap,
	schema: ImplicitFieldSchema,
): FlexFieldSchema {
	let kind: FlexFieldKind;
	let types: ImplicitAllowedTypes;
	if (schema instanceof FieldSchema) {
		kind = convertFieldKind.get(schema.kind) ?? fail("Invalid field kind");
		types = schema.allowedTypes;
	} else {
		kind = FieldKinds.required;
		types = schema;
	}
	const allowedTypes = convertAllowedTypes(schemaMap, types);
	return FlexFieldSchema.create(kind, allowedTypes);
}

const convertFieldKind = new Map<FieldKind, FlexFieldKind>([
	[FieldKind.Optional, FieldKinds.optional],
	[FieldKind.Required, FieldKinds.required],
	[FieldKind.Identifier, FieldKinds.identifier],
]);

/**
 * Normalizes an {@link ImplicitAllowedTypes} into an {@link AllowedTypes}.
 */
export function convertAllowedTypes(
	schemaMap: SchemaMap,
	schema: ImplicitAllowedTypes,
): FlexAllowedTypes {
	if (isReadonlyArray(schema)) {
		return normalizeFlexListEager(schema).map((item) => convertNodeSchema(schemaMap, item));
	}
	return [convertNodeSchema(schemaMap, schema)];
}

const builder = { name: "simple schema" };

/**
 * Converts a {@link TreeNodeSchema} into a {@link FlexTreeNodeSchema}.
 * Ensures all types reachable from `schema` are included in `schemaMap`.
 *
 * Return value (and entries in map) are lazy to allow recursive types to work.
 * This laziness does NOT extend to adding entries to `schemaMap`:
 * all referenced types are added to it before this function returns.
 */
export function convertNodeSchema(
	schemaMap: SchemaMap,
	schema: TreeNodeSchema,
): () => FlexTreeNodeSchema {
	const fromMap = schemaMap.get(brand(schema.identifier));
	if (fromMap !== undefined) {
		if (fromMap.original !== schema) {
			// Use JSON.stringify to quote and escape identifier string.
			throw new UsageError(
				`Multiple schema encountered with the identifier ${JSON.stringify(
					schema.identifier,
				)}. Remove or rename them to avoid the collision.`,
			);
		}
		return fromMap.toFlex;
	}

	const toFlex = (): FlexTreeNodeSchema => {
		let out: FlexTreeNodeSchema;
		const kind = schema.kind;
		switch (kind) {
			case NodeKind.Leaf: {
				const cached =
					cachedFlexSchemaFromClassSchema(schema) ?? fail("leaf schema should be pre-cached");
				assert(schemaIsLeaf(cached), 0x840 /* expected leaf */);
				return cached;
			}
			case NodeKind.Map: {
				const fieldInfo = schema.info as ImplicitAllowedTypes;
				const field = FlexFieldSchema.create(
					FieldKinds.optional,
					convertAllowedTypes(schemaMap, fieldInfo),
				);
				// Lookup of cached schema is done here instead of before since walking the schema recursively to populate schemaMap is still required.
				const cached = cachedFlexSchemaFromClassSchema(schema);
				out = cached ?? FlexMapNodeSchema.create(builder, brand(schema.identifier), field);
				break;
			}
			case NodeKind.Array: {
				const fieldInfo = schema.info as ImplicitAllowedTypes;
				const field = FlexFieldSchema.create(
					FieldKinds.sequence,
					convertAllowedTypes(schemaMap, fieldInfo),
				);
				const cached = cachedFlexSchemaFromClassSchema(schema);
				out =
					cached ??
					FlexObjectNodeSchema.create(builder, brand(schema.identifier), {
						[EmptyKey]: field,
					});
				break;
			}
			case NodeKind.Object: {
				const info = schema.info as Record<string, ImplicitFieldSchema>;
				const fields: Record<string, FlexFieldSchema> = Object.create(null);
				for (const [viewKey, implicitFieldSchema] of Object.entries(info)) {
					// If a `stored key` was provided, use it as the key in the flex schema.
					// Otherwise, use the view key.
					const flexKey = getStoredKey(viewKey, implicitFieldSchema);

					// This code has to be careful to avoid assigning to __proto__ or similar built-in fields.
					Object.defineProperty(fields, flexKey, {
						enumerable: true,
						configurable: false,
						writable: false,
						value: convertField(schemaMap, implicitFieldSchema),
					});
				}
				const cached = cachedFlexSchemaFromClassSchema(schema);
				out = cached ?? FlexObjectNodeSchema.create(builder, brand(schema.identifier), fields);
				break;
			}
			default:
				unreachableCase(kind);
		}
		assert(out instanceof TreeNodeSchemaBase, 0x841 /* invalid schema produced */);
		{
			const cached = cachedFlexSchemaFromClassSchema(schema);
			if (cached !== undefined) {
				assert(
					cachedFlexSchemaFromClassSchema(schema) === out,
					0x842 /* incorrect flexSchemaSymbol */,
				);
			} else {
				setFlexSchemaFromClassSchema(schema, out);
			}
		}
		return out;
	};
	schemaMap.set(brand(schema.identifier), { original: schema, toFlex });
	return toFlex;
}
