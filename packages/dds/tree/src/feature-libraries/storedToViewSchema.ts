/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
} from "../core/index.js";
import { fail } from "../util/index.js";

import { defaultSchemaPolicy } from "./default-schema/index.js";
import {
	Any,
	type FlexAllowedTypes,
	FlexFieldSchema,
	type FlexMapFieldSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	type FlexTreeNodeSchema,
	type FlexTreeSchema,
	LeafNodeSchema,
} from "./typed-schema/index.js";

/**
 * Creates a new view schema using the stored schema.
 * @remarks
 * This is really only suitable for use with code that happens to need access to things which require a view schema, but isn't actually schema aware.
 * If the input schema came from a view schema, it will not return the same view schema, and will not be compatible:
 * the returned TreeSchema is simply one which schematize will not object to.
 * Assumes the schema uses the default field kinds.
 */
export function treeSchemaFromStoredSchema(schema: TreeStoredSchema): FlexTreeSchema {
	const map: Map<TreeNodeSchemaIdentifier, FlexTreeNodeSchema> = new Map();
	for (const [identifier, innerSchema] of schema.nodeSchema) {
		if (innerSchema instanceof LeafNodeStoredSchema) {
			map.set(
				identifier,
				LeafNodeSchema.create({ name: "intoTypedSchema" }, identifier, innerSchema.leafValue),
			);
		} else if (innerSchema instanceof MapNodeStoredSchema) {
			map.set(
				identifier,
				FlexMapNodeSchema.create(
					{ name: "intoTypedSchema" },
					identifier,
					fieldSchemaFromStoredSchema(innerSchema.mapFields, map) as FlexMapFieldSchema,
				),
			);
		} else {
			assert(innerSchema instanceof ObjectNodeStoredSchema, 0x882 /* unsupported node kind */);
			const fields = new Map<string, FlexFieldSchema>();
			for (const [key, field] of innerSchema.objectNodeFields) {
				fields.set(key, fieldSchemaFromStoredSchema(field, map));
			}
			const fieldsObject = mapToObject(fields);
			map.set(
				identifier,
				FlexObjectNodeSchema.create({ name: "intoTypedSchema" }, identifier, fieldsObject),
			);
		}
	}
	return {
		adapters: {},
		policy: defaultSchemaPolicy,
		rootFieldSchema: fieldSchemaFromStoredSchema(schema.rootFieldSchema, map),
		nodeSchema: map,
	};
}

function mapToObject<MapValue>(map: Map<string, MapValue>): Record<string, MapValue> {
	const objectMap: Record<string, MapValue> = Object.create(null);
	for (const [key, value] of map.entries()) {
		// This code has to be careful to avoid assigned to __proto__ or similar built in fields.
		Object.defineProperty(objectMap, key, {
			enumerable: true,
			configurable: false,
			writable: false,
			value,
		});
	}
	return objectMap;
}

export function fieldSchemaFromStoredSchema(
	schema: TreeFieldStoredSchema,
	map: ReadonlyMap<TreeNodeSchemaIdentifier, FlexTreeNodeSchema>,
): FlexFieldSchema {
	const kind = defaultSchemaPolicy.fieldKinds.get(schema.kind) ?? fail("missing field kind");
	const types: FlexAllowedTypes =
		schema.types === undefined
			? [Any]
			: Array.from(schema.types, (v) => () => map.get(v) ?? fail("missing schema"));
	return FlexFieldSchema.create(kind, types);
}
